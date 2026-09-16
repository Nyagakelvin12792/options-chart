import type { Candle } from "@options-chart/domain";
import type {
  VolumeProfileExclusions,
  VolumeProfileInput,
  VolumeProfileQualityMetadata,
  VolumeProfileResult,
} from "./types";

export const CALCULATION_VERSION = "1.0.0";
const MAX_ROW_COUNT = 2048;

interface MutableRow {
  low: number;
  high: number;
  mid: number;
  totalVolume: number;
  bullishVolume: number;
  bearishVolume: number;
  neutralVolume: number;
  takerBuyVolume?: number;
  takerSellVolume?: number;
  isValueArea: boolean;
  isPOC: boolean;
}

interface MutableExclusions {
  missingVolumeCount: number;
  negativeOrNonFiniteVolumeCount: number;
  malformedOhlcCount: number;
  nonFinitePriceCount: number;
  reversedTimestampCount: number;
  duplicateCandleCount: number;
  conflictingDuplicateCount: number;
  straddlingBoundaryCount: number;
  replayExcludedCount: number;
}

interface MutableQualityMetadata {
  eligibleCandleCount: number;
  excludedCandleCount: number;
  sparseRowCount: number;
  hasGaps: boolean;
  isProvisional: boolean;
  sourceFallback: boolean;
  coverageStart: number | null;
  coverageEnd: number | null;
}

