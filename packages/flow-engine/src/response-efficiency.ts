import {
  DEFAULT_FLOW_ENGINE_CONFIG_V1,
  type FlowEngineConfigV1,
} from "./configuration";
import type {
  FeatureAvailability,
  NormalizedTradeFlowV1,
  ResponseEfficiencySnapshotV1,
  ResponseEfficiencyWindowV1,
  ResponseUnavailableReason,
} from "./contracts";
import {
  QUOTE_MILLION_UNIT,
  computeSignedBpsChange,
  roundDecimal,
} from "./decimal";

export const RESPONSE_EFFICIENCY_POLICY_VERSION =
  "flow-response-efficiency-v1" as const;

export interface ResponseEfficiencyOptionsV1 {
  readonly isStaleOrGapped?: boolean;
  readonly forceDegraded?: boolean;
}

function findFirstIndexAtOrAfter(
  trades: readonly NormalizedTradeFlowV1[],
  minTimestampMs: number,
): number {
  let low = 0;
  let high = trades.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    const trade = trades[mid];
    if (trade !== undefined && trade.featureTimestampMs < minTimestampMs) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

function findFirstIndexAfter(
  trades: readonly NormalizedTradeFlowV1[],
  maxTimestampMs: number,
): number {
  let low = 0;
  let high = trades.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    const trade = trades[mid];
    if (trade !== undefined && trade.featureTimestampMs <= maxTimestampMs) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

function selectWindowTrades(
  trades: readonly NormalizedTradeFlowV1[],
  startTimestampMs: number,
  endTimestampMs: number,
): readonly NormalizedTradeFlowV1[] {
  if (trades.length === 0 || startTimestampMs > endTimestampMs) {
    return [];
  }
  const startIndex = findFirstIndexAtOrAfter(trades, startTimestampMs);
  const endIndex = findFirstIndexAfter(trades, endTimestampMs);
  if (startIndex >= endIndex) {
    return [];
  }
  return trades.slice(startIndex, endIndex);
}

function createUnavailableWindow(params: {
  readonly windowId: string;
  readonly windowDurationMs: number;
  readonly unavailableReason: ResponseUnavailableReason;
  readonly startPrice: number | null;
  readonly endPrice: number | null;
  readonly signedPriceChangeBps: number | null;
  readonly signedAggressiveQuoteVolume: number;
  readonly totalAggressiveQuoteVolume: number;
  readonly unknownSideQuoteVolume: number;
  readonly sampleCount: number;
  readonly excludedTradeCount: number;
  readonly directionalCoverageRatio: number | null;
}): ResponseEfficiencyWindowV1 {
  return Object.freeze({
    windowId: params.windowId,
    windowDurationMs: params.windowDurationMs,
    availability: "unavailable",
    unavailableReason: params.unavailableReason,
    startPrice: params.startPrice,
    endPrice: params.endPrice,
    signedPriceChangeBps: params.signedPriceChangeBps,
    signedAggressiveQuoteVolume: params.signedAggressiveQuoteVolume,
    totalAggressiveQuoteVolume: params.totalAggressiveQuoteVolume,
    unknownSideQuoteVolume: params.unknownSideQuoteVolume,
    netEfficiencyBpsPerMillionQuote: null,
    directionalImpactBpsPerMillionQuote: null,
    absorptionDragScore: null,
    sampleCount: params.sampleCount,
    excludedTradeCount: params.excludedTradeCount,
    directionalCoverageRatio: params.directionalCoverageRatio,
  });
}

export function computeResponseEfficiencyWindow(
  trades: readonly NormalizedTradeFlowV1[],
  asOfFeatureTimestampMs: number,
  windowDurationMs: number,
  config: FlowEngineConfigV1 = DEFAULT_FLOW_ENGINE_CONFIG_V1,
  options?: ResponseEfficiencyOptionsV1,
): ResponseEfficiencyWindowV1 {
  const windowId = `response-${String(windowDurationMs)}ms`;
  const windowStartMs = asOfFeatureTimestampMs - windowDurationMs;
  const windowTrades = selectWindowTrades(
    trades,
    windowStartMs,
    asOfFeatureTimestampMs,
  );

  let buyQuoteVolume = 0;
  let sellQuoteVolume = 0;
  let unknownSideQuoteVolume = 0;
  let sampleCount = 0;
  let excludedTradeCount = 0;

  for (const trade of windowTrades) {
    if (trade.takerSide === "buy") {
      buyQuoteVolume = roundDecimal(buyQuoteVolume + trade.quoteVolume);
      sampleCount += 1;
    } else if (trade.takerSide === "sell") {
      sellQuoteVolume = roundDecimal(sellQuoteVolume + trade.quoteVolume);
      sampleCount += 1;
    } else {
      unknownSideQuoteVolume = roundDecimal(
        unknownSideQuoteVolume + trade.quoteVolume,
      );
      excludedTradeCount += 1;
    }
  }

  const totalAggressiveQuoteVolume = roundDecimal(
    buyQuoteVolume + sellQuoteVolume,
  );
  const signedAggressiveQuoteVolume = roundDecimal(
    buyQuoteVolume - sellQuoteVolume,
  );
  const totalQuote = roundDecimal(
    totalAggressiveQuoteVolume + unknownSideQuoteVolume,
  );
  const directionalCoverageRatio =
    totalQuote > 0
      ? roundDecimal(totalAggressiveQuoteVolume / totalQuote, 6)
      : null;

  const firstTrade = windowTrades[0];
  const lastTrade = windowTrades[windowTrades.length - 1];
  const startPrice = firstTrade !== undefined ? firstTrade.price : null;
  const endPrice = lastTrade !== undefined ? lastTrade.price : null;
  const signedPriceChangeBps =
    startPrice !== null && endPrice !== null
      ? computeSignedBpsChange(startPrice, endPrice)
      : null;

  const baseMetrics = {
    windowId,
    windowDurationMs,
    startPrice,
    endPrice,
    signedPriceChangeBps,
    signedAggressiveQuoteVolume,
    totalAggressiveQuoteVolume,
    unknownSideQuoteVolume,
    sampleCount,
    excludedTradeCount,
    directionalCoverageRatio,
  };

  if (options?.isStaleOrGapped === true) {
    return createUnavailableWindow({
      ...baseMetrics,
      unavailableReason: "stale-or-gapped",
    });
  }

  if (
    sampleCount < config.responseEfficiencyMinSamples ||
    signedPriceChangeBps === null
  ) {
    return createUnavailableWindow({
      ...baseMetrics,
      unavailableReason: "insufficient-samples",
    });
  }

  if (
    directionalCoverageRatio === null ||
    directionalCoverageRatio < config.minTradeSideCoverageRatio
  ) {
    return createUnavailableWindow({
      ...baseMetrics,
      unavailableReason: "low-directional-coverage",
    });
  }

  if (
    totalAggressiveQuoteVolume < config.responseEfficiencyMinQuoteVolume ||
    Math.abs(signedAggressiveQuoteVolume) <
      config.responseEfficiencyMinQuoteVolume
  ) {
    return createUnavailableWindow({
      ...baseMetrics,
      unavailableReason: "zero-or-small-denominator",
    });
  }

  const netMillions = signedAggressiveQuoteVolume / QUOTE_MILLION_UNIT;
  const totalMillions = totalAggressiveQuoteVolume / QUOTE_MILLION_UNIT;
  const netEfficiencyBpsPerMillionQuote = roundDecimal(
    signedPriceChangeBps / netMillions,
    6,
  );
  const directionalImpactBpsPerMillionQuote = roundDecimal(
    signedPriceChangeBps / totalMillions,
    6,
  );
  const favorableProgressBps =
    signedAggressiveQuoteVolume > 0
      ? Math.max(0, signedPriceChangeBps)
      : Math.max(0, -signedPriceChangeBps);
  const absorptionDragScore = roundDecimal(
    Math.max(
      0,
      Math.min(
        1,
        1 - favorableProgressBps / (config.maxAbsorptionProgressBps * 2),
      ),
    ),
    6,
  );
  const availability: FeatureAvailability =
    options?.forceDegraded === true || excludedTradeCount > 0
      ? "degraded"
      : "available";

  return Object.freeze({
    ...baseMetrics,
    availability,
    unavailableReason: "none",
    netEfficiencyBpsPerMillionQuote,
    directionalImpactBpsPerMillionQuote,
    absorptionDragScore,
  });
}

export function computeResponseEfficiencySnapshot(
  trades: readonly NormalizedTradeFlowV1[],
  asOfFeatureTimestampMs: number,
  config: FlowEngineConfigV1 = DEFAULT_FLOW_ENGINE_CONFIG_V1,
  options?: ResponseEfficiencyOptionsV1,
): ResponseEfficiencySnapshotV1 {
  const windows = Object.freeze(
    config.responseEfficiencyWindowsMs.map((windowDurationMs) =>
      computeResponseEfficiencyWindow(
        trades,
        asOfFeatureTimestampMs,
        windowDurationMs,
        config,
        options,
      ),
    ),
  );

  let availability: FeatureAvailability;
  if (
    windows.length === 0 ||
    windows.every((window) => window.availability === "unavailable")
  ) {
    availability = "unavailable";
  } else if (windows.every((window) => window.availability === "available")) {
    availability = "available";
  } else {
    availability = "degraded";
  }

  return Object.freeze({
    availability,
    windows,
  });
}
