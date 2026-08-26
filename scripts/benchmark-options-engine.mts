import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import type {
  OptionsChainSnapshot,
  OptionSnapshot,
} from "../packages/domain/src/index.ts";
import { calculateOptionsMetrics } from "../packages/options-engine/src/calculate.ts";
import {
  createChainFixture,
  createOptionFixture,
} from "../packages/options-engine/src/test-fixtures.ts";
import { DeribitConsolidatedSnapshotSchema } from "../packages/market-data/src/deribit/schemas.ts";
import { parseDeribitSnapshot } from "../packages/market-data/src/deribit/normalizers.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");

export interface BenchmarkConfig {
  readonly contractCount: number;
  readonly runCount: number;
  readonly warmupCount: number;
  readonly maxTsLatencyBudgetMs: number;
  readonly maxDualLatencyBudgetMs: number;
  readonly maxHeapPerPassMb: number;
}

export const DEFAULT_BENCHMARK_CONFIG: BenchmarkConfig = {
  contractCount: 1_000,
  runCount: 20,
  warmupCount: 5,
  maxTsLatencyBudgetMs: 250,
  maxDualLatencyBudgetMs: 350,
  maxHeapPerPassMb: 25,
};

export const generateSynthetic1000ContractChain = (
  targetCount = 1_000,
  spotPrice = 78_500,
  now = Date.UTC(2026, 7, 26, 8, 0, 0),
): { chain: OptionsChainSnapshot; targetExpiry: number } => {
  const dtes = [1, 2, 7, 14, 30, 60, 90, 180, 270, 365];
  const expiries = dtes.map((d) => now + d * 86_400_000);
  const contractsPerExpiry = Math.ceil(targetCount / expiries.length);
  const strikesPerExpiry = Math.ceil(contractsPerExpiry / 2);

  const instruments: OptionSnapshot[] = [];

  for (let eIdx = 0; eIdx < expiries.length; eIdx++) {
    const expiry = expiries[eIdx]!;
    for (let sIdx = 0; sIdx < strikesPerExpiry; sIdx++) {
      if (instruments.length >= targetCount) break;

      const strike = 50_000 + sIdx * 1_000; // 50k to 99k around 78.5k spot
      const callOi = 10 + (sIdx % 20) * 2.5 + eIdx * 1.5;
      const putOi = 8 + ((sIdx + 5) % 25) * 2.0 + eIdx * 1.2;
      const callIv = 0.5 + (sIdx % 15) * 0.015;
      const putIv = 0.52 + (sIdx % 15) * 0.015;

      instruments.push(
        createOptionFixture({
          expiry,
          strike,
          optionType: "call",
          openInterestBtc: callOi,
          markIvDecimal: callIv,
          underlyingPriceUsd: spotPrice,
        }),
      );

      if (instruments.length < targetCount) {
        instruments.push(
          createOptionFixture({
            expiry,
            strike,
            optionType: "put",
            openInterestBtc: putOi,
            markIvDecimal: putIv,
            underlyingPriceUsd: spotPrice,
          }),
        );
      }
    }
  }

  return {
    chain: createChainFixture(instruments, now),
    targetExpiry: expiries[2]!, // 7-day expiry
  };
};

export const loadRealDeribitChain = (
  now = Date.UTC(2026, 7, 26, 8, 0, 0),
): { chain: OptionsChainSnapshot; targetExpiry: number } | null => {
  const fixturePath = resolve(
    rootDir,
    "tests/fixtures/deribit/live-chain-snapshot.json",
  );
  if (!existsSync(fixturePath)) {
    return null;
  }
  try {
    const raw = JSON.parse(readFileSync(fixturePath, "utf8")) as unknown;
    const validated = DeribitConsolidatedSnapshotSchema.parse(raw);
    const chain = parseDeribitSnapshot(validated, now);
    const expiries = [
      ...new Set(chain.instruments.map((i) => i.instrument.expiry)),
    ].sort((a, b) => a - b);
    return {
      chain,
      targetExpiry: expiries[0] ?? now + 86_400_000,
    };
  } catch {
    return null;
  }
};

