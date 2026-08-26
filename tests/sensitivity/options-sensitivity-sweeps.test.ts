import { describe, expect, it } from "vitest";

import type { OptionSnapshot, QualifyingCrossing } from "@options-chart/domain";

import {
  calculateBlackScholesD1D2,
  calculateDeribitInverseGamma,
  calculateGammaProfile,
  calculateGrossGammaOnePercentUsd,
  calculateHolderPayoutUsd,
  calculateMaxPain,
  calculateModeledSignedGexOnePercentUsd,
  calculateOptionsMetrics,
  findZeroCrossings,
  selectHeadlineGammaFlip,
  standardNormalCdf,
} from "../../packages/options-engine/src/index";
import {
  createChainFixture,
  createOptionFixture,
} from "../../packages/options-engine/src/test-fixtures";

describe("M4 Phase 4: Sensitivity & Profiling Sweeps Suite (M4.20 - M4.25)", () => {
  const now = Date.UTC(2026, 7, 26, 8, 0, 0);
  const spotPrice = 80_000;
  const thirtyDaysMs = 30 * 86_400_000;

  // -------------------------------------------------------------------------
  // M4.20: Spot Shift Invariance & Gamma Dollar Exposure Scaling
  // -------------------------------------------------------------------------
  describe("M4.20 Spot Shift Invariance & S^2 Gamma Scaling", () => {
    it("verifies modeled signed GEX scales quadratically with spot price (S^2 * 0.01)", () => {
      const oi = 100;
      const gammaPerDollar = 1e-5;

      const gexAt50k = calculateModeledSignedGexOnePercentUsd(
        "call",
        gammaPerDollar,
        oi,
        50_000,
      );
      const gexAt100k = calculateModeledSignedGexOnePercentUsd(
        "call",
        gammaPerDollar,
        oi,
        100_000,
      );

      // (100k / 50k)^2 = 4x
      expect(gexAt100k / gexAt50k).toBeCloseTo(4.0, 10);
      expect(gexAt50k).toBe(1.0 * gammaPerDollar * oi * 50_000 * 50_000 * 0.01);
    });

    it("verifies small spot shifts (Delta S = +1%) shift d1 and gamma smoothly", () => {
      const strike = 80_000;
      const time = 30 / 365;
      const iv = 0.6;

      const { d1: d1Base } = calculateBlackScholesD1D2(
        80_000,
        strike,
        time,
        iv,
        0,
      );
      const { d1: d1Shifted } = calculateBlackScholesD1D2(
        80_800,
        strike,
        time,
        iv,
        0,
      );

      expect(d1Shifted).toBeGreaterThan(d1Base);
      expect(d1Shifted - d1Base).toBeLessThan(0.1);
    });
  });

  // -------------------------------------------------------------------------
  // M4.21: Multi-Zero-Crossing Profile Cases
  // -------------------------------------------------------------------------
  describe("M4.21 Multi-Zero-Crossing Profile Cases", () => {
    it("detects multiple distinct qualifying crossings in a complex multi-expiry skew regime", () => {
      const expiry = now + 14 * 86_400_000;

      // Alternating calls and puts creates multiple flip crossings across the spot grid
      const contracts: OptionSnapshot[] = [
        createOptionFixture({
          expiry,
          strike: 60_000,
          optionType: "put",
          openInterestBtc: 800,
          markIvDecimal: 0.35,
          underlyingPriceUsd: spotPrice,
        }),
        createOptionFixture({
          expiry,
          strike: 70_000,
          optionType: "call",
          openInterestBtc: 1200,
          markIvDecimal: 0.35,
          underlyingPriceUsd: spotPrice,
        }),
        createOptionFixture({
          expiry,
          strike: 80_000,
          optionType: "put",
          openInterestBtc: 1500,
          markIvDecimal: 0.35,
          underlyingPriceUsd: spotPrice,
        }),
        createOptionFixture({
          expiry,
          strike: 90_000,
          optionType: "call",
          openInterestBtc: 1200,
          markIvDecimal: 0.35,
          underlyingPriceUsd: spotPrice,
        }),
        createOptionFixture({
          expiry,
          strike: 100_000,
          optionType: "put",
          openInterestBtc: 800,
          markIvDecimal: 0.35,
          underlyingPriceUsd: spotPrice,
        }),
      ];

      const profile = calculateGammaProfile(contracts, spotPrice, now, 0);
      const crossings = findZeroCrossings(profile, spotPrice, 0.005);

      expect(crossings.length).toBeGreaterThanOrEqual(2);
      for (const crossing of crossings) {
        expect(crossing.price).toBeGreaterThan(56_000);
        expect(crossing.price).toBeLessThan(104_000);
        expect(crossing.distanceFromUnderlying).toBe(
          Math.abs(crossing.price - spotPrice),
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  // M4.22: Equidistant Tie-Breaking Validation (Lower Strike Selected)
  // -------------------------------------------------------------------------
  describe("M4.22 Equidistant Tie-Breaking Validation", () => {
    it("deterministically selects the lower strike when two crossings are equidistant from spot", () => {
      const crossingLower: QualifyingCrossing = {
        price: 75_000,
        distanceFromUnderlying: 5_000,
        lowerBracketPrice: 74_900,
        upperBracketPrice: 75_100,
        lowerBracketGex: -10_000,
        upperBracketGex: 10_000,
        significanceThreshold: 500,
      };

      const crossingUpper: QualifyingCrossing = {
        price: 85_000,
        distanceFromUnderlying: 5_000,
        lowerBracketPrice: 84_900,
        upperBracketPrice: 85_100,
        lowerBracketGex: 10_000,
        upperBracketGex: -10_000,
        significanceThreshold: 500,
      };

      // Test order invariance: [lower, upper] and [upper, lower]
      const headline1 = selectHeadlineGammaFlip([crossingLower, crossingUpper]);
      const headline2 = selectHeadlineGammaFlip([crossingUpper, crossingLower]);

      expect(headline1?.price).toBe(75_000);
      expect(headline2?.price).toBe(75_000);
    });
  });

  // -------------------------------------------------------------------------
  // M4.23: Monotonicity & Peak Decay Property Tests
  // -------------------------------------------------------------------------
  describe("M4.23 Monotonicity & Peak Decay Properties", () => {
    it("verifies standard normal CDF is strictly monotonically increasing", () => {
      let prevCdf = -1;
      for (let z = -6.0; z <= 6.0; z += 0.25) {
        const cdf = standardNormalCdf(z);
        expect(cdf).toBeGreaterThan(prevCdf);
        prevCdf = cdf;
      }
    });

    it("verifies Gross Gamma dollar exposure peaks at ATM and decays symmetrically", () => {
      const strike = 100_000;
      const time = 1.0;
      const iv = 0.5;
      const oi = 100;

      const gammaAtm = calculateDeribitInverseGamma(
        100_000,
        strike,
        time,
        iv,
        0,
      );
      const gammaOtm = calculateDeribitInverseGamma(
        130_000,
        strike,
        time,
        iv,
        0,
      );
      const gammaItm = calculateDeribitInverseGamma(
        70_000,
        strike,
        time,
        iv,
        0,
      );

      const gexAtm = calculateGrossGammaOnePercentUsd(gammaAtm, oi, 100_000);
      const gexOtm = calculateGrossGammaOnePercentUsd(gammaOtm, oi, 130_000);
      const gexItm = calculateGrossGammaOnePercentUsd(gammaItm, oi, 70_000);

      expect(gexAtm).toBeGreaterThan(gexOtm);
      expect(gexAtm).toBeGreaterThan(gexItm);
    });
  });

  // -------------------------------------------------------------------------
  // M4.24: Max Pain Payoff Convexity & Lower-Strike Tie-Break
  // -------------------------------------------------------------------------
  describe("M4.24 Max Pain Payoff Convexity & Tie-Breaking", () => {
    it("calculates exact holder payout for individual call and put contracts", () => {
      // Call with strike 80,000 at evaluated spot 85,000 with 10 OI -> payoff = 5,000 * 10 = 50,000 USD
      const call = createOptionFixture({
        expiry: now + thirtyDaysMs,
        strike: 80_000,
        optionType: "call",
        openInterestBtc: 10,
        underlyingPriceUsd: spotPrice,
      });
      const callPayout = calculateHolderPayoutUsd(call, 85_000);
      expect(callPayout).toBe(50_000);

      // Put with strike 80,000 at evaluated spot 75,000 with 10 OI -> payoff = 5,000 * 10 = 50,000 USD
      const put = createOptionFixture({
        expiry: now + thirtyDaysMs,
        strike: 80_000,
        optionType: "put",
        openInterestBtc: 10,
        underlyingPriceUsd: spotPrice,
      });
      const putPayout = calculateHolderPayoutUsd(put, 75_000);
      expect(putPayout).toBe(50_000);
    });

    it("selects lower strike on exact payout tie", () => {
      const targetExpiry = now + thirtyDaysMs;
      const contracts: OptionSnapshot[] = [
        createOptionFixture({
          expiry: targetExpiry,
          strike: 70_000,
          optionType: "call",
          openInterestBtc: 100,
          underlyingPriceUsd: spotPrice,
        }),
        createOptionFixture({
          expiry: targetExpiry,
          strike: 90_000,
          optionType: "put",
          openInterestBtc: 100,
          underlyingPriceUsd: spotPrice,
        }),
      ];

      // At strike 70,000: call payout = 0, put payout = (90k - 70k) * 100 = 2,000,000
      // At strike 90,000: call payout = (90k - 70k) * 100 = 2,000,000, put payout = 0
      // Exact tie in payout (2,000,000): tie-breaker selects lower strike (70,000)
      const maxPain = calculateMaxPain(contracts, targetExpiry);
      expect(maxPain?.price).toBe(70_000);
      expect(maxPain?.totalPayoutUsd).toBe(2_000_000);
    });
  });

  // -------------------------------------------------------------------------
  // M4.25: Total OI Aggregation Invariants
  // -------------------------------------------------------------------------
  describe("M4.25 Total OI Aggregation Invariants", () => {
    it("guarantees Total OI === Total Call OI + Total Put OI identically across all chains", () => {
      const contracts: OptionSnapshot[] = [
        createOptionFixture({
          expiry: now + thirtyDaysMs,
          strike: 70_000,
          optionType: "call",
          openInterestBtc: 123.45,
          underlyingPriceUsd: spotPrice,
        }),
        createOptionFixture({
          expiry: now + thirtyDaysMs,
          strike: 80_000,
          optionType: "call",
          openInterestBtc: 234.56,
          underlyingPriceUsd: spotPrice,
        }),
        createOptionFixture({
          expiry: now + thirtyDaysMs,
          strike: 80_000,
          optionType: "put",
          openInterestBtc: 345.67,
          underlyingPriceUsd: spotPrice,
        }),
        createOptionFixture({
          expiry: now + thirtyDaysMs,
          strike: 90_000,
          optionType: "put",
          openInterestBtc: 456.78,
          underlyingPriceUsd: spotPrice,
        }),
      ];

      const chain = createChainFixture(contracts, now);
      const result = calculateOptionsMetrics({
        chain,
        underlyingPriceUsd: spotPrice,
        calculatedAt: now,
        expiryScope: "ALL",
        interestRateFallbackDecimal: 0.0,
        maxPainExpiry: null,
        secondaryLevelCount: 3,
      });

      const callTotal = 123.45 + 234.56;
      const putTotal = 345.67 + 456.78;
      const expectedTotal = callTotal + putTotal;

      expect(result.summary.totalCallOpenInterestBtc).toBeCloseTo(callTotal, 8);
      expect(result.summary.totalPutOpenInterestBtc).toBeCloseTo(putTotal, 8);
      expect(result.summary.totalOpenInterestBtc).toBeCloseTo(expectedTotal, 8);
      expect(result.summary.totalOpenInterestBtc).toBe(
        result.summary.totalCallOpenInterestBtc +
          result.summary.totalPutOpenInterestBtc,
      );
    });
  });
});
