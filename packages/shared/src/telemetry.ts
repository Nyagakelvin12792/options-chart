export const BASELINE_PERFORMANCE_BUDGETS = {
  initialCandleCount: 2_000,
  longTaskThresholdMs: 50,
  summaryRecomputeIntervalMs: 1_000,
  profileRecomputeMinIntervalMs: 2_000,
  openInterestSnapshotIntervalMs: 30_000,
  soakTestDurationHours: 8,
  maxSamplesPerMetric: 500,
} as const;

export type PerformanceMetricName =
  | "chart.initial-load"
  | "chart.live-update"
  | "calculation.summary"
  | "calculation.gamma-profile"
  | "validation.deribit-batch"
  | "worker.round-trip";

export interface PerformanceSample {
  readonly metric: PerformanceMetricName;
  readonly durationMs: number;
  readonly recordedAt: number;
}

export interface PerformanceSnapshot {
  readonly generatedAt: number;
  readonly samples: Readonly<
    Partial<Record<PerformanceMetricName, readonly PerformanceSample[]>>
  >;
}

type Clock = () => number;

const defaultMonotonicClock: Clock = () =>
  globalThis.performance?.now() ?? Date.now();
const defaultWallClock: Clock = () => Date.now();

export class BoundedPerformanceTelemetry {
  readonly #samples = new Map<PerformanceMetricName, PerformanceSample[]>();
  readonly #capacity: number;
  readonly #monotonicClock: Clock;
  readonly #wallClock: Clock;

  constructor(
    capacity: number = BASELINE_PERFORMANCE_BUDGETS.maxSamplesPerMetric,
    monotonicClock: Clock = defaultMonotonicClock,
    wallClock: Clock = defaultWallClock,
  ) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError("Telemetry capacity must be a positive integer");
    }

    this.#capacity = capacity;
    this.#monotonicClock = monotonicClock;
    this.#wallClock = wallClock;
  }

  record(metric: PerformanceMetricName, durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      throw new RangeError(
        "Telemetry duration must be finite and non-negative",
      );
    }

    const existing = this.#samples.get(metric) ?? [];
    existing.push({ metric, durationMs, recordedAt: this.#wallClock() });

    if (existing.length > this.#capacity) {
      existing.splice(0, existing.length - this.#capacity);
    }

    this.#samples.set(metric, existing);
  }

  measure<T>(metric: PerformanceMetricName, operation: () => T): T {
    const startedAt = this.#monotonicClock();

    try {
      return operation();
    } finally {
      this.record(metric, this.#monotonicClock() - startedAt);
    }
  }

  async measureAsync<T>(
    metric: PerformanceMetricName,
    operation: () => Promise<T>,
  ): Promise<T> {
    const startedAt = this.#monotonicClock();

    try {
      return await operation();
    } finally {
      this.record(metric, this.#monotonicClock() - startedAt);
    }
  }

  snapshot(): PerformanceSnapshot {
    const samples = Object.fromEntries(
      [...this.#samples.entries()].map(([metric, values]) => [
        metric,
        [...values],
      ]),
    ) as Readonly<
      Partial<Record<PerformanceMetricName, readonly PerformanceSample[]>>
    >;

    return { generatedAt: this.#wallClock(), samples };
  }

  clear(): void {
    this.#samples.clear();
  }
}
