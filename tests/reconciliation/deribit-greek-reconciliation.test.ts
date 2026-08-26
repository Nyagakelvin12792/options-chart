import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  parseDeribitSnapshot,
  DeribitConsolidatedSnapshotSchema,
} from "../../packages/market-data/src";
import {
  calculateBlackScholesD1D2,
  calculateContractExposure,
  calculateDeribitInverseGamma,
  calculateGrossGammaOnePercentUsd,
  calculateModeledSignedGexOnePercentUsd,
  calculateTimeToExpiryYears,
  standardNormalCdf,
} from "../../packages/options-engine/src";

interface ContractPair {
  call?: (typeof liveData.instruments)[number];
  put?: (typeof liveData.instruments)[number];
}

const fixturePath = resolve(
  __dirname,
  "../fixtures/deribit/live-chain-snapshot.json",
);
const rawFixture = JSON.parse(readFileSync(fixturePath, "utf8"));
const liveData = DeribitConsolidatedSnapshotSchema.parse(rawFixture);
const domainChain = parseDeribitSnapshot(liveData, liveData.timestamp);

describe("M4.8 Deribit Greek Reconciliation Suite (956 Live Contracts)", () => {
  it("loads and parses all 956 active contracts with complete metadata", () => {
    expect(liveData.schema_version).toBe("m0.5-deribit-snapshot-v1");
    expect(liveData.instruments).toHaveLength(956);
    expect(domainChain.instruments).toHaveLength(956);

    const calls = liveData.instruments.filter((i) => i.option_type === "call");
    const puts = liveData.instruments.filter((i) => i.option_type === "put");

    expect(calls).toHaveLength(478);
    expect(puts).toHaveLength(478);

    const totalOi = liveData.instruments.reduce(
      (sum, i) => sum + i.open_interest,
      0,
    );
    expect(totalOi).toBeCloseTo(432229.4, 1);
  });

  it("computes Black-Scholes Greeks within theoretical bounds for all 956 contracts", () => {
    let validCount = 0;

    for (let i = 0; i < liveData.instruments.length; i++) {
      const inst = liveData.instruments[i]!;
      const domainInst = domainChain.instruments[i]!;
      const spot = inst.underlying_price;
      const strike = inst.strike;
      const ivDecimal = inst.mark_iv! / 100;
      const timeYears = calculateTimeToExpiryYears(
        inst.expiration_timestamp,
        liveData.timestamp,
      )!;
      const rate = inst.interest_rate ?? 0;

      expect(timeYears).toBeGreaterThan(0);
      expect(ivDecimal).toBeGreaterThan(0);
      expect(spot).toBeGreaterThan(0);
      expect(strike).toBeGreaterThan(0);

      const { d1, d2 } = calculateBlackScholesD1D2(
        spot,
        strike,
        timeYears,
        ivDecimal,
        rate,
      );
      expect(Number.isFinite(d1)).toBe(true);
      expect(Number.isFinite(d2)).toBe(true);

      const gamma = calculateDeribitInverseGamma(
        spot,
        strike,
        timeYears,
        ivDecimal,
        rate,
      );
      expect(gamma).toBeGreaterThan(0);
      expect(Number.isFinite(gamma)).toBe(true);

      const delta =
        inst.option_type === "call"
          ? standardNormalCdf(d1)
          : standardNormalCdf(d1) - 1;

      if (inst.option_type === "call") {
        expect(delta).toBeGreaterThan(0);
        expect(delta).toBeLessThan(1);
      } else {
        expect(delta).toBeGreaterThan(-1);
        expect(delta).toBeLessThan(0);
      }

      const grossGex = calculateGrossGammaOnePercentUsd(
        gamma,
        inst.open_interest,
        spot,
      );
      const signedGex = calculateModeledSignedGexOnePercentUsd(
        inst.option_type,
        gamma,
        inst.open_interest,
        spot,
      );

      expect(grossGex).toBeGreaterThanOrEqual(0);
      if (inst.open_interest > 0) {
        if (inst.option_type === "call") {
          expect(signedGex).toBe(grossGex);
        } else {
          expect(signedGex).toBe(-grossGex);
        }
      } else {
        expect(grossGex).toBe(0);
        expect(Math.abs(signedGex)).toBe(0);
      }

      const exposure = calculateContractExposure(
        domainInst,
        spot,
        liveData.timestamp,
        0,
      );
      expect(exposure.gammaPerDollar).toBeCloseTo(gamma, 12);
      expect(exposure.grossGammaOnePercentUsd).toBeCloseTo(grossGex, 8);
      expect(exposure.modeledGexOnePercentUsd).toBeCloseTo(signedGex, 8);

      validCount++;
    }

    expect(validCount).toBe(956);
  });

  it("reconciles Black-Scholes inverse BTC mark price against exchange quotes within calibrated tolerance", () => {
    let maxAbsDiff = 0;
    let maxRelDiffP01 = 0;
    let withinToleranceCount = 0;

    for (const inst of liveData.instruments) {
      const spot = inst.underlying_price;
      const strike = inst.strike;
      const ivDecimal = inst.mark_iv! / 100;
      const timeYears = calculateTimeToExpiryYears(
        inst.expiration_timestamp,
        liveData.timestamp,
      )!;
      const rate = inst.interest_rate ?? 0;

      const { d1, d2 } = calculateBlackScholesD1D2(
        spot,
        strike,
        timeYears,
        ivDecimal,
        rate,
      );

      let calcBtcPrice = 0;
      if (inst.option_type === "call") {
        calcBtcPrice =
          standardNormalCdf(d1) - (strike / spot) * standardNormalCdf(d2);
      } else {
        calcBtcPrice =
          (strike / spot) * standardNormalCdf(-d2) - standardNormalCdf(-d1);
      }

      const pubBtcPrice = inst.mark_price!;
      const absDiff = Math.abs(calcBtcPrice - pubBtcPrice);
      if (absDiff > maxAbsDiff) maxAbsDiff = absDiff;

      // Absolute error is strictly within 2.5e-5 BTC across the entire chain (956/956)
      expect(absDiff).toBeLessThanOrEqual(2.5e-5);

      // Relative error calibrated tolerances:
      // <= 4e-4 for mark_price >= 0.01 BTC (678 contracts)
      // <= 1e-3 for mark_price >= 0.001 BTC (860 contracts)
      // Extreme OTM contracts bounded by absolute error <= 2.2e-5 BTC due to 8-decimal tick truncation
      if (pubBtcPrice >= 0.01) {
        const relDiff = absDiff / pubBtcPrice;
        if (relDiff > maxRelDiffP01) maxRelDiffP01 = relDiff;
        expect(relDiff).toBeLessThanOrEqual(4e-4);
        withinToleranceCount++;
      } else if (pubBtcPrice >= 0.001) {
        const relDiff = absDiff / pubBtcPrice;
        expect(relDiff).toBeLessThanOrEqual(1e-3);
        withinToleranceCount++;
      } else {
        expect(absDiff).toBeLessThanOrEqual(2.2e-5);
        withinToleranceCount++;
      }
    }

    expect(withinToleranceCount).toBe(956);
    expect(maxAbsDiff).toBeLessThanOrEqual(2.2e-5);
    expect(maxRelDiffP01).toBeLessThanOrEqual(4e-4);
  });

  it("validates that call and put gross gammas match identically at each strike", () => {
    const pairMap = new Map<string, ContractPair>();

    for (const inst of liveData.instruments) {
      const key = `${inst.expiration_timestamp}:${inst.strike}`;
      if (!pairMap.has(key)) {
        pairMap.set(key, {});
      }
      const pair = pairMap.get(key)!;
      if (inst.option_type === "call") {
        pair.call = inst;
      } else {
        pair.put = inst;
      }
    }

    expect(pairMap.size).toBe(478);

    let maxRelDiffIdentical = 0;
    let maxRelDiffSnapshot = 0;

    for (const [, pair] of pairMap.entries()) {
      expect(pair.call).toBeDefined();
      expect(pair.put).toBeDefined();

      const call = pair.call!;
      const put = pair.put!;
      const timeYears = calculateTimeToExpiryYears(
        call.expiration_timestamp,
        liveData.timestamp,
      )!;
      const commonSpot = call.underlying_price;
      const commonIv = call.mark_iv! / 100;
      const callGammaIdentical = calculateDeribitInverseGamma(
        commonSpot,
        call.strike,
        timeYears,
        commonIv,
        0,
      );
      const putGammaIdentical = calculateDeribitInverseGamma(
        commonSpot,
        put.strike,
        timeYears,
        commonIv,
        0,
      );

      const absDiffIdentical = Math.abs(callGammaIdentical - putGammaIdentical);
      const relDiffIdentical =
        absDiffIdentical / Math.max(callGammaIdentical, 1e-15);
      if (relDiffIdentical > maxRelDiffIdentical) {
        maxRelDiffIdentical = relDiffIdentical;
      }

      // Mathematical gamma equality holds to machine precision (< 1e-12)
      expect(relDiffIdentical).toBeLessThanOrEqual(1e-12);

      // 2. Evaluate with snapshot-recorded underlying spot and IV
      const callGammaSnap = calculateDeribitInverseGamma(
        call.underlying_price,
        call.strike,
        timeYears,
        call.mark_iv! / 100,
        call.interest_rate ?? 0,
      );
      const putGammaSnap = calculateDeribitInverseGamma(
        put.underlying_price,
        put.strike,
        timeYears,
        put.mark_iv! / 100,
        put.interest_rate ?? 0,
      );

      const absDiffSnap = Math.abs(callGammaSnap - putGammaSnap);
      const relDiffSnap = absDiffSnap / Math.max(callGammaSnap, 1e-15);
      if (relDiffSnap > maxRelDiffSnapshot) {
        maxRelDiffSnapshot = relDiffSnap;
      }

      // Reconciles within calibrated tolerance <= 1e-3 (max observed 4.42e-4)
      expect(relDiffSnap).toBeLessThanOrEqual(1e-3);
    }

    expect(maxRelDiffIdentical).toBeLessThanOrEqual(1e-12);
    expect(maxRelDiffSnapshot).toBeLessThanOrEqual(5e-4);
  });

  it("validates Put-Call parity and Delta parity across all 478 strike pairs", () => {
    const pairMap = new Map<string, ContractPair>();
    for (const inst of liveData.instruments) {
      const key = `${inst.expiration_timestamp}:${inst.strike}`;
      if (!pairMap.has(key)) pairMap.set(key, {});
      const pair = pairMap.get(key)!;
      if (inst.option_type === "call") pair.call = inst;
      else pair.put = inst;
    }

    let maxDeltaParityDiff = 0;
    let maxPriceParityDiff = 0;

    for (const [, pair] of pairMap.entries()) {
      const call = pair.call!;
      const timeYears = calculateTimeToExpiryYears(
        call.expiration_timestamp,
        liveData.timestamp,
      )!;

      const spot = call.underlying_price;
      const strike = call.strike;
      const ivDecimal = call.mark_iv! / 100;

      const { d1, d2 } = calculateBlackScholesD1D2(
        spot,
        strike,
        timeYears,
        ivDecimal,
        0,
      );

      const deltaCall = standardNormalCdf(d1);
      const deltaPut = standardNormalCdf(d1) - 1;

      // Delta parity: Delta_Call - Delta_Put === 1.0 identically
      const deltaDiff = Math.abs(deltaCall - deltaPut - 1.0);
      if (deltaDiff > maxDeltaParityDiff) maxDeltaParityDiff = deltaDiff;
      expect(deltaDiff).toBeLessThanOrEqual(1e-14);

      // BTC Put-Call parity: C_btc - P_btc === 1 - K/S
      const callPriceBtc =
        standardNormalCdf(d1) - (strike / spot) * standardNormalCdf(d2);
      const putPriceBtc =
        (strike / spot) * standardNormalCdf(-d2) - standardNormalCdf(-d1);

      const expectedParity = 1 - strike / spot;
      const actualParity = callPriceBtc - putPriceBtc;
      const priceDiff = Math.abs(actualParity - expectedParity);
      if (priceDiff > maxPriceParityDiff) maxPriceParityDiff = priceDiff;
      expect(priceDiff).toBeLessThanOrEqual(1e-12);
    }

    expect(maxDeltaParityDiff).toBeLessThanOrEqual(1e-14);
    expect(maxPriceParityDiff).toBeLessThanOrEqual(1e-12);
  });

  it("verifies aggregate chain GEX exposure invariants and summary statistics", () => {
    let totalGrossGex = 0;
    let totalSignedGex = 0;
    let callGrossGex = 0;
    let putGrossGex = 0;

    for (const inst of liveData.instruments) {
      const spot = inst.underlying_price;
      const strike = inst.strike;
      const ivDecimal = inst.mark_iv! / 100;
      const timeYears = calculateTimeToExpiryYears(
        inst.expiration_timestamp,
        liveData.timestamp,
      )!;
      const rate = inst.interest_rate ?? 0;

      const gamma = calculateDeribitInverseGamma(
        spot,
        strike,
        timeYears,
        ivDecimal,
        rate,
      );
      const grossGex = calculateGrossGammaOnePercentUsd(
        gamma,
        inst.open_interest,
        spot,
      );
      const signedGex = calculateModeledSignedGexOnePercentUsd(
        inst.option_type,
        gamma,
        inst.open_interest,
        spot,
      );

      totalGrossGex += grossGex;
      totalSignedGex += signedGex;
      if (inst.option_type === "call") {
        callGrossGex += grossGex;
      } else {
        putGrossGex += grossGex;
      }
    }

    // Chain GEX invariants
    expect(totalGrossGex).toBeCloseTo(callGrossGex + putGrossGex, 4);
    expect(totalSignedGex).toBeCloseTo(callGrossGex - putGrossGex, 4);

    // Exact aggregate figures across 956 contracts
    expect(totalGrossGex).toBeCloseTo(529547329.98, 0);
    expect(totalSignedGex).toBeCloseTo(262334336.73, 0);
    expect(callGrossGex).toBeCloseTo(395940833.35, 0);
    expect(putGrossGex).toBeCloseTo(133606496.62, 0);
  });
});
