import type {
  BinanceAggTrade,
  VolumeProfileExclusions,
  VolumeProfileQualityMetadata,
  VolumeProfileResult,
  VolumeProfileTradeInput,
} from "./types";
import { CALCULATION_VERSION } from "./calculate";

const MAX_ROW_COUNT = 2048;

interface MutableTradeRow {
  low: number;
  high: number;
  mid: number;
  totalVolume: number;
  bullishVolume: number;
  bearishVolume: number;
  neutralVolume: number;
  takerBuyVolume: number;
  takerSellVolume: number;
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

export function calculateVolumeProfileFromTrades(
  input: VolumeProfileTradeInput,
): VolumeProfileResult {
  const {
    trades,
    range,
    replayCutoff,
    binConfig,
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

  const eligibleTrades: BinanceAggTrade[] = [];
  const seenTradeIds = new Set<number>();

  for (const trade of trades) {
    if (!Number.isFinite(trade.price) || trade.price <= 0) {
      exclusions.nonFinitePriceCount += 1;
      continue;
    }

    if (!Number.isFinite(trade.quantity) || trade.quantity < 0) {
      exclusions.negativeOrNonFiniteVolumeCount += 1;
      continue;
    }

    if (trade.quantity === 0) continue;

    if (seenTradeIds.has(trade.tradeId)) {
      exclusions.duplicateCandleCount += 1;
      continue;
    }
    seenTradeIds.add(trade.tradeId);

    if (replayCutoff !== undefined && trade.timestamp > replayCutoff) {
      exclusions.replayExcludedCount += 1;
      continue;
    }

    if (trade.timestamp < range.from || trade.timestamp > range.to) {
      continue;
    }

    eligibleTrades.push(trade);
  }

  eligibleTrades.sort((a, b) => a.timestamp - b.timestamp);

  const firstTrade = eligibleTrades[0];
  const lastTrade = eligibleTrades[eligibleTrades.length - 1];

  const qualityMetadata: MutableQualityMetadata = {
    eligibleCandleCount: eligibleTrades.length,
    excludedCandleCount: trades.length - eligibleTrades.length,
    sparseRowCount: 0,
    hasGaps: false,
    isProvisional: false,
    sourceFallback: false,
    coverageStart: firstTrade ? firstTrade.timestamp : null,
    coverageEnd: lastTrade ? lastTrade.timestamp : null,
  };

  if (eligibleTrades.length === 0) {
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
      exclusions: exclusions as VolumeProfileExclusions,
      qualityMetadata: qualityMetadata as VolumeProfileQualityMetadata,
      version: CALCULATION_VERSION,
    };
  }

  let minPrice = Number.POSITIVE_INFINITY;
  let maxPrice = Number.NEGATIVE_INFINITY;
  let totalEligibleVolume = 0;

  for (const t of eligibleTrades) {
    if (t.price < minPrice) minPrice = t.price;
    if (t.price > maxPrice) maxPrice = t.price;
    totalEligibleVolume += t.quantity;
  }

  const rows: MutableTradeRow[] = [];

  if (binConfig.mode === "rowCount") {
    const targetRowCount = Math.min(
      MAX_ROW_COUNT,
      Math.max(1, Math.round(binConfig.rowCount)),
    );

    if (maxPrice === minPrice) {
      rows.push({
        low: minPrice,
        high: minPrice + 1.0,
        mid: minPrice + 0.5,
        totalVolume: 0,
        bullishVolume: 0,
        bearishVolume: 0,
        neutralVolume: 0,
        takerBuyVolume: 0,
        takerSellVolume: 0,
        isValueArea: false,
        isPOC: false,
      });
    } else {
      const binWidth = (maxPrice - minPrice) / targetRowCount;
      for (let i = 0; i < targetRowCount; i++) {
        const rowLow = minPrice + i * binWidth;
        const rowHigh = i === targetRowCount - 1 ? maxPrice : minPrice + (i + 1) * binWidth;
        rows.push({
          low: rowLow,
          high: rowHigh,
          mid: (rowLow + rowHigh) / 2,
          totalVolume: 0,
          bullishVolume: 0,
          bearishVolume: 0,
          neutralVolume: 0,
          takerBuyVolume: 0,
          takerSellVolume: 0,
          isValueArea: false,
          isPOC: false,
        });
      }
    }
  } else if (binConfig.mode === "binSize") {
    const { binSize, tickOrigin = 0 } = binConfig;
    if (binSize <= 0 || !Number.isFinite(binSize)) {
      throw new Error(`Invalid binSize: ${binSize}. Must be positive finite number.`);
    }

    const firstBinIndex = Math.floor((minPrice - tickOrigin) / binSize);
    let lastBinIndex = Math.floor((maxPrice - tickOrigin) / binSize);
    if (tickOrigin + lastBinIndex * binSize === maxPrice && maxPrice > minPrice) {
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
        takerBuyVolume: 0,
        takerSellVolume: 0,
        isValueArea: false,
        isPOC: false,
      });
    }
  }

  const lastRowIdx = rows.length - 1;
  for (const trade of eligibleTrades) {
    let allocatedIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const isLast = i === lastRowIdx;
      const inBin = isLast
        ? trade.price >= row.low && trade.price <= row.high
        : trade.price >= row.low && trade.price < row.high;
      if (inBin) {
        allocatedIdx = i;
        break;
      }
    }

    if (allocatedIdx === -1) {
      if (trade.price <= rows[0]!.low) allocatedIdx = 0;
      else allocatedIdx = lastRowIdx;
    }

    const targetRow = rows[allocatedIdx]!;
    targetRow.totalVolume += trade.quantity;
    if (trade.isBuyerMaker) {
      targetRow.takerSellVolume += trade.quantity;
    } else {
      targetRow.takerBuyVolume += trade.quantity;
    }
  }

  let pocRowIndex = 0;
  let maxVolume = -1;
  let sparseCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.totalVolume === 0) sparseCount += 1;
    if (row.totalVolume > maxVolume) {
      maxVolume = row.totalVolume;
      pocRowIndex = i;
    }
  }

  qualityMetadata.sparseRowCount = sparseCount;

  const pocRow = rows[pocRowIndex]!;
  const pocPrice = pocRow.mid;
  pocRow.isPOC = true;

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
