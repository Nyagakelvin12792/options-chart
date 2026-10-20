import {
  CLASSIFICATIONS_POLICY_VERSION,
  CVD_POLICY_VERSION,
  FlowFeatureSnapshotV1Schema,
  ORDER_BOOK_POLICY_VERSION,
  type FlowFeatureSnapshotV1,
  type LevelClassificationRecordV1,
} from "@options-chart/flow-engine";
import { recordEvidence, type LayerContext } from "./layer-context";
import type {
  FlowPressureState,
  ImbalanceState,
  OrderFlowLayerV1,
  ResponseDirection,
  ResponseState,
  SourceHealthV1,
} from "./market-state-contracts";
import type { FlowInput } from "./market-state-input";
import { MARKET_STATE_THRESHOLDS_V1 } from "./thresholds";
import { resolveSourceHealth } from "./source-health";

const T = MARKET_STATE_THRESHOLDS_V1;
const QUOTE_UNIT = "quote-usdt";

type Pressure = { state: FlowPressureState; evidenceRefs: string[] };
const UNAVAILABLE_PRESSURE: Pressure = {
  state: "unavailable",
  evidenceRefs: [],
};

type ClassificationTiming = Pick<
  LevelClassificationRecordV1,
  "candidateTimestampMs" | "finalizedTimestampMs" | "lifecycle"
>;

export function isClassificationAvailableAt(
  record: ClassificationTiming,
  effectiveAtMs: number,
): boolean {
  return (
    record.candidateTimestampMs <= effectiveAtMs &&
    (record.lifecycle === "pending"
      ? record.finalizedTimestampMs === null
      : record.finalizedTimestampMs !== null &&
        record.finalizedTimestampMs <= effectiveAtMs)
  );
}

function classifyRatio(ratio: number): FlowPressureState {
  const magnitude = Math.abs(ratio);
  if (magnitude < T.flowBalancedRatio) {
    return "balanced";
  }
  const strong = magnitude >= T.flowStrongRatio;
  if (ratio > 0) {
    return strong ? "strong-buy" : "buy";
  }
  return strong ? "strong-sell" : "sell";
}

function pressure(
  idPrefix: string,
  net: number,
  total: number,
  availability: string,
  asOfMs: number,
  ctx: LayerContext,
): Pressure {
  if (availability === "unavailable" || total <= 0) {
    return UNAVAILABLE_PRESSURE;
  }
  const record = (suffix: string, value: number): string =>
    recordEvidence(ctx, {
      evidenceId: `${idPrefix}:${suffix}`,
      name: `${idPrefix.replace(/:/g, ".")}.${suffix}`,
      value,
      unit: QUOTE_UNIT,
      formulaVersion: CVD_POLICY_VERSION,
      source: "cryptofeed-shadow",
      asOfMs,
    });
  const evidenceRefs = [record("netQuote", net), record("totalQuote", total)];
  if (availability === "degraded") {
    ctx.collector.warn(`FLOW_DEGRADED:${idPrefix}`);
  }
  return { state: classifyRatio(net / total), evidenceRefs };
}

function imbalance(
  snapshot: FlowFeatureSnapshotV1,
  ctx: LayerContext,
): { state: ImbalanceState; evidenceRefs: string[] } {
  const book = snapshot.book;
  const top = book.topNImbalances.find((n) => n.depthN === T.imbalanceDepthN);
  if (
    book.availability === "unavailable" ||
    top === undefined ||
    top.notionalImbalance === null
  ) {
    return { state: "unavailable", evidenceRefs: [] };
  }
  const ref = recordEvidence(ctx, {
    evidenceId: `flow:book:top${T.imbalanceDepthN}NotionalImbalance`,
    name: `flow.book.top${T.imbalanceDepthN}NotionalImbalance`,
    value: top.notionalImbalance,
    unit: "ratio",
    formulaVersion: ORDER_BOOK_POLICY_VERSION,
    source: "cryptofeed-shadow",
    asOfMs: snapshot.asOfReceiptTimestampMs,
  });
  const state: ImbalanceState =
    top.notionalImbalance >= T.imbalanceHeavy
      ? "bid-heavy"
      : top.notionalImbalance <= -T.imbalanceHeavy
        ? "ask-heavy"
        : "balanced";
  return { state, evidenceRefs: [ref] };
}

function mapRecord(record: LevelClassificationRecordV1): {
  state: ResponseState;
  direction: ResponseDirection | null;
} {
  const bullishCandidate = record.candidateClassification === "sell-absorption";
  if (record.lifecycle === "pending") {
    return {
      state: "absorption-pending",
      direction: bullishCandidate ? "bullish" : "bearish",
    };
  }
  switch (record.outcome) {
    case "bullish-rejection":
      return { state: "rejection", direction: "bullish" };
    case "bearish-rejection":
      return { state: "rejection", direction: "bearish" };
    case "acceptance":
      // Accepted beyond the absorbed level: the prior flow side prevailed.
      return {
        state: "acceptance",
        direction: bullishCandidate ? "bearish" : "bullish",
      };
    case "unresolved":
      return { state: "unresolved", direction: null };
    default:
      return { state: "unavailable", direction: null };
  }
}