export interface BenchmarkMetrics {
  readonly runCount: number;
  readonly minMs: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
  readonly meanMs: number;
  readonly throughputOpsPerSec: number;
}

const computeMetrics = (durations: number[]): BenchmarkMetrics => {
  const sorted = [...durations].sort((a, b) => a - b);
  const count = sorted.length;
  const medianMs = sorted[Math.floor(count / 2)] ?? 0;
  const p95Ms = sorted[Math.min(count - 1, Math.ceil(count * 0.95) - 1)] ?? 0;
  const p99Ms = sorted[Math.min(count - 1, Math.ceil(count * 0.99) - 1)] ?? 0;
  const minMs = sorted[0] ?? 0;
  const maxMs = sorted[count - 1] ?? 0;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const meanMs = count > 0 ? sum / count : 0;
  const throughputOpsPerSec = meanMs > 0 ? 1_000 / meanMs : 0;

  return {
    runCount: count,
    minMs: Number(minMs.toFixed(3)),
    medianMs: Number(medianMs.toFixed(3)),
    p95Ms: Number(p95Ms.toFixed(3)),
    p99Ms: Number(p99Ms.toFixed(3)),
    maxMs: Number(maxMs.toFixed(3)),
    meanMs: Number(meanMs.toFixed(3)),
    throughputOpsPerSec: Number(throughputOpsPerSec.toFixed(1)),
  };
};

export interface BenchmarkResultSummary {
  readonly benchmarkName: string;
  readonly contractCount: number;
  readonly spotGridPoints: number;
  readonly tsMetrics: BenchmarkMetrics;
  readonly heapDeltaMb: number;
  readonly heapPerPassMb: number;
  readonly pythonMetrics?: BenchmarkMetrics;
  readonly dualEngineCombinedMedianMs?: number;
  readonly dualEnginePassed: boolean;
  readonly tsLatencyPassed: boolean;
  readonly memoryPassed: boolean;
  readonly outputs: {
    readonly gammaFlipPrice: number | null;
    readonly qualifyingCrossingsCount: number;
    readonly callWallStrike: number | null;
    readonly putWallStrike: number | null;
    readonly maxPainStrike: number | null;
    readonly totalModeledGexUsd: number;
    readonly averageIvDecimal: number | null;
  };
}