export function calculateVolumeProfile(
  input: VolumeProfileInput,
): VolumeProfileResult {
  const {
    candles,
    range,
    replayCutoff,
    binConfig,
    volumeUnit = "base",
    directionMode = "total",
    valueAreaPercent = 70,
  } = input;

  if (valueAreaPercent <= 0 || valueAreaPercent > 100 || !Number.isFinite(valueAreaPercent)) {
    throw new Error(
      `Invalid valueAreaPercent: ${valueAreaPercent}. Must be in range (0, 100].`,
    );
  }

  const exclusions: MutableExclusions = {
    missingVolumeCount: 0,
    negativeOrNonFiniteVolumeCount: 0,
    malformedOhlcCount: 0,
    nonFinitePriceCount: 0,
    reversedTimestampCount: 0,
    duplicateCandleCount: 0,
    conflictingDuplicateCount: 0,
    straddlingBoundaryCount: 0,
    replayExcludedCount: 0,
  };

  let isProvisional = false;

  // 1. Deduplicate and filter candles safely without mutating input
  const seenTimestamps = new Map<number, Candle>();
  const validCandles: Candle[] = [];

  for (const candle of candles) {
    if (candle.closeTime < candle.openTime) {
      exclusions.reversedTimestampCount += 1;
      continue;
    }

    if (
      !Number.isFinite(candle.open) ||
      !Number.isFinite(candle.high) ||
      !Number.isFinite(candle.low) ||
      !Number.isFinite(candle.close)
    ) {
      exclusions.nonFinitePriceCount += 1;
      continue;
    }

    if (
      candle.high < candle.low ||
      candle.open > candle.high ||
      candle.open < candle.low ||
      candle.close > candle.high ||
      candle.close < candle.low
    ) {
      exclusions.malformedOhlcCount += 1;
      continue;
    }

    const rawVolume =
      volumeUnit === "quote" ? candle.quoteVolume : candle.volume;

    if (rawVolume === undefined || rawVolume === null || Number.isNaN(rawVolume)) {
      exclusions.missingVolumeCount += 1;
      continue;
    }

    if (rawVolume < 0 || !Number.isFinite(rawVolume)) {
      exclusions.negativeOrNonFiniteVolumeCount += 1;
      continue;
    }

    const existing = seenTimestamps.get(candle.openTime);
    if (existing) {
      if (
        existing.closeTime === candle.closeTime &&
        existing.open === candle.open &&
        existing.high === candle.high &&
        existing.low === candle.low &&
        existing.close === candle.close &&
        existing.volume === candle.volume &&
        existing.quoteVolume === candle.quoteVolume
      ) {
        exclusions.duplicateCandleCount += 1;
      } else {
        exclusions.conflictingDuplicateCount += 1;
      }
      continue;
    }

    seenTimestamps.set(candle.openTime, candle);
    validCandles.push(candle);
  }

  // Canonical ordering by openTime ascending
  validCandles.sort((a, b) => a.openTime - b.openTime);

  // 2. Replay & Range filtering: strictly contained within resolved interval
  const eligibleCandles: Candle[] = [];

  for (const candle of validCandles) {
    if (replayCutoff !== undefined) {
      if (!candle.isClosed || candle.closeTime > replayCutoff) {
        exclusions.replayExcludedCount += 1;
        continue;
      }
    } else {
      if (!candle.isClosed) {
        isProvisional = true;
      }
    }

    if (candle.openTime < range.from || candle.closeTime > range.to) {
      const overlaps =
        (candle.openTime < range.from && candle.closeTime > range.from) ||
        (candle.openTime < range.to && candle.closeTime > range.to);
      if (overlaps) {
        exclusions.straddlingBoundaryCount += 1;
      }
      continue;
    }

    eligibleCandles.push(candle);
  }

  const firstCandle = eligibleCandles[0];
  const lastCandle = eligibleCandles[eligibleCandles.length - 1];

  const qualityMetadata: MutableQualityMetadata = {
    eligibleCandleCount: eligibleCandles.length,
    excludedCandleCount: candles.length - eligibleCandles.length,
    sparseRowCount: 0,
    hasGaps: false,
    isProvisional,
    sourceFallback: false,
    coverageStart: firstCandle ? firstCandle.openTime : null,
    coverageEnd: lastCandle ? lastCandle.closeTime : null,
  };

  for (let i = 1; i < eligibleCandles.length; i++) {
    const prev = eligibleCandles[i - 1];
    const curr = eligibleCandles[i];
    if (prev && curr && curr.openTime > prev.closeTime + 1_000) {
      qualityMetadata.hasGaps = true;
      break;
    }
  }

  // 3. Return null levels for empty eligible dataset
  if (eligibleCandles.length === 0) {
    return {
      rows: [],
      pocPrice: null,
      pocRowIndex: null,
      vah: null,
      val: null,
      targetValueAreaPercent: valueAreaPercent,
      achievedValueAreaPercent: 0,
      totalEligibleVolume: 0,
      valueAreaVolume: 0,
      exclusions,
      qualityMetadata,
      version: CALCULATION_VERSION,
    };
  }

  // 4. Derive price bounds from eligible data
  let minLow = Number.POSITIVE_INFINITY;
  let maxHigh = Number.NEGATIVE_INFINITY;
  let totalEligibleVolume = 0;

  for (const candle of eligibleCandles) {
    if (candle.low < minLow) minLow = candle.low;
    if (candle.high > maxHigh) maxHigh = candle.high;
    const vol = volumeUnit === "quote" ? candle.quoteVolume : candle.volume;
    totalEligibleVolume += vol;
  }

  if (totalEligibleVolume <= 0) {
    return {
      rows: [],
      pocPrice: null,
      pocRowIndex: null,
      vah: null,
      val: null,
      targetValueAreaPercent: valueAreaPercent,
      achievedValueAreaPercent: 0,
      totalEligibleVolume: 0,
      valueAreaVolume: 0,
      exclusions,
      qualityMetadata,
      version: CALCULATION_VERSION,
    };
  }

  // 5. Construct Bins
  const rows: MutableRow[] = [];

  if (binConfig.mode === "rowCount") {
    const targetRowCount = Math.min(
      MAX_ROW_COUNT,
      Math.max(1, Math.round(binConfig.rowCount)),
    );

    if (maxHigh === minLow) {
      const binWidth = 1.0;
      rows.push({
        low: minLow,
        high: minLow + binWidth,
        mid: minLow + binWidth / 2,
        totalVolume: 0,
        bullishVolume: 0,
        bearishVolume: 0,
        neutralVolume: 0,
        isValueArea: false,
        isPOC: false,
      });
    } else {
      const binWidth = (maxHigh - minLow) / targetRowCount;
      for (let i = 0; i < targetRowCount; i++) {
        const rowLow = minLow + i * binWidth;
        const rowHigh = i === targetRowCount - 1 ? maxHigh : minLow + (i + 1) * binWidth;
        rows.push({
          low: rowLow,
          high: rowHigh,
          mid: (rowLow + rowHigh) / 2,
          totalVolume: 0,
          bullishVolume: 0,
          bearishVolume: 0,
          neutralVolume: 0,
          isValueArea: false,
          isPOC: false,
        });
      }
    }
  } else if (binConfig.mode === "binSize") {
    const { binSize, tickOrigin = 0 } = binConfig;
    if (binSize <= 0 || !Number.isFinite(binSize)) {
      throw new Error(
        `Invalid binSize: ${binSize}. Requested bin size must be a positive finite number.`,
      );
    }

    if (maxHigh === minLow) {
      const rowLow = Math.floor((minLow - tickOrigin) / binSize) * binSize + tickOrigin;
      const rowHigh = rowLow + binSize;
      rows.push({
        low: rowLow,
        high: rowHigh,
        mid: (rowLow + rowHigh) / 2,
        totalVolume: 0,
        bullishVolume: 0,
        bearishVolume: 0,
        neutralVolume: 0,
        isValueArea: false,
        isPOC: false,
      });
    } else {
      const firstBinIndex = Math.floor((minLow - tickOrigin) / binSize);
      let lastBinIndex = Math.floor((maxHigh - tickOrigin) / binSize);
      const exactTopBoundary = tickOrigin + lastBinIndex * binSize;
      if (exactTopBoundary === maxHigh && maxHigh > minLow) {
        lastBinIndex -= 1;
      }

      const rowCount = lastBinIndex - firstBinIndex + 1;
      if (rowCount > MAX_ROW_COUNT) {
        throw new Error(
          `Volume profile row cap exceeded: requested bin size results in ${rowCount} rows (maximum ${MAX_ROW_COUNT})`,
        );
      }

      for (let i = 0; i < rowCount; i++) {
        const rowLow = tickOrigin + (firstBinIndex + i) * binSize;
        const rowHigh = tickOrigin + (firstBinIndex + i + 1) * binSize;
        rows.push({
          low: rowLow,
          high: rowHigh,
          mid: (rowLow + rowHigh) / 2,
          totalVolume: 0,
          bullishVolume: 0,
          bearishVolume: 0,
          neutralVolume: 0,
          isValueArea: false,
          isPOC: false,
        });
      }
    }
  } else {
    throw new Error("Invalid or ambiguous VolumeProfileBinConfig mode");
  }

  // 6. Allocate Volume to Bins
  const lastRowIdx = rows.length - 1;

  function findFirstIntersectingRowIndex(low: number): number {
    let l = 0;
    let r = lastRowIdx;
    let ans = 0;
    while (l <= r) {
      const mid = (l + r) >> 1;
      if (rows[mid]!.high > low) {
        ans = mid;
        r = mid - 1;
      } else {
        l = mid + 1;
      }
    }
    return ans;
  }

  function findPointBinIndex(point: number): number {
    if (point <= rows[0]!.low) return 0;
    if (point >= rows[lastRowIdx]!.high) return lastRowIdx;
    let l = 0;
    let r = lastRowIdx;
    while (l <= r) {
      const mid = (l + r) >> 1;
      const row = rows[mid]!;
      const isLast = mid === lastRowIdx;
      if (isLast ? point >= row.low && point <= row.high : point >= row.low && point < row.high) {
        return mid;
      }
      if (point < row.low) {
        r = mid - 1;
      } else {
        l = mid + 1;
      }
    }
    return Math.max(0, Math.min(lastRowIdx, l));
  }

  for (const candle of eligibleCandles) {
    const vol = volumeUnit === "quote" ? candle.quoteVolume : candle.volume;
    if (vol === 0) continue;

    const isBullish = candle.close > candle.open;
    const isBearish = candle.close < candle.open;

    if (candle.high === candle.low) {
      const allocatedIdx = findPointBinIndex(candle.low);
      const targetRow = rows[allocatedIdx]!;
      targetRow.totalVolume += vol;
      if (directionMode === "candle-direction") {
        if (isBullish) targetRow.bullishVolume += vol;
        else if (isBearish) targetRow.bearishVolume += vol;
        else targetRow.neutralVolume += vol;
      }
      continue;
    }

    const candleSpan = candle.high - candle.low;
    let accumulatedVol = 0;
    let lastIntersectedIdx = -1;

    const startIdx = findFirstIntersectingRowIndex(candle.low);

    for (let i = startIdx; i < rows.length; i++) {
      const row = rows[i]!;
      if (row.low >= candle.high) {
        break;
      }
      if (row.high <= candle.low) {
        continue;
      }

      lastIntersectedIdx = i;
      const overlap =
        Math.max(0, Math.min(candle.high, row.high) - Math.max(candle.low, row.low));
      const weight = overlap / candleSpan;
      const binVol = vol * weight;

      row.totalVolume += binVol;
      accumulatedVol += binVol;

      if (directionMode === "candle-direction") {
        if (isBullish) row.bullishVolume += binVol;
        else if (isBearish) row.bearishVolume += binVol;
        else row.neutralVolume += binVol;
      }
    }

    if (lastIntersectedIdx !== -1) {
      const residual = vol - accumulatedVol;
      if (Math.abs(residual) > 0) {
        const lastRow = rows[lastIntersectedIdx]!;
        lastRow.totalVolume += residual;
        if (directionMode === "candle-direction") {
          if (isBullish) lastRow.bullishVolume += residual;
          else if (isBearish) lastRow.bearishVolume += residual;
          else lastRow.neutralVolume += residual;
        }
      }
    }
  }

  let sparseCount = 0;
  for (const row of rows) {
    if (row.totalVolume === 0) sparseCount += 1;
  }
  qualityMetadata.sparseRowCount = sparseCount;

  // 7. Determine POC: greatest-volume row. Resolve exact ties with lower-priced row.
  let pocRowIndex = 0;
  let maxVolume = -1;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.totalVolume > maxVolume) {
      maxVolume = row.totalVolume;
      pocRowIndex = i;
    }
  }

  const pocRow = rows[pocRowIndex]!;
  const pocPrice = pocRow.mid;
  pocRow.isPOC = true;

  // 8. Value Area Contiguous Expansion
  const targetVolume = totalEligibleVolume * (valueAreaPercent / 100);
  pocRow.isValueArea = true;
  let accumulatedValueAreaVol = pocRow.totalVolume;

  let idxAbove = pocRowIndex + 1;
  let idxBelow = pocRowIndex - 1;

  while (
    accumulatedValueAreaVol < targetVolume &&
    (idxAbove < rows.length || idxBelow >= 0)
  ) {
    const rowAbove = idxAbove < rows.length ? rows[idxAbove] : undefined;
    const rowBelow = idxBelow >= 0 ? rows[idxBelow] : undefined;

    if (rowAbove && rowBelow) {
      if (rowAbove.totalVolume > rowBelow.totalVolume) {
        accumulatedValueAreaVol += rowAbove.totalVolume;
        rowAbove.isValueArea = true;
        idxAbove += 1;
      } else {
        // Lower-priced candidate wins on tie (volBelow >= volAbove)
        accumulatedValueAreaVol += rowBelow.totalVolume;
        rowBelow.isValueArea = true;
        idxBelow -= 1;
      }
    } else if (rowAbove) {
      accumulatedValueAreaVol += rowAbove.totalVolume;
      rowAbove.isValueArea = true;
      idxAbove += 1;
    } else if (rowBelow) {
      accumulatedValueAreaVol += rowBelow.totalVolume;
      rowBelow.isValueArea = true;
      idxBelow -= 1;
    }
  }

  const lowestIncludedIdx = idxBelow + 1;
  const highestIncludedIdx = idxAbove - 1;

  const lowestRow = rows[lowestIncludedIdx]!;
  const highestRow = rows[highestIncludedIdx]!;

  const val = lowestRow.low;
  const vah = highestRow.high;
  const achievedValueAreaPercent = (accumulatedValueAreaVol / totalEligibleVolume) * 100;

  return {
    rows,
    pocPrice,
    pocRowIndex,
    vah,
    val,
    targetValueAreaPercent: valueAreaPercent,
    achievedValueAreaPercent,
    totalEligibleVolume,
    valueAreaVolume: accumulatedValueAreaVol,
    exclusions: exclusions as VolumeProfileExclusions,
    qualityMetadata: qualityMetadata as VolumeProfileQualityMetadata,
    version: CALCULATION_VERSION,
  };
}
