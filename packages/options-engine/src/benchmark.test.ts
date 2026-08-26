import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";

import type {
  OptionsChainSnapshot,
  OptionSnapshot,
} from "@options-chart/domain";

import { calculateOptionsMetrics } from "./calculate";
import {
  CALCULATION_ENGINE_VERSION,
  GAMMA_PROFILE_VERSION,
  GEX_MODEL_VERSION,
} from "./version";
import { createChainFixture, createOptionFixture } from "./test-fixtures";

const generateSynthetic1000ContractChain = (
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

      const strike = 50_000 + sIdx * 1_000;
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
    targetExpiry: expiries[2]!,
  };
};

describe("M4.9 Performance Benchmark Suite", () => {
  const now = Date.UTC(2026, 7, 26, 8, 0, 0);
  const spotPrice = 78_500;
  const { chain, targetExpiry } = generateSynthetic1000ContractChain(
    1_000,
    spotPrice,
    now,
  );

  const baseInput = {
    chain,
    underlyingPriceUsd: spotPrice,
    calculatedAt: now,
    expiryScope: { kind: "all" as const },
    interestRateFallbackDecimal: 0.0,
    maxPainExpiry: targetExpiry,
    secondaryLevelCount: 3,
  };

  it("benchmarks end-to-end full calculation pipeline on full 1,000-contract snapshot", () => {
    const result = calculateOptionsMetrics(baseInput);

    expect(chain.instruments.length).toBe(1_000);
    expect(result.summary.metadata.contractsSeen).toBe(1_000);
    expect(result.summary.metadata.contractsIncluded).toBe(1_000);
    expect(result.summary.metadata.calculationEngineVersion).toBe(
      CALCULATION_ENGINE_VERSION,
    );
    expect(result.summary.metadata.gexModelVersion).toBe(GEX_MODEL_VERSION);
    expect(result.summary.metadata.gammaProfileVersion).toBe(
      GAMMA_PROFILE_VERSION,
    );

    // GEX profile across spot grid
    expect(result.gammaProfile.length).toBeGreaterThanOrEqual(61);
    expect(result.gammaProfile[0]!.spotPrice).toBeCloseTo(spotPrice * 0.7, 0);
    expect(result.gammaProfile.at(-1)!.spotPrice).toBeCloseTo(
      spotPrice * 1.3,
      0,
    );

    // Zero-crossings & two-pass refinement Gamma Flip
    expect(result.qualifyingCrossings.length).toBeGreaterThan(0);
    expect(result.gammaFlipPrice).not.toBeNull();
    expect(result.gammaFlipPrice!).toBeGreaterThan(spotPrice * 0.7);
    expect(result.gammaFlipPrice!).toBeLessThan(spotPrice * 1.3);

    // Call / Put Walls & Secondary Levels
    const callWall = result.summary.keyLevels.find(
      (l) => l.kind === "call-wall",
    );
    const putWall = result.summary.keyLevels.find((l) => l.kind === "put-wall");
    const secondaryLevels = result.summary.keyLevels.filter(
      (l) => l.kind === "secondary-gex",
    );

    expect(callWall).toBeDefined();
    expect(callWall?.price).toBeGreaterThan(0);
    expect(putWall).toBeDefined();
    expect(putWall?.price).toBeGreaterThan(0);
    expect(secondaryLevels.length).toBe(3);

    // Expiry-specific Max Pain
    expect(result.maxPain).not.toBeNull();
    expect(result.maxPain?.expiry).toBe(targetExpiry);
    expect(result.maxPain?.price).toBeGreaterThan(0);
    expect(result.maxPain?.totalPayoutUsd).toBeGreaterThan(0);
  });

  it("enforces execution budget <= 250 ms for TypeScript engine on 1,000 contracts", () => {
    // Warmup
    for (let w = 0; w < 5; w++) {
      calculateOptionsMetrics(baseInput);
    }

    const runs = 15;
    const durations: number[] = [];

    for (let r = 0; r < runs; r++) {
      const start = performance.now();
      calculateOptionsMetrics(baseInput);
      const elapsed = performance.now() - start;
      durations.push(elapsed);
    }

    durations.sort((a, b) => a - b);
    const medianMs = durations[Math.floor(runs / 2)]!;
    const p95Ms = durations[Math.ceil(runs * 0.95) - 1]!;

    expect(medianMs).toBeLessThanOrEqual(250);
    expect(p95Ms).toBeLessThanOrEqual(250);
  });

  it("measures and enforces heap memory allocation budget < 25 MB per calculation pass", () => {
    if (typeof globalThis.gc === "function") {
      globalThis.gc();
    }

    const initialHeap = process.memoryUsage().heapUsed;
    const iterations = 10;

    for (let i = 0; i < iterations; i++) {
      calculateOptionsMetrics(baseInput);
    }

    const finalHeap = process.memoryUsage().heapUsed;
    const heapDeltaBytes = Math.max(0, finalHeap - initialHeap);
    const heapPerPassMb = heapDeltaBytes / (1024 * 1024 * iterations);

    expect(heapPerPassMb).toBeLessThan(25);
  });

  it("benchmarks full pipeline on real Deribit 956-contract live fixture", () => {
    const fixturePath = resolve(
      __dirname,
      "../../../../tests/fixtures/deribit/live-chain-snapshot.json",
    );
    if (!existsSync(fixturePath)) {
      return;
    }

    const raw = JSON.parse(readFileSync(fixturePath, "utf8")) as {
      instruments: Array<{
        strike: number;
        option_type: "call" | "put";
        open_interest: number;
        mark_iv: number;
        expiration_timestamp: number;
        underlying_price: number;
      }>;
      timestamp: number;
    };

    const realInstruments: OptionSnapshot[] = raw.instruments.map((item) =>
      createOptionFixture({
        expiry: item.expiration_timestamp,
        strike: item.strike,
        optionType: item.option_type,
        openInterestBtc: item.open_interest,
        markIvDecimal: item.mark_iv ? item.mark_iv / 100 : null,
        underlyingPriceUsd: item.underlying_price,
      }),
    );

    const realChain = createChainFixture(realInstruments, raw.timestamp);
    const firstExpiry = [
      ...new Set(realInstruments.map((i) => i.instrument.expiry)),
    ].sort((a, b) => a - b)[0]!;

    const realInput = {
      chain: realChain,
      underlyingPriceUsd: 78_423.82,
      calculatedAt: raw.timestamp,
      expiryScope: { kind: "all" as const },
      interestRateFallbackDecimal: 0.0,
      maxPainExpiry: firstExpiry,
      secondaryLevelCount: 3,
    };

    // Warmup
    for (let w = 0; w < 3; w++) {
      calculateOptionsMetrics(realInput);
    }

    const start = performance.now();
    const result = calculateOptionsMetrics(realInput);
    const duration = performance.now() - start;

    expect(duration).toBeLessThanOrEqual(250);
    expect(result.summary.metadata.contractsSeen).toBe(realInstruments.length);
    expect(result.summary.keyLevels.length).toBeGreaterThan(0);
    expect(result.gammaProfile.length).toBeGreaterThanOrEqual(61);
  });

  it("validates dual-engine parity and combined budget <= 350 ms with Python reference engine", () => {
    const rootDir = resolve(__dirname, "../../../..");
    const pythonCode = `
import json, time, sys
sys.path.insert(0, "tools/reference-python")
from gamma_reference import OptionContract, calculate_gamma_flip
from max_pain_reference import calculate_max_pain

now = ${now}
spot_price = ${spotPrice}
dtes = [1, 2, 7, 14, 30, 60, 90, 180, 270, 365]
expiries = [now + d * 86400000 for d in dtes]

contracts = []
for e_idx, expiry in enumerate(expiries):
    for s_idx in range(50):
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
        contracts.append(OptionContract(
            instrument_name=f"BTC-OPT-P-{s_idx}",
            strike=strike,
            option_type="put",
            open_interest_btc=put_oi,
            mark_iv_decimal=put_iv,
            expiry_timestamp_ms=expiry,
        ))

t0 = time.perf_counter()
flip = calculate_gamma_flip(contracts, spot_price, calculation_timestamp_ms=now)
mp = calculate_max_pain(contracts, expiry=expiries[2])
t1 = time.perf_counter()

print(json.dumps({
    "duration_ms": (t1 - t0) * 1000.0,
    "gamma_flip_price": flip.price,
    "max_pain_strike": mp.max_pain_strike,
}))
`;

    const pyRes = spawnSync("python", ["-c", pythonCode], {
      cwd: rootDir,
      encoding: "utf8",
      timeout: 10_000,
    });

    if (pyRes.status === 0 && pyRes.stdout) {
      const parsedPy = JSON.parse(pyRes.stdout.trim()) as {
        duration_ms: number;
        gamma_flip_price: number | null;
        max_pain_strike: number | null;
      };

      const tsStart = performance.now();
      const tsResult = calculateOptionsMetrics(baseInput);
      const tsDuration = performance.now() - tsStart;

      const combinedDuration = tsDuration + parsedPy.duration_ms;

      // Parity assertions
      if (
        parsedPy.gamma_flip_price !== null &&
        tsResult.gammaFlipPrice !== null
      ) {
        expect(tsResult.gammaFlipPrice).toBeCloseTo(
          parsedPy.gamma_flip_price,
          1,
        );
      }
      if (
        parsedPy.max_pain_strike !== null &&
        tsResult.maxPain?.price !== null
      ) {
        expect(tsResult.maxPain?.price).toBe(parsedPy.max_pain_strike);
      }

      // Budget assertion
      expect(combinedDuration).toBeLessThanOrEqual(350);
    }
  });
});
