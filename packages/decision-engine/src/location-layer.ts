import { computeAbsoluteBpsDistance } from "@options-chart/flow-engine/decimal";
import { recordEvidence, type LayerContext } from "./layer-context";
import {
  type AvwapState,
  type LevelZoneV1,
  type LocationLayerV1,
  type SourceHealthV1,
  type VolumeProfileState,
  type WallInteractionState,
} from "./market-state-contracts";
import type { AvwapInput, VolumeProfileInput } from "./market-state-input";
import {
  MARKET_STATE_CLASSIFICATION_VERSION,
  MARKET_STATE_THRESHOLDS_V1,
} from "./thresholds";
import { resolveSourceHealth } from "./source-health";
import { WALL_ZONE_KINDS, compareZones, strengthOf } from "./zones";

export interface LocationLayerInput {
  readonly referencePrice: number | null;
  readonly previousPrice: number | null;
  readonly candlesHealth: SourceHealthV1;
  readonly avwap: AvwapInput | null;
  readonly volumeProfile: VolumeProfileInput | null;
  readonly zones: readonly LevelZoneV1[];
}

const T = MARKET_STATE_THRESHOLDS_V1;

function avwapLayer(
  referencePrice: number | null,
  avwap: AvwapInput | null,
  ctx: LayerContext,
): { state: AvwapState; evidenceRefs: string[] } {
  const resolved = resolveSourceHealth(ctx.effectiveAtMs, avwap);
  if (resolved.future) {
    ctx.collector.markFuture("avwap");
  } else if (avwap !== null && !resolved.usable) {
    ctx.collector.warn("AVWAP_STALE");
  }
  if (avwap === null || !resolved.usable || referencePrice === null) {
    return { state: "unavailable", evidenceRefs: [] };
  }
  const distance = computeAbsoluteBpsDistance(
    referencePrice,
    avwap.value,
    avwap.value,
  );
  if (distance === null) {
    return { state: "unavailable", evidenceRefs: [] };
  }
  const valueRef = recordEvidence(ctx, {
    evidenceId: "avwap:value",
    name: "avwap.value",
    value: avwap.value,
    unit: "usd",
    formulaVersion: avwap.formulaVersion,
    source: "binance-spot",
    asOfMs: avwap.asOfMs,
  });
  const distanceRef = recordEvidence(ctx, {
    evidenceId: "avwap:distanceBps",
    name: "avwap.distanceBps",
    value: distance,
    unit: "bps",
    formulaVersion: MARKET_STATE_CLASSIFICATION_VERSION,
    source: "deterministic-derived",
    asOfMs: avwap.asOfMs,
  });
  const state: AvwapState =
    distance <= T.avwapAtBandBps
      ? "at"
      : referencePrice > avwap.value
        ? "above"
        : "below";
  return { state, evidenceRefs: [valueRef, distanceRef] };
}

function volumeProfileLayer(
  referencePrice: number | null,
  profile: VolumeProfileInput | null,
  ctx: LayerContext,
): { state: VolumeProfileState; evidenceRefs: string[] } {
  const resolved = resolveSourceHealth(ctx.effectiveAtMs, profile);
  if (resolved.future) {
    ctx.collector.markFuture("volumeProfile");
  } else if (profile !== null && !resolved.usable) {
    ctx.collector.warn("VOLUME_PROFILE_STALE");
  }
  if (profile === null || !resolved.usable || referencePrice === null) {
    return { state: "unavailable", evidenceRefs: [] };
  }
  const point = (name: string, value: number): string =>
    recordEvidence(ctx, {
      evidenceId: `volumeProfile:${name}`,
      name: `volumeProfile.${name}`,
      value,
      unit: "usd",
      formulaVersion: profile.formulaVersion,
      source: "binance-spot",
      asOfMs: profile.asOfMs,
    });
  const evidenceRefs = [
    point("val", profile.val),
    point("poc", profile.poc),
    point("vah", profile.vah),
  ];
  const state: VolumeProfileState =
    referencePrice > profile.vah
      ? "above-value"
      : referencePrice < profile.val
        ? "below-value"
        : "inside-value";
  return { state, evidenceRefs };
}

function wallInteraction(
  referencePrice: number | null,
  previousPrice: number | null,
  zones: readonly LevelZoneV1[],
): LocationLayerV1["wallInteraction"] {
  if (referencePrice === null || zones.length === 0) {
    return { state: "unavailable", wallZoneId: null, evidenceRefs: [] };
  }
  const walls = zones.filter((z) => WALL_ZONE_KINDS.has(z.kind));
  if (walls.length === 0) {
    return { state: "none", wallZoneId: null, evidenceRefs: [] };
  }
  const nearestFirst = [...walls].sort(
    (a, b) => a.distanceBps - b.distanceBps || compareZones(a, b),
  );
  if (previousPrice !== null) {
    const crossed = nearestFirst.find(
      (w) =>
        (previousPrice < w.price && referencePrice >= w.price) ||
        (previousPrice > w.price && referencePrice <= w.price),
    );
    if (crossed !== undefined) {
      return {
        state: "through",
        wallZoneId: crossed.zoneId,
        evidenceRefs: crossed.evidenceRefs,
      };
    }
  }
  const nearest = nearestFirst[0];
  if (nearest === undefined) {
    return { state: "none", wallZoneId: null, evidenceRefs: [] };
  }
  const state: WallInteractionState =
    nearest.distanceBps <= T.wallTestingBps
      ? "testing"
      : nearest.distanceBps <= T.wallApproachingBps
        ? "approaching"
        : "none";
  return state === "none"
    ? { state, wallZoneId: null, evidenceRefs: [] }
    : { state, wallZoneId: nearest.zoneId, evidenceRefs: nearest.evidenceRefs };
}

/**
 * Location layer. AVWAP and Volume Profile stay distinct inputs; support and
 * resistance are chosen independently from the same dated zone set.
 */
export function buildLocationLayer(
  input: LocationLayerInput,
  ctx: LayerContext,
): LocationLayerV1 {
  const { referencePrice } = input;
  const supports = input.zones.filter(
    (z) => referencePrice !== null && z.price <= referencePrice,
  );
  const resistances = input.zones.filter(
    (z) => referencePrice !== null && z.price > referencePrice,
  );
  const strongestSupport = [...supports].sort(compareZones)[0] ?? null;
  const strongestResistance = [...resistances].sort(compareZones)[0] ?? null;
  const hasZones = referencePrice !== null && input.zones.length > 0;
  return {
    referencePrice,
    avwap: avwapLayer(referencePrice, input.avwap, ctx),
    volumeProfile: volumeProfileLayer(referencePrice, input.volumeProfile, ctx),
    strongestSupport,
    strongestResistance,
    supportStrength: strengthOf(strongestSupport, hasZones),
    resistanceStrength: strengthOf(strongestResistance, hasZones),
    wallInteraction: wallInteraction(
      referencePrice,
      input.previousPrice,
      input.zones,
    ),
    health: input.candlesHealth,
  };
}
