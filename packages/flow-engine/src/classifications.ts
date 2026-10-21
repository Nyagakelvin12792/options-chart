import {
  DEFAULT_FLOW_ENGINE_CONFIG_V1,
  type FlowEngineConfigV1,
} from "./configuration";
import type {
  FlowClassification,
  FlowSide,
  LevelClassificationRecordV1,
  NormalizedTradeFlowV1,
  RelevantLevelV1,
  ReplenishmentEventV1,
} from "./contracts";
import {
  BASIS_POINTS_SCALE,
  computeAbsoluteBpsDistance,
  computeSignedBpsChange,
  roundDecimal,
} from "./decimal";
import {
  buildBaseLevelClassificationRecord,
  buildClassificationThresholds,
  buildComponentScores,
  collectBoundedEvidenceIds,
  doesLevelSupportAbsorptionSide,
  findActiveLevelsNearPrice,
  isLevelActiveAt,
  sumDirectionalWindowTrades,
} from "./level-context";

export const CLASSIFICATIONS_POLICY_VERSION =
  "flow-classifications-v1" as const;

export interface ClassificationEvaluationInputV1 {
  readonly asOfReceiptTimestampMs: number;
  readonly featureTimestampMs: number;
  readonly referencePrice: number | null;
  readonly latestTradeEventId?: string | undefined;
  readonly trades: readonly NormalizedTradeFlowV1[];
  readonly levels: readonly RelevantLevelV1[];
  readonly tradeSideCoverageRatio: number | null;
  readonly bookCoverageRatio: number;
  readonly recentReplenishments: readonly ReplenishmentEventV1[];
  readonly hasUnresolvedGap: boolean;
  readonly isStale: boolean;
  readonly isBaselineTruncated?: boolean;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

function markUnavailable(
  rec: LevelClassificationRecordV1,
  inp: ClassificationEvaluationInputV1,
  reason: string,
): LevelClassificationRecordV1 {
  return Object.freeze({
    ...rec,
    lifecycle: "finalized",
    outcome: "unavailable",
    finalizedTimestampMs: inp.featureTimestampMs,
    finalReferencePrice: inp.referencePrice,
    unavailableReason: reason,
    auditNote: `${rec.auditNote} Finalized unavailable (${reason}).`,
  });
}

function finalizeHorizon(
  rec: LevelClassificationRecordV1,
  inp: ClassificationEvaluationInputV1,
  cfg: FlowEngineConfigV1,
): LevelClassificationRecordV1 {
  const rcpt = inp.asOfReceiptTimestampMs;
  const hTrades = inp.trades.filter(
    (t) =>
      t.featureTimestampMs > rec.candidateTimestampMs &&
      t.featureTimestampMs <= rec.responseHorizonTimestampMs &&
      t.receiptTimestampMs <= rcpt,
  );
  const last = hTrades[hTrades.length - 1];
  if (last === undefined || inp.referencePrice === null) {
    const scores = buildComponentScores({
      ...rec.componentScores,
      sustainedFarSideDurationMs: 0,
      sustainedFarSideQuoteVolume: 0,
    });
    return Object.freeze({
      ...rec,
      lifecycle: "finalized",
      outcome: "unresolved",
      finalizedTimestampMs: inp.featureTimestampMs,
      finalReferencePrice: inp.referencePrice,
      componentScores: scores,
      auditNote: `${rec.auditNote} Finalized unresolved at horizon.`,
    });
  }

  const atHorizon = inp.featureTimestampMs === rec.responseHorizonTimestampMs;
  const finalPx = atHorizon ? inp.referencePrice : last.price;
  const lvlPx = rec.levelPrice;
  const isBuy = rec.candidateClassification === "buy-absorption";
  const sign = isBuy ? 1 : -1;
  const toBps = (d: number): number =>
    roundDecimal((d / lvlPx) * BASIS_POINTS_SCALE, 6);
  const moveAwayBps = toBps(sign * (lvlPx - finalPx));

  let maxMoveAway = 0,
    firstRejIdx = -1,
    regained = false;
  for (let i = 0; i < hTrades.length; i += 1) {
    const t = hTrades[i];
    if (!t) continue;
    const exc = toBps(sign * (lvlPx - t.price));
    if (exc > maxMoveAway) maxMoveAway = exc;
    if (firstRejIdx === -1 && exc >= cfg.rejectionMoveAwayBps) firstRejIdx = i;
  }
  if (firstRejIdx !== -1) {
    for (let j = firstRejIdx + 1; j < hTrades.length; j += 1) {
      const t = hTrades[j];
      if (
        t &&
        toBps(sign * (t.price - lvlPx)) > cfg.rejectionRegainToleranceBps
      ) {
        regained = true;
        break;
      }
    }
  }

  const farPx =
    lvlPx * (1 + (sign * cfg.acceptanceMoveBeyondBps) / BASIS_POINTS_SCALE);
  let firstBreak: number | null = null,
    lastFar: number | null = null,
    farVol = 0,
    dipped = false;
  for (const t of hTrades) {
    const crossed = isBuy ? t.price < lvlPx : t.price > lvlPx;
    const beyond = isBuy ? t.price > farPx : t.price < farPx;
    if (crossed) {
      firstBreak = null;
      lastFar = null;
      farVol = 0;
      dipped = false;
    } else if (beyond) {
      if (firstBreak === null) firstBreak = t.featureTimestampMs;
      lastFar = t.featureTimestampMs;
      farVol = roundDecimal(farVol + t.quoteVolume);
    } else if (firstBreak !== null) {
      dipped = true;
    }
  }

  const endBeyond = isBuy ? finalPx > farPx : finalPx < farPx;
  const spanA =
    firstBreak !== null && lastFar !== null ? lastFar - firstBreak : 0;
  const spanB =
    firstBreak !== null ? rec.responseHorizonTimestampMs - firstBreak : 0;
  const rawDur =
    firstBreak !== null && lastFar !== null
      ? !dipped && endBeyond
        ? Math.max(spanA, spanB)
        : spanA
      : 0;
  const farDur = Math.max(0, Math.trunc(rawDur));

  let outcome: FlowClassification = "unresolved";
  if (
    maxMoveAway >= cfg.rejectionMoveAwayBps &&
    moveAwayBps >= cfg.rejectionMoveAwayBps &&
    !regained
  ) {
    outcome = isBuy ? "bearish-rejection" : "bullish-rejection";
  } else if (
    farDur >= cfg.acceptanceSustainedDurationMs &&
    farVol >= cfg.acceptanceSustainedQuoteVolume &&
    endBeyond
  ) {
    outcome = "acceptance";
  }

  const scores = buildComponentScores({
    ...rec.componentScores,
    followThroughBps: computeSignedBpsChange(lvlPx, finalPx),
    sustainedFarSideDurationMs: farDur,
    sustainedFarSideQuoteVolume: farVol,
  });
  const ids = collectBoundedEvidenceIds(
    rec.evidenceEventIds,
    hTrades,
    [],
    inp.latestTradeEventId,
    cfg.maxEvidenceEventIds,
  );
  return Object.freeze({
    ...rec,
    lifecycle: "finalized",
    outcome,
    finalizedTimestampMs: inp.featureTimestampMs,
    finalReferencePrice: finalPx,
    componentScores: scores,
    evidenceEventIds: ids,
    auditNote: `${rec.auditNote} Finalized as ${outcome} at horizon.`,
  });
}

export class ClassificationsEngine {
  private readonly config: FlowEngineConfigV1;
  private records: LevelClassificationRecordV1[] = [];
  private seq = 0;

