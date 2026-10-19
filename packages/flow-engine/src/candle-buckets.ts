import type { FlowEngineConfigV1 } from "./configuration";
import {
  FLOW_TIMEFRAMES,
  FLOW_TIMEFRAME_DURATION_MS,
  type CandleCvdBucketV1,
  type FeatureAvailability,
  type FlowTimeframe,
  type NormalizedTradeFlowV1,
} from "./contracts";
import { roundDecimal } from "./decimal";

export const CANDLE_BUCKETS_POLICY_VERSION = "flow-candle-buckets-v1" as const;

/**
 * 1970-01-01 00:00:00 UTC was a Thursday.
 * Binance weekly candles align to Monday 00:00:00 UTC (4 days = 345,600,000 ms after Unix epoch).
 */
export const MONDAY_1W_EPOCH_OFFSET_MS = 345_600_000;

export function computeBinanceCandleBoundary(
  timestampMs: number,
  timeframe: FlowTimeframe,
): { readonly openTimeMs: number; readonly closeTimeMs: number } {
  const durationMs = FLOW_TIMEFRAME_DURATION_MS[timeframe];
  const openTimeMs =
    timeframe === "1w"
      ? Math.floor((timestampMs - MONDAY_1W_EPOCH_OFFSET_MS) / durationMs) *
          durationMs +
        MONDAY_1W_EPOCH_OFFSET_MS
      : Math.floor(timestampMs / durationMs) * durationMs;
  const closeTimeMs = openTimeMs + durationMs - 1;
  return { openTimeMs, closeTimeMs };
}

interface MutableCandleBucket {
  readonly timeframe: FlowTimeframe;
  readonly openTimeMs: number;
  readonly closeTimeMs: number;
  buyQuoteVolume: number;
  sellQuoteVolume: number;
  unknownSideQuoteVolume: number;
  totalQuoteVolume: number;
  buyBaseQuantity: number;
  sellBaseQuantity: number;
  rawCvdQuote: number;
  cumulativeCvdFromAnchorQuote: number;
  anchorId: string;
  tradeCount: number;
  unknownSideTradeCount: number;
}

export type CandleBucketAccumulatorConfig = Pick<
  FlowEngineConfigV1,
  | "candleTimeframes"
  | "maxRetainedCandlesPerTimeframe"
  | "minTradeSideCoverageRatio"
>;

export class CandleBucketAccumulator {
  private readonly configuredTimeframes: readonly FlowTimeframe[];
  private readonly maxRetainedCandlesPerTimeframe: number;
  private readonly minTradeSideCoverageRatio: number;
  private readonly bucketsByTimeframe: Readonly<
    Record<FlowTimeframe, Map<number, MutableCandleBucket>>
  >;
  private readonly lastOpenTimeByTimeframe: Record<FlowTimeframe, number>;

  public constructor(config: CandleBucketAccumulatorConfig) {
    this.configuredTimeframes = [...config.candleTimeframes];
    this.maxRetainedCandlesPerTimeframe = config.maxRetainedCandlesPerTimeframe;
    this.minTradeSideCoverageRatio = config.minTradeSideCoverageRatio;
    this.bucketsByTimeframe = Object.freeze({
      "1m": new Map<number, MutableCandleBucket>(),
      "5m": new Map<number, MutableCandleBucket>(),
      "15m": new Map<number, MutableCandleBucket>(),
      "1h": new Map<number, MutableCandleBucket>(),
      "4h": new Map<number, MutableCandleBucket>(),
      "1d": new Map<number, MutableCandleBucket>(),
      "1w": new Map<number, MutableCandleBucket>(),
    });
    this.lastOpenTimeByTimeframe = {
      "1m": Number.NEGATIVE_INFINITY,
      "5m": Number.NEGATIVE_INFINITY,
      "15m": Number.NEGATIVE_INFINITY,
      "1h": Number.NEGATIVE_INFINITY,
      "4h": Number.NEGATIVE_INFINITY,
      "1d": Number.NEGATIVE_INFINITY,
      "1w": Number.NEGATIVE_INFINITY,
    };
  }

