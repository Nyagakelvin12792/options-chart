import { describe, expect, it } from "vitest";

import {
  aggregateExposureByExpiry,
  aggregateExposureByStrike,
} from "./aggregate";
import {
  calculateGrossGammaOnePercentUsd,
  calculateModeledSignedGexOnePercentUsd,
  type ContractExposure,
} from "./exposure";

const exposure = (
  overrides: Partial<ContractExposure> = {},
): ContractExposure => ({
  instrumentName: "BTC-TEST",
  expiry: 1_800_000_000_000,
  strike: 100_000,
  optionType: "call",
  spotPrice: 100_000,
  openInterestBtc: 10,
  gammaPerDollar: 0.00002,
  grossGammaOnePercentUsd: 20_000,
  modeledGexOnePercentUsd: 20_000,
  ...overrides,
});

describe("Gamma exposure", () => {
  it("uses normalized BTC OI exactly once in the pinned one-percent unit", () => {
    expect(calculateGrossGammaOnePercentUsd(0.00002, 500, 100_000)).toBe(
      1_000_000,
    );
    expect(
      calculateModeledSignedGexOnePercentUsd("call", 0.00002, 500, 100_000),
    ).toBe(1_000_000);
    expect(
      calculateModeledSignedGexOnePercentUsd("put", 0.00002, 500, 100_000),
    ).toBe(-1_000_000);
  });

  it("aggregates by strike side and expiry deterministically", () => {
    const exposures = [
      exposure(),
      exposure({ instrumentName: "BTC-TEST-2", openInterestBtc: 5 }),
      exposure({
        instrumentName: "BTC-TEST-P",
        optionType: "put",
        modeledGexOnePercentUsd: -8_000,
        grossGammaOnePercentUsd: 8_000,
        openInterestBtc: 4,
      }),
    ];
    expect(aggregateExposureByStrike(exposures)).toEqual([
      {
        strike: 100_000,
        optionType: "call",
        openInterestBtc: 15,
        grossGammaOnePercentUsd: 40_000,
        modeledGexOnePercentUsd: 40_000,
      },
      {
        strike: 100_000,
        optionType: "put",
        openInterestBtc: 4,
        grossGammaOnePercentUsd: 8_000,
        modeledGexOnePercentUsd: -8_000,
      },
    ]);
    expect(aggregateExposureByExpiry(exposures)[0]).toMatchObject({
      openInterestBtc: 19,
      grossGammaOnePercentUsd: 48_000,
      modeledGexOnePercentUsd: 32_000,
    });
  });

  it("rejects invalid OI rather than hiding it", () => {
    expect(() => calculateGrossGammaOnePercentUsd(0.1, -1, 100)).toThrow(
      RangeError,
    );
  });
});
