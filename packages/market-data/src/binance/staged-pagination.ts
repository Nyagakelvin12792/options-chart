import type { Candle, CandleInterval } from "@options-chart/domain";
import { TransportError } from "@options-chart/shared";

import type { BinanceRestClient } from "./client";
import {
  BINANCE_MAX_KLINES_PER_REQUEST,
  BOOTSTRAP_TARGET_BARS,
} from "./constants";
import { parseBinanceKlines } from "./normalizers";

export interface InitialHistoryOptions {
  readonly symbol?: string;
  readonly interval: CandleInterval;
  readonly limit?: number;
  readonly maxRetries?: number;
}

export interface InitialHistoryResult {
  readonly candles: readonly Candle[];
  readonly reachedBeginning: boolean;
}

export interface StreamOlderHistoryOptions {
  readonly symbol?: string;
  readonly interval: CandleInterval;
  readonly beforeOpenTime: number;
  readonly targetBars?: number;
  readonly existingCount?: number;
  readonly pageSize?: number;
  readonly maxPageRetries?: number;
  readonly isCancelled?: () => boolean;
  readonly onPage?: (
    newCandles: readonly Candle[],
    meta: {
      readonly totalCandles: number;
      readonly targetBars: number;
      readonly reachedBeginning: boolean;
    },
  ) => void;
}

export interface StreamOlderHistoryResult {
  readonly candles: readonly Candle[];
  readonly totalPagesFetched: number;
  readonly reachedBeginning: boolean;
  readonly cancelled: boolean;
}

/**
 * Rapidly fetches the first page of the most recent historical candles (up to 1,000 bars)
 * so the chart can render immediately and connect live streaming without waiting for
 * 10,000 historical bars.
 */
export async function fetchInitialHistoryPage(
  client: BinanceRestClient,
  options: InitialHistoryOptions,
): Promise<InitialHistoryResult> {
  const {
    symbol = "BTCUSDT",
    interval,
    limit = BINANCE_MAX_KLINES_PER_REQUEST,
    maxRetries = 2,
  } = options;

  let pageCandles: Candle[] = [];

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const payload = await client.fetchKlines({
        symbol,
        interval,
        limit: Math.min(limit, BINANCE_MAX_KLINES_PER_REQUEST),
      });
      const parsed = parseBinanceKlines(payload, Date.now(), interval);
      pageCandles = Array.from(
        new Map(parsed.map((c) => [c.openTime, c])).values(),
      ).sort((a, b) => a.openTime - b.openTime);
      break;
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      if (error instanceof TransportError && !error.retryable) {
        throw error;
      }
    }
  }

  return {
    candles: pageCandles,
    reachedBeginning: pageCandles.length < limit,
  };
}

/**
 * Background streaming loader for older historical bars toward targetBars (default: 10,000).
 * Yields pages progressively via `onPage`, supports cooperative cancellation, and respects
 * API rate limits.
 */
export async function streamOlderHistoryPages(
  client: BinanceRestClient,
  options: StreamOlderHistoryOptions,
): Promise<StreamOlderHistoryResult> {
  const {
    symbol = "BTCUSDT",
    interval,
    targetBars = BOOTSTRAP_TARGET_BARS,
    existingCount = 0,
    pageSize = BINANCE_MAX_KLINES_PER_REQUEST,
    maxPageRetries = 2,
    isCancelled = () => false,
    onPage,
  } = options;

  let currentBeforeOpenTime = options.beforeOpenTime;
  let totalPagesFetched = 0;
  let reachedBeginning = false;
  const allOlderCandles: Candle[] = [];
  const neededOlderBars = Math.max(0, targetBars - existingCount);

  while (
    allOlderCandles.length < neededOlderBars &&
    !reachedBeginning &&
    !isCancelled()
  ) {
    const remaining = neededOlderBars - allOlderCandles.length;
    const limit = Math.min(pageSize, remaining);

    let pageCandles: Candle[] | null = null;

    for (let attempt = 0; attempt <= maxPageRetries; attempt += 1) {
      if (isCancelled()) break;
      try {
        const payload = await client.fetchKlines({
          symbol,
          interval,
          endTime: currentBeforeOpenTime - 1,
          limit,
        });
        const parsed = parseBinanceKlines(payload, Date.now(), interval);
        pageCandles = parsed
          .filter((c) => c.openTime < currentBeforeOpenTime)
          .sort((a, b) => a.openTime - b.openTime);
        totalPagesFetched += 1;
        break;
      } catch (error) {
        if (attempt === maxPageRetries || isCancelled()) {
          pageCandles = null;
          break;
        }
        if (error instanceof TransportError && !error.retryable) {
          pageCandles = null;
          break;
        }
      }
    }

    if (isCancelled()) {
      return {
        candles: allOlderCandles,
        totalPagesFetched,
        reachedBeginning: false,
        cancelled: true,
      };
    }

    if (!pageCandles || pageCandles.length === 0) {
      reachedBeginning = true;
      break;
    }

    // Deduplicate and prepend to older candles
    const earliestOpenTime = pageCandles[0]?.openTime;
    if (earliestOpenTime === undefined || earliestOpenTime >= currentBeforeOpenTime) {
      // No progress backwards; stop to prevent infinite loop
      break;
    }

    allOlderCandles.push(...pageCandles);
    currentBeforeOpenTime = earliestOpenTime;

    if (pageCandles.length < limit) {
      reachedBeginning = true;
    }

    if (onPage) {
      onPage(pageCandles, {
        totalCandles: existingCount + allOlderCandles.length,
        targetBars,
        reachedBeginning,
      });
    }
  }

  // Sort collected older candles chronologically
  const sorted = Array.from(
    new Map(allOlderCandles.map((c) => [c.openTime, c])).values(),
  ).sort((a, b) => a.openTime - b.openTime);

  return {
    candles: sorted,
    totalPagesFetched,
    reachedBeginning,
    cancelled: isCancelled(),
  };
}
