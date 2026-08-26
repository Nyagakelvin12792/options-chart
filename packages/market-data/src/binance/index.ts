// Binance module barrel export.

export { BinanceRestClient } from "./client";
export type { BinanceClientOptions, KlinesRequestParams } from "./client";

export { syncBinanceClock } from "./clock";
export type { ClockSyncResult } from "./clock";

export {
  BACKOFF_MAX_MS,
  BACKOFF_MIN_MS,
  BACKOFF_MULTIPLIER,
  BINANCE_MAX_KLINES_PER_REQUEST,
  BINANCE_REST_ENDPOINTS,
  BINANCE_REST_FALLBACK,
  BINANCE_REST_PRIMARY,
  BINANCE_WS_ENDPOINTS,
  BINANCE_WS_FALLBACK,
  BINANCE_WS_PRIMARY,
  BOOTSTRAP_TARGET_BARS,
  CLOCK_SYNC_SAMPLES,
  HEALTHY_RESET_MS,
  INTERVAL_MS,
  MAX_RECONNECT_ATTEMPTS,
  MAX_TIMEFRAME_CHANGES_PER_SECOND,
  PLANNED_RECONNECT_MS,
  REST_TIMEOUT_MS,
  STALE_THRESHOLD_MS,
  TIMEFRAME_DEBOUNCE_MS,
} from "./constants";

export { runEndpointDiagnostics } from "./diagnostics";
export type { DiagnosticsBundle, EndpointDiagnostic } from "./diagnostics";

export {
  BINANCE_KLINE_SCHEMA_VERSION,
  parseBinanceKlines,
} from "./normalizers";

export { bootstrapHistory } from "./pagination";
export type {
  BootstrapOptions,
  BootstrapResult,
  HistoryCompleteness,
} from "./pagination";

export { CandleStore } from "./reconciliation";
export type { ReconciliationResult, RepairAction } from "./reconciliation";

export {
  BinanceKlinePageSchema,
  BinanceKlineSchema,
  type BinanceKline,
} from "./schemas";

export { BinanceKlineSocket } from "./websocket";
export type { BinanceWsOptions } from "./websocket";

export {
  BinanceWsKlineDataSchema,
  BinanceWsKlineEventSchema,
  type BinanceWsKlineData,
  type BinanceWsKlineEvent,
} from "./ws-schemas";
