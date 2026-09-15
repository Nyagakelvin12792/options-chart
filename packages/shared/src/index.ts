export {
  AppError,
  CalculationError,
  ChartError,
  NormalizationError,
  RateLimitError,
  ReconciliationError,
  SchemaValidationError,
  StaleDataError,
  TimeoutError,
  TransportError,
  WorkerError,
} from "./errors";
export type { AppErrorCategory, AppErrorDetails } from "./errors";
export { failure, success } from "./result";
export type { Result } from "./result";
export {
  BASELINE_PERFORMANCE_BUDGETS,
  BoundedPerformanceTelemetry,
} from "./telemetry";
export type {
  PerformanceMetricName,
  PerformanceSample,
  PerformanceSnapshot,
} from "./telemetry";
export {
  LevelShiftTracker,
  DEFAULT_GAMMA_FLIP_TOLERANCE_FRACTION,
  DEFAULT_GAMMA_FLIP_MIN_DOLLAR_TOLERANCE,
  DEFAULT_CONFLUENCE_MIDPOINT_TOLERANCE_FRACTION,
} from "./level-shift-tracker";
export type {
  ActiveLevelRecord,
  ConfluenceZoneInput,
  LevelShiftReason,
  LevelShiftTrackerOptions,
} from "./level-shift-tracker";
