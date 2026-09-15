import type { AnchoredVwapInput, AnchoredVwapResult } from "./types";

export const ANCHORED_VWAP_CALCULATION_VERSION = "1.0.0";

export function buildAnchoredVwapCacheKey(input: AnchoredVwapInput): string {
  const symbol = input.symbol ?? "BTCUSDT";
  const timeframe = input.timeframe ?? "1m";
  const priceSource = input.priceSource ?? "typical";
  const bandMultipliersStr = (input.bandMultipliers ?? [1, 2, 3]).join(",");
  const replayCutoff = input.replayCutoff ?? "live";

  let latestCandleSignature = "empty";
  if (input.candles.length > 0) {
    const last = input.candles[input.candles.length - 1];
    if (last) {
      latestCandleSignature = `${last.openTime}_${last.closeTime}_${last.close}_${last.volume}_${last.isClosed}`;
    }
  }

  const parts = [
    symbol,
    timeframe,
    input.anchorTimestamp,
    priceSource,
    bandMultipliersStr,
    replayCutoff,
    input.candles.length,
    latestCandleSignature,
    ANCHORED_VWAP_CALCULATION_VERSION,
  ];

  return parts.join("|");
}

export class AnchoredVwapCache {
  private readonly capacity: number;
  private readonly store = new Map<string, AnchoredVwapResult>();

  constructor(capacity = 50) {
    this.capacity = capacity;
  }

  get(key: string): AnchoredVwapResult | undefined {
    const value = this.store.get(key);
    if (value) {
      // Refresh LRU order
      this.store.delete(key);
      this.store.set(key, value);
    }
    return value;
  }

  set(key: string, result: AnchoredVwapResult): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.capacity) {
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
