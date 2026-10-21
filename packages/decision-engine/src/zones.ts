import { computeAbsoluteBpsDistance } from "@options-chart/flow-engine/decimal";
import { recordEvidence, type LayerContext } from "./layer-context";
import type {
  LevelStrength,
  LevelZoneV1,
  ZoneKind,
  ZoneStrength,
} from "./market-state-contracts";
import type { ZoneInput } from "./market-state-input";
import { resolveSourceHealth } from "./source-health";

const STRENGTH_RANK: Readonly<Record<ZoneStrength, number>> = {
  weak: 1,
  moderate: 2,
  strong: 3,
};

export const WALL_ZONE_KINDS: ReadonlySet<ZoneKind> = new Set<ZoneKind>([
  "gamma-wall",
  "open-interest-wall",
  "volume-wall",
  "flow-wall",
]);

export const OPTIONS_ZONE_KINDS: ReadonlySet<ZoneKind> = new Set<ZoneKind>([
  "gamma-wall",
  "open-interest-wall",
  "gamma-flip",
  "max-pain",
]);

/** Deterministic ordering: strongest, then nearest, then identifier. */
export function compareZones(a: LevelZoneV1, b: LevelZoneV1): number {
  return (
    STRENGTH_RANK[b.strength] - STRENGTH_RANK[a.strength] ||
    a.distanceBps - b.distanceBps ||
    a.zoneId.localeCompare(b.zoneId)
  );
}

export function strengthOf(
  zone: LevelZoneV1 | null,
  hasZones: boolean,
): LevelStrength {
  if (!hasZones) {
    return "unavailable";
  }
  return zone === null ? "none" : zone.strength;
}

/**
 * Resolves caller-supplied zones at the effective time. Future-dated and stale
 * zones are dropped (future ones are reported); remaining zones become typed
 * `LevelZoneV1` records with their distance from the reference price.
 */
export function resolveZones(
  zones: readonly ZoneInput[],
  referencePrice: number,
  ctx: LayerContext,
): LevelZoneV1[] {
  const resolved: LevelZoneV1[] = [];
  for (const zone of zones) {
    const health = resolveSourceHealth(ctx.effectiveAtMs, zone);
    if (health.future) {
      ctx.collector.markFuture(`zone:${zone.zoneId}`);
      continue;
    }
    if (!health.usable) {
      ctx.collector.warn(`ZONE_STALE:${zone.zoneId}`);
      continue;
    }
    const distanceBps = computeAbsoluteBpsDistance(
      zone.price,
      referencePrice,
      referencePrice,
    );
    if (distanceBps === null) {
      ctx.collector.warn(`ZONE_DISTANCE_UNAVAILABLE:${zone.zoneId}`);
      continue;
    }
    const ref = recordEvidence(ctx, {
      evidenceId: `zone:${zone.zoneId}:price`,
      name: `zone.${zone.zoneId}.price`,
      value: zone.price,
      unit: "usd",
      formulaVersion: zone.formulaVersion,
      source: zone.source,
      asOfMs: zone.asOfMs,
    });
    resolved.push({
      zoneId: zone.zoneId,
      kind: zone.kind,
      price: zone.price,
      strength: zone.strength,
      distanceBps,
      formulaVersion: zone.formulaVersion,
      evidenceRefs: [ref],
    });
  }
  return resolved.sort(compareZones);
}
