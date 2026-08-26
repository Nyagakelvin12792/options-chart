import type { CandleInterval } from "@options-chart/domain";

// ---------------------------------------------------------------------------
// REST endpoints
// ---------------------------------------------------------------------------

/** Primary Binance REST endpoint. */
export const BINANCE_REST_PRIMARY = "https://api.binance.com";

/** Official market-data-only REST fallback (no trading). */
export const BINANCE_REST_FALLBACK = "https://data-api.binance.vision";

/** Ordered list of REST base URLs to attempt. */
export const BINANCE_REST_ENDPOINTS = [
  BINANCE_REST_PRIMARY,
  BINANCE_REST_FALLBACK,
] as const;

// ---------------------------------------------------------------------------
// WebSocket endpoints
// ---------------------------------------------------------------------------

/** Primary Binance WebSocket endpoint. */
export const BINANCE_WS_PRIMARY = "wss://stream.binance.com:9443/ws";

/** Official market-data-only WS fallback. */
export const BINANCE_WS_FALLBACK = "wss://data-stream.binance.vision:9443/ws";

/** Ordered list of WS base URLs to attempt. */
export const BINANCE_WS_ENDPOINTS = [
  BINANCE_WS_PRIMARY,
  BINANCE_WS_FALLBACK,
] as const;

// ---------------------------------------------------------------------------
// Interval durations (milliseconds)
// ---------------------------------------------------------------------------

/**
 * Exact millisecond duration for each supported candlestick interval.
 *
 * Note: `1d` and `1w` use calendar-exact UTC durations (Binance opens
 * daily candles at 00:00 UTC and weekly candles on Monday 00:00 UTC).
 */
export const INTERVAL_MS: Readonly<Record<CandleInterval, number>> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
  "1w": 604_800_000,
};

// ---------------------------------------------------------------------------
// Pagination limits
// ---------------------------------------------------------------------------

/** Binance hard maximum klines per REST request. */
export const BINANCE_MAX_KLINES_PER_REQUEST = 1_000;

/** Default number of historical candles to bootstrap. */
export const BOOTSTRAP_TARGET_BARS = 2_000;

// ---------------------------------------------------------------------------
// Timeouts
// ---------------------------------------------------------------------------

/** REST request timeout in milliseconds. */
export const REST_TIMEOUT_MS = 8_000;

/** Number of server-time samples for clock sync. */
export const CLOCK_SYNC_SAMPLES = 5;

// ---------------------------------------------------------------------------
// Reconnection / backoff
// ---------------------------------------------------------------------------

/** Planned proactive WebSocket reconnect interval (ms). */
export const PLANNED_RECONNECT_MS = 23 * 3_600_000; // 23 hours (buffer before 24h limit)

/** Minimum backoff delay (ms) after unexpected WS disconnect. */
export const BACKOFF_MIN_MS = 1_000;

/** Maximum backoff delay (ms). */
export const BACKOFF_MAX_MS = 30_000;

/** Backoff multiplier per consecutive failure. */
export const BACKOFF_MULTIPLIER = 2;

/** Healthy connection duration (ms) before resetting backoff counter. */
export const HEALTHY_RESET_MS = 60_000;

// ---------------------------------------------------------------------------
// Stale / health thresholds
// ---------------------------------------------------------------------------

/** Duration without a kline message before marking feed STALE (ms). */
export const STALE_THRESHOLD_MS = 15_000;

/** Maximum reconnect attempts before entering ERROR state. */
export const MAX_RECONNECT_ATTEMPTS = 10;

// ---------------------------------------------------------------------------
// WebSocket control-message budget (PROJECT_PLAN RISK-014)
// ---------------------------------------------------------------------------

/** Minimum milliseconds between applied timeframe switches. */
export const TIMEFRAME_DEBOUNCE_MS = 350;

/** Maximum applied timeframe changes per second. */
export const MAX_TIMEFRAME_CHANGES_PER_SECOND = 2;