  public constructor(
    config: FlowEngineConfigV1 = DEFAULT_FLOW_ENGINE_CONFIG_V1,
  ) {
    this.config = config;
  }

  public evaluate(
    inp: ClassificationEvaluationInputV1,
  ): readonly LevelClassificationRecordV1[] {
    const cfg = this.config;
    const thresholds = buildClassificationThresholds(cfg);
    const ts = inp.featureTimestampMs;
    const rcpt = inp.asOfReceiptTimestampMs;

    this.records = this.records.map((rec) => {
      if (rec.lifecycle !== "pending") return rec;
      if (inp.hasUnresolvedGap || inp.isStale) {
        const r = inp.hasUnresolvedGap
          ? "unresolved-sequence-gap"
          : "stale-market-input";
        return markUnavailable(rec, inp, r);
      }
      const lvl = inp.levels.find((item) => item.id === rec.levelId);
      const active =
        lvl !== undefined &&
        lvl.sourceVersion === rec.levelSourceVersion &&
        isLevelActiveAt(lvl, ts, rcpt);
      if (!active)
        return markUnavailable(rec, inp, "level-expired-or-version-changed");
      return ts < rec.responseHorizonTimestampMs
        ? rec
        : finalizeHorizon(rec, inp, cfg);
    });

    if (inp.referencePrice === null) return this.snapshot();
    const refPx = inp.referencePrice;
    const prox = cfg.levelProximityBps;
    const matches = findActiveLevelsNearPrice(
      inp.levels,
      refPx,
      ts,
      prox,
      rcpt,
    );
    const cStart = ts - cfg.absorptionCandidateWindowMs;
    const bStart = ts - cfg.absorptionBaselineWindowMs;
    const cTrades = inp.trades.filter(
      (t) =>
        t.featureTimestampMs >= cStart &&
        t.featureTimestampMs <= ts &&
        t.receiptTimestampMs <= rcpt,
    );
    const bTrades = inp.trades.filter(
      (t) =>
        t.featureTimestampMs >= bStart &&
        t.featureTimestampMs < cStart &&
        t.receiptTimestampMs <= rcpt,
    );
    const cFlow = sumDirectionalWindowTrades(cTrades);
    const bFlow = sumDirectionalWindowTrades(bTrades);

    for (const match of matches) {
      const lvl = match.level;
      const busy = this.records.some(
        (r) =>
          r.levelId === lvl.id &&
          (r.lifecycle === "pending" || r.candidateTimestampMs === ts),
      );
      if (busy) continue;

      const lowCov =
        inp.tradeSideCoverageRatio === null ||
        inp.tradeSideCoverageRatio < cfg.minTradeSideCoverageRatio;
      const gateReason = inp.hasUnresolvedGap
        ? "unresolved-gap"
        : inp.isStale
          ? "stale-input"
          : lowCov
            ? "insufficient-trade-side-coverage"
            : inp.bookCoverageRatio < cfg.minBookCoverageRatio
              ? "insufficient-book-coverage"
              : inp.isBaselineTruncated === true
                ? "truncated-retention-window"
                : null;

      if (gateReason !== null) {
        const dup = this.records.some(
          (r) =>
            r.levelId === lvl.id &&
            r.levelSourceVersion === lvl.sourceVersion &&
            r.outcome === "unavailable" &&
            ts - r.candidateTimestampMs <= cfg.absorptionCandidateWindowMs,
        );
        if (!dup) {
          const side: FlowSide =
            lvl.role === "support"
              ? "sell"
              : lvl.role === "resistance"
                ? "buy"
                : cFlow.buy >= cFlow.sell
                  ? "buy"
                  : "sell";
          const fbId = inp.latestTradeEventId ?? `eval-${String(ts)}`;
          const ids = collectBoundedEvidenceIds(
            [],
            cTrades,
            [],
            fbId,
            cfg.maxEvidenceEventIds,
          );
          const scores = buildComponentScores({
            levelDistanceBps: match.distanceBps,
            tradeSideCoverageRatio: inp.tradeSideCoverageRatio,
            bookCoverageRatio: inp.bookCoverageRatio,
          });
          const note = `Unavailable near level ${lvl.id} due to ${gateReason}.`;
          const ov = {
            lifecycle: "finalized" as const,
            outcome: "unavailable" as const,
            finalizedTimestampMs: ts,
            finalReferencePrice: refPx,
            componentScores: scores,
            evidenceEventIds: ids,
            unavailableReason: gateReason,
            auditNote: note,
          };
          this.append(
            buildBaseLevelClassificationRecord(
              this.nextId(lvl.id, ts),
              lvl,
              side,
              ts,
              refPx,
              cfg,
              thresholds,
              ov,
            ),
          );
        }
        continue;
      }

      if (cTrades.length < cfg.absorptionCandidateMinTrades) continue;
      const side: FlowSide = cFlow.buy >= cFlow.sell ? "buy" : "sell";
      if (!doesLevelSupportAbsorptionSide(lvl, side)) continue;
      if (bFlow.samples < cfg.absorptionBaselineMinSamples) continue;

      const bSpan =
        cfg.absorptionBaselineWindowMs - cfg.absorptionCandidateWindowMs;
      const bScaled =
        roundDecimal(bFlow.buy + bFlow.sell) *
        (cfg.absorptionCandidateWindowMs / bSpan);
      const bDenom = Math.max(cfg.absorptionMinBaselineQuoteVolume, bScaled);
      const domQuote = side === "buy" ? cFlow.buy : cFlow.sell;
      const netDom =
        side === "buy" ? cFlow.buy - cFlow.sell : cFlow.sell - cFlow.buy;
      if (roundDecimal(netDom) <= 0) continue;

      const flowRatio = roundDecimal(domQuote / bDenom, 6);
      if (flowRatio < cfg.elevatedFlowMultiplier) continue;

      const firstT = cTrades[0],
        lastT = cTrades[cTrades.length - 1];
      if (!firstT || !lastT) continue;
      const prices = cTrades.map((t) => t.price);
      const netBps = computeSignedBpsChange(firstT.price, lastT.price) ?? 0;
      const maxBps =
        computeSignedBpsChange(lvl.price, Math.max(...prices)) ?? 0;
      const minBps =
        computeSignedBpsChange(lvl.price, Math.min(...prices)) ?? 0;
      const progressBps =
        side === "buy"
          ? roundDecimal(Math.max(0, netBps, maxBps), 6)
          : roundDecimal(Math.max(0, -netBps, -minBps), 6);
      if (progressBps > cfg.maxAbsorptionProgressBps) continue;

      const oppSide = side === "buy" ? "ask" : "bid";
      const reps = inp.recentReplenishments.filter((r) => {
        if (
          r.side !== oppSide ||
          r.replenishTimestampMs < cStart ||
          r.replenishTimestampMs > ts
        ) {
          return false;
        }
        const d = computeAbsoluteBpsDistance(
          r.replenishedPrice,
          lvl.price,
          lvl.price,
        );
        return d !== null && d <= prox;
      });
      const repRatio =
        reps.length > 0
          ? roundDecimal(Math.max(...reps.map((r) => r.replenishmentRatio)), 6)
          : 0;

      const fScore = clamp01(
        (flowRatio - cfg.elevatedFlowMultiplier) / cfg.elevatedFlowMultiplier +
          0.5,
      );
      const pScore = clamp01(1 - progressBps / cfg.maxAbsorptionProgressBps);
      const dScore = clamp01(1 - match.distanceBps / prox);
      const cScore = clamp01(
        ((inp.tradeSideCoverageRatio ?? 0) + inp.bookCoverageRatio) / 2,
      );
      const strength = roundDecimal(
        clamp01(
          0.35 * fScore +
            0.25 * pScore +
            0.2 * dScore +
            0.2 * cScore +
            Math.min(0.15, repRatio * 0.1),
        ),
        6,
      );

      const scores = buildComponentScores({
        aggressiveFlowRatio: flowRatio,
        priceProgressBps: progressBps,
        levelDistanceBps: match.distanceBps,
        tradeSideCoverageRatio: inp.tradeSideCoverageRatio,
        bookCoverageRatio: inp.bookCoverageRatio,
        replenishmentSupportRatio: repRatio,
        relativeRankingStrength: strength,
      });
      const ids = collectBoundedEvidenceIds(
        [],
        cTrades,
        reps,
        inp.latestTradeEventId,
        cfg.maxEvidenceEventIds,
      );
      const note = `Observed elevated aggressive ${side} flow (ratio=${String(flowRatio)}) with muted price progress (${String(progressBps)} bps) near level ${lvl.id}.`;
      const ov = {
        componentScores: scores,
        evidenceEventIds: ids,
        auditNote: note,
      };
      this.append(
        buildBaseLevelClassificationRecord(
          this.nextId(lvl.id, ts),
          lvl,
          side,
          ts,
          refPx,
          cfg,
          thresholds,
          ov,
        ),
      );
    }

    return this.snapshot();
  }

  public snapshot(): readonly LevelClassificationRecordV1[] {
    return Object.freeze([...this.records]);
  }

  public reset(): void {
    this.records = [];
    this.seq = 0;
  }

  private nextId(levelId: string, ts: number): string {
    this.seq += 1;
    return `cls-${levelId}-${String(ts)}-${String(this.seq)}`;
  }

  private append(record: LevelClassificationRecordV1): void {
    this.records.push(record);
    if (this.records.length > this.config.maxRetainedClassifications) {
      this.records = this.records.slice(
        -this.config.maxRetainedClassifications,
      );
    }
  }
}
