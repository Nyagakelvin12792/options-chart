import type { FlowEngineConfigV1 } from "./configuration";
import {
  RelevantLevelV1Schema,
  type ClassificationComponentScoresV1,
  type ClassificationThresholdsSnapshotV1,
  type FlowSide,
  type LevelClassificationRecordV1,
  type NormalizedTradeFlowV1,
  type RelevantLevelV1,
  type ReplenishmentEventV1,
} from "./contracts";
import {
  computeAbsoluteBpsDistance,
  computeSignedBpsChange,
  roundDecimal,
} from "./decimal";

export const LEVEL_CONTEXT_POLICY_VERSION = "flow-level-context-v1" as const;

export interface ActiveLevelProximityMatchV1 {
  readonly level: RelevantLevelV1;
  readonly referencePrice: number;
  readonly distanceBps: number;
  readonly signedDistanceBps: number;
}

export function validateRelevantLevels(
  levels: readonly unknown[],
): readonly RelevantLevelV1[] {
  const validated = levels.map((raw) => {
    const parsed = RelevantLevelV1Schema.parse(raw);
    const normalized: RelevantLevelV1 =
      parsed.role !== undefined
        ? {
            id: parsed.id,
            price: parsed.price,
            kind: parsed.kind,
            observedAtMs: parsed.observedAtMs,
            validFromMs: parsed.validFromMs,
            validUntilMs: parsed.validUntilMs,
            sourceVersion: parsed.sourceVersion,
            role: parsed.role,
          }
        : {
            id: parsed.id,
            price: parsed.price,
            kind: parsed.kind,
            observedAtMs: parsed.observedAtMs,
            validFromMs: parsed.validFromMs,
            validUntilMs: parsed.validUntilMs,
            sourceVersion: parsed.sourceVersion,
          };
    return Object.freeze(normalized);
  });
  return Object.freeze(validated);
}

export function isLevelActiveAt(
  level: RelevantLevelV1,
  featureTimestampMs: number,
  asOfReceiptTimestampMs: number = featureTimestampMs,
): boolean {
  if (level.observedAtMs > asOfReceiptTimestampMs) {
    return false;
  }
  if (level.validFromMs > featureTimestampMs) {
    return false;
  }
  if (level.validUntilMs !== null && featureTimestampMs > level.validUntilMs) {
    return false;
  }
  return true;
}

export function doesLevelSupportAbsorptionSide(
  level: RelevantLevelV1,
  dominantSide: FlowSide,
): boolean {
  if (dominantSide === "buy") {
    return (
      level.role === "resistance" ||
      level.role === "pivot" ||
      level.role === undefined
    );
  }
  return (
    level.role === "support" ||
    level.role === "pivot" ||
    level.role === undefined
  );
}

export function findActiveLevelsNearPrice(
  levels: readonly RelevantLevelV1[],
  referencePrice: number,
  featureTimestampMs: number,
  maxProximityBps: number,
  asOfReceiptTimestampMs: number = featureTimestampMs,
): readonly ActiveLevelProximityMatchV1[] {
  if (
    !Number.isFinite(referencePrice) ||
    referencePrice <= 0 ||
    !Number.isFinite(maxProximityBps) ||
    maxProximityBps < 0
  ) {
    return Object.freeze([]);
  }

  const matches: ActiveLevelProximityMatchV1[] = [];
  for (const level of levels) {
    if (!isLevelActiveAt(level, featureTimestampMs, asOfReceiptTimestampMs)) {
      continue;
    }
    const distanceBps = computeAbsoluteBpsDistance(
      referencePrice,
      level.price,
      level.price,
    );
    if (distanceBps === null || distanceBps > maxProximityBps) {
      continue;
    }
    const signedDistanceBps =
      computeSignedBpsChange(level.price, referencePrice) ?? 0;
    matches.push(
      Object.freeze({
        level,
        referencePrice,
        distanceBps,
        signedDistanceBps,
      }),
    );
  }

  matches.sort((a, b) => {
    if (a.distanceBps !== b.distanceBps) {
      return a.distanceBps - b.distanceBps;
    }
    if (a.level.id < b.level.id) {
      return -1;
    }
    if (a.level.id > b.level.id) {
      return 1;
    }
    return 0;
  });

  return Object.freeze(matches);
}

