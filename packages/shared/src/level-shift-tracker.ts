import type { GammaLevel, GammaLevelKind } from "@options-chart/domain";
import { z } from "zod";

export type LevelShiftReason =
  | "initial_observation"
  | "strike_shift"
  | "expiry_change"
  | "gamma_flip_tolerance_exceeded"
  | "confluence_tolerance_exceeded"
  | "confluence_signals_changed"
  | "reappearance";

export interface ActiveLevelRecord {
  readonly id: string;
  readonly kind: GammaLevelKind | "confluence-zone";
  readonly label: string;
  readonly price: number;
  readonly priceLow?: number | undefined;
  readonly priceHigh?: number | undefined;
  readonly expiryScope: string;
  readonly activationTimestamp: number;
  readonly lastObservedTimestamp: number;
  readonly isHistoricalKnown: boolean;
  readonly shiftReason: LevelShiftReason;
  readonly signalSignature?: string | undefined;
}

export interface ConfluenceZoneInput {
  readonly id: string;
  readonly priceLow: number;
  readonly priceHigh: number;
  readonly score: number;
  readonly bias: string;
  readonly signalKinds: readonly string[];
}

export interface LevelShiftTrackerOptions {
  /**
   * Relative anti-jitter tolerance for continuous levels (Gamma Flip).
   * Default: 0.0025 (0.25% of price, ~\$150 at \$60,000 BTC).
   */
  readonly gammaFlipToleranceFraction?: number | undefined;
  /**
   * Absolute minimum price change to trigger a Gamma Flip shift (default: \$50).
   */
  readonly gammaFlipMinDollarTolerance?: number | undefined;
  /**
   * Confluence zone midpoint tolerance relative to zone width (default: 0.5).
   */
  readonly confluenceMidpointToleranceFraction?: number | undefined;
}

export const DEFAULT_GAMMA_FLIP_TOLERANCE_FRACTION = 0.0025; // 0.25%
export const DEFAULT_GAMMA_FLIP_MIN_DOLLAR_TOLERANCE = 50; // $50
export const DEFAULT_CONFLUENCE_MIDPOINT_TOLERANCE_FRACTION = 0.5;

const ActiveLevelRecordSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "call-wall",
    "put-wall",
    "gamma-flip",
    "max-pain",
    "secondary-gex",
    "confluence-zone",
  ]),
  label: z.string(),
  price: z.number(),
  priceLow: z.number().optional(),
  priceHigh: z.number().optional(),
  expiryScope: z.string(),
  activationTimestamp: z.number(),
  lastObservedTimestamp: z.number(),
  isHistoricalKnown: z.boolean(),
  shiftReason: z.enum([
    "initial_observation",
    "strike_shift",
    "expiry_change",
    "gamma_flip_tolerance_exceeded",
    "confluence_tolerance_exceeded",
    "confluence_signals_changed",
    "reappearance",
  ]),
  signalSignature: z.string().optional(),
});

const PersistedStateSchema = z.object({
  version: z.literal(1),
  records: z.array(ActiveLevelRecordSchema),
});

export class LevelShiftTracker {
  private readonly records = new Map<string, ActiveLevelRecord>();
  private readonly gammaFlipToleranceFraction: number;
  private readonly gammaFlipMinDollarTolerance: number;
  private readonly confluenceMidpointToleranceFraction: number;

  constructor(options: LevelShiftTrackerOptions = {}) {
    this.gammaFlipToleranceFraction =
      options.gammaFlipToleranceFraction ??
      DEFAULT_GAMMA_FLIP_TOLERANCE_FRACTION;
    this.gammaFlipMinDollarTolerance =
      options.gammaFlipMinDollarTolerance ??
      DEFAULT_GAMMA_FLIP_MIN_DOLLAR_TOLERANCE;
    this.confluenceMidpointToleranceFraction =
      options.confluenceMidpointToleranceFraction ??
      DEFAULT_CONFLUENCE_MIDPOINT_TOLERANCE_FRACTION;
  }

