import type { Candle, CandleInterval } from "@options-chart/domain";
import { TransportError } from "@options-chart/shared";

import type { BinanceRestClient } from "./client";
import {
  BINANCE_MAX_KLINES_PER_REQUEST,
  BOOTSTRAP_TARGET_BARS,
  INTERVAL_MS,
} from "./constants";
import { parseBinanceKlines } from "./normalizers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HistoryCompleteness = "COMPLETE" | "DEGRADED";

export interface BootstrapResult {
  /** Canonical candle array, strictly ordered by openTime. */
  readonly candles: readonly Candle[];
  /** Whether the full requested bar count was obtained. */
  readonly completeness: HistoryCompleteness;
  /** Number of REST pages fetched. */
  readonly pagesFetched: number;
  /** Total bars before deduplication. */
  readonly rawBarCount: number;
  /** Bars removed by deduplication. */
  readonly duplicatesRemoved: number;
  /** Any contiguity gaps detected (openTime pairs). */
  readonly contiguityGaps: ReadonlyArray<{
    readonly expectedOpenTime: number;
    readonly actualOpenTime: number;
  }>;
}

export interface BootstrapOptions {
  readonly symbol?: string;
  readonly interval: CandleInterval;
  readonly targetBars?: number;
  /** End time for bootstrap range (defaults to now). */
  readonly endTime?: number;
  /** Maximum retry attempts per page. */
  readonly maxPageRetries?: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Deterministic paginated historical candle bootstrap.
 *
 * Fetches up to {@link BOOTSTRAP_TARGET_BARS} candles in pages of
 * ≤{@link BINANCE_MAX_KLINES_PER_REQUEST}, validates each page
 * independently with Zod, deduplicates by `openTime`, and verifies
 * interval contiguity.
 *
 * If a page fails after retries, the bootstrap continues in DEGRADED
 * mode with whatever data was successfully fetched.
 */
export async function bootstrapHistory(
  client: BinanceRestClient,
  options: BootstrapOptions,
): Promise<BootstrapResult> {
  const {
    symbol = "BTCUSDT",
    interval,
    targetBars = BOOTSTRAP_TARGET_BARS,
    endTime = Date.now(),
    maxPageRetries = 2,
  } = options;

  const intervalMs = INTERVAL_MS[interval];
  const pageSize = BINANCE_MAX_KLINES_PER_REQUEST;

  // Calculate the desired time range working backwards from endTime.
  const desiredStartTime = endTime - targetBars * intervalMs;

  let currentStartTime = desiredStartTime;
  const allCandles: Candle[] = [];
  let pagesFetched = 0;
  let completeness: HistoryCompleteness = "COMPLETE";

  // Paginate forward from desiredStartTime.
  while (currentStartTime < endTime) {
    let pageCandles: readonly Candle[] | null = null;

    for (let attempt = 0; attempt <= maxPageRetries; attempt++) {
      try {
        const payload = await client.fetchKlines({
          symbol,
          interval,
          startTime: currentStartTime,
          endTime,
          limit: pageSize,
        });

        pageCandles = parseBinanceKlines(payload, Date.now(), interval);
        pagesFetched++;
        break;
      } catch (error) {
        if (attempt === maxPageRetries) {
          // Page failed after all retries — degrade gracefully.
          completeness = "DEGRADED";
          pageCandles = null;
        }
        // On retryable errors, continue loop; otherwise break.
        if (
          error instanceof TransportError &&
          !error.retryable &&
          attempt < maxPageRetries
        ) {
          // Non-retryable transport error — skip remaining retries.
          completeness = "DEGRADED";
          break;
        }
      }
    }

    if (!pageCandles || pageCandles.length === 0) {
      // No data from this page — stop pagination.
      break;
    }

    allCandles.push(...pageCandles);

    // Advance startTime past the last received candle.
    const lastCandle = pageCandles[pageCandles.length - 1]!;
    const nextStartTime = lastCandle.openTime + intervalMs;

    // If the page returned fewer than pageSize candles, we've reached the end.
    if (pageCandles.length < pageSize) {
      break;
    }

    // Guard: if startTime didn't advance, prevent infinite loop.
    if (nextStartTime <= currentStartTime) {
      break;
    }

    currentStartTime = nextStartTime;
  }

  // Assemble: sort, deduplicate, verify contiguity.
  return assembleCandles(
    allCandles,
    interval,
    targetBars,
    pagesFetched,
    completeness,
  );
}

// ---------------------------------------------------------------------------
// Assembly helpers
// ---------------------------------------------------------------------------

function assembleCandles(
  raw: Candle[],
  interval: CandleInterval,
  targetBars: number,
  pagesFetched: number,
  initialCompleteness: HistoryCompleteness,
): BootstrapResult {
  const intervalMs = INTERVAL_MS[interval];

  // Sort by openTime (should already be ordered, but enforce).
  raw.sort((a, b) => a.openTime - b.openTime);

  // Deduplicate by openTime (keep last occurrence — freshest data).
  const seen = new Map<number, Candle>();
  for (const candle of raw) {
    seen.set(candle.openTime, candle);
  }
  const deduped = Array.from(seen.values()).sort(
    (a, b) => a.openTime - b.openTime,
  );
  const duplicatesRemoved = raw.length - deduped.length;

  // Verify contiguity between adjacent closed candles.
  const contiguityGaps: Array<{
    expectedOpenTime: number;
    actualOpenTime: number;
  }> = [];

  for (let i = 1; i < deduped.length; i++) {
    const prev = deduped[i - 1]!;
    const curr = deduped[i]!;
    // Only check contiguity between closed candles.
    if (prev.isClosed && curr.isClosed) {
      const expected = prev.openTime + intervalMs;
      if (curr.openTime !== expected) {
        contiguityGaps.push({
          expectedOpenTime: expected,
          actualOpenTime: curr.openTime,
        });
      }
    }
  }

  // Determine final completeness.
  let completeness = initialCompleteness;
  if (deduped.length < targetBars && completeness === "COMPLETE") {
    completeness = "DEGRADED";
  }
  if (contiguityGaps.length > 0 && completeness === "COMPLETE") {
    completeness = "DEGRADED";
  }

  return {
    candles: deduped,
    completeness,
    pagesFetched,
    rawBarCount: raw.length,
    duplicatesRemoved,
    contiguityGaps,
  };
}