  public ingestTrade(
    trade: NormalizedTradeFlowV1,
    activeAnchorId: string,
    cumulativeCvdFromAnchorQuote: number,
  ): void {
    const roundedCumulativeCvd = roundDecimal(cumulativeCvdFromAnchorQuote);

    for (const timeframe of this.configuredTimeframes) {
      const { openTimeMs, closeTimeMs } = computeBinanceCandleBoundary(
        trade.featureTimestampMs,
        timeframe,
      );
      const bucketMap = this.bucketsByTimeframe[timeframe];
      let bucket = bucketMap.get(openTimeMs);

      if (bucket === undefined) {
        bucket = {
          timeframe,
          openTimeMs,
          closeTimeMs,
          buyQuoteVolume: 0,
          sellQuoteVolume: 0,
          unknownSideQuoteVolume: 0,
          totalQuoteVolume: 0,
          buyBaseQuantity: 0,
          sellBaseQuantity: 0,
          rawCvdQuote: 0,
          cumulativeCvdFromAnchorQuote: roundedCumulativeCvd,
          anchorId: activeAnchorId,
          tradeCount: 0,
          unknownSideTradeCount: 0,
        };
        bucketMap.set(openTimeMs, bucket);

        if (openTimeMs < this.lastOpenTimeByTimeframe[timeframe]) {
          this.resortAndTrimTimeframeMap(timeframe, bucketMap);
        } else {
          this.lastOpenTimeByTimeframe[timeframe] = openTimeMs;
          while (bucketMap.size > this.maxRetainedCandlesPerTimeframe) {
            const oldestKey = bucketMap.keys().next().value;
            if (oldestKey === undefined) {
              break;
            }
            bucketMap.delete(oldestKey);
          }
        }
      }

      if (trade.takerSide === "buy") {
        bucket.buyQuoteVolume = roundDecimal(
          bucket.buyQuoteVolume + trade.quoteVolume,
        );
        bucket.buyBaseQuantity = roundDecimal(
          bucket.buyBaseQuantity + trade.baseQuantity,
        );
      } else if (trade.takerSide === "sell") {
        bucket.sellQuoteVolume = roundDecimal(
          bucket.sellQuoteVolume + trade.quoteVolume,
        );
        bucket.sellBaseQuantity = roundDecimal(
          bucket.sellBaseQuantity + trade.baseQuantity,
        );
      } else {
        bucket.unknownSideQuoteVolume = roundDecimal(
          bucket.unknownSideQuoteVolume + trade.quoteVolume,
        );
        bucket.unknownSideTradeCount += 1;
      }

      bucket.totalQuoteVolume = roundDecimal(
        bucket.buyQuoteVolume +
          bucket.sellQuoteVolume +
          bucket.unknownSideQuoteVolume,
      );
      bucket.rawCvdQuote = roundDecimal(
        bucket.buyQuoteVolume - bucket.sellQuoteVolume,
      );
      bucket.cumulativeCvdFromAnchorQuote = roundedCumulativeCvd;
      bucket.anchorId = activeAnchorId;
      bucket.tradeCount += 1;
    }
  }

  public snapshot(
    asOfFeatureTimestampMs: number,
    options?: {
      readonly forceDegraded?: boolean;
      readonly forceUnavailable?: boolean;
    },
  ): Readonly<Record<FlowTimeframe, readonly CandleCvdBucketV1[]>> {
    const forceUnavailable = options?.forceUnavailable === true;
    const forceDegraded = options?.forceDegraded === true;

    const buildTimeframeBuckets = (
      timeframe: FlowTimeframe,
    ): readonly CandleCvdBucketV1[] => {
      const bucketMap = this.bucketsByTimeframe[timeframe];
      const result: CandleCvdBucketV1[] = [];

      for (const bucket of bucketMap.values()) {
        const directionalQuote = roundDecimal(
          bucket.buyQuoteVolume + bucket.sellQuoteVolume,
        );
        const directionalCoverageRatio =
          bucket.totalQuoteVolume > 0
            ? roundDecimal(directionalQuote / bucket.totalQuoteVolume, 6)
            : null;
        const isClosed = asOfFeatureTimestampMs > bucket.closeTimeMs;

        let availability: FeatureAvailability;
        if (forceUnavailable || bucket.tradeCount === 0) {
          availability = "unavailable";
        } else if (
          forceDegraded ||
          bucket.unknownSideTradeCount > 0 ||
          (directionalCoverageRatio !== null &&
            directionalCoverageRatio < this.minTradeSideCoverageRatio)
        ) {
          availability = "degraded";
        } else {
          availability = "available";
        }

        result.push(
          Object.freeze({
            timeframe: bucket.timeframe,
            openTimeMs: bucket.openTimeMs,
            closeTimeMs: bucket.closeTimeMs,
            buyQuoteVolume: bucket.buyQuoteVolume,
            sellQuoteVolume: bucket.sellQuoteVolume,
            unknownSideQuoteVolume: bucket.unknownSideQuoteVolume,
            totalQuoteVolume: bucket.totalQuoteVolume,
            buyBaseQuantity: bucket.buyBaseQuantity,
            sellBaseQuantity: bucket.sellBaseQuantity,
            rawCvdQuote: bucket.rawCvdQuote,
            cumulativeCvdFromAnchorQuote: bucket.cumulativeCvdFromAnchorQuote,
            anchorId: bucket.anchorId,
            tradeCount: bucket.tradeCount,
            unknownSideTradeCount: bucket.unknownSideTradeCount,
            directionalCoverageRatio,
            isClosed,
            availability,
          }),
        );
      }

      return Object.freeze(result);
    };

    const record = {} as Record<FlowTimeframe, readonly CandleCvdBucketV1[]>;
    for (const timeframe of FLOW_TIMEFRAMES) {
      record[timeframe] = buildTimeframeBuckets(timeframe);
    }
    return Object.freeze(record);
  }

  private resortAndTrimTimeframeMap(
    timeframe: FlowTimeframe,
    bucketMap: Map<number, MutableCandleBucket>,
  ): void {
    const sortedEntries = [...bucketMap.entries()].sort((a, b) => a[0] - b[0]);
    bucketMap.clear();
    const startIdx = Math.max(
      0,
      sortedEntries.length - this.maxRetainedCandlesPerTimeframe,
    );
    for (let i = startIdx; i < sortedEntries.length; i += 1) {
      const entry = sortedEntries[i];
      if (entry !== undefined) {
        bucketMap.set(entry[0], entry[1]);
      }
    }
    const lastEntry = sortedEntries[sortedEntries.length - 1];
    this.lastOpenTimeByTimeframe[timeframe] =
      lastEntry !== undefined ? lastEntry[0] : Number.NEGATIVE_INFINITY;
  }
}
