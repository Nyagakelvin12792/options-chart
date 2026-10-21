import { recordEvidence, type LayerContext } from "./layer-context";
import type {
  MarketStructureLayerV1,
  StructureAgreement,
  StructureState,
  StructureTimeframe,
  TimeframeStructureV1,
} from "./market-state-contracts";
import type { StructureTimeframeInput } from "./market-state-input";
import { resolveSourceHealth } from "./source-health";

function classify(input: StructureTimeframeInput): {
  state: StructureState;
  invalidationPrice: number | null;
} {
  const higherHigh = input.lastSwingHigh > input.prevSwingHigh;
  const higherLow = input.lastSwingLow > input.prevSwingLow;
  const lowerHigh = input.lastSwingHigh < input.prevSwingHigh;
  const lowerLow = input.lastSwingLow < input.prevSwingLow;
  if (higherHigh && higherLow) {
    // A close below the last swing low breaks the sequence: transition.
    return input.close < input.lastSwingLow
      ? { state: "transition", invalidationPrice: input.lastSwingLow }
      : { state: "uptrend", invalidationPrice: input.lastSwingLow };
  }
  if (lowerHigh && lowerLow) {
    return input.close > input.lastSwingHigh
      ? { state: "transition", invalidationPrice: input.lastSwingHigh }
      : { state: "downtrend", invalidationPrice: input.lastSwingHigh };
  }
  return { state: "range", invalidationPrice: null };
}

function buildTimeframe(
  timeframe: StructureTimeframe,
  input: StructureTimeframeInput | null,
  ctx: LayerContext,
): TimeframeStructureV1 {
  const resolved = resolveSourceHealth(ctx.effectiveAtMs, input);
  if (resolved.future) {
    ctx.collector.markFuture(`structure:${timeframe}`);
  } else if (input !== null && !resolved.usable) {
    ctx.collector.warn(`STRUCTURE_STALE:${timeframe}`);
  }
  if (input === null || !resolved.usable) {
    return {
      timeframe,
      state: "unavailable",
      invalidationPrice: null,
      evidenceRefs: [],
      health: resolved.health,
    };
  }
  const point = (name: string, value: number): string =>
    recordEvidence(ctx, {
      evidenceId: `structure:${timeframe}:${name}`,
      name: `structure.${timeframe}.${name}`,
      value,
      unit: "usd",
      formulaVersion: input.formulaVersion,
      source: "binance-spot",
      asOfMs: input.asOfMs,
    });
  const evidenceRefs = [
    point("close", input.close),
    point("lastSwingHigh", input.lastSwingHigh),
    point("prevSwingHigh", input.prevSwingHigh),
    point("lastSwingLow", input.lastSwingLow),
    point("prevSwingLow", input.prevSwingLow),
  ];
  const { state, invalidationPrice } = classify(input);
  return {
    timeframe,
    state,
    invalidationPrice,
    evidenceRefs,
    health: resolved.health,
  };
}

/** Independent agreement label; individual timeframe states are never merged. */
export function resolveAgreement(
  states: readonly StructureState[],
): StructureAgreement {
  const available = states.filter((s) => s !== "unavailable");
  if (available.length === 0) {
    return "unavailable";
  }
  const hasUp = available.includes("uptrend");
  const hasDown = available.includes("downtrend");
  if (hasUp && hasDown) {
    return "conflicting";
  }
  if (available.length >= 2 && available.every((s) => s === "uptrend")) {
    return "aligned-up";
  }
  if (available.length >= 2 && available.every((s) => s === "downtrend")) {
    return "aligned-down";
  }
  return "mixed";
}

export function buildStructureLayer(
  input: {
    readonly h4: StructureTimeframeInput | null;
    readonly h1: StructureTimeframeInput | null;
    readonly m15: StructureTimeframeInput | null;
  },
  ctx: LayerContext,
): MarketStructureLayerV1 {
  const h4 = buildTimeframe("4h", input.h4, ctx);
  const h1 = buildTimeframe("1h", input.h1, ctx);
  const m15 = buildTimeframe("15m", input.m15, ctx);
  const all = [h4, h1, m15];
  return {
    h4,
    h1,
    m15,
    agreement: resolveAgreement(all.map((t) => t.state)),
    transitionTimeframes: all
      .filter((t) => t.state === "transition")
      .map((t) => t.timeframe),
  };
}
