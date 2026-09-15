import type { Candle } from "@options-chart/domain";
import type {
  AnchoredVwapBandPoint,
  AnchoredVwapExclusion,
  AnchoredVwapInput,
  AnchoredVwapPoint,
  AnchoredVwapPriceSource,
  AnchoredVwapResult,
} from "./types";

export const DEFAULT_PRICE_SOURCE: AnchoredVwapPriceSource = "typical";
export const DEFAULT_BAND_MULTIPLIERS: readonly number[] = [1, 2, 3];

export function extractCandlePrice(
  candle: Candle,
  source: AnchoredVwapPriceSource = DEFAULT_PRICE_SOURCE,
): number {
  switch (source) {
    case "close":
      return candle.close;
    case "hl2":
      return (candle.high + candle.low) / 2;
    case "ohlc4":
      return (candle.open + candle.high + candle.low + candle.close) / 4;
    case "weighted":
      return (candle.high + candle.low + 2 * candle.close) / 4;
    case "typical":
    case "hlc3":
    default:
      return (candle.high + candle.low + candle.close) / 3;
  }
}

export function findAnchorIndex(
  sortedCandles: readonly Candle[],
  anchorTimestamp: number,
): number | null {
  if (sortedCandles.length === 0) {
    return null;
  }

  const first = sortedCandles[0]!;
  if (anchorTimestamp <= first.openTime) {
    return 0;
  }

  const last = sortedCandles[sortedCandles.length - 1]!;
  if (anchorTimestamp > last.closeTime) {
    return null;
  }

  // Binary search for candle covering anchorTimestamp or first candle >= anchorTimestamp
  let low = 0;
  let high = sortedCandles.length - 1;
  let candidate = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candle = sortedCandles[mid]!;

    if (
      anchorTimestamp >= candle.openTime &&
      anchorTimestamp <= candle.closeTime
    ) {
      return mid;
    }

    if (candle.openTime >= anchorTimestamp) {
      candidate = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return candidate !== -1 ? candidate : null;
}

export function calculateAnchoredVwap(
  input: AnchoredVwapInput,
): AnchoredVwapResult {
  const startedAt = performance.now();
  const priceSource = input.priceSource ?? DEFAULT_PRICE_SOURCE;
  const bandMultipliers = input.bandMultipliers ?? DEFAULT_BAND_MULTIPLIERS;
  const anchorTimestamp = input.anchorTimestamp;
  const replayCutoff = input.replayCutoff;

  const exclusions: AnchoredVwapExclusion[] = [];

  if (input.candles.length === 0) {
    return {
      anchorTimestamp,
      resolvedAnchorIndex: null,
      points: [],
      latestPoint: null,
      totalCandlesConsidered: 0,
      candlesIncluded: 0,
      candlesExcluded: 0,
      exclusions: [],
      calculationDurationMs: performance.now() - startedAt,
      priceSource,
      bandMultipliers,
    };
  }

  // Ensure candles are sorted ascending by openTime
  let isSorted = true;
  for (let i = 1; i < input.candles.length; i++) {
    if (input.candles[i]!.openTime < input.candles[i - 1]!.openTime) {
      isSorted = false;
      break;
    }
  }

  const sortedCandles = isSorted
    ? input.candles
    : [...input.candles].sort((a, b) => a.openTime - b.openTime);

  const anchorIndex = findAnchorIndex(sortedCandles, anchorTimestamp);

  if (anchorIndex === null) {
    for (const candle of sortedCandles) {
      exclusions.push({
        candleOpenTime: candle.openTime,
        reason: "before_anchor",
      });
    }

    return {
      anchorTimestamp,
      resolvedAnchorIndex: null,
      points: [],
      latestPoint: null,
      totalCandlesConsidered: sortedCandles.length,
      candlesIncluded: 0,
      candlesExcluded: exclusions.length,
      exclusions,
      calculationDurationMs: performance.now() - startedAt,
      priceSource,
      bandMultipliers,
    };
  }

  // Record candles before anchor as excluded
  for (let i = 0; i < anchorIndex; i++) {
    exclusions.push({
      candleOpenTime: sortedCandles[i]!.openTime,
      reason: "before_anchor",
    });
  }

  const points: AnchoredVwapPoint[] = [];

  let cumVolume = 0;
  let cumPriceVolume = 0;
  let runningVwap = 0;
  let runningM2 = 0; // Sum of squared differences weighted: sum(w_i * (x_i - mean_i)^2)
  let runningVariance = 0;
  let runningStdDev = 0;

  for (let i = anchorIndex; i < sortedCandles.length; i++) {
    const candle = sortedCandles[i]!;

    // Replay filtering
    if (replayCutoff !== undefined) {
      if (candle.closeTime > replayCutoff) {
        exclusions.push({
          candleOpenTime: candle.openTime,
          reason: "after_replay_cutoff",
          detail: `closeTime ${candle.closeTime} > replayCutoff ${replayCutoff}`,
        });
        continue;
      }
      if (!candle.isClosed) {
        exclusions.push({
          candleOpenTime: candle.openTime,
          reason: "unclosed_in_replay",
          detail: "Candle is not closed in replay mode",
        });
        continue;
      }
    }

    // Validate prices
    if (
      candle.open <= 0 ||
      candle.high <= 0 ||
      candle.low <= 0 ||
      candle.close <= 0 ||
      candle.high < candle.low
    ) {
      exclusions.push({
        candleOpenTime: candle.openTime,
        reason: "non_positive_price",
        detail: `open: ${candle.open}, high: ${candle.high}, low: ${candle.low}, close: ${candle.close}`,
      });
      continue;
    }

    if (
      !Number.isFinite(candle.open) ||
      !Number.isFinite(candle.high) ||
      !Number.isFinite(candle.low) ||
      !Number.isFinite(candle.close) ||
      !Number.isFinite(candle.volume)
    ) {
      exclusions.push({
        candleOpenTime: candle.openTime,
        reason: "non_finite_values",
      });
      continue;
    }

    const price = extractCandlePrice(candle, priceSource);
    const volume = candle.volume;

    if (volume < 0) {
      exclusions.push({
        candleOpenTime: candle.openTime,
        reason: "non_finite_values",
        detail: `Negative volume: ${volume}`,
      });
      continue;
    }

    if (volume === 0) {
      if (cumVolume === 0) {
        exclusions.push({
          candleOpenTime: candle.openTime,
          reason: "zero_volume",
          detail: "Candle volume is 0 before VWAP accumulation begins",
        });
        continue;
      }
    } else {
      const prevCumVolume = cumVolume;
      const prevVwap = runningVwap;

      cumVolume += volume;
      cumPriceVolume += price * volume;

      if (prevCumVolume === 0) {
        runningVwap = price;
        runningM2 = 0;
        runningVariance = 0;
        runningStdDev = 0;
      } else {
        const delta = price - prevVwap;
        const r = delta * (volume / cumVolume);
        runningVwap = prevVwap + r;
        runningM2 += prevCumVolume * delta * r;
        runningVariance =
          cumVolume > 0 ? Math.max(0, runningM2 / cumVolume) : 0;
        runningStdDev = Math.sqrt(runningVariance);
      }
    }

    const bands: AnchoredVwapBandPoint[] = [];
    for (const mult of bandMultipliers) {
      bands.push({
        multiplier: mult,
        upper: runningVwap + mult * runningStdDev,
        lower: runningVwap - mult * runningStdDev,
      });
    }

    points.push({
      timestamp: candle.openTime,
      vwap: runningVwap,
      variance: runningVariance,
      standardDeviation: runningStdDev,
      cumulativeVolume: cumVolume,
      cumulativeTypicalPriceVolume: cumPriceVolume,
      bands,
    });
  }

  const durationMs = performance.now() - startedAt;

  return {
    anchorTimestamp,
    resolvedAnchorIndex: anchorIndex,
    points,
    latestPoint: points.length > 0 ? (points[points.length - 1] ?? null) : null,
    totalCandlesConsidered: sortedCandles.length,
    candlesIncluded: points.length,
    candlesExcluded: exclusions.length,
    exclusions,
    calculationDurationMs: durationMs,
    priceSource,
    bandMultipliers,
  };
}
