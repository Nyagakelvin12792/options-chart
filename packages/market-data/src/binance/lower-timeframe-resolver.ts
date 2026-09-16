import type { Candle, CandleInterval } from "@options-chart/domain";
import { INTERVAL_MS } from "./constants";

export const RESOLVER_SUPPORTED_INTERVALS: readonly CandleInterval[] = [
  "1m",
  "5m",
  "15m",
  "1h",
  "4h",
  "1d",
] as const;

export const DEFAULT_MAX_SOURCE_BARS = 5_000;

export interface LowerTimeframeResolution {
  readonly interval: CandleInterval;
  readonly estimatedBars: number;
  readonly maxBars: number;
  readonly durationMs: number;
  readonly isFallback: boolean;
  readonly fallbackReason?: string | undefined;
}

export type VolumeDirection = "bullish" | "bearish" | "neutral";

export interface ClassifiedCandleVolume {
  readonly totalVolume: number;
  readonly quoteVolume: number;
  readonly direction: VolumeDirection;
  readonly bullishVolume: number;
  readonly bearishVolume: number;
  readonly neutralVolume: number;
  readonly bullishQuoteVolume: number;
  readonly bearishQuoteVolume: number;
  readonly neutralQuoteVolume: number;
}

/**
 * Resolves the finest candlestick timeframe for a requested time range
 * such that the estimated number of bars does not exceed `maxBars` (default 5,000).
 *
 * Ordered candidates: 1m -> 5m -> 15m -> 1h -> 4h -> 1d.
 */
export function resolveLowerTimeframe(
  range: { readonly from: number; readonly to: number },
  maxBars = DEFAULT_MAX_SOURCE_BARS,
): LowerTimeframeResolution {
  const from = Math.min(range.from, range.to);
  const to = Math.max(range.from, range.to);
  const durationMs = Math.max(0, to - from);

  if (durationMs === 0) {
    return {
      interval: "1m",
      estimatedBars: 1,
      maxBars,
      durationMs: 0,
      isFallback: false,
    };
  }

  for (const interval of RESOLVER_SUPPORTED_INTERVALS) {
    const intervalMs = INTERVAL_MS[interval];
    const estimatedBars = Math.ceil(durationMs / intervalMs);

    if (estimatedBars <= maxBars) {
      return {
        interval,
        estimatedBars: Math.max(1, estimatedBars),
        maxBars,
        durationMs,
        isFallback: false,
      };
    }
  }

  // Fallback to coarsest supported interval ("1d") when range is unusually large
  const coarsestInterval = RESOLVER_SUPPORTED_INTERVALS[RESOLVER_SUPPORTED_INTERVALS.length - 1]!;
  const estimatedBars = Math.ceil(durationMs / INTERVAL_MS[coarsestInterval]);

  return {
    interval: coarsestInterval,
    estimatedBars,
    maxBars,
    durationMs,
    isFallback: true,
    fallbackReason: `Estimated bars (${estimatedBars}) exceed maxBars budget (${maxBars}) at finest available timeframes`,
  };
}

/**
 * Classifies candle volume into bullish (close > open), bearish (close < open),
 * or neutral (close === open), computing both base and quote volumes safely.
 */
export function classifyCandleVolume(candle: Candle): ClassifiedCandleVolume {
  const isBullish = candle.close > candle.open;
  const isBearish = candle.close < candle.open;
  const isNeutral = !isBullish && !isBearish;

  const direction: VolumeDirection = isBullish
    ? "bullish"
    : isBearish
      ? "bearish"
      : "neutral";

  const totalVolume = Number.isFinite(candle.volume) ? Math.max(0, candle.volume) : 0;
  const quoteVolume = Number.isFinite(candle.quoteVolume)
    ? Math.max(0, candle.quoteVolume)
    : totalVolume * Math.max(0, candle.close);

  return {
    totalVolume,
    quoteVolume,
    direction,
    bullishVolume: isBullish ? totalVolume : 0,
    bearishVolume: isBearish ? totalVolume : 0,
    neutralVolume: isNeutral ? totalVolume : 0,
    bullishQuoteVolume: isBullish ? quoteVolume : 0,
    bearishQuoteVolume: isBearish ? quoteVolume : 0,
    neutralQuoteVolume: isNeutral ? quoteVolume : 0,
  };
}
