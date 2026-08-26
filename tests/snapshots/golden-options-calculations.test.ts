import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  CALCULATION_ENGINE_VERSION,
  ENGINE_VERSION,
  GAMMA_PROFILE_VERSION,
  GEX_MODEL_VERSION,
  calculateOptionsMetrics,
  type OptionsCalculationResult,
} from "../../packages/options-engine/src/index";
import type { GoldenSnapshotFixture } from "../../tools/golden-generator";

/**
 * Deterministically serialize any JavaScript value to a canonical JSON string
 * with alphabetically sorted object keys.
 */
function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalJsonStringify).join(",") + "]";
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map((key) => {
    const val = (obj as Record<string, unknown>)[key];
    return JSON.stringify(key) + ":" + canonicalJsonStringify(val);
  });
  return "{" + pairs.join(",") + "}";
}

/**
 * Compute SHA-256 digest of a UTF-8 string.
 */
function computeSha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function loadGoldenFixture(regimeName: string): GoldenSnapshotFixture {
  const filePath = resolve(__dirname, `../fixtures/golden/${regimeName}.json`);
  const raw = readFileSync(filePath, "utf8");
  return JSON.parse(raw) as GoldenSnapshotFixture;
}

describe("M4.11 Golden Snapshot Regression Suite", () => {
  const regimes = [
    "normal-market",
    "volatility-crush",
    "zero-dte",
    "strike-skew",
  ] as const;

  // Load all versioned golden fixtures
  const fixtures = new Map<string, GoldenSnapshotFixture>();
  for (const regime of regimes) {
    fixtures.set(regime, loadGoldenFixture(regime));
  }

  describe("Snapshot Metadata & Integrity Verification", () => {
    it("validates that engine version ENGINE_VERSION = '0.1.0' is embedded across all snapshot fixtures", () => {
      expect(ENGINE_VERSION).toBe("0.1.0");

      for (const [regime, fixture] of fixtures.entries()) {
        expect(fixture.schemaVersion).toBe("golden-options-snapshot-v1");
        expect(fixture.engineVersion).toBe("0.1.0");
        expect(fixture.regime).toBe(regime);
        expect(fixture.outputSha256).toBeDefined();
        expect(fixture.outputSha256).toHaveLength(64);
      }
    });

    it("verifies stored golden outputs match their SHA-256 integrity hashes without tampering", () => {
      for (const [regime, fixture] of fixtures.entries()) {
        const canonical = canonicalJsonStringify(fixture.expectedOutput);
        const actualSha256 = computeSha256(canonical);

        expect(
          actualSha256,
          `Tamper detected in stored golden output for regime '${regime}'`,
        ).toBe(fixture.outputSha256);
      }
    });
  });

  describe("Regime A: Normal Market (Balanced Calls/Puts, Multiple Expiries)", () => {
    const fixture = fixtures.get("normal-market")!;

    it("computes exact deterministic parity against golden output with SHA-256 verification", () => {
      const result = calculateOptionsMetrics(fixture.input);
      const canonical = canonicalJsonStringify(result);
      const sha256 = computeSha256(canonical);

      expect(sha256).toBe(fixture.outputSha256);
      expect(result).toEqual(fixture.expectedOutput);
    });

    it("evaluates comprehensive metrics for multi-expiry balanced market", () => {
      const result = calculateOptionsMetrics(fixture.input);

      // Open interest verification
      expect(result.summary.totalOpenInterestBtc).toBe(44800);
      expect(result.summary.totalCallOpenInterestBtc).toBe(22400);
      expect(result.summary.totalPutOpenInterestBtc).toBe(22400);
      expect(result.summary.putCallOpenInterestRatio).toBe(1.0);

      // Open interest-weighted average IV
      expect(result.summary.averageMarkIvDecimal).toBeCloseTo(0.5773, 4);

      // Wall identification: call wall and put wall at ATM strike
      const callWall = result.summary.keyLevels.find(
        (l) => l.kind === "call-wall",
      );
      const putWall = result.summary.keyLevels.find(
        (l) => l.kind === "put-wall",
      );
      expect(callWall?.price).toBe(80000);
      expect(putWall?.price).toBe(80000);

      // Modeled Gamma Flip
      expect(result.gammaFlipPrice).toBeCloseTo(78883.21, 2);
      expect(result.qualifyingCrossings).toHaveLength(1);
      expect(result.qualifyingCrossings[0]!.price).toBeCloseTo(78883.21, 2);

      // Max Pain on 7D expiry
      expect(result.maxPain?.price).toBe(80000);
      expect(result.maxPain?.totalPayoutUsd).toBe(15000000);

      // Gamma Profile grid
      expect(result.gammaProfile).toHaveLength(121);
      expect(result.gammaProfile[0]!.spotPrice).toBe(56000);
      expect(result.gammaProfile.at(-1)!.spotPrice).toBe(104000);

      // Audit metadata
      expect(result.summary.metadata).toMatchObject({
        calculationEngineVersion: CALCULATION_ENGINE_VERSION,
        gexModelVersion: GEX_MODEL_VERSION,
        gammaProfileVersion: GAMMA_PROFILE_VERSION,
        contractsSeen: 72,
        contractsIncluded: 72,
      });
    });
  });

  describe("Regime B: Volatility Crush / Extreme IV Spike Regime", () => {
    const fixture = fixtures.get("volatility-crush")!;

    it("computes exact deterministic parity against golden output with SHA-256 verification", () => {
      const result = calculateOptionsMetrics(fixture.input);
      const canonical = canonicalJsonStringify(result);
      const sha256 = computeSha256(canonical);

      expect(sha256).toBe(fixture.outputSha256);
      expect(result).toEqual(fixture.expectedOutput);
    });

    it("handles extreme IV levels (up to 330%) with numerical stability", () => {
      const result = calculateOptionsMetrics(fixture.input);

      // High average IV verification
      expect(result.summary.averageMarkIvDecimal).toBeGreaterThan(2.0);
      expect(result.summary.averageMarkIvDecimal).toBeCloseTo(2.8867, 4);

      // High OI total
      expect(result.summary.totalOpenInterestBtc).toBe(36000);
      expect(result.summary.totalCallOpenInterestBtc).toBe(15200);
      expect(result.summary.totalPutOpenInterestBtc).toBe(20800);

      // All gamma profile points must be finite and non-NaN under extreme IV
      for (const point of result.gammaProfile) {
        expect(Number.isFinite(point.spotPrice)).toBe(true);
        expect(Number.isFinite(point.modeledGexOnePercentUsd)).toBe(true);
      }

      // Walls accurately identified
      const callWall = result.summary.keyLevels.find(
        (l) => l.kind === "call-wall",
      );
      const putWall = result.summary.keyLevels.find(
        (l) => l.kind === "put-wall",
      );
      expect(callWall?.price).toBe(90000);
      expect(putWall?.price).toBe(85000);

      // Max Pain on 2D expiry
      expect(result.maxPain?.price).toBe(85000);
    });
  });

  describe("Regime C: 0DTE Near-Expiry Expiry Regime", () => {
    const fixture = fixtures.get("zero-dte")!;

    it("computes exact deterministic parity against golden output with SHA-256 verification", () => {
      const result = calculateOptionsMetrics(fixture.input);
      const canonical = canonicalJsonStringify(result);
      const sha256 = computeSha256(canonical);

      expect(sha256).toBe(fixture.outputSha256);
      expect(result).toEqual(fixture.expectedOutput);
    });

    it("enforces 15-minute gamma profile floor while preserving 100% OI and Max Pain coverage", () => {
      const result = calculateOptionsMetrics(fixture.input);

      // Contracts under 15 min (10m and 14m) are filtered from gamma
      // 5 expiries * 5 strikes * 2 types = 50 contracts seen
      // 2 expiries < 15 min (2 * 5 * 2 = 20 contracts excluded)
      // 3 expiries >= 15 min (3 * 5 * 2 = 30 contracts included)
      expect(result.summary.metadata.contractsSeen).toBe(50);
      expect(result.summary.metadata.contractsIncluded).toBe(30);
      expect(
        result.summary.metadata.excludedCountByReason.nearExpiryProfileFloor,
      ).toBe(20);

      // Total open interest must account for ALL 50 contracts
      expect(result.summary.totalOpenInterestBtc).toBe(10000);
      expect(result.summary.totalCallOpenInterestBtc).toBe(5000);
      expect(result.summary.totalPutOpenInterestBtc).toBe(5000);

      // Max pain for the 0DTE expiry evaluates its 10 contracts
      expect(result.maxPain?.price).toBe(80000);
      expect(result.maxPain?.metadata.contractsSeen).toBe(10);
      expect(result.maxPain?.metadata.contractsIncluded).toBe(10);

      // Gamma profile is well-formed from valid >=15m contracts
      expect(result.gammaProfile.length).toBeGreaterThan(0);
      for (const pt of result.gammaProfile) {
        expect(Number.isFinite(pt.modeledGexOnePercentUsd)).toBe(true);
      }
    });
  });

  describe("Regime D: Deep ITM/OTM Strike Skew Regime", () => {
    const fixture = fixtures.get("strike-skew")!;

    it("computes exact deterministic parity against golden output with SHA-256 verification", () => {
      const result = calculateOptionsMetrics(fixture.input);
      const canonical = canonicalJsonStringify(result);
      const sha256 = computeSha256(canonical);

      expect(sha256).toBe(fixture.outputSha256);
      expect(result).toEqual(fixture.expectedOutput);
    });

    it("handles extreme strike range ($20,000 to $300,000) and wing OI concentration", () => {
      const result = calculateOptionsMetrics(fixture.input);

      // Deep wings OI verification
      expect(result.summary.totalOpenInterestBtc).toBe(32100);
      expect(result.summary.totalCallOpenInterestBtc).toBe(14100);
      expect(result.summary.totalPutOpenInterestBtc).toBe(18000);

      // Put Wall placed at $80,000
      const putWall = result.summary.keyLevels.find(
        (l) => l.kind === "put-wall",
      );
      expect(putWall?.price).toBe(80000);

      // Call Wall placed at $100,000
      const callWall = result.summary.keyLevels.find(
        (l) => l.kind === "call-wall",
      );
      expect(callWall?.price).toBe(100000);

      // Max Pain at $90,000
      expect(result.maxPain?.price).toBe(90000);

      // Strike exposures span all 13 strikes * 2 option types (call and put)
      expect(result.strikeExposures).toHaveLength(26);
      expect(result.strikeExposures[0]!.strike).toBe(20000);
      expect(result.strikeExposures.at(-1)!.strike).toBe(300000);

      // Asymptotic stability: no NaNs across all profile points
      expect(result.gammaProfile.length).toBeGreaterThan(0);
      for (const point of result.gammaProfile) {
        expect(Number.isFinite(point.modeledGexOnePercentUsd)).toBe(true);
      }
    });
  });

  describe("Deterministic Engine Idempotence & Tamper Sensitivity", () => {
    it("produces byte-for-byte identical output over 10 consecutive executions", () => {
      const fixture = fixtures.get("normal-market")!;
      const baseResult = calculateOptionsMetrics(fixture.input);
      const baseSha256 = computeSha256(canonicalJsonStringify(baseResult));

      for (let i = 0; i < 10; i++) {
        const result = calculateOptionsMetrics(fixture.input);
        const sha256 = computeSha256(canonicalJsonStringify(result));
        expect(sha256).toBe(baseSha256);
      }
    });

    it("detects any simulated bit flips or floating-point mutation in result verification", () => {
      const fixture = fixtures.get("normal-market")!;
      const result = calculateOptionsMetrics(fixture.input);

      // Mutate one floating point number slightly (1e-6 delta)
      const tampered: OptionsCalculationResult = {
        ...result,
        summary: {
          ...result.summary,
          modeledGexOnePercentUsd:
            result.summary.modeledGexOnePercentUsd + 0.000001,
        },
      };

      const tamperedSha256 = computeSha256(canonicalJsonStringify(tampered));
      expect(tamperedSha256).not.toBe(fixture.outputSha256);
    });
  });
});
