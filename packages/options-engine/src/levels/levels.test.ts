import type { StrikeExposure } from "@options-chart/domain";
import { describe, expect, it } from "vitest";

import { calculateMaxPain } from "../max-pain/max-pain";
import { createOptionFixture } from "../test-fixtures";
import { rankSecondaryGexLevels } from "./secondary-gex";
import { selectRawCallWall, selectRawPutWall } from "./walls";

const strikeExposure = (
  strike: number,
  optionType: "call" | "put",
  grossGammaOnePercentUsd: number,
  openInterestBtc = 10,
): StrikeExposure => ({
  strike,
  optionType,
  openInterestBtc,
  grossGammaOnePercentUsd,
  modeledGexOnePercentUsd:
    (optionType === "call" ? 1 : -1) * grossGammaOnePercentUsd,
});

describe("key levels", () => {
  it("selects guarded raw walls and excludes them from secondary ranking", () => {
    const exposures = [
      strikeExposure(80, "call", 20),
      strikeExposure(110, "call", 100),
      strikeExposure(130, "call", 1_000),
      strikeExposure(90, "put", 80),
      strikeExposure(120, "put", 10),
      strikeExposure(100, "call", 50),
      strikeExposure(100, "put", 50),
    ];
    expect(selectRawCallWall(exposures, 100)?.strike).toBe(110);
    expect(selectRawPutWall(exposures, 100)?.strike).toBe(90);
    expect(
      rankSecondaryGexLevels(exposures, new Set([110, 90]), 2).map(
        ({ strike }) => strike,
      ),
    ).toEqual([130, 100]);
  });

  it("returns null when no wall passes the OI and exposure guardrails", () => {
    expect(
      selectRawCallWall([strikeExposure(100, "call", 10, 0.5)], 100),
    ).toBeNull();
  });

  it("calculates expiry-specific Max Pain without requiring IV", () => {
    const expiry = Date.UTC(2026, 7, 28, 8);
    const contracts = [
      createOptionFixture({
        expiry,
        strike: 90,
        optionType: "call",
        openInterestBtc: 10,
        markIvDecimal: null,
      }),
      createOptionFixture({
        expiry,
        strike: 100,
        optionType: "call",
        openInterestBtc: 10,
      }),
      createOptionFixture({
        expiry,
        strike: 100,
        optionType: "put",
        openInterestBtc: 10,
      }),
      createOptionFixture({
        expiry,
        strike: 110,
        optionType: "put",
        openInterestBtc: 10,
        markIvDecimal: null,
      }),
      createOptionFixture({
        expiry: expiry + 86_400_000,
        strike: 200,
        optionType: "put",
        openInterestBtc: 1_000,
      }),
    ];
    const result = calculateMaxPain(contracts, expiry);
    expect(result.price).toBe(100);
    expect(result.totalPayoutUsd).toBe(200);
    expect(result.contractsIncluded).toBe(4);
  });
});
