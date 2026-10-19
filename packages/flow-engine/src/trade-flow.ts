import type { MarketEventV1 } from "@options-chart/market-data";
import {
  type CvdAnchorV1,
  type CvdResetReason,
  type FeatureAvailability,
  type FlowSide,
  type NormalizedTradeFlowV1,
  type RollingCvdWindowSnapshotV1,
  type TakerSideSource,
} from "./contracts";
import {
  computeQuoteVolume,
  parsePositiveDecimal,
  roundDecimal,
} from "./decimal";
import { isValidTimestampMs, resolveEffectiveTime } from "./effective-time";

export const TRADE_FLOW_POLICY_VERSION = "flow-trade-normalization-v1" as const;

export type TradeNormalizationFailureReason =
  | "wrong-channel"
  | "unsupported-venue-or-instrument"
  | "invalid-payload-shape"
  | "invalid-price"
  | "invalid-quantity"
  | "invalid-quote-volume"
  | "invalid-timestamp";

export type TradeNormalizationResult =
  | { readonly ok: true; readonly trade: NormalizedTradeFlowV1 }
  | {
      readonly ok: false;
      readonly reason: TradeNormalizationFailureReason;
      readonly eventId: string;
    };

export function resolveBinanceSpotTakerSide(payload: {
  readonly takerSide: "buy" | "sell" | null;
  readonly isBuyerMaker?: boolean | undefined;
}): {
  readonly takerSide: FlowSide | null;
  readonly takerSideSource: TakerSideSource;
} {
  if (payload.takerSide === "buy" || payload.takerSide === "sell") {
    return {
      takerSide: payload.takerSide,
      takerSideSource: "explicit-taker-side",
    };
  }
  if (payload.takerSide === null && typeof payload.isBuyerMaker === "boolean") {
    return {
      takerSide: payload.isBuyerMaker ? "sell" : "buy",
      takerSideSource: "binance-buyer-maker",
    };
  }
  return {
    takerSide: null,
    takerSideSource: "unknown",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeTradeEvent(
  event: MarketEventV1,
): TradeNormalizationResult {
  const eventId =
    typeof event.eventId === "string" && event.eventId.length > 0
      ? event.eventId
      : "unknown-event";

  if (event.channel !== "trade") {
    return { ok: false, reason: "wrong-channel", eventId };
  }

  if (
    event.venue !== "binance" ||
    event.instrumentType !== "spot" ||
    event.symbol !== "BTC-USDT"
  ) {
    return { ok: false, reason: "unsupported-venue-or-instrument", eventId };
  }

  if (!isValidTimestampMs(event.receiptTimestampMs)) {
    return { ok: false, reason: "invalid-timestamp", eventId };
  }

  if (
    !isRecord(event.payload) ||
    event.payload.schemaVersion !== "binance-spot-trade-payload-v1"
  ) {
    return { ok: false, reason: "invalid-payload-shape", eventId };
  }

  const rawTakerSide = event.payload.takerSide;
  const rawIsBuyerMaker = event.payload.isBuyerMaker;
  if (
    (rawTakerSide !== "buy" &&
      rawTakerSide !== "sell" &&
      rawTakerSide !== null) ||
    (rawIsBuyerMaker !== undefined && typeof rawIsBuyerMaker !== "boolean")
  ) {
    return { ok: false, reason: "invalid-payload-shape", eventId };
  }

  const priceResult = parsePositiveDecimal(event.payload.price);
  if (!priceResult.ok) {
    return { ok: false, reason: "invalid-price", eventId };
  }

  const quantityResult = parsePositiveDecimal(event.payload.quantity);
  if (!quantityResult.ok) {
    return { ok: false, reason: "invalid-quantity", eventId };
  }

  const quoteVolumeResult = computeQuoteVolume(
    priceResult.value,
    quantityResult.value,
  );
  if (!quoteVolumeResult.ok) {
    return { ok: false, reason: "invalid-quote-volume", eventId };
  }

  const effectiveTime = resolveEffectiveTime(event);
  const { takerSide, takerSideSource } = resolveBinanceSpotTakerSide({
    takerSide: rawTakerSide,
    isBuyerMaker: rawIsBuyerMaker,
  });

  const quoteVolume = quoteVolumeResult.value;
  const signedQuoteDelta =
    takerSide === "buy"
      ? quoteVolume
      : takerSide === "sell"
        ? -quoteVolume
        : null;

  const trade: NormalizedTradeFlowV1 = Object.freeze({
    eventId,
    receiptTimestampMs: effectiveTime.receiptTimestampMs,
    featureTimestampMs: effectiveTime.featureTimestampMs,
    featureTimeSource: effectiveTime.featureTimeSource,
    price: priceResult.value,
    baseQuantity: quantityResult.value,
    quoteVolume,
    takerSide,
    takerSideSource,
    signedQuoteDelta,
  });

  return { ok: true, trade };
}

export interface TradeRunningSums {
  buyQuoteVolume: number;
  sellQuoteVolume: number;
  unknownSideQuoteVolume: number;
  tradeCount: number;
  unknownSideTradeCount: number;
}

export type MutableCvdAnchorState = {
  -readonly [
    K in keyof Omit<CvdAnchorV1, "directionalCoverageRatio" | "availability">
  ]: CvdAnchorV1[K];
};

export function createZeroTradeSums(): TradeRunningSums {
  return {
    buyQuoteVolume: 0,
    sellQuoteVolume: 0,
    unknownSideQuoteVolume: 0,
    tradeCount: 0,
    unknownSideTradeCount: 0,
  };
}

export function createZeroAnchorState(
  anchorId: string,
  anchorTimestampMs: number,
  resetReason: CvdResetReason,
): MutableCvdAnchorState {
  return {
    anchorId,
    anchorTimestampMs,
    resetReason,
    buyQuoteVolume: 0,
    sellQuoteVolume: 0,
    unknownSideQuoteVolume: 0,
    totalQuoteVolume: 0,
    buyBaseQuantity: 0,
    sellBaseQuantity: 0,
    unknownSideBaseQuantity: 0,
    totalBaseQuantity: 0,
    rawCvdQuote: 0,
    includedTradeCount: 0,
    unknownSideTradeCount: 0,
    malformedTradeCount: 0,
  };
}

export function applyTradeToAnchorState(
  a: MutableCvdAnchorState,
  trade: NormalizedTradeFlowV1,
): void {
  if (trade.takerSide === "buy") {
    a.buyQuoteVolume = roundDecimal(a.buyQuoteVolume + trade.quoteVolume);
    a.buyBaseQuantity = roundDecimal(a.buyBaseQuantity + trade.baseQuantity);
  } else if (trade.takerSide === "sell") {
    a.sellQuoteVolume = roundDecimal(a.sellQuoteVolume + trade.quoteVolume);
    a.sellBaseQuantity = roundDecimal(a.sellBaseQuantity + trade.baseQuantity);
  } else {
    a.unknownSideQuoteVolume = roundDecimal(
      a.unknownSideQuoteVolume + trade.quoteVolume,
    );
    a.unknownSideBaseQuantity = roundDecimal(
      a.unknownSideBaseQuantity + trade.baseQuantity,
    );
    a.unknownSideTradeCount += 1;
  }
  a.totalQuoteVolume = roundDecimal(
    a.buyQuoteVolume + a.sellQuoteVolume + a.unknownSideQuoteVolume,
  );
  a.totalBaseQuantity = roundDecimal(
    a.buyBaseQuantity + a.sellBaseQuantity + a.unknownSideBaseQuantity,
  );
  a.rawCvdQuote = roundDecimal(a.buyQuoteVolume - a.sellQuoteVolume);
  a.includedTradeCount += 1;
}

export function addTradeToSums(
  sums: TradeRunningSums,
  trade: NormalizedTradeFlowV1,
): void {
  if (trade.takerSide === "buy") {
    sums.buyQuoteVolume = roundDecimal(sums.buyQuoteVolume + trade.quoteVolume);
  } else if (trade.takerSide === "sell") {
    sums.sellQuoteVolume = roundDecimal(
      sums.sellQuoteVolume + trade.quoteVolume,
    );
  } else {
    sums.unknownSideQuoteVolume = roundDecimal(
      sums.unknownSideQuoteVolume + trade.quoteVolume,
    );
    sums.unknownSideTradeCount += 1;
  }
  sums.tradeCount += 1;
}

export function removeTradeFromSums(
  sums: TradeRunningSums,
  trade: NormalizedTradeFlowV1,
): void {
  sums.tradeCount = Math.max(0, sums.tradeCount - 1);
  if (sums.tradeCount === 0) {
    Object.assign(sums, createZeroTradeSums());
    return;
  }
  if (trade.takerSide === "buy") {
    sums.buyQuoteVolume = Math.max(
      0,
      roundDecimal(sums.buyQuoteVolume - trade.quoteVolume),
    );
  } else if (trade.takerSide === "sell") {
    sums.sellQuoteVolume = Math.max(
      0,
      roundDecimal(sums.sellQuoteVolume - trade.quoteVolume),
    );
  } else {
    sums.unknownSideQuoteVolume = Math.max(
      0,
      roundDecimal(sums.unknownSideQuoteVolume - trade.quoteVolume),
    );
    sums.unknownSideTradeCount = Math.max(0, sums.unknownSideTradeCount - 1);
  }
}

export function resolveCvdAvailability(
  count: number,
  unknownCount: number,
  malformedCount: number,
  coverage: number | null,
  minCoverage: number,
  opts?: {
    readonly forceDegraded?: boolean;
    readonly forceUnavailable?: boolean;
  },
): FeatureAvailability {
  if (opts?.forceUnavailable === true || count === 0) return "unavailable";
  if (
    opts?.forceDegraded === true ||
    malformedCount > 0 ||
    unknownCount > 0 ||
    (coverage !== null && coverage < minCoverage)
  ) {
    return "degraded";
  }
  return "available";
}

export function buildRollingWindowSnapshot(
  windowId: string,
  windowKind: "duration" | "event-count",
  windowDurationMs: number | null,
  windowMaxEvents: number | null,
  s: TradeRunningSums,
  malformedTradeCount: number,
  minCoverageRatio: number,
  opts?: {
    readonly forceDegraded?: boolean;
    readonly forceUnavailable?: boolean;
  },
): RollingCvdWindowSnapshotV1 {
  const dirQuote = roundDecimal(s.buyQuoteVolume + s.sellQuoteVolume);
  const totalQuoteVolume = roundDecimal(dirQuote + s.unknownSideQuoteVolume);
  const directionalCoverageRatio =
    totalQuoteVolume > 0 ? roundDecimal(dirQuote / totalQuoteVolume, 6) : null;
  return Object.freeze({
    windowId,
    windowKind,
    windowDurationMs,
    windowMaxEvents,
    buyQuoteVolume: s.buyQuoteVolume,
    sellQuoteVolume: s.sellQuoteVolume,
    unknownSideQuoteVolume: s.unknownSideQuoteVolume,
    totalQuoteVolume,
    rawCvdQuote: roundDecimal(s.buyQuoteVolume - s.sellQuoteVolume),
    tradeCount: s.tradeCount,
    unknownSideTradeCount: s.unknownSideTradeCount,
    directionalCoverageRatio,
    availability: resolveCvdAvailability(
      s.tradeCount,
      s.unknownSideTradeCount,
      malformedTradeCount,
      directionalCoverageRatio,
      minCoverageRatio,
      opts,
    ),
  });
}

export function buildCvdAnchorSnapshot(
  a: MutableCvdAnchorState,
  minCoverageRatio: number,
  opts?: {
    readonly forceDegraded?: boolean;
    readonly forceUnavailable?: boolean;
  },
): CvdAnchorV1 {
  const dirQuote = roundDecimal(a.buyQuoteVolume + a.sellQuoteVolume);
  const directionalCoverageRatio =
    a.totalQuoteVolume > 0
      ? roundDecimal(dirQuote / a.totalQuoteVolume, 6)
      : null;
  return Object.freeze({
    ...a,
    directionalCoverageRatio,
    availability: resolveCvdAvailability(
      a.includedTradeCount,
      a.unknownSideTradeCount,
      a.malformedTradeCount,
      directionalCoverageRatio,
      minCoverageRatio,
      opts,
    ),
  });
}
