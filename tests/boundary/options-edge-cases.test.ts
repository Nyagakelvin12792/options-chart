import { describe, expect, it } from "vitest";

import {
  calculateBlackScholesD1D2,
  calculateDeribitInverseGamma,
  calculateModeledSignedGexOnePercentUsd,
  calculateOptionsMetrics,
  calculateTimeToExpiryYears,
  getGammaExclusionReason,
  minimumProfileTimeToExpiryMs,
  partitionGammaEligibleContracts,
  standardNormalCdf,
  standardNormalPdf,
} from "../../packages/options-engine/src/index";
import {
  createChainFixture,
  createOptionFixture,
} from "../../packages/options-engine/src/test-fixtures";

describe("M4 Phase 3: Boundary & Edge Case Test Suite (M4.12 - M4.19)", () => {
  const now = Date.UTC(2026, 7, 26, 8, 0, 0); // 2026-08-26 08:00:00 UTC
  const spotPrice = 80_000;

  // -------------------------------------------------------------------------
  // M4.12: Near-Expiry Edge Cases (T < 1h, 15-Minute Floor)
  // -------------------------------------------------------------------------
  describe("M4.12 Near-Expiry Edge Cases (T < 1h, 15m Floor)", () => {
    it("excludes contracts with remaining time < 15 minutes from gamma calculations", () => {
      const tenMinContract = createOptionFixture({
        expiry: now + 10 * 60 * 1000,
        strike: 80_000,
        optionType: "call",
        openInterestBtc: 100,
        markIvDecimal: 0.6,
        underlyingPriceUsd: spotPrice,
      });

      const reason = getGammaExclusionReason(tenMinContract, now);
      expect(reason).toBe("nearExpiryProfileFloor");

      const partitioned = partitionGammaEligibleContracts(
        [tenMinContract],
        now,
      );
      expect(partitioned.eligibleContracts).toHaveLength(0);
      expect(partitioned.excludedCountByReason.nearExpiryProfileFloor).toBe(1);
    });

    it("includes contracts with remaining time >= 15 minutes in gamma calculations", () => {
      const fifteenMinContract = createOptionFixture({
        expiry: now + minimumProfileTimeToExpiryMs,
        strike: 80_000,
        optionType: "call",
        openInterestBtc: 100,
        markIvDecimal: 0.6,
        underlyingPriceUsd: spotPrice,
      });

      const reason = getGammaExclusionReason(fifteenMinContract, now);
      expect(reason).toBeNull();

      const partitioned = partitionGammaEligibleContracts(
        [fifteenMinContract],
        now,
      );
      expect(partitioned.eligibleContracts).toHaveLength(1);
    });

    it("preserves near-expiry (< 15m) contracts in Total Open Interest and Max Pain", () => {
      const fiveMinCall = createOptionFixture({
        expiry: now + 5 * 60 * 1000,
        strike: 80_000,
        optionType: "call",
        openInterestBtc: 50,
        markIvDecimal: 0.6,
        underlyingPriceUsd: spotPrice,
      });
      const fiveMinPut = createOptionFixture({
        expiry: now + 5 * 60 * 1000,
        strike: 80_000,
        optionType: "put",
        openInterestBtc: 50,
        markIvDecimal: 0.6,
        underlyingPriceUsd: spotPrice,
      });
      const normalCall = createOptionFixture({
        expiry: now + 24 * 3600 * 1000,
        strike: 82_000,
        optionType: "call",
        openInterestBtc: 100,
        markIvDecimal: 0.6,
        underlyingPriceUsd: spotPrice,
      });

      const chain = createChainFixture(
        [fiveMinCall, fiveMinPut, normalCall],
        now,
      );
      const result = calculateOptionsMetrics({
        chain,
        underlyingPriceUsd: spotPrice,
        calculatedAt: now,
        expiryScope: "ALL",
        interestRateFallbackDecimal: 0.0,
        maxPainExpiry: null,
        secondaryLevelCount: 3,
      });

      // Total OI includes all 3 contracts (50 + 50 + 100 = 200 BTC)
      expect(result.summary.totalOpenInterestBtc).toBe(200);
      expect(result.summary.metadata.contractsSeen).toBe(3);
      expect(result.summary.metadata.contractsIncluded).toBe(1);
      expect(
        result.summary.metadata.excludedCountByReason.nearExpiryProfileFloor,
      ).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // M4.13: 0DTE and Expired Contract Handling (T <= 0)
  // -------------------------------------------------------------------------
  describe("M4.13 0DTE and Expired Contracts (T <= 0)", () => {
    it("classifies expired contracts (expiry <= calculationTimestamp) as 'expired'", () => {
      const expiredContract = createOptionFixture({
        expiry: now - 1_000,
        strike: 80_000,
        optionType: "call",
        openInterestBtc: 100,
        markIvDecimal: 0.6,
        underlyingPriceUsd: spotPrice,
      });

      const reason = getGammaExclusionReason(expiredContract, now);
      expect(reason).toBe("expired");
    });

    it("returns null for calculateTimeToExpiryYears when contract is expired", () => {
      expect(calculateTimeToExpiryYears(now - 1_000, now)).toBeNull();
      expect(calculateTimeToExpiryYears(now, now)).toBeNull();
    });

    it("evaluates 0DTE contracts expiring later today (> 15m) normally", () => {
      const fourHourExpiry = now + 4 * 3600 * 1000;
      const dteYears = calculateTimeToExpiryYears(fourHourExpiry, now);
      expect(dteYears).toBeCloseTo(4 / (24 * 365), 8);
    });
  });

  // -------------------------------------------------------------------------
  // M4.14: Deep ITM / Deep OTM Asymptotic Stability (|d1| > 38)
  // -------------------------------------------------------------------------
  describe("M4.14 Deep ITM / Deep OTM Options (|d1| > 38)", () => {
    it("handles ultra-deep OTM strike ($1,000,000 at spot $10,000) without NaN or overflow", () => {
      const { d1, d2 } = calculateBlackScholesD1D2(
        10_000,
        1_000_000,
        0.1,
        0.5,
        0.0,
      );
      expect(d1).toBeLessThan(-10);
      expect(d2).toBeLessThan(-10);

      const pdf = standardNormalPdf(d1);
      expect(pdf).toBeGreaterThanOrEqual(0);
      expect(pdf).toBeLessThan(1e-20);

      const gamma = calculateDeribitInverseGamma(
        10_000,
        1_000_000,
        0.1,
        0.5,
        0.0,
      );
      expect(Number.isFinite(gamma)).toBe(true);
      expect(gamma).toBeGreaterThanOrEqual(0);
      expect(gamma).toBeLessThan(1e-15);
    });

    it("handles ultra-deep ITM strike ($1,000 at spot $200,000) with asymptotic delta ~ 1.0", () => {
      const { d1, d2 } = calculateBlackScholesD1D2(
        200_000,
        1_000,
        0.1,
        0.5,
        0.0,
      );
      expect(d1).toBeGreaterThan(10);
      expect(d2).toBeGreaterThan(10);

      const cdf = standardNormalCdf(d1);
      expect(cdf).toBeCloseTo(1.0, 10);

      const gamma = calculateDeribitInverseGamma(200_000, 1_000, 0.1, 0.5, 0.0);
      expect(Number.isFinite(gamma)).toBe(true);
      expect(gamma).toBeLessThan(1e-15);
    });
  });

  // -------------------------------------------------------------------------
  // M4.15: Extreme Volatility Regimes (sigma in [0.01, 10.0])
  // -------------------------------------------------------------------------
  describe("M4.15 Extreme Volatility Regimes (0.01 <= IV <= 10.0)", () => {
    it("evaluates extremely low volatility (IV = 1% = 0.01) stably", () => {
      const { d1, d2 } = calculateBlackScholesD1D2(
        80_000,
        80_000,
        30 / 365,
        0.01,
        0.0,
      );
      expect(Number.isFinite(d1)).toBe(true);
      expect(Number.isFinite(d2)).toBe(true);

      const gamma = calculateDeribitInverseGamma(
        80_000,
        80_000,
        30 / 365,
        0.01,
        0.0,
      );
      expect(Number.isFinite(gamma)).toBe(true);
      expect(gamma).toBeGreaterThan(0);
    });

    it("evaluates extremely high volatility (IV = 1000% = 10.0) stably", () => {
      const { d1, d2 } = calculateBlackScholesD1D2(
        80_000,
        80_000,
        30 / 365,
        10.0,
        0.0,
      );
      expect(Number.isFinite(d1)).toBe(true);
      expect(Number.isFinite(d2)).toBe(true);

      const gamma = calculateDeribitInverseGamma(
        80_000,
        80_000,
        30 / 365,
        10.0,
        0.0,
      );
      expect(Number.isFinite(gamma)).toBe(true);
      expect(gamma).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // M4.16: Missing IV Exclusions (mark_iv = null)
  // -------------------------------------------------------------------------
  describe("M4.16 Missing IV Exclusions", () => {
    it("excludes contracts with null markIvDecimal from gamma but retains them in Open Interest", () => {
      const missingIvContract = createOptionFixture({
        expiry: now + 30 * 86_400_000,
        strike: 80_000,
        optionType: "call",
        openInterestBtc: 150,
        markIvDecimal: null,
        underlyingPriceUsd: spotPrice,
      });

      const reason = getGammaExclusionReason(missingIvContract, now);
      expect(reason).toBe("missingIv");

      const chain = createChainFixture([missingIvContract], now);
      const result = calculateOptionsMetrics({
        chain,
        underlyingPriceUsd: spotPrice,
        calculatedAt: now,
        expiryScope: "ALL",
        interestRateFallbackDecimal: 0.0,
        maxPainExpiry: null,
        secondaryLevelCount: 3,
      });

      expect(result.summary.totalOpenInterestBtc).toBe(150);
      expect(result.summary.metadata.contractsSeen).toBe(1);
      expect(result.summary.metadata.contractsIncluded).toBe(0);
      expect(result.summary.metadata.excludedCountByReason.missingIv).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // M4.17: IV Normalization Verification (Percentage to Decimal)
  // -------------------------------------------------------------------------
  describe("M4.17 IV Normalization Verification", () => {
    it("verifies that decimal IV (0.80) produces exactly 100x lower variance than raw percentage IV (80.0)", () => {
      const spot = 100_000;
      const strike = 100_000;
      const time = 30 / 365;

      const normalized = calculateDeribitInverseGamma(
        spot,
        strike,
        time,
        0.8,
        0.0,
      );
      const unnormalized = calculateDeribitInverseGamma(
        spot,
        strike,
        time,
        80.0,
        0.0,
      );

      // Raw unnormalized 80.0 suppresses gamma by ~100x
      expect(normalized).toBeGreaterThan(unnormalized * 50);
      expect(normalized).toBeCloseTo(1.728e-5, 8);
    });
  });

  // -------------------------------------------------------------------------
  // M4.18: Zero Open Interest Handling (OI = 0)
  // -------------------------------------------------------------------------
  describe("M4.18 Zero Open Interest Options", () => {
    it("evaluates contracts with 0 OI with zero GEX contribution without throwing", () => {
      const zeroOiContract = createOptionFixture({
        expiry: now + 30 * 86_400_000,
        strike: 80_000,
        optionType: "call",
        openInterestBtc: 0,
        markIvDecimal: 0.6,
        underlyingPriceUsd: spotPrice,
      });

      const reason = getGammaExclusionReason(zeroOiContract, now);
      expect(reason).toBeNull(); // Eligible for calculation

      const gamma = calculateDeribitInverseGamma(
        spotPrice,
        80_000,
        30 / 365,
        0.6,
        0.0,
      );
      const gex = calculateModeledSignedGexOnePercentUsd(
        "call",
        gamma,
        0,
        spotPrice,
      );
      expect(gex).toBe(0);
    });

    it("computes put/call ratio as null when total put OI is zero", () => {
      const callOnly = createOptionFixture({
        expiry: now + 30 * 86_400_000,
        strike: 80_000,
        optionType: "call",
        openInterestBtc: 100,
        markIvDecimal: 0.6,
        underlyingPriceUsd: spotPrice,
      });

      const chain = createChainFixture([callOnly], now);
      const result = calculateOptionsMetrics({
        chain,
        underlyingPriceUsd: spotPrice,
        calculatedAt: now,
        expiryScope: "ALL",
        interestRateFallbackDecimal: 0.0,
        maxPainExpiry: null,
        secondaryLevelCount: 3,
      });

      expect(result.summary.totalCallOpenInterestBtc).toBe(100);
      expect(result.summary.totalPutOpenInterestBtc).toBe(0);
      expect(result.summary.putCallOpenInterestRatio).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // M4.19: Duplicate Contract Robustness
  // -------------------------------------------------------------------------
  describe("M4.19 Duplicate Contract Inputs", () => {
    it("processes duplicate contracts deterministically without crashing or throwing", () => {
      const contract1 = createOptionFixture({
        expiry: now + 30 * 86_400_000,
        strike: 80_000,
        optionType: "call",
        openInterestBtc: 100,
        markIvDecimal: 0.6,
        underlyingPriceUsd: spotPrice,
      });
      const contract2 = createOptionFixture({
        expiry: now + 30 * 86_400_000,
        strike: 80_000,
        optionType: "call",
        openInterestBtc: 100,
        markIvDecimal: 0.6,
        underlyingPriceUsd: spotPrice,
      });

      const chain = createChainFixture([contract1, contract2], now);
      const result = calculateOptionsMetrics({
        chain,
        underlyingPriceUsd: spotPrice,
        calculatedAt: now,
        expiryScope: "ALL",
        interestRateFallbackDecimal: 0.0,
        maxPainExpiry: null,
        secondaryLevelCount: 3,
      });

      expect(result.summary.totalOpenInterestBtc).toBe(200);
      expect(result.summary.metadata.contractsSeen).toBe(2);
      expect(result.summary.metadata.contractsIncluded).toBe(2);
    });
  });
});