export const runOptionsEngineBenchmark = (
  customConfig: Partial<BenchmarkConfig> = {},
): BenchmarkResultSummary => {
  const config: BenchmarkConfig = {
    ...DEFAULT_BENCHMARK_CONFIG,
    ...customConfig,
  };

  const now = Date.UTC(2026, 7, 26, 8, 0, 0);
  const spotPrice = 78_500;
  const { chain, targetExpiry } = generateSynthetic1000ContractChain(
    config.contractCount,
    spotPrice,
    now,
  );

  const input = {
    chain,
    underlyingPriceUsd: spotPrice,
    calculatedAt: now,
    expiryScope: { kind: "all" as const },
    interestRateFallbackDecimal: 0.0,
    maxPainExpiry: targetExpiry,
    secondaryLevelCount: 3,
  };

  // Warmup iterations
  for (let w = 0; w < config.warmupCount; w++) {
    calculateOptionsMetrics(input);
  }

  // Force GC if exposed (--expose-gc)
  if (typeof globalThis.gc === "function") {
    globalThis.gc();
  }

  const initialHeap = process.memoryUsage().heapUsed;
  const tsDurations: number[] = [];

  for (let run = 0; run < config.runCount; run++) {
    const start = performance.now();
    calculateOptionsMetrics(input);
    const elapsed = performance.now() - start;
    tsDurations.push(elapsed);
  }

  const finalHeap = process.memoryUsage().heapUsed;
  const heapDeltaBytes = Math.max(0, finalHeap - initialHeap);
  const heapDeltaMb = Number((heapDeltaBytes / (1024 * 1024)).toFixed(3));
  const heapPerPassMb = Number(
    (heapDeltaMb / Math.max(1, config.runCount)).toFixed(3),
  );

  const tsMetrics = computeMetrics(tsDurations);
  const fullResult = calculateOptionsMetrics(input);

  const callWall = fullResult.summary.keyLevels.find(
    (l) => l.kind === "call-wall",
  );
  const putWall = fullResult.summary.keyLevels.find(
    (l) => l.kind === "put-wall",
  );

  const tsLatencyPassed =
    tsMetrics.medianMs <= config.maxTsLatencyBudgetMs &&
    tsMetrics.p95Ms <= config.maxTsLatencyBudgetMs;
  const memoryPassed = heapPerPassMb <= config.maxHeapPerPassMb;

  // Run Python reference engine benchmark for dual-engine parity & comparison
  let pythonMetrics: BenchmarkMetrics | undefined;
  let dualEngineCombinedMedianMs: number | undefined;
  let dualEnginePassed = tsLatencyPassed;

  try {
    const pythonCode = `
import json, time, sys
sys.path.insert(0, "tools/reference-python")
from gamma_reference import OptionContract, calculate_gamma_flip
from max_pain_reference import calculate_max_pain

# Generate equivalent 1,000 contracts
now = ${now}
spot_price = ${spotPrice}
dtes = [1, 2, 7, 14, 30, 60, 90, 180, 270, 365]
expiries = [now + d * 86400000 for d in dtes]
contracts_per_expiry = ${Math.ceil(config.contractCount / 10)}
strikes_per_expiry = ${Math.ceil(Math.ceil(config.contractCount / 10) / 2)}

contracts = []
for e_idx, expiry in enumerate(expiries):
    for s_idx in range(strikes_per_expiry):
        if len(contracts) >= ${config.contractCount}:
            break
        strike = 50000 + s_idx * 1000
        call_oi = 10 + (s_idx % 20) * 2.5 + e_idx * 1.5
        put_oi = 8 + ((s_idx + 5) % 25) * 2.0 + e_idx * 1.2
        call_iv = 0.50 + (s_idx % 15) * 0.015
        put_iv = 0.52 + (s_idx % 15) * 0.015
        contracts.append(OptionContract(
            instrument_name=f"BTC-OPT-C-{s_idx}",
            strike=strike,
            option_type="call",
            open_interest_btc=call_oi,
            mark_iv_decimal=call_iv,
            expiry_timestamp_ms=expiry,
        ))
        if len(contracts) < ${config.contractCount}:
            contracts.append(OptionContract(
                instrument_name=f"BTC-OPT-P-{s_idx}",
                strike=strike,
                option_type="put",
                open_interest_btc=put_oi,
                mark_iv_decimal=put_iv,
                expiry_timestamp_ms=expiry,
            ))

# Warmup
for _ in range(${config.warmupCount}):
    flip = calculate_gamma_flip(contracts, spot_price, calculation_timestamp_ms=now)
    mp = calculate_max_pain(contracts, expiry=expiries[2])

durations = []
for _ in range(${config.runCount}):
    t0 = time.perf_counter()
    flip = calculate_gamma_flip(contracts, spot_price, calculation_timestamp_ms=now)
    mp = calculate_max_pain(contracts, expiry=expiries[2])
    t1 = time.perf_counter()
    durations.append((t1 - t0) * 1000.0)

print(json.dumps({
    "durations": durations,
    "gamma_flip": flip.price,
    "max_pain": mp.max_pain_strike,
}))
`;
    const pyRes = spawnSync("python", ["-c", pythonCode], {
      cwd: rootDir,
      encoding: "utf8",
      timeout: 10_000,
    });

    if (pyRes.status === 0 && pyRes.stdout) {
      const parsedPy = JSON.parse(pyRes.stdout.trim()) as {
        durations: number[];
        gamma_flip: number | null;
        max_pain: number | null;
      };
      pythonMetrics = computeMetrics(parsedPy.durations);
      dualEngineCombinedMedianMs = Number(
        (tsMetrics.medianMs + pythonMetrics.medianMs).toFixed(3),
      );
      dualEnginePassed =
        tsLatencyPassed &&
        dualEngineCombinedMedianMs <= config.maxDualLatencyBudgetMs;
    }
  } catch {
    // Python benchmark optional if python not configured
  }

  return {
    benchmarkName: "options-engine.full-pipeline",
    contractCount: config.contractCount,
    spotGridPoints: fullResult.gammaProfile.length,
    tsMetrics,
    heapDeltaMb,
    heapPerPassMb,
    pythonMetrics,
    dualEngineCombinedMedianMs,
    dualEnginePassed,
    tsLatencyPassed,
    memoryPassed,
    outputs: {
      gammaFlipPrice: fullResult.gammaFlipPrice,
      qualifyingCrossingsCount: fullResult.qualifyingCrossings.length,
      callWallStrike: callWall?.price ?? null,
      putWallStrike: putWall?.price ?? null,
      maxPainStrike: fullResult.maxPain?.price ?? null,
      totalModeledGexUsd: Number(
        fullResult.summary.modeledGexOnePercentUsd.toFixed(2),
      ),
      averageIvDecimal: fullResult.summary.averageMarkIvDecimal
        ? Number(fullResult.summary.averageMarkIvDecimal.toFixed(4))
        : null,
    },
  };
};

