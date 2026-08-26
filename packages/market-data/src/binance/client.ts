import type { CandleInterval } from "@options-chart/domain";
import {
  RateLimitError,
  TimeoutError,
  TransportError,
} from "@options-chart/shared";

import { BINANCE_REST_ENDPOINTS, REST_TIMEOUT_MS } from "./constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BinanceClientOptions {
  /** Override REST endpoints (for testing). */
  readonly endpoints?: readonly string[];
  /** Override request timeout in ms. */
  readonly timeoutMs?: number;
}

export interface KlinesRequestParams {
  readonly symbol?: string;
  readonly interval: CandleInterval;
  readonly startTime?: number;
  readonly endTime?: number;
  readonly limit?: number;
}

// ---------------------------------------------------------------------------
// Binance REST client
// ---------------------------------------------------------------------------

/**
 * Lightweight Binance REST client with automatic endpoint failover.
 *
 * Tries each endpoint in order. On transport or timeout failure, falls
 * through to the next endpoint. On HTTP 429 / 418, throws a
 * `RateLimitError` immediately (no failover — rate limits apply globally).
 */
export class BinanceRestClient {
  private readonly endpoints: readonly string[];
  private readonly timeoutMs: number;

  constructor(options: BinanceClientOptions = {}) {
    this.endpoints = options.endpoints ?? BINANCE_REST_ENDPOINTS;
    this.timeoutMs = options.timeoutMs ?? REST_TIMEOUT_MS;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Fetch klines (candlestick) data.
   * Returns the raw JSON array (caller validates with Zod).
   */
  async fetchKlines(params: KlinesRequestParams): Promise<unknown> {
    const qs = new URLSearchParams();
    qs.set("symbol", params.symbol ?? "BTCUSDT");
    qs.set("interval", params.interval);
    if (params.limit !== undefined) {
      qs.set("limit", String(params.limit));
    }
    if (params.startTime !== undefined) {
      qs.set("startTime", String(params.startTime));
    }
    if (params.endTime !== undefined) {
      qs.set("endTime", String(params.endTime));
    }

    return this.request(`/api/v3/klines?${qs.toString()}`);
  }

  /**
   * Fetch Binance server time.
   * Returns `{ serverTime: number }`.
   */
  async fetchServerTime(): Promise<{ serverTime: number }> {
    const result = await this.request("/api/v3/time");
    return result as { serverTime: number };
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private async request(path: string): Promise<unknown> {
    let lastError: unknown = null;

    for (const base of this.endpoints) {
      const url = `${base}${path}`;
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(this.timeoutMs),
          cache: "no-store",
        });

        // Rate-limit errors are global — do not fail over.
        if (response.status === 429 || response.status === 418) {
          const retryAfter = response.headers.get("Retry-After");
          throw new RateLimitError(
            `Binance rate limit: HTTP ${response.status}`,
            {
              source: "binance",
              operation: "rest-request",
              timestamp: Date.now(),
              retryable: true,
              context: {
                url,
                status: response.status,
                retryAfterSeconds: retryAfter ? Number(retryAfter) : null,
              },
            },
          );
        }

        if (!response.ok) {
          throw new TransportError(`Binance REST HTTP ${response.status}`, {
            source: "binance",
            operation: "rest-request",
            timestamp: Date.now(),
            retryable: response.status >= 500,
            context: { url, status: response.status },
          });
        }

        return await response.json();
      } catch (error) {
        // Re-throw rate-limit errors immediately.
        if (error instanceof RateLimitError) {
          throw error;
        }

        // Timeout — try next endpoint.
        if (error instanceof DOMException && error.name === "TimeoutError") {
          lastError = new TimeoutError(
            `Binance REST timeout after ${this.timeoutMs}ms`,
            {
              source: "binance",
              operation: "rest-request",
              timestamp: Date.now(),
              retryable: true,
              context: { url, timeoutMs: this.timeoutMs },
              cause: error,
            },
          );
          continue;
        }

        // Network failure — try next endpoint.
        if (error instanceof TypeError || error instanceof TransportError) {
          lastError =
            error instanceof TransportError
              ? error
              : new TransportError(
                  `Binance REST network error: ${error.message}`,
                  {
                    source: "binance",
                    operation: "rest-request",
                    timestamp: Date.now(),
                    retryable: true,
                    context: { url },
                    cause: error,
                  },
                );
          continue;
        }

        // Unexpected error — propagate.
        throw error;
      }
    }

    // All endpoints exhausted.
    throw (
      lastError ??
      new TransportError("All Binance REST endpoints failed", {
        source: "binance",
        operation: "rest-request",
        timestamp: Date.now(),
        retryable: true,
        context: { endpoints: [...this.endpoints] },
      })
    );
  }
}
