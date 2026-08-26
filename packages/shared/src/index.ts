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
