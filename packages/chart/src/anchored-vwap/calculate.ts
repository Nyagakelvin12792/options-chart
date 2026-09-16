import type { Candle } from "@options-chart/domain";
import type {
  AnchoredVwapBandPoint,
  AnchoredVwapExclusion,
  AnchoredVwapInput,
  AnchoredVwapPoint,
  AnchoredVwapPriceSource,
  AnchoredVwapResult,
  PreparedCandleSeries,
} from "./types";

export const DEFAULT_PRICE_SOURCE: AnchoredVwapPriceSource = "typical";
export const DEFAULT_BAND_MULTIPLIERS: readonly number[] = [1, 2, 3];

const preparedSeriesCache = new WeakMap<readonly Candle[], PreparedCandleSeries>();

export function prepareCandleSeries(candles: readonly Candle[]): PreparedCandleSeries {
  const cached = preparedSeriesCache.get(candles);
  if (cached) {
    return cached;
  }
  const count = candles.length;
  const openTimes = new Float64Array(count);
  const closeTimes = new Float64Array(count);
  const opens = new Float64Array(count);
  const highs = new Float64Array(count);
  const lows = new Float64Array(count);
  const closes = new Float64Array(count);
  const volumes = new Float64Array(count);
  const quoteVolumes = new Float64Array(count);
  const isClosed = new Uint8Array(count);

  for (let i = 0; i < count; i++) {
    const c = candles[i]!;
    openTimes[i] = c.openTime;
    closeTimes[i] = c.closeTime;
    opens[i] = c.open;
    highs[i] = c.high;
    lows[i] = c.low;
    closes[i] = c.close;
    volumes[i] = c.volume;
    quoteVolumes[i] = c.quoteVolume;
    isClosed[i] = c.isClosed ? 1 : 0;
  }

  const series: PreparedCandleSeries = {
    count,
    openTimes,
    closeTimes,
    opens,
    highs,
    lows,
    closes,
    volumes,
    quoteVolumes,
    isClosed,
  };
  preparedSeriesCache.set(candles, series);
  return series;
}

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
  const candleCount = input.candles.length;
  for (let i = 1; i < candleCount; i++) {
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

  const remainingCandles = sortedCandles.length - anchorIndex;
  const points: AnchoredVwapPoint[] = new Array(remainingCandles);
  let pointCount = 0;

  const numBands = bandMultipliers.length;
  const isTypical = priceSource === "typical" || priceSource === "hlc3";
  const isClose = priceSource === "close";
  const isHl2 = priceSource === "hl2";
  const isOhlc4 = priceSource === "ohlc4";

  let cumVolume = 0;
  let cumPriceVolume = 0;
  let runningVwap = 0;
  let runningM2 = 0;
  let runningVariance = 0;
  let runningStdDev = 0;

  const hasReplay = replayCutoff !== undefined;

  for (let i = anchorIndex; i < sortedCandles.length; i++) {
    const candle = sortedCandles[i]!;

    if (hasReplay) {
      if (candle.closeTime > replayCutoff!) {
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

    const open = candle.open;
    const high = candle.high;
    const low = candle.low;
    const close = candle.close;
    const volume = candle.volume;

    // Fast path: valid positive numbers, non-zero span
    if (
      open > 0 &&
      high >= low &&
      low > 0 &&
      close > 0 &&
      volume >= 0 &&
      Number.isFinite(high) &&
      Number.isFinite(volume)
    ) {
      // Calculate price fast
      let price: number;
      if (isTypical) {
        price = (high + low + close) / 3;
      } else if (isClose) {
        price = close;
      } else if (isHl2) {
        price = (high + low) * 0.5;
      } else if (isOhlc4) {
        price = (open + high + low + close) * 0.25;
      } else {
        price = (high + low + 2 * close) * 0.25;
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

      const bands: AnchoredVwapBandPoint[] = new Array(numBands);
      for (let b = 0; b < numBands; b++) {
        const mult = bandMultipliers[b]!;
        bands[b] = {
          multiplier: mult,
          upper: runningVwap + mult * runningStdDev,
          lower: runningVwap - mult * runningStdDev,
        };
      }

      points[pointCount++] = {
        timestamp: candle.openTime,
        vwap: runningVwap,
        variance: runningVariance,
        standardDeviation: runningStdDev,
        cumulativeVolume: cumVolume,
        cumulativeTypicalPriceVolume: cumPriceVolume,
        bands,
      };
      continue;
    }

    // Slow path for invalid / edge-case candles
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

    if (volume < 0) {
      exclusions.push({
        candleOpenTime: candle.openTime,
        reason: "non_finite_values",
        detail: `Negative volume: ${volume}`,
      });
      continue;
    }

    // Handle remaining case if any
    const price = extractCandlePrice(candle, priceSource);
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

    const bands: AnchoredVwapBandPoint[] = new Array(numBands);
    for (let b = 0; b < numBands; b++) {
      const mult = bandMultipliers[b]!;
      bands[b] = {
        multiplier: mult,
        upper: runningVwap + mult * runningStdDev,
        lower: runningVwap - mult * runningStdDev,
      };
    }

    points[pointCount++] = {
      timestamp: candle.openTime,
      vwap: runningVwap,
      variance: runningVariance,
      standardDeviation: runningStdDev,
      cumulativeVolume: cumVolume,
      cumulativeTypicalPriceVolume: cumPriceVolume,
      bands,
    };
  }

  if (pointCount < points.length) {
    points.length = pointCount;
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
