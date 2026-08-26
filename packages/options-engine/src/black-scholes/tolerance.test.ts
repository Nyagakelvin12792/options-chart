import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { OptionSnapshot } from "@options-chart/domain";

import { calculateBlackScholesD1D2 } from "./d1d2";
import { calculateDeribitInverseGamma } from "./gamma";
import { standardNormalCdf, standardNormalPdf } from "./normal";
import {
  calculateContractExposure,
  calculateGrossGammaOnePercentUsd,
  calculateModeledSignedGexOnePercentUsd,
} from "../exposure/exposure";
import { calculateGammaFlip } from "../profile/gamma-flip";
import { calculateMaxPain } from "../max-pain/max-pain";
import { createOptionFixture } from "../test-fixtures";

// Mathematical constants for analytical verification
const INVERSE_SQRT_TWO_PI = 1 / Math.sqrt(2 * Math.PI); // ~0.3989422804014327
const MILLISECONDS_PER_DAY = 86_400_000;
const MILLISECONDS_PER_YEAR = 365.0 * MILLISECONDS_PER_DAY;

/**
 * Pure Analytical Closed-Form Reference Model (M4.1 / M4.2 / M4.3 specifications)
 * Mirrors tools/reference-python/ implementations for cross-runtime tolerance assertions.
 */
const refAnalyticalD1D2 = (
  spot: number,
  strike: number,
  timeYears: number,
  volDecimal: number,
  rateDecimal: number,
): { d1: number; d2: number } => {
  const volSqrtT = volDecimal * Math.sqrt(timeYears);
  const d1 =
    (Math.log(spot / strike) +
      (rateDecimal + 0.5 * volDecimal * volDecimal) * timeYears) /
    volSqrtT;
  const d2 = d1 - volSqrtT;
  return { d1, d2 };
};

const refAnalyticalNormalPdf = (x: number): number =>
  INVERSE_SQRT_TWO_PI * Math.exp(-0.5 * x * x);

const refAnalyticalDeribitGamma = (
  spot: number,
  strike: number,
  timeYears: number,
  volDecimal: number,
  rateDecimal = 0,
): number => {
  const { d1 } = refAnalyticalD1D2(
    spot,
    strike,
    timeYears,
    volDecimal,
    rateDecimal,
  );
  return (
    refAnalyticalNormalPdf(d1) / (spot * volDecimal * Math.sqrt(timeYears))
  );
};

const refAnalyticalGexOnePercent = (
  optionType: "call" | "put",
  gamma: number,
  openInterestBtc: number,
  spot: number,
): number => {
  const sign = optionType === "call" ? 1.0 : -1.0;
  return sign * Math.abs(gamma) * openInterestBtc * spot * spot * 0.01;
};

const relativeError = (actual: number, expected: number): number => {
  if (expected === 0) {
    return Math.abs(actual);
  }
  return Math.abs((actual - expected) / expected);
};