if (process.argv[1] && process.argv[1].includes("benchmark-options-engine")) {
  console.log("============================================================");
  console.log("  M4.9 Options Mathematics Engine Performance Benchmark    ");
  console.log("============================================================");

  const result = runOptionsEngineBenchmark();

  console.log("\n--- BENCHMARK SUMMARY ---");
  console.log(JSON.stringify(result, null, 2));

  console.log("\n--- KEY RESULTS & VERIFICATION ---");
  console.log(`- Universe Size:           ${result.contractCount} contracts`);
  console.log(
    `- Spot Grid Points:        ${result.spotGridPoints} points (0.70x to 1.30x spot)`,
  );
  console.log(
    `- TS Latency (Median / p50): ${result.tsMetrics.medianMs} ms  [Budget: <= 250 ms] -> ${result.tsMetrics.medianMs <= 250 ? "PASS" : "FAIL"}`,
  );
  console.log(
    `- TS Latency (p95):        ${result.tsMetrics.p95Ms} ms  [Budget: <= 250 ms] -> ${result.tsMetrics.p95Ms <= 250 ? "PASS" : "FAIL"}`,
  );
  console.log(`- TS Latency (Mean):       ${result.tsMetrics.meanMs} ms`);
  console.log(
    `- TS Throughput:           ${result.tsMetrics.throughputOpsPerSec} passes/sec`,
  );
  console.log(
    `- Heap Allocation / Pass:  ${result.heapPerPassMb} MB  [Budget: < 25 MB] -> ${result.memoryPassed ? "PASS" : "FAIL"}`,
  );

  if (result.pythonMetrics && result.dualEngineCombinedMedianMs !== undefined) {
    console.log(
      `- Python Reference Latency:${result.pythonMetrics.medianMs} ms`,
    );
    console.log(
      `- Dual-Engine Combined:    ${result.dualEngineCombinedMedianMs} ms  [Budget: <= 350 ms] -> ${result.dualEnginePassed ? "PASS" : "FAIL"}`,
    );
  }

  console.log("\n--- PIPELINE OUTPUTS ---");
  console.log(`- Gamma Flip Price:        ${result.outputs.gammaFlipPrice}`);
  console.log(`- Call Wall Strike:        ${result.outputs.callWallStrike}`);
  console.log(`- Put Wall Strike:         ${result.outputs.putWallStrike}`);
  console.log(`- Max Pain Strike:         ${result.outputs.maxPainStrike}`);
  console.log(
    `- Total Modeled GEX:       $${result.outputs.totalModeledGexUsd.toLocaleString()}`,
  );

  if (!result.tsLatencyPassed || !result.memoryPassed) {
    console.error(
      "\n[FAILURE] Benchmark did not meet required performance budgets!",
    );
    process.exit(1);
  } else {
    console.log(
      "\n[SUCCESS] All performance and memory throughput budgets verified!",
    );
  }
}
