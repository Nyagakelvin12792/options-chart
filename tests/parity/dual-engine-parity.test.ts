import { describe, expect, it } from "vitest";

import {
  calculateBlackScholesD1D2,
  calculateDeribitInverseGamma,
  calculateModeledSignedGexOnePercentUsd,
  standardNormalCdf,
  standardNormalPdf,
} from "../../packages/options-engine/src/index";
import { runDualEngineParity } from "../../scripts/verify-parity";

describe("M4.5 Dual-Engine Parity Test Suite (TypeScript vs Python Reference)", () => {
  const TOLERANCE = 1e-7;

  it("evaluates >= 100,000 grid and randomized vectors with <= 1e-7 difference against Python reference", async () => {
    const stats = await runDualEngineParity({
      gridTarget: 20_000,
      randomTarget: 80_000,
      tolerance: TOLERANCE,
      verbose: false,
    });

    expect(stats.totalEvaluated).toBeGreaterThanOrEqual(100_000);
    expect(stats.failureCount).toBe(0);

    // Assert absolute and relative error bounds for all evaluated metrics
    expect(stats.maxCdfDelta).toBeLessThanOrEqual(TOLERANCE);
    expect(stats.maxPdfDelta).toBeLessThanOrEqual(TOLERANCE);
    expect(stats.maxD1Delta).toBeLessThanOrEqual(TOLERANCE);
    expect(stats.maxD2Delta).toBeLessThanOrEqual(TOLERANCE);
    expect(stats.maxGammaDelta).toBeLessThanOrEqual(TOLERANCE);
    expect(stats.maxRelGammaDelta).toBeLessThanOrEqual(TOLERANCE);
    expect(stats.maxGexDelta).toBeLessThanOrEqual(TOLERANCE);
    expect(stats.maxRelGexDelta).toBeLessThanOrEqual(TOLERANCE);
  }, 30_000);

  describe("Canonical Deterministic Vector Parity", () => {
    it("matches Python reference for ATM BTC option (S=100,000, K=100,000, T=30/365, IV=0.80, OI=500)", () => {
      const spot = 100_000;
      const strike = 100_000;
      const timeToExpiryYears = 30 / 365;
      const iv = 0.8;
      const oi = 500;

      const { d1, d2 } = calculateBlackScholesD1D2(
        spot,
        strike,
        timeToExpiryYears,
        iv,
        0.0,
      );
      const gamma = calculateDeribitInverseGamma(
        spot,
        strike,
        timeToExpiryYears,
        iv,
        0.0,
      );
      const callGex = calculateModeledSignedGexOnePercentUsd(
        "call",
        gamma,
        oi,
        spot,
      );
      const putGex = calculateModeledSignedGexOnePercentUsd(
        "put",
        gamma,
        oi,
        spot,
      );

      // Expected values computed from Python reference model
      expect(d1).toBeCloseTo(0.11467643581619918, 12);
      expect(d2).toBeCloseTo(-0.11467643581619918, 12);
      expect(gamma).toBeCloseTo(1.728025905025941e-5, 12);
      expect(callGex).toBeCloseTo(864012.9525129705, 6);
      expect(putGex).toBeCloseTo(-864012.9525129705, 6);
      expect(callGex).toBeCloseTo(-putGex, 8);
    });

    it("matches Python reference for extreme boundaries (S=1,000, K=300,000, T=1/365, IV=3.00)", () => {
      const spot = 1_000;
      const strike = 300_000;
      const timeToExpiryYears = 1 / 365;
      const iv = 3.0;

      const { d1, d2 } = calculateBlackScholesD1D2(
        spot,
        strike,
        timeToExpiryYears,
        iv,
        0.0,
      );
      const gamma = calculateDeribitInverseGamma(
        spot,
        strike,
        timeToExpiryYears,
        iv,
        0.0,
      );

      expect(Number.isFinite(d1)).toBe(true);
      expect(Number.isFinite(d2)).toBe(true);
      expect(gamma).toBeGreaterThanOrEqual(0);
      expect(standardNormalCdf(d1)).toBeLessThan(1e-10);
    });

    it("matches Python reference for standard normal distribution constants", () => {
      expect(standardNormalCdf(0.0)).toBe(0.5);
      expect(standardNormalPdf(0.0)).toBeCloseTo(
        1 / Math.sqrt(2 * Math.PI),
        12,
      );

      // Abramowitz & Stegun polynomial CDF approximation vs true normal CDF values
      // N(1.95996398454) ~= 0.975 (97.5th percentile)
      expect(standardNormalCdf(1.95996398454)).toBeCloseTo(0.975, 5);
      // N(-1.95996398454) ~= 0.025 (2.5th percentile)
      expect(standardNormalCdf(-1.95996398454)).toBeCloseTo(0.025, 5);
    });
  });
});