function response(
  snapshot: FlowFeatureSnapshotV1,
  effectiveAtMs: number,
  ctx: LayerContext,
): OrderFlowLayerV1["response"] {
  for (const record of snapshot.classifications) {
    const finalizedInFuture =
      record.finalizedTimestampMs !== null &&
      record.finalizedTimestampMs > effectiveAtMs;
    if (record.candidateTimestampMs > effectiveAtMs || finalizedInFuture) {
      ctx.collector.markFuture(`flow:response:${record.recordId}`);
    } else if (
      (record.lifecycle === "pending" &&
        record.finalizedTimestampMs !== null) ||
      (record.lifecycle === "finalized" && record.finalizedTimestampMs === null)
    ) {
      ctx.collector.warn(`FLOW_CLASSIFICATION_INCONSISTENT:${record.recordId}`);
    }
  }

  const eligible = snapshot.classifications
    .filter((record) => isClassificationAvailableAt(record, effectiveAtMs))
    .sort(
      (a, b) =>
        b.candidateTimestampMs - a.candidateTimestampMs ||
        a.recordId.localeCompare(b.recordId),
    );
  const latest = eligible[0];
  if (latest === undefined) {
    return {
      state: "none",
      direction: null,
      levelId: null,
      recordId: null,
      evidenceRefs: [],
    };
  }
  const mapped = mapRecord(latest);
  const ref = recordEvidence(ctx, {
    evidenceId: `flow:response:${latest.recordId}:levelPrice`,
    name: "flow.response.levelPrice",
    value: latest.levelPrice,
    unit: "usd",
    formulaVersion: CLASSIFICATIONS_POLICY_VERSION,
    source: "cryptofeed-shadow",
    asOfMs: latest.candidateTimestampMs,
  });
  return {
    state: mapped.state,
    direction: mapped.direction,
    levelId: latest.levelId,
    recordId: latest.recordId,
    evidenceRefs: [ref],
  };
}

function flowHealth(
  snapshot: FlowFeatureSnapshotV1,
  base: SourceHealthV1,
): SourceHealthV1 {
  if (base.state !== "live") {
    return base;
  }
  if (snapshot.health.availability === "unavailable") {
    return { ...base, state: "unavailable" };
  }
  if (snapshot.health.isStale) {
    return { ...base, state: "stale" };
  }
  return base;
}

function emptyLayer(health: SourceHealthV1): OrderFlowLayerV1 {
  return {
    health,
    cvd: UNAVAILABLE_PRESSURE,
    aggressiveFlow: UNAVAILABLE_PRESSURE,
    imbalance: { state: "unavailable", evidenceRefs: [] },
    response: {
      state: "unavailable",
      direction: null,
      levelId: null,
      recordId: null,
      evidenceRefs: [],
    },
    coverage: { tradeSideCoverageRatio: null, bookCoverageRatio: null },
    featureVersion: null,
  };
}

/**
 * Order-flow layer from a validated M11.3 snapshot. Missing, stale, gapped or
 * future-dated flow stays `unavailable`; it is never mapped to "balanced".
 */
export function buildFlowLayer(
  flow: FlowInput | null,
  ctx: LayerContext,
): OrderFlowLayerV1 {
  if (flow === null) {
    return emptyLayer(resolveSourceHealth(ctx.effectiveAtMs, null).health);
  }
  const snapshot = FlowFeatureSnapshotV1Schema.parse(flow.snapshot);
  const resolved = resolveSourceHealth(ctx.effectiveAtMs, {
    asOfMs: snapshot.asOfReceiptTimestampMs,
    staleAfterMs: flow.staleAfterMs,
  });
  if (resolved.future) {
    ctx.collector.markFuture("flow");
    return emptyLayer(resolved.health);
  }
  const health = flowHealth(snapshot, resolved.health);
  if (health.state !== "live") {
    ctx.collector.warn(`FLOW_${health.state.toUpperCase()}`);
    return emptyLayer(health);
  }
  const featureVersion = `${snapshot.schemaVersion}/${snapshot.configVersion}`;
  ctx.collector.addFeatureVersion("flow-feature-snapshot", featureVersion);
  ctx.collector.addSourceIds(snapshot.evidenceEventIds);
  ctx.collector.addVenue("cryptofeed-binance-spot");
  const asOf = snapshot.asOfReceiptTimestampMs;
  const anchor = snapshot.cvd.activeAnchor;
  const shortest = [...snapshot.cvd.rollingByDuration]
    .filter((w) => w.availability !== "unavailable")
    .sort((a, b) => (a.windowDurationMs ?? 0) - (b.windowDurationMs ?? 0))[0];
  return {
    health,
    cvd: pressure(
      "flow:cvd:anchor",
      anchor.rawCvdQuote,
      anchor.totalQuoteVolume,
      anchor.availability,
      asOf,
      ctx,
    ),
    aggressiveFlow:
      shortest === undefined
        ? UNAVAILABLE_PRESSURE
        : pressure(
            `flow:cvd:${shortest.windowId}`,
            shortest.rawCvdQuote,
            shortest.totalQuoteVolume,
            shortest.availability,
            asOf,
            ctx,
          ),
    imbalance: imbalance(snapshot, ctx),
    response: response(snapshot, ctx.effectiveAtMs, ctx),
    coverage: {
      tradeSideCoverageRatio: snapshot.health.tradeSideCoverageRatio,
      bookCoverageRatio: snapshot.health.bookCoverageRatio,
    },
    featureVersion,
  };
}
