# M0 Performance Baseline

## Acceptance Budgets

| Signal                              | M0 baseline |
| ----------------------------------- | ----------: |
| Initial candle history              |  2,000 bars |
| Main-thread long-task threshold     |       50 ms |
| Summary recompute interval          |    1,000 ms |
| Full Gamma profile minimum interval |    2,000 ms |
| OI snapshot interval                |   30,000 ms |
| Soak-test duration                  |     8 hours |
| Samples retained per metric         |         500 |

## Instrumented Metrics

- `chart.initial-load`
- `chart.live-update`
- `calculation.summary`
- `calculation.gamma-profile`
- `validation.deribit-batch`
- `worker.round-trip`

`BoundedPerformanceTelemetry` stores bounded duration samples and exposes snapshots without creating an unbounded browser log. M0 establishes instrumentation and budgets; M0.5 records the first chart-path and Deribit batch measurements.
