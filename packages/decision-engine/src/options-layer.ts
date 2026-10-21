import { computeAbsoluteBpsDistance } from "@options-chart/flow-engine/decimal";
import { recordEvidence, type LayerContext } from "./layer-context";
import type {
  ExpiryPressureState,
  GammaState,
  LevelZoneV1,
  OptionsRegimeLayerV1,
  VolatilityState,
} from "./market-state-contracts";
import type { OptionsInput } from "./market-state-input";
import {
  MARKET_STATE_CLASSIFICATION_VERSION,
  MARKET_STATE_THRESHOLDS_V1,
} from "./thresholds";
import { resolveSourceHealth } from "./source-health";
import { OPTIONS_ZONE_KINDS, compareZones } from "./zones";

const T = MARKET_STATE_THRESHOLDS_V1;
type Part<S> = { state: S; evidenceRefs: string[] };

function gammaPart(
  options: OptionsInput,
  referencePrice: number | null,
  ctx: LayerContext,
): Part<GammaState> {
  if (options.modeledSignedGexOnePercentUsd === null) {
    return { state: "unavailable", evidenceRefs: [] };
  }
  const evidenceRefs = [
    recordEvidence(ctx, {
      evidenceId: "options:modeledSignedGexOnePercentUsd",
      name: "options.modeledSignedGexOnePercentUsd",
      value: options.modeledSignedGexOnePercentUsd,
      unit: "usd-per-1pct",
      formulaVersion: options.formulaVersion,
      source: "deribit",
      asOfMs: options.asOfMs,
    }),
  ];
  if (options.gammaFlipPrice !== null && referencePrice !== null) {
    evidenceRefs.push(
      recordEvidence(ctx, {
        evidenceId: "options:gammaFlipPrice",
        name: "options.gammaFlipPrice",
        value: options.gammaFlipPrice,
        unit: "usd",
        formulaVersion: options.formulaVersion,
        source: "deribit",
        asOfMs: options.asOfMs,
      }),
    );
    const distance = computeAbsoluteBpsDistance(
      referencePrice,
      options.gammaFlipPrice,
      options.gammaFlipPrice,
    );
    if (distance !== null && distance <= T.gammaTransitionBandBps) {
      return { state: "transition", evidenceRefs };
    }
  }
  const gex = options.modeledSignedGexOnePercentUsd;
  return {
    state: gex > 0 ? "positive" : gex < 0 ? "negative" : "transition",
    evidenceRefs,
  };
}

function volatilityPart(
  options: OptionsInput,
  ctx: LayerContext,
): Part<VolatilityState> {
  if (options.atmIvCurrent === null || options.atmIvBaseline === null) {
    return { state: "unavailable", evidenceRefs: [] };
  }
  const record = (suffix: string, value: number): string =>
    recordEvidence(ctx, {
      evidenceId: `options:atmIv${suffix}`,
      name: `options.atmIv${suffix}`,
      value,
      unit: "iv-decimal",
      formulaVersion: options.formulaVersion,
      source: "deribit",
      asOfMs: options.asOfMs,
    });
  const evidenceRefs = [
    record("Current", options.atmIvCurrent),
    record("Baseline", options.atmIvBaseline),
  ];
  const ratio = options.atmIvCurrent / options.atmIvBaseline;
  const state: VolatilityState =
    ratio < T.ivContractingRatio
      ? "contracting"
      : ratio > T.ivExpandingRatio
        ? "expanding"
        : "normal";
  return { state, evidenceRefs };
}

function expiryPart(
  options: OptionsInput,
  ctx: LayerContext,
): Part<ExpiryPressureState> {
  if (options.nextExpiryMs === null) {
    return { state: "unavailable", evidenceRefs: [] };
  }
  const remainingMs = options.nextExpiryMs - ctx.effectiveAtMs;
  if (remainingMs < 0) {
    ctx.collector.warn("OPTIONS_EXPIRY_IN_PAST");
    return { state: "unavailable", evidenceRefs: [] };
  }
  const ref = recordEvidence(ctx, {
    evidenceId: "options:msToNextExpiry",
    name: "options.msToNextExpiry",
    value: remainingMs,
    unit: "ms",
    formulaVersion: MARKET_STATE_CLASSIFICATION_VERSION,
    source: "deterministic-derived",
    asOfMs: options.asOfMs,
  });
  const state: ExpiryPressureState =
    remainingMs <= T.expiryImminentMs
      ? "imminent"
      : remainingMs <= T.expiryBuildingMs
        ? "building"
        : "none";
  return { state, evidenceRefs: [ref] };
}

/**
 * Options-regime layer from Deribit-authoritative evidence. Missing or stale
 * options data stays `unavailable`; it is never reported as neutral Gamma.
 * Charm, Vanna, Speed and Color are intentionally absent (audit-only).
 */
export function buildOptionsLayer(
  options: OptionsInput | null,
  referencePrice: number | null,
  zones: readonly LevelZoneV1[],
  ctx: LayerContext,
): OptionsRegimeLayerV1 {
  const resolved = resolveSourceHealth(ctx.effectiveAtMs, options);
  if (resolved.future) {
    ctx.collector.markFuture("options");
  } else if (options !== null && !resolved.usable) {
    ctx.collector.warn("OPTIONS_STALE");
  }
  const unavailable = { state: "unavailable" as const, evidenceRefs: [] };
  if (options === null || !resolved.usable) {
    return {
      gamma: unavailable,
      volatility: unavailable,
      expiryPressure: unavailable,
      strongestZone: null,
      health: resolved.health,
    };
  }
  return {
    gamma: gammaPart(options, referencePrice, ctx),
    volatility: volatilityPart(options, ctx),
    expiryPressure: expiryPart(options, ctx),
    strongestZone:
      [...zones]
        .filter((z) => OPTIONS_ZONE_KINDS.has(z.kind))
        .sort(compareZones)[0] ?? null,
    health: resolved.health,
  };
}