  /**
   * Process a new snapshot of GammaLevels at the authoritative calculation timestamp.
   */
  updateLevels(
    levels: readonly GammaLevel[],
    expiryScope: string,
    observationTimestamp: number,
  ): readonly ActiveLevelRecord[] {
    const updated: ActiveLevelRecord[] = [];
    const seenIds = new Set<string>();

    for (const level of levels) {
      const semanticId = this.buildLevelSemanticId(level, expiryScope);
      seenIds.add(semanticId);

      const existing = this.records.get(semanticId);
      const isDiscrete =
        level.kind === "call-wall" ||
        level.kind === "put-wall" ||
        level.kind === "max-pain";

      if (!existing) {
        // First observation or reappearance
        const isReappearance = this.wasPreviouslySeen(level.kind, expiryScope);
        const record: ActiveLevelRecord = {
          id: semanticId,
          kind: level.kind,
          label: level.label,
          price: level.price,
          expiryScope: String(expiryScope),
          activationTimestamp: observationTimestamp,
          lastObservedTimestamp: observationTimestamp,
          isHistoricalKnown: false,
          shiftReason: isReappearance ? "reappearance" : "initial_observation",
        };
        this.records.set(semanticId, record);
        updated.push(record);
        continue;
      }

      // Check expiry scope shift
      if (existing.expiryScope !== String(expiryScope)) {
        const record: ActiveLevelRecord = {
          ...existing,
          price: level.price,
          expiryScope: String(expiryScope),
          activationTimestamp: observationTimestamp,
          lastObservedTimestamp: observationTimestamp,
          shiftReason: "expiry_change",
        };
        this.records.set(semanticId, record);
        updated.push(record);
        continue;
      }

      // Discrete walls shift on exact price strike change
      if (isDiscrete) {
        if (existing.price !== level.price) {
          const record: ActiveLevelRecord = {
            ...existing,
            price: level.price,
            activationTimestamp: observationTimestamp,
            lastObservedTimestamp: observationTimestamp,
            shiftReason: "strike_shift",
          };
          this.records.set(semanticId, record);
          updated.push(record);
        } else {
          // Stable level - keep activationTimestamp unchanged
          const record: ActiveLevelRecord = {
            ...existing,
            lastObservedTimestamp: observationTimestamp,
          };
          this.records.set(semanticId, record);
          updated.push(record);
        }
        continue;
      }

      // Continuous level (Gamma Flip, Secondary GEX)
      if (level.kind === "gamma-flip") {
        const priceDelta = Math.abs(level.price - existing.price);
        const relativeThreshold = existing.price * this.gammaFlipToleranceFraction;
        const effectiveThreshold = Math.max(
          this.gammaFlipMinDollarTolerance,
          relativeThreshold,
        );

        if (priceDelta > effectiveThreshold) {
          // Exceeded anti-jitter tolerance -> genuine shift
          const record: ActiveLevelRecord = {
            ...existing,
            price: level.price,
            activationTimestamp: observationTimestamp,
            lastObservedTimestamp: observationTimestamp,
            shiftReason: "gamma_flip_tolerance_exceeded",
          };
          this.records.set(semanticId, record);
          updated.push(record);
        } else {
          // Fluctuation inside tolerance -> do NOT reset activation timestamp!
          // Update last price and observation timestamp
          const record: ActiveLevelRecord = {
            ...existing,
            price: level.price,
            lastObservedTimestamp: observationTimestamp,
          };
          this.records.set(semanticId, record);
          updated.push(record);
        }
        continue;
      }

      // Secondary GEX levels
      if (existing.price !== level.price) {
        const record: ActiveLevelRecord = {
          ...existing,
          price: level.price,
          activationTimestamp: observationTimestamp,
          lastObservedTimestamp: observationTimestamp,
          shiftReason: "strike_shift",
        };
        this.records.set(semanticId, record);
        updated.push(record);
      } else {
        const record: ActiveLevelRecord = {
          ...existing,
          lastObservedTimestamp: observationTimestamp,
        };
        this.records.set(semanticId, record);
        updated.push(record);
      }
    }

    return updated;
  }

