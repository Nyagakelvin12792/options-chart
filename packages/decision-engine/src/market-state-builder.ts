import { EvidenceCollector } from "./evidence-collector";
import { buildFlowLayer } from "./flow-layer";
import { recordEvidence, type LayerContext } from "./layer-context";
import { buildLocationLayer } from "./location-layer";
import {
  MARKET_STATE_SCHEMA_VERSION,
  MarketStateV1Schema,
  type MarketStateV1,
} from "./market-state-contracts";
import {
  MarketStateInputV1Schema,
  type MarketStateInputV1,
} from "./market-state-input";
import { buildOptionsLayer } from "./options-layer";
import { resolveSourceHealth } from "./source-health";
import { buildStructureLayer } from "./structure-layer";
import {
  MARKET_STATE_CLASSIFICATION_VERSION,
  MARKET_STATE_THRESHOLDS_V1,
} from "./thresholds";
import { buildTradeQualityLayer } from "./trade-quality-layer";
import { contentHash, deepFreeze, deriveId } from "./canonical";
import { resolveZones } from "./zones";

export type MarketStateBuildResult =
  | { readonly ok: true; readonly state: MarketStateV1 }
  | { readonly ok: false; readonly error: Error };

type StateContent = Omit<MarketStateV1, "identity"> & {
  identity: Omit<MarketStateV1["identity"], "stateId">;
};

/** Deterministic state identity over every field except the ID itself. */
export function computeStateId(content: StateContent): string {
  return deriveId(MARKET_STATE_SCHEMA_VERSION, content);
}

function collectEvidenceRefs(value: unknown, out: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((v) => collectEvidenceRefs(v, out));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (key === "evidenceRefs" && Array.isArray(child)) {
        child.forEach((ref) => out.add(String(ref)));
      } else if (key !== "evidence") {
        collectEvidenceRefs(child, out);
      }
    }
  }
}

/**
 * Validates a stored or received state: schema, evidence-reference integrity
 * (every classification must resolve to stored numeric evidence), and that the
 * `stateId` still matches the content. Throws on any violation.
 */
export function parseMarketState(raw: unknown): MarketStateV1 {
  const state = MarketStateV1Schema.parse(raw);
  const known = new Set(
    state.evidence.numericEvidence.map((e) => e.evidenceId),
  );
  const refs = new Set<string>();
  collectEvidenceRefs(state, refs);
  for (const ref of refs) {
    if (!known.has(ref)) {
      throw new Error(`Unresolved evidence reference: ${ref}`);
    }
  }
  for (const item of state.evidence.numericEvidence) {
    if (item.effectiveAtMs > state.identity.effectiveAtMs) {
      throw new Error(`Future-dated evidence in state: ${item.evidenceId}`);
    }
  }
  const { stateId, ...identity } = state.identity;
  if (stateId !== computeStateId({ ...state, identity })) {
    throw new Error("stateId does not match state content");
  }
  return deepFreeze(state);
}

function recordCandles(
  input: MarketStateInputV1,
  ctx: LayerContext,
): {
  referencePrice: number | null;
  previousPrice: number | null;
  health: ReturnType<typeof resolveSourceHealth>;
} {
  const resolved = resolveSourceHealth(ctx.effectiveAtMs, input.candles);
  const candles = input.candles;
  if (resolved.future) {
    ctx.collector.markFuture("candles");
  } else if (candles !== null && !resolved.usable) {
    ctx.collector.warn("CANDLES_STALE");
  }
  if (candles === null || !resolved.usable) {
    return { referencePrice: null, previousPrice: null, health: resolved };
  }
  const point = (name: string, value: number): void => {
    recordEvidence(ctx, {
      evidenceId: `candles:${name}`,
      name: `candles.${name}`,
      value,
      unit: "usd",
      formulaVersion: candles.sourceVersion,
      source: "binance-spot",
      asOfMs: candles.asOfMs,
    });
  };
  point("lastPrice", candles.lastPrice);
  if (candles.previousPrice !== null) {
    point("previousPrice", candles.previousPrice);
  }
  return {
    referencePrice: candles.lastPrice,
    previousPrice: candles.previousPrice,
    health: resolved,
  };
}

/**
 * Builds one `MarketStateV1`. Pure: time is explicit, nothing is read from the
 * clock, and no existing formula is recomputed. Throws on malformed input.
 */
export function buildMarketState(rawInput: unknown): MarketStateV1 {
  const input = MarketStateInputV1Schema.parse(rawInput);
  const { identity } = input;
  const collector = new EvidenceCollector();
  const ctx: LayerContext = {
    effectiveAtMs: identity.effectiveAtMs,
    collector,
  };
  collector.addFormulaVersion(
    "market-state-classification",
    MARKET_STATE_CLASSIFICATION_VERSION,
  );
  collector.addFeatureVersion(
    "market-state-thresholds",
    contentHash(MARKET_STATE_THRESHOLDS_V1).slice(0, 16),
  );

  const candles = recordCandles(input, ctx);
  const zones =
    candles.referencePrice === null
      ? []
      : resolveZones(input.zones, candles.referencePrice, ctx);
  if (candles.referencePrice === null && input.zones.length > 0) {
    collector.warn("ZONES_REQUIRE_REFERENCE_PRICE");
  }

  const marketStructure = buildStructureLayer(input.structure, ctx);
  const location = buildLocationLayer(
    {
      referencePrice: candles.referencePrice,
      previousPrice: candles.previousPrice,
      candlesHealth: candles.health.health,
      avwap: input.avwap,
      volumeProfile: input.volumeProfile,
      zones,
    },
    ctx,
  );
  const orderFlow = buildFlowLayer(input.flow, ctx);
  const optionsRegime = buildOptionsLayer(
    input.options,
    candles.referencePrice,
    zones,
    ctx,
  );
  const trade = buildTradeQualityLayer(
    input.proposedTrade,
    input.accountRisk,
    marketStructure,
    orderFlow,
    ctx,
  );

  const content: StateContent = {
    identity: {
      schemaVersion: MARKET_STATE_SCHEMA_VERSION,
      createdAtMs: identity.createdAtMs,
      effectiveAtMs: identity.effectiveAtMs,
      symbol: identity.symbol,
      activeTimeframe: identity.activeTimeframe,
      expiryScope: identity.expiryScope,
      mode: identity.mode,
      generationId: identity.generationId,
      replayCursorMs: identity.replayCursorMs,
    },
    health: {
      candles: candles.health.health,
      options: optionsRegime.health,
      flow: orderFlow.health,
      geometry: trade.geometryHealth,
      accountRisk: trade.accountHealth,
      warnings: collector.warningCodes(),
    },
    marketStructure,
    location,
    orderFlow,
    optionsRegime,
    tradeQuality: trade.layer,
    evidence: collector.build(),
  };
  const stateId = computeStateId(content);
  return parseMarketState({
    ...content,
    identity: { ...content.identity, stateId },
  });
}

export function tryBuildMarketState(rawInput: unknown): MarketStateBuildResult {
  try {
    return { ok: true, state: buildMarketState(rawInput) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