export function buildClassificationThresholds(
  c: FlowEngineConfigV1,
): ClassificationThresholdsSnapshotV1 {
  return Object.freeze({
    levelProximityBps: c.levelProximityBps,
    elevatedFlowMultiplier: c.elevatedFlowMultiplier,
    maxAbsorptionProgressBps: c.maxAbsorptionProgressBps,
    responseHorizonMs: c.responseHorizonMs,
    rejectionMoveAwayBps: c.rejectionMoveAwayBps,
    rejectionRegainToleranceBps: c.rejectionRegainToleranceBps,
    acceptanceMoveBeyondBps: c.acceptanceMoveBeyondBps,
    acceptanceSustainedDurationMs: c.acceptanceSustainedDurationMs,
    acceptanceSustainedQuoteVolume: c.acceptanceSustainedQuoteVolume,
    minTradeSideCoverageRatio: c.minTradeSideCoverageRatio,
    minBookCoverageRatio: c.minBookCoverageRatio,
  });
}

export function buildComponentScores(
  partial: Partial<ClassificationComponentScoresV1>,
): ClassificationComponentScoresV1 {
  return Object.freeze({
    aggressiveFlowRatio: null,
    priceProgressBps: null,
    levelDistanceBps: null,
    tradeSideCoverageRatio: null,
    bookCoverageRatio: null,
    replenishmentSupportRatio: null,
    followThroughBps: null,
    sustainedFarSideDurationMs: null,
    sustainedFarSideQuoteVolume: null,
    relativeRankingStrength: null,
    ...partial,
  });
}

export function buildBaseLevelClassificationRecord(
  id: string,
  lvl: RelevantLevelV1,
  side: FlowSide,
  ts: number,
  refPx: number,
  cfg: FlowEngineConfigV1,
  thresholds: ClassificationThresholdsSnapshotV1,
  overrides: Partial<LevelClassificationRecordV1>,
): LevelClassificationRecordV1 {
  const cls = side === "buy" ? "buy-absorption" : "sell-absorption";
  return Object.freeze({
    recordId: id,
    lifecycle: "pending",
    candidateClassification: cls,
    outcome: cls,
    levelId: lvl.id,
    levelPrice: lvl.price,
    levelKind: lvl.kind,
    levelSourceVersion: lvl.sourceVersion,
    candidateTimestampMs: ts,
    responseHorizonTimestampMs: ts + cfg.responseHorizonMs,
    finalizedTimestampMs: null,
    dominantAggressiveSide: side,
    referencePriceAtCandidate: refPx,
    finalReferencePrice: null,
    componentScores: buildComponentScores({}),
    thresholds,
    evidenceEventIds: Object.freeze([]),
    unavailableReason: null,
    auditNote: `Candidate at ${lvl.id}.`,
    ...overrides,
  });
}

export function collectBoundedEvidenceIds(
  base: readonly string[],
  trades: readonly NormalizedTradeFlowV1[],
  reps: readonly ReplenishmentEventV1[],
  fallback: string | undefined,
  maxIds: number,
): readonly string[] {
  const set = new Set<string>(base);
  for (const t of trades) if (t.eventId) set.add(t.eventId);
  for (const r of reps) {
    if (r.removalEventId) set.add(r.removalEventId);
    if (r.replenishEventId) set.add(r.replenishEventId);
  }
  if (set.size === 0 && fallback) set.add(fallback);
  const arr = [...set];
  return Object.freeze(arr.length > maxIds ? arr.slice(-maxIds) : arr);
}

export function sumDirectionalWindowTrades(
  trades: readonly NormalizedTradeFlowV1[],
): {
  readonly buy: number;
  readonly sell: number;
  readonly samples: number;
} {
  let buy = 0,
    sell = 0,
    samples = 0;
  for (const t of trades) {
    if (t.takerSide === "buy") {
      buy = roundDecimal(buy + t.quoteVolume);
      samples += 1;
    } else if (t.takerSide === "sell") {
      sell = roundDecimal(sell + t.quoteVolume);
      samples += 1;
    }
  }
  return { buy, sell, samples };
}
