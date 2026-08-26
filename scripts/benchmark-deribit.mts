import { performance } from "node:perf_hooks";

import { DeribitConsolidatedSnapshotSchema } from "../packages/market-data/src/deribit/schemas.ts";

const instrumentCount = 2_500;
const runCount = 12;
const payload: unknown = {
  schema_version: "m0.5-deribit-snapshot-v1",
  timestamp: 1_900_000_000_000,
  instruments: Array.from({ length: instrumentCount }, (_, index) => ({
    instrument_name: `BTC-01JAN30-${50_000 + index}-${index % 2 === 0 ? "C" : "P"}`,
    creation_timestamp: 1_800_000_000_000,
    expiration_timestamp: 1_910_000_000_000,
    strike: 50_000 + index,
    option_type: index % 2 === 0 ? "call" : "put",
    underlying_price: 91_000,
    open_interest: 1 + (index % 100) / 10,
    mark_price: 0.01 + (index % 20) / 1_000,
    mark_iv: 45 + (index % 30) / 10,
    interest_rate: 0.01,
  })),
};

for (let warmup = 0; warmup < 3; warmup += 1) {
  DeribitConsolidatedSnapshotSchema.parse(payload);
}

const durations: number[] = [];
for (let run = 0; run < runCount; run += 1) {
  const startedAt = performance.now();
  DeribitConsolidatedSnapshotSchema.parse(payload);
  durations.push(performance.now() - startedAt);
}

durations.sort((left, right) => left - right);
const medianMs = durations[Math.floor(durations.length / 2)] ?? 0;
const p95Ms = durations[Math.ceil(durations.length * 0.95) - 1] ?? 0;
const maxMs = durations.at(-1) ?? 0;

console.log(
  JSON.stringify(
    {
      benchmark: "validation.deribit-batch",
      instrumentCount,
      runCount,
      medianMs: Number(medianMs.toFixed(3)),
      p95Ms: Number(p95Ms.toFixed(3)),
      maxMs: Number(maxMs.toFixed(3)),
      decision:
        p95Ms >= 50
          ? "validate representative batches in the worker"
          : "main-thread validation remains viable; keep monitoring",
    },
    null,
    2,
  ),
);
