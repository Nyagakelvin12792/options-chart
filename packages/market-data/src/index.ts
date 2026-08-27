// Re-export all Binance market-data modules.
export {
  BINANCE_KLINE_SCHEMA_VERSION,
  BinanceKlinePageSchema,
  BinanceKlineSchema,
  BinanceKlineSocket,
  BinanceRestClient,
  BinanceWsKlineDataSchema,
  BinanceWsKlineEventSchema,
  bootstrapHistory,
  BOOTSTRAP_TARGET_BARS,
  CandleStore,
  fetchOlderHistory,
  INTERVAL_MS,
  parseBinanceKlines,
  runEndpointDiagnostics,
  syncBinanceClock,
  TIMEFRAME_DEBOUNCE_MS,
  type BinanceClientOptions,
  type BinanceKline,
  type BinanceWsKlineData,
  type BinanceWsKlineEvent,
  type BinanceWsOptions,
  type BootstrapOptions,
  type BootstrapResult,
  type ClockSyncResult,
  type DiagnosticsBundle,
  type EndpointDiagnostic,
  type HistoryCompleteness,
  type KlinesRequestParams,
  type OlderHistoryOptions,
  type OlderHistoryResult,
  type ReconciliationResult,
  type RepairAction,
} from "./binance";

// Re-export Deribit modules.
export {
  DERIBIT_SNAPSHOT_SCHEMA_VERSION,
  parseDeribitSnapshot,
} from "./deribit/normalizers";
export {
  DeribitConsolidatedInstrumentSchema,
  DeribitConsolidatedSnapshotSchema,
  type DeribitConsolidatedSnapshot,
} from "./deribit/schemas";
export * from "./deribit";
