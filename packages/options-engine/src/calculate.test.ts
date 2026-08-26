import { describe, expect, it } from "vitest";

import {
  CALCULATION_ENGINE_VERSION,
  GAMMA_PROFILE_VERSION,
  GEX_MODEL_VERSION,
} from "./version";
import { calculateOptionsMetrics } from "./calculate";
import { minimumProfileTimeToExpiryMs } from "./expiry/dte";
import { calculateOpenInterestWeightedAverageIv } from "./iv/average-iv";
import {
  calculateOpenInterestMetrics,
  calculatePutCallOpenInterestRatio,
} from "./metrics/open-interest";
import { createChainFixture, createOptionFixture } from "./test-fixtures";

describe("aggregate options metrics", () => {
  it("returns null-safe OI and OI-weighted IV metrics", () => {
    const expiry = Date.UTC(2026, 7, 28, 8);
    const contracts = [
      createOptionFixture({
        expiry,
        strike: 90,
        optionType: "call",
        openInterestBtc: 10,
        markIvDecimal: 0.5,
      }),
      createOptionFixture({
        expiry,
        strike: 110,
        optionType: "put",
        openInterestBtc: 20,
        markIvDecimal: 1,
      }),
    ];
    expect(calculateOpenInterestMetrics(contracts)).toMatchObject({
      totalOpenInterestBtc: 30,
      totalCallOpenInterestBtc: 10,
      totalPutOpenInterestBtc: 20,
      putCallOpenInterestRatio: 2,
    });
    expect(calculateOpenInterestWeightedAverageIv(contracts)).toBeCloseTo(
      5 / 6,
      12,
    );
    expect(calculatePutCallOpenInterestRatio(10, 0)).toBeNull();
  });

  it("keeps zero OI valid while returning unavailable aggregates as null", () => {
    const expiry = Date.UTC(2026, 7, 28, 8);
    const zeroOiPut = createOptionFixture({
      expiry,
      strike: 100,
      optionType: "put",
      openInterestBtc: 0,
      markIvDecimal: 3,
    });
    expect(
      calculateOpenInterestMetrics([zeroOiPut]).putCallOpenInterestRatio,
    ).toBeNull();
    expect(calculateOpenInterestWeightedAverageIv([zeroOiPut])).toBeNull();
  });

  it("builds an auditable full-chain result with metric-specific exclusions", () => {
    const now = Date.UTC(2026, 7, 26, 0);
    const expiry = now + 2 * 86_400_000;
    const contracts = [
      createOptionFixture({
        expiry,
        strike: 90,
        optionType: "call",
        openInterestBtc: 10,
        markIvDecimal: 0.5,
      }),
      createOptionFixture({
        expiry,
        strike: 110,
        optionType: "put",
        openInterestBtc: 20,
        markIvDecimal: 1,
      }),
      createOptionFixture({
        expiry,
        strike: 120,
        optionType: "call",
        openInterestBtc: 4,
        markIvDecimal: null,
      }),
      createOptionFixture({
        expiry: now + minimumProfileTimeToExpiryMs - 1,
        strike: 100,
        optionType: "put",
        openInterestBtc: 5,
        markIvDecimal: 0.7,
      }),
    ];
    const result = calculateOptionsMetrics({
      chain: createChainFixture(contracts, now),
      underlyingPriceUsd: 100,
      calculatedAt: now,
      expiryScope: { kind: "all" },
      interestRateFallbackDecimal: 0,
      maxPainExpiry: expiry,
      secondaryLevelCount: 3,
    });

    expect(result.summary.totalOpenInterestBtc).toBe(39);
    expect(result.summary.totalCallOpenInterestBtc).toBe(14);
    expect(result.summary.totalPutOpenInterestBtc).toBe(25);
    expect(result.summary.averageMarkIvDecimal).toBeCloseTo(28.5 / 35, 12);
    expect(result.summary.metadata).toMatchObject({
      calculationEngineVersion: CALCULATION_ENGINE_VERSION,
      gexModelVersion: GEX_MODEL_VERSION,
      gammaProfileVersion: GAMMA_PROFILE_VERSION,
      contractsSeen: 4,
      contractsIncluded: 2,
      excludedCountByReason: {
        missingIv: 1,
        nearExpiryProfileFloor: 1,
      },
      durationMs: 0,
    });
    expect(result.summary.metadata.qualifyingCrossings).toEqual(
      result.qualifyingCrossings,
    );
    expect(result.maxPain?.expiry).toBe(expiry);
    expect(result.maxPain?.metadata.expiryScope).toBe(`expiry:${expiry}`);
    expect(result.gammaProfile[0]?.spotPrice).toBe(70);
    expect(result.gammaProfile.at(-1)?.spotPrice).toBe(130);
  });
});