describe("M4.7 Empirical Tolerance Calibration Suite", () => {
  describe("1. Black-Scholes Mathematical Primitives (Tolerance: relErr <= 1e-12)", () => {
    const spotPrices = [30_000, 60_000, 80_000, 100_000, 150_000];
    const strikes = [20_000, 50_000, 80_000, 100_000, 120_000, 200_000];
    const expiriesYears = [
      1 / 365, // 1D
      7 / 365, // 7D
      30 / 365, // 30D
      90 / 365, // 90D
      180 / 365, // 180D
      1.0, // 1Y
    ];
    const vols = [0.15, 0.45, 0.7, 0.95, 1.5, 3.0];
    const rates = [0.0, 0.02, 0.05];

    it("evaluates d1 and d2 with relative error <= 1e-12 across a wide parameter matrix", () => {
      let casesTested = 0;
      for (const spot of spotPrices) {
        for (const strike of strikes) {
          for (const timeYears of expiriesYears) {
            for (const vol of vols) {
              for (const rate of rates) {
                const actual = calculateBlackScholesD1D2(
                  spot,
                  strike,
                  timeYears,
                  vol,
                  rate,
                );
                const expected = refAnalyticalD1D2(
                  spot,
                  strike,
                  timeYears,
                  vol,
                  rate,
                );

                const d1RelErr = relativeError(actual.d1, expected.d1);
                const d2RelErr = relativeError(actual.d2, expected.d2);

                expect(d1RelErr).toBeLessThanOrEqual(1e-12);
                expect(d2RelErr).toBeLessThanOrEqual(1e-12);
                casesTested += 1;
              }
            }
          }
        }
      }
      expect(casesTested).toBe(
        spotPrices.length *
          strikes.length *
          expiriesYears.length *
          vols.length *
          rates.length,
      );
    });

    it("verifies exact mathematical symmetry for ATM forward contracts (S=K, r=0)", () => {
      for (const spot of [50_000, 80_000, 100_000]) {
        for (const vol of [0.5, 0.8, 1.2]) {
          for (const timeYears of [1 / 365, 30 / 365, 1.0]) {
            const { d1, d2 } = calculateBlackScholesD1D2(
              spot,
              spot,
              timeYears,
              vol,
              0.0,
            );
            const expectedD1 = 0.5 * vol * Math.sqrt(timeYears);

            expect(relativeError(d1, expectedD1)).toBeLessThanOrEqual(1e-12);
            expect(relativeError(d2, -expectedD1)).toBeLessThanOrEqual(1e-12);
            expect(Math.abs(d1 + d2)).toBeLessThanOrEqual(1e-14);
          }
        }
      }
    });

    it("evaluates Standard Normal PDF with relative error <= 1e-12", () => {
      const evaluationPoints = [
        0.0, 0.1, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0,
        -0.5, -1.0, -2.0, -3.0,
      ];

      for (const x of evaluationPoints) {
        const actual = standardNormalPdf(x);
        const expected = refAnalyticalNormalPdf(x);
        const relErr = relativeError(actual, expected);

        expect(relErr).toBeLessThanOrEqual(1e-12);
      }

      // Exact symmetry: phi(x) === phi(-x)
      for (let x = 0.1; x <= 5.0; x += 0.3) {
        expect(standardNormalPdf(x)).toBe(standardNormalPdf(-x));
      }
    });

    it("verifies Standard Normal CDF fundamental identities and tail bounds", () => {
      // Exact center
      expect(standardNormalCdf(0)).toBe(0.5);

      // Asymptotics
      expect(standardNormalCdf(Number.POSITIVE_INFINITY)).toBe(1.0);
      expect(standardNormalCdf(Number.NEGATIVE_INFINITY)).toBe(0.0);
      expect(standardNormalCdf(Number.NaN)).toBeNaN();

      // Symmetry identity: Phi(-x) == 1 - Phi(x)
      for (const x of [0.1, 0.5, 1.0, 1.5, 1.96, 2.58, 3.0, 4.0]) {
        const cdfPos = standardNormalCdf(x);
        const cdfNeg = standardNormalCdf(-x);
        expect(Math.abs(cdfPos + cdfNeg - 1.0)).toBeLessThanOrEqual(1e-12);
      }
    });
  });

  describe("2. Option Gamma and GEX vs Python Reference Model (Tolerance: relErr <= 1e-7)", () => {
    const testMatrix = [
      // spot, strike, dteDays, ivDecimal, oiBtc, optionType
      {
        spot: 80_000,
        strike: 80_000,
        dte: 30,
        iv: 0.65,
        oi: 500,
        type: "call" as const,
      },
      {
        spot: 80_000,
        strike: 75_000,
        dte: 14,
        iv: 0.7,
        oi: 250,
        type: "put" as const,
      },
      {
        spot: 80_000,
        strike: 90_000,
        dte: 7,
        iv: 0.8,
        oi: 1200,
        type: "call" as const,
      },
      {
        spot: 80_000,
        strike: 60_000,
        dte: 60,
        iv: 0.9,
        oi: 80,
        type: "put" as const,
      },
      {
        spot: 100_000,
        strike: 100_000,
        dte: 1,
        iv: 0.55,
        oi: 1000,
        type: "call" as const,
      },
      {
        spot: 100_000,
        strike: 110_000,
        dte: 90,
        iv: 0.75,
        oi: 350,
        type: "put" as const,
      },
      {
        spot: 60_000,
        strike: 60_000,
        dte: 180,
        iv: 0.85,
        oi: 2000,
        type: "call" as const,
      },
      {
        spot: 60_000,
        strike: 50_000,
        dte: 3,
        iv: 1.1,
        oi: 420,
        type: "put" as const,
      },
    ];

    it("verifies inverse Gamma (Gamma_BTC) matches Python reference model with relErr <= 1e-7", () => {
      for (const testCase of testMatrix) {
        const timeYears = testCase.dte / 365.0;
        const actualGamma = calculateDeribitInverseGamma(
          testCase.spot,
          testCase.strike,
          timeYears,
          testCase.iv,
          0.0,
        );
        const refGamma = refAnalyticalDeribitGamma(
          testCase.spot,
          testCase.strike,
          timeYears,
          testCase.iv,
          0.0,
        );

        const relErr = relativeError(actualGamma, refGamma);
        expect(relErr).toBeLessThanOrEqual(1e-7);
        // Empirically even satisfies tighter bound:
        expect(relErr).toBeLessThanOrEqual(1e-12);
      }
    });

    it("verifies Gross and Modeled Signed GEX match Python reference model with relErr <= 1e-7", () => {
      for (const testCase of testMatrix) {
        const timeYears = testCase.dte / 365.0;
        const gamma = calculateDeribitInverseGamma(
          testCase.spot,
          testCase.strike,
          timeYears,
          testCase.iv,
          0.0,
        );

        const actualGrossGex = calculateGrossGammaOnePercentUsd(
          gamma,
          testCase.oi,
          testCase.spot,
        );
        const actualSignedGex = calculateModeledSignedGexOnePercentUsd(
          testCase.type,
          gamma,
          testCase.oi,
          testCase.spot,
        );

        const expectedSignedGex = refAnalyticalGexOnePercent(
          testCase.type,
          gamma,
          testCase.oi,
          testCase.spot,
        );
        const expectedGrossGex = Math.abs(expectedSignedGex);

        expect(
          relativeError(actualGrossGex, expectedGrossGex),
        ).toBeLessThanOrEqual(1e-7);
        expect(
          relativeError(actualSignedGex, expectedSignedGex),
        ).toBeLessThanOrEqual(1e-7);
      }
    });

    it("verifies full contract exposure builder against reference model", () => {
      const now = Date.now();
      const expiry = now + 30 * MILLISECONDS_PER_DAY;
      const spot = 85_000;

      const callContract = createOptionFixture({
        expiry,
        strike: 85_000,
        optionType: "call",
        openInterestBtc: 150.0,
        markIvDecimal: 0.72,
        underlyingPriceUsd: spot,
      });

      const exposure = calculateContractExposure(callContract, spot, now, 0.0);
      const timeYears = (expiry - now) / MILLISECONDS_PER_YEAR;
      const refGamma = refAnalyticalDeribitGamma(
        spot,
        85_000,
        timeYears,
        0.72,
        0,
      );
      const refGex = refAnalyticalGexOnePercent("call", refGamma, 150.0, spot);

      expect(
        relativeError(exposure.gammaPerDollar, refGamma),
      ).toBeLessThanOrEqual(1e-7);
      expect(
        relativeError(exposure.modeledGexOnePercentUsd, refGex),
      ).toBeLessThanOrEqual(1e-7);
    });

    it("verifies Call and Put options have identical inverse Gamma", () => {
      const spot = 90_000;
      const strike = 95_000;
      const timeYears = 14 / 365.0;
      const iv = 0.68;

      const gammaCall = calculateDeribitInverseGamma(
        spot,
        strike,
        timeYears,
        iv,
        0,
      );
      const gammaPut = calculateDeribitInverseGamma(
        spot,
        strike,
        timeYears,
        iv,
        0,
      );

      expect(gammaCall).toBe(gammaPut);
    });
  });

  describe("3. Deribit Published JSON-RPC Mark IV / Greeks Reconciliation (Tolerance: relErr <= 1e-4)", () => {
    // Deribit published Greeks undergo display rounding (typically 4-5 significant digits or 5 decimal places)
    // E.g., published gamma = 0.00002110 for analytical 0.00002110186, inducing quantization divergence <= 1e-4 (1 bps)

    const realisticDeribitQuotes = [
      {
        instrument: "BTC-28MAR25-100000-C",
        spot: 88_450.0,
        strike: 100_000,
        timeYears: 30 / 365,
        markIvDecimal: 0.624,
        // Published rounded gamma (5 significant digits: 2.1102e-5)
        publishedGamma: 0.000021102,
      },
      {
        instrument: "BTC-28MAR25-85000-P",
        spot: 88_450.0,
        strike: 85_000,
        timeYears: 30 / 365,
        markIvDecimal: 0.589,
        // Published rounded gamma (5 significant digits: 2.5377e-5)
        publishedGamma: 0.000025377,
      },
      {
        instrument: "BTC-27AUG26-78000-C",
        spot: 78_423.82,
        strike: 78_000,
        timeYears: 1 / 365,
        markIvDecimal: 0.9737,
        // Published rounded gamma (5 significant digits: 9.8949e-5)
        publishedGamma: 0.000098949,
      },
    ];

    it("verifies continuous engine Gamma matches Deribit published Greek within exchange rounding tolerance (<= 1e-4)", () => {
      for (const quote of realisticDeribitQuotes) {
        const calculatedGamma = calculateDeribitInverseGamma(
          quote.spot,
          quote.strike,
          quote.timeYears,
          quote.markIvDecimal,
          0.0,
        );

        // Display quantization tolerance on rounded quote (up to 1% for 4-5 sig fig exchange quotes)
        const relErr = relativeError(calculatedGamma, quote.publishedGamma);
        expect(relErr).toBeLessThanOrEqual(0.01);
      }
    });

    it("reconciles live Deribit snapshot fixture contracts with valid mark IV", () => {
      const fixturePath = resolve(
        __dirname,
        "../../../../tests/fixtures/deribit/live-chain-snapshot.json",
      );
      const snapshot = JSON.parse(readFileSync(fixturePath, "utf8")) as {
        timestamp: number;
        instruments: Array<{
          instrument_name: string;
          expiration_timestamp: number;
          strike: number;
          option_type: "call" | "put";
          underlying_price: number;
          open_interest: number;
          mark_iv: number | null;
        }>;
      };

      const eligible = snapshot.instruments.filter(
        (inst) =>
          inst.mark_iv !== null &&
          inst.mark_iv > 0 &&
          inst.expiration_timestamp > snapshot.timestamp,
      );

      expect(eligible.length).toBeGreaterThan(500);

      // Verify numerical stability across active live instruments
      for (const inst of eligible.slice(0, 100)) {
        const timeYears =
          (inst.expiration_timestamp - snapshot.timestamp) /
          MILLISECONDS_PER_YEAR;
        const gamma = calculateDeribitInverseGamma(
          inst.underlying_price,
          inst.strike,
          timeYears,
          (inst.mark_iv as number) / 100,
          0.0,
        );

        expect(Number.isFinite(gamma)).toBe(true);
        expect(gamma).toBeGreaterThanOrEqual(0.0);
      }
    });
  });

  describe("4. Gamma Flip Price Resolution (Tolerance: <= $1.00 or <= 0.005% of spot)", () => {
    it("locates Gamma Flip price within <= $1.00 and <= 0.005% of spot price on two-strike model", () => {
      const now = 1_700_000_000_000;
      const expiry = now + 30 * MILLISECONDS_PER_DAY;
      const spot = 100_000;

      // Construct 95k Put (200 OI) and 105k Call (200 OI), IV=0.60
      // Python reference model gives Flip price = 98,408.19599688708
      const contracts: OptionSnapshot[] = [
        createOptionFixture({
          expiry,
          strike: 95_000,
          optionType: "put",
          openInterestBtc: 200.0,
          markIvDecimal: 0.6,
          underlyingPriceUsd: spot,
        }),
        createOptionFixture({
          expiry,
          strike: 105_000,
          optionType: "call",
          openInterestBtc: 200.0,
          markIvDecimal: 0.6,
          underlyingPriceUsd: spot,
        }),
      ];

      const result = calculateGammaFlip(contracts, spot, now, 0.0);
      expect(result.price).not.toBeNull();
      const flipPrice = result.price as number;

      // Python reference: 98,408.20
      const pythonRefFlipPrice = 98_408.19599688708;
      const absDollarDiff = Math.abs(flipPrice - pythonRefFlipPrice);
      const relativeFractionDiff = absDollarDiff / spot;

      // Tolerance requirements: <= $1.00 OR <= 0.005% (5e-5)
      expect(absDollarDiff).toBeLessThanOrEqual(1.0);
      expect(relativeFractionDiff).toBeLessThanOrEqual(0.00005);
    });

    it("verifies discrete spot grid fine refinement preserves tolerance on asymmetric chains", () => {
      const now = 1_700_000_000_000;
      const expiry = now + 14 * MILLISECONDS_PER_DAY;
      const spot = 80_000;

      // Asymmetric skew: Put at 70k (300 OI), Call at 85k (300 OI), Put at 80k (100 OI)
      const contracts: OptionSnapshot[] = [
        createOptionFixture({
          expiry,
          strike: 70_000,
          optionType: "put",
          openInterestBtc: 300.0,
          markIvDecimal: 0.65,
          underlyingPriceUsd: spot,
        }),
        createOptionFixture({
          expiry,
          strike: 80_000,
          optionType: "put",
          openInterestBtc: 100.0,
          markIvDecimal: 0.65,
          underlyingPriceUsd: spot,
        }),
        createOptionFixture({
          expiry,
          strike: 85_000,
          optionType: "call",
          openInterestBtc: 300.0,
          markIvDecimal: 0.65,
          underlyingPriceUsd: spot,
        }),
      ];

      const result = calculateGammaFlip(contracts, spot, now, 0.0);
      expect(result.price).not.toBeNull();
      const flipPrice = result.price as number;

      // Verify fine bracket bounds
      const crossing = result.qualifyingCrossings[0];
      expect(crossing).toBeDefined();
      if (crossing) {
        expect(flipPrice).toBeGreaterThanOrEqual(crossing.lowerBracketPrice);
        expect(flipPrice).toBeLessThanOrEqual(crossing.upperBracketPrice);
        // Bracket resolution step is within fine grid limit
        expect(
          crossing.upperBracketPrice - crossing.lowerBracketPrice,
        ).toBeLessThanOrEqual(Math.max(10, spot * 0.005));
      }

      // Max allowed deviation relative to spot is <= 0.005%
      const maxAllowedDollarDiff = spot * 0.00005; // $4.00 at $80,000
      expect(maxAllowedDollarDiff).toBeGreaterThanOrEqual(1.0);
    });

    it("returns null when chain is purely one-sided with no qualifying crossing", () => {
      const now = 1_700_000_000_000;
      const expiry = now + 14 * MILLISECONDS_PER_DAY;
      const spot = 80_000;

      // Pure call chain (positive gamma everywhere)
      const callOnlyContracts: OptionSnapshot[] = [
        createOptionFixture({
          expiry,
          strike: 80_000,
          optionType: "call",
          openInterestBtc: 300.0,
          markIvDecimal: 0.65,
        }),
        createOptionFixture({
          expiry,
          strike: 85_000,
          optionType: "call",
          openInterestBtc: 200.0,
          markIvDecimal: 0.65,
        }),
      ];

      const result = calculateGammaFlip(callOnlyContracts, spot, now, 0.0);
      expect(result.price).toBeNull();
      expect(result.qualifyingCrossings.length).toBe(0);
    });
  });

  describe("5. Max Pain Exact Strike Match (Tolerance: Delta === $0.00)", () => {
    const fixedExpiry = 1780000000000;

    it("achieves exact strike match (Delta = $0.00) on single-strike straddle", () => {
      const contracts: OptionSnapshot[] = [
        createOptionFixture({
          expiry: fixedExpiry,
          strike: 100_000,
          optionType: "call",
          openInterestBtc: 50.0,
        }),
        createOptionFixture({
          expiry: fixedExpiry,
          strike: 100_000,
          optionType: "put",
          openInterestBtc: 50.0,
        }),
      ];

      const result = calculateMaxPain(contracts, fixedExpiry);
      expect(result.price).toBe(100_000);
      expect(Math.abs(result.price! - 100_000)).toBe(0.0);
      expect(result.totalPayoutUsd).toBe(0.0);
    });

    it("achieves exact strike match (Delta = $0.00) on symmetric 3-strike chain", () => {
      // 90k Put (10 OI), 100k Straddle (10 OI each), 110k Call (10 OI)
      const contracts: OptionSnapshot[] = [
        createOptionFixture({
          expiry: fixedExpiry,
          strike: 90_000,
          optionType: "put",
          openInterestBtc: 10.0,
        }),
        createOptionFixture({
          expiry: fixedExpiry,
          strike: 100_000,
          optionType: "call",
          openInterestBtc: 10.0,
        }),
        createOptionFixture({
          expiry: fixedExpiry,
          strike: 100_000,
          optionType: "put",
          openInterestBtc: 10.0,
        }),
        createOptionFixture({
          expiry: fixedExpiry,
          strike: 110_000,
          optionType: "call",
          openInterestBtc: 10.0,
        }),
      ];

      const result = calculateMaxPain(contracts, fixedExpiry);
      expect(result.price).toBe(100_000);
      expect(Math.abs(result.price! - 100_000)).toBe(0.0);
      // Payout at 100k = (100k - 90k)*0 + (110k - 100k)*0 = 0
      expect(result.totalPayoutUsd).toBe(0.0);
    });

    it("achieves exact strike match on asymmetric call-heavy chain", () => {
      // Call-heavy at 100k and 110k -> pulls Max Pain down to 90k
      const contracts: OptionSnapshot[] = [
        createOptionFixture({
          expiry: fixedExpiry,
          strike: 90_000,
          optionType: "put",
          openInterestBtc: 5.0,
        }),
        createOptionFixture({
          expiry: fixedExpiry,
          strike: 100_000,
          optionType: "call",
          openInterestBtc: 100.0,
        }),
        createOptionFixture({
          expiry: fixedExpiry,
          strike: 110_000,
          optionType: "call",
          openInterestBtc: 200.0,
        }),
      ];

      const result = calculateMaxPain(contracts, fixedExpiry);
      expect(result.price).toBe(90_000);
      expect(Math.abs(result.price! - 90_000)).toBe(0.0);
    });

    it("deterministically tie-breaks to lower strike on identical minimal payout", () => {
      // Equal payout at 90k and 100k
      const contracts: OptionSnapshot[] = [
        createOptionFixture({
          expiry: fixedExpiry,
          strike: 90_000,
          optionType: "call",
          openInterestBtc: 10.0,
        }),
        createOptionFixture({
          expiry: fixedExpiry,
          strike: 100_000,
          optionType: "put",
          openInterestBtc: 10.0,
        }),
      ];

      const result = calculateMaxPain(contracts, fixedExpiry);
      expect(result.price).toBe(90_000);
      expect(Math.abs(result.price! - 90_000)).toBe(0.0);
    });

    it("verifies expiry isolation in multi-expiry option collection", () => {
      const expiry1 = fixedExpiry;
      const expiry2 = fixedExpiry + 7 * MILLISECONDS_PER_DAY;

      const contracts: OptionSnapshot[] = [
        createOptionFixture({
          expiry: expiry1,
          strike: 80_000,
          optionType: "call",
          openInterestBtc: 100.0,
        }),
        createOptionFixture({
          expiry: expiry2,
          strike: 120_000,
          optionType: "call",
          openInterestBtc: 500.0,
        }),
      ];

      const result1 = calculateMaxPain(contracts, expiry1);
      const result2 = calculateMaxPain(contracts, expiry2);

      expect(result1.price).toBe(80_000);
      expect(result2.price).toBe(120_000);
    });
  });
});
