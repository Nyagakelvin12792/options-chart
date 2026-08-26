export type AppErrorCategory =
  | "transport"
  | "timeout"
  | "rate-limit"
  | "schema-validation"
  | "normalization"
  | "stale-data"
  | "reconciliation"
  | "calculation"
  | "chart"
  | "worker";

export interface AppErrorDetails {
  readonly source: string;
  readonly operation: string;
  readonly timestamp: number;
  readonly retryable: boolean;
  readonly context?: Readonly<Record<string, unknown>>;
  readonly cause?: unknown;
}

export class AppError extends Error {
  readonly category: AppErrorCategory;
  readonly source: string;
  readonly operation: string;
  readonly timestamp: number;
  readonly retryable: boolean;
  readonly context: Readonly<Record<string, unknown>>;

  constructor(
    category: AppErrorCategory,
    message: string,
    details: AppErrorDetails,
  ) {
    super(
      message,
      details.cause === undefined ? undefined : { cause: details.cause },
    );
    this.name = new.target.name;
    this.category = category;
    this.source = details.source;
    this.operation = details.operation;
    this.timestamp = details.timestamp;
    this.retryable = details.retryable;
    this.context = details.context ?? {};
  }
}

type ConcreteErrorDetails = Omit<AppErrorDetails, "cause"> & {
  readonly cause?: unknown;
};

export class TransportError extends AppError {
  constructor(message: string, details: ConcreteErrorDetails) {
    super("transport", message, details);
  }
}

export class TimeoutError extends AppError {
  constructor(message: string, details: ConcreteErrorDetails) {
    super("timeout", message, details);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string, details: ConcreteErrorDetails) {
    super("rate-limit", message, details);
  }
}

export class SchemaValidationError extends AppError {
  constructor(message: string, details: ConcreteErrorDetails) {
    super("schema-validation", message, details);
  }
}

export class NormalizationError extends AppError {
  constructor(message: string, details: ConcreteErrorDetails) {
    super("normalization", message, details);
  }
}

export class StaleDataError extends AppError {
  constructor(message: string, details: ConcreteErrorDetails) {
    super("stale-data", message, details);
  }
}

export class ReconciliationError extends AppError {
  constructor(message: string, details: ConcreteErrorDetails) {
    super("reconciliation", message, details);
  }
}

export class CalculationError extends AppError {
  constructor(message: string, details: ConcreteErrorDetails) {
    super("calculation", message, details);
  }
}

export class ChartError extends AppError {
  constructor(message: string, details: ConcreteErrorDetails) {
    super("chart", message, details);
  }
}

export class WorkerError extends AppError {
  constructor(message: string, details: ConcreteErrorDetails) {
    super("worker", message, details);
  }
}
