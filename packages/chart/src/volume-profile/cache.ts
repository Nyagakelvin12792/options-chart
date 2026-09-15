import type { VolumeProfileInput, VolumeProfileResult } from "./types";
import { CALCULATION_VERSION } from "./calculate";

export interface CacheKeyParams {
  readonly exchange: string;
  readonly market: string;
  readonly symbol: string;
  readonly sourceTimeframe: string;
  readonly displayTimeframe: string;
  readonly sourceRevision?: string;
  readonly rangeFrom: number;
  readonly rangeTo: number;
  readonly replayCutoff?: number;
  readonly binMode: "rowCount" | "binSize";
  readonly binValue: number;
  readonly tickOrigin?: number;
  readonly volumeUnit: string;
  readonly directionMode: string;
  readonly valueAreaPercent: number;
  readonly calculationVersion: string;
  readonly latestCandleSignature?: string;
}

export function buildVolumeProfileCacheKey(input: VolumeProfileInput): string {
  const meta = input.sourceMetadata;
  const binMode = input.binConfig.mode;
  const binValue =
    input.binConfig.mode === "rowCount"
      ? input.binConfig.rowCount
      : input.binConfig.binSize;
  const tickOrigin =
    input.binConfig.mode === "binSize" ? input.binConfig.tickOrigin ?? 0 : 0;

  // Derive signature of latest eligible/forming candle to detect in-place candle corrections
  let latestCandleSignature = "empty";
  if (input.candles.length > 0) {
    const last = input.candles[input.candles.length - 1];
    if (last) {
      latestCandleSignature = `${last.openTime}_${last.closeTime}_${last.close}_${last.volume}_${last.quoteVolume}_${last.isClosed}`;
    }
  }

  const parts = [
    meta.exchange,
    meta.market,
    meta.symbol,
    meta.sourceTimeframe,
    meta.displayTimeframe,
    meta.sourceRevision ?? "rev0",
    input.range.from,
    input.range.to,
    input.replayCutoff ?? "live",
    binMode,
    binValue,
    tickOrigin,
    input.volumeUnit ?? "base",
    input.directionMode ?? "total",
    input.valueAreaPercent ?? 70,
    meta.calculationVersion || CALCULATION_VERSION,
    latestCandleSignature,
  ];

  return parts.join("|");
}

export class VolumeProfileCache {
  private readonly capacity: number;
  private readonly store = new Map<string, VolumeProfileResult>();

  constructor(capacity = 50) {
    this.capacity = capacity;
  }

  get(key: string): VolumeProfileResult | undefined {
    const value = this.store.get(key);
    if (value) {
      // Refresh LRU order: delete and re-insert
      this.store.delete(key);
      this.store.set(key, value);
    }
    return value;
  }

  set(key: string, result: VolumeProfileResult): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.capacity) {
      // Evict oldest (first key in map iteration order)
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }
    this.store.set(key, result);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}
