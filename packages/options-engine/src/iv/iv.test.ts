import { describe, expect, it } from "vitest";

import { createOptionFixture } from "../test-fixtures";
import {
  calculateCallPutOpenInterestWeightedMarkIv,
  calculateOpenInterestWeightedAverageIv,
  calculateOpenInterestWeightedMarkIv,
} from "./average-iv";
import { calculateNearForwardAtmIv } from "./atm-iv";
import { calculateIvTermStructure } from "./term-structure";

const now = Date.UTC(2026, 8, 10, 7);
const nearExpiry = Date.UTC(2026, 8, 10, 8);
const farExpiry = Date.UTC(2026, 8, 11, 8);

const option = (
  overrides: Partial<Parameters<typeof createOptionFixture>[0]> = {},
) =>
  createOptionFixture({
    expiry: nearExpiry,
    strike: 100,
    optionType: "call",
    openInterestBtc: 10,
    markIvDecimal: 0.5,
    underlyingPriceUsd: 100,
    ...overrides,
  });

describe("implied-volatility primitives", () => {
  it("returns an auditable OI-weighted mark IV without changing the legacy value", () => {
    const contracts = [
      option({ openInterestBtc: 10, markIvDecimal: 0.5 }),
      option({ openInterestBtc: 30, markIvDecimal: 0.8, strike: 110 }),
      option({ openInterestBtc: 0, markIvDecimal: 2, strike: 120 }),
      option({ openInterestBtc: -1, markIvDecimal: 0.6, strike: 130 }),
      option({ openInterestBtc: 5, markIvDecimal: null, strike: 140 }),
      option({ openInterestBtc: 5, markIvDecimal: 0, strike: 150 }),
    ];

    expect(calculateOpenInterestWeightedMarkIv(contracts)).toEqual({
      averageMarkIvDecimal: 0.725,
      contractsSeen: 6,
      contractsEligible: 2,
      eligibleOpenInterestBtc: 40,
      excludedCountByReason: {
        zeroOpenInterest: 1,
        invalidOpenInterest: 1,
        missingIv: 1,
        invalidIv: 1,
      },
    });
    expect(calculateOpenInterestWeightedAverageIv(contracts)).toBe(0.725);
  });

  it("returns null with explicit eligibility when no positive OI can contribute", () => {
    expect(
      calculateOpenInterestWeightedMarkIv([
        option({ openInterestBtc: 0 }),
        option({ openInterestBtc: 1, markIvDecimal: null, strike: 110 }),
      ]),
    ).toEqual({
      averageMarkIvDecimal: null,
      contractsSeen: 2,
      contractsEligible: 0,
      eligibleOpenInterestBtc: 0,
      excludedCountByReason: { zeroOpenInterest: 1, missingIv: 1 },
    });
  });

  it("calculates separate OI-weighted call and put IV", () => {
    const result = calculateCallPutOpenInterestWeightedMarkIv([
      option({ optionType: "call", openInterestBtc: 10, markIvDecimal: 0.5 }),
      option({
        optionType: "call",
        openInterestBtc: 20,
        markIvDecimal: 0.8,
        strike: 110,
      }),
      option({ optionType: "put", openInterestBtc: 5, markIvDecimal: 1 }),
    ]);

    expect(result.call.averageMarkIvDecimal).toBeCloseTo(0.7, 12);
    expect(result.call.eligibleOpenInterestBtc).toBe(30);
    expect(result.put.averageMarkIvDecimal).toBe(1);
    expect(result.put.eligibleOpenInterestBtc).toBe(5);
  });

  it("uses the nearest forward strike and requires a complete call/put pair", () => {
    const contracts = [
      option({ strike: 90, optionType: "call", markIvDecimal: 0.4 }),
      option({ strike: 90, optionType: "put", markIvDecimal: 0.5 }),
      option({ strike: 100, optionType: "call", markIvDecimal: 0.6 }),
      option({ strike: 100, optionType: "put", markIvDecimal: 0.8 }),
      option({ strike: 110, optionType: "call", markIvDecimal: 0.9 }),
      option({ strike: 110, optionType: "put", markIvDecimal: 1 }),
    ].map((contract) => ({
      ...contract,
      quote: { ...contract.quote, underlyingPriceUsd: 104 },
    }));

    const result = calculateNearForwardAtmIv(contracts, nearExpiry);
    expect(result).toMatchObject({
      expiry: nearExpiry,
      forwardPriceUsd: 104,
      strike: 100,
      averageMarkIvDecimal: 0.7,
      isCompletePair: true,
      contractsSeenAtExpiry: 6,
      contractsWithEligibleForwardPrice: 6,
    });
    expect(result.call.markIvDecimal).toBe(0.6);
    expect(result.put.markIvDecimal).toBe(0.8);

    const incomplete = calculateNearForwardAtmIv(
      contracts.map((contract) =>
        contract.instrument.strike === 100 &&
        contract.instrument.optionType === "put"
          ? {
              ...contract,
              quote: { ...contract.quote, markIvDecimal: null },
            }
          : contract,
      ),
      nearExpiry,
    );
    expect(incomplete.averageMarkIvDecimal).toBeNull();
    expect(incomplete.isCompletePair).toBe(false);
    expect(incomplete.put.excludedCountByReason).toEqual({ missingIv: 1 });
  });

  it("breaks equidistant strike ties toward the lower strike", () => {
    const result = calculateNearForwardAtmIv(
      [
        option({ strike: 100, optionType: "call", underlyingPriceUsd: 105 }),
        option({ strike: 100, optionType: "put", underlyingPriceUsd: 105 }),
        option({ strike: 110, optionType: "call", underlyingPriceUsd: 105 }),
        option({ strike: 110, optionType: "put", underlyingPriceUsd: 105 }),
      ],
      nearExpiry,
    );

    expect(result.strike).toBe(100);
  });

  it("returns a sorted active per-expiry IV term structure", () => {
    const expired = option({ expiry: now, strike: 80 });
    const inactive = option({
      expiry: farExpiry,
      strike: 120,
      isActive: false,
    });
    const contracts = [
      option({
        expiry: farExpiry,
        optionType: "put",
        markIvDecimal: 0.9,
      }),
      option({
        expiry: farExpiry,
        optionType: "call",
        markIvDecimal: 0.7,
      }),
      option({ optionType: "put", markIvDecimal: 0.6 }),
      option({ optionType: "call", markIvDecimal: 0.4 }),
      inactive,
      expired,
    ];

    const result = calculateIvTermStructure(contracts, now);
    expect(result.map(({ expiry }) => expiry)).toEqual([nearExpiry, farExpiry]);
    expect(result[0]?.daysToExpiry).toBeCloseTo(1 / 24, 12);
    expect(
      result[0]?.openInterestWeightedMarkIv.averageMarkIvDecimal,
    ).toBeCloseTo(0.5, 12);
    expect(result[0]?.nearForwardAtmIv.averageMarkIvDecimal).toBeCloseTo(
      0.5,
      12,
    );
    expect(
      result[1]?.callPutOpenInterestWeightedMarkIv.call.averageMarkIvDecimal,
    ).toBe(0.7);
    expect(
      result[1]?.callPutOpenInterestWeightedMarkIv.put.averageMarkIvDecimal,
    ).toBe(0.9);
  });
});