  /**
   * Process a new snapshot of Confluence Zones at the authoritative calculation timestamp.
   */
  updateConfluenceZones(
    zones: readonly ConfluenceZoneInput[],
    expiryScope: string,
    observationTimestamp: number,
  ): readonly ActiveLevelRecord[] {
    const updated: ActiveLevelRecord[] = [];

    for (const zone of zones) {
      const semanticId = `confluence-${zone.id}`;
      const existing = this.records.get(semanticId);
      const signalSig = [...zone.signalKinds].sort().join(",");
      const mid = (zone.priceLow + zone.priceHigh) / 2;
      const width = Math.max(1, zone.priceHigh - zone.priceLow);

      if (!existing) {
        const record: ActiveLevelRecord = {
          id: semanticId,
          kind: "confluence-zone",
          label: `${zone.bias.toUpperCase()} Zone`,
          price: mid,
          priceLow: zone.priceLow,
          priceHigh: zone.priceHigh,
          expiryScope: String(expiryScope),
          activationTimestamp: observationTimestamp,
          lastObservedTimestamp: observationTimestamp,
          isHistoricalKnown: false,
          shiftReason: "initial_observation",
          signalSignature: signalSig,
        };
        this.records.set(semanticId, record);
        updated.push(record);
        continue;
      }

      // Check if defining signals changed
      if (existing.signalSignature && existing.signalSignature !== signalSig) {
        const record: ActiveLevelRecord = {
          ...existing,
          price: mid,
          priceLow: zone.priceLow,
          priceHigh: zone.priceHigh,
          activationTimestamp: observationTimestamp,
          lastObservedTimestamp: observationTimestamp,
          shiftReason: "confluence_signals_changed",
          signalSignature: signalSig,
        };
        this.records.set(semanticId, record);
        updated.push(record);
        continue;
      }

      // Check if midpoint shifted beyond tolerance
      const midDelta = Math.abs(mid - existing.price);
      const threshold = width * this.confluenceMidpointToleranceFraction;

      if (midDelta > threshold) {
        const record: ActiveLevelRecord = {
          ...existing,
          price: mid,
          priceLow: zone.priceLow,
          priceHigh: zone.priceHigh,
          activationTimestamp: observationTimestamp,
          lastObservedTimestamp: observationTimestamp,
          shiftReason: "confluence_tolerance_exceeded",
          signalSignature: signalSig,
        };
        this.records.set(semanticId, record);
        updated.push(record);
      } else {
        // Stable confluence zone - preserve activation timestamp
        const record: ActiveLevelRecord = {
          ...existing,
          price: mid,
          priceLow: zone.priceLow,
          priceHigh: zone.priceHigh,
          lastObservedTimestamp: observationTimestamp,
        };
        this.records.set(semanticId, record);
        updated.push(record);
      }
    }

    return updated;
  }

  getRecord(id: string): ActiveLevelRecord | undefined {
    return this.records.get(id);
  }

  getAllRecords(): readonly ActiveLevelRecord[] {
    return [...this.records.values()];
  }

  clear(): void {
    this.records.clear();
  }

  /**
   * Serializes the current active records to JSON with versioning.
   */
  serialize(): string {
    const payload = {
      version: 1 as const,
      records: [...this.records.values()],
    };
    return JSON.stringify(payload);
  }

  /**
   * Safely loads persisted records into the tracker, discarding corrupted data.
   */
  loadPersisted(rawJson: string | null): boolean {
    if (!rawJson) return false;
    try {
      const parsed = JSON.parse(rawJson);
      const result = PersistedStateSchema.safeParse(parsed);
      if (!result.success) {
        return false;
      }
      this.records.clear();
      for (const item of result.data.records) {
        this.records.set(item.id, item);
      }
      return true;
    } catch {
      return false;
    }
  }

  private buildLevelSemanticId(
    level: GammaLevel,
    expiryScope: string,
  ): string {
    if (level.kind === "call-wall") return `call-wall-${expiryScope}`;
    if (level.kind === "put-wall") return `put-wall-${expiryScope}`;
    if (level.kind === "gamma-flip") return `gamma-flip-${expiryScope}`;
    if (level.kind === "max-pain") return `max-pain-${expiryScope}`;
    return `${level.kind}-${level.id}-${expiryScope}`;
  }

  private wasPreviouslySeen(
    kind: GammaLevelKind,
    expiryScope: string,
  ): boolean {
    for (const record of this.records.values()) {
      if (record.kind === kind && record.expiryScope === expiryScope) {
        return true;
      }
    }
    return false;
  }
}
