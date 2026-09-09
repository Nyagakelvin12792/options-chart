import type { OptionSnapshot, StrikeExposure } from "@options-chart/domain";
import { describe, expect, it } from "vitest";

import { createOptionFixture } from "../test-fixtures";
import { calculateStaticWallSignals } from "./concentration-walls";
import { selectRawCallWall, selectRawPutWall } from "./walls";

const exposure = (
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

const contract = (
  strike: number,
  optionType: "call" | "put",
  openInterestBtc: number,
  volumeBtc: number | null,
): OptionSnapshot => {
  const fixture = createOptionFixture({
    expiry: Date.UTC(2026, 8, 30, 8),
    strike,
    optionType,
    openInterestBtc,
  });
  return { ...fixture, quote: { ...fixture.quote, volumeBtc } };
};

describe("static wall signals", () => {
  it("keeps guarded call and put wall selection and normalizes every metric", () => {
    const strikeExposures = [
      exposure(90, "put", 60),
      exposure(100, "put", 40),
      exposure(110, "call", 75),
      exposure(120, "call", 25),
    ];
    const contracts = [
      contract(90, "put", 10, 5),
      contract(100, "put", 20, 5),
      contract(100, "call", 30, 10),
      contract(110, "call", 40, 80),
    ];
    const signals = calculateStaticWallSignals({
      strikeExposures,
      contracts,
      currentSpotPrice: 100,
      maxPainPrice: 100,
      gammaFlipPrice: 105,
    });

    expect(signals.map(({ id }) => id)).toEqual([
      "gamma-call",
      "gamma-put",
      "open-interest",
      "volume",
      "max-pain",
      "gamma-flip",
    ]);
    expect(signals.find(({ id }) => id === "gamma-call")).toMatchObject({
      price: selectRawCallWall(strikeExposures, 100)?.strike,
      concentration: 0.75,
      normalizationGroup: "call-gamma",
    });
    expect(signals.find(({ id }) => id === "gamma-put")).toMatchObject({
      price: selectRawPutWall(strikeExposures, 100)?.strike,
      concentration: 0.6,
      normalizationGroup: "put-gamma",
    });
    expect(signals.find(({ id }) => id === "open-interest")).toMatchObject({
      price: 100,
      metricValue: 50,
      metricTotal: 100,
      concentration: 0.5,
    });
    expect(signals.find(({ id }) => id === "volume")).toMatchObject({
      price: 110,
      metricValue: 80,
      metricTotal: 100,
      concentration: 0.8,
    });
    expect(signals.find(({ id }) => id === "max-pain")?.concentration).toBe(1);
    expect(signals.find(({ id }) => id === "gamma-flip")?.concentration).toBe(
      1,
    );
    expect(
      signals.every(
        ({ concentration }) => concentration >= 0 && concentration <= 1,
      ),
    ).toBe(true);
  });

  it("breaks equal metric ties by distance from spot and then lower strike", () => {
    const contracts = [
      contract(90, "call", 10, 4),
      contract(110, "put", 10, 4),
    ];
    const signals = calculateStaticWallSignals({
      strikeExposures: [],
      contracts,
      currentSpotPrice: 100,
      maxPainPrice: null,
      gammaFlipPrice: null,
    });

    expect(signals).toHaveLength(2);
    expect(signals.find(({ kind }) => kind === "open-interest")?.price).toBe(
      90,
    );
    expect(signals.find(({ kind }) => kind === "volume")?.price).toBe(90);
  });

  it("omits unavailable metrics rather than inventing a wall", () => {
    const signals = calculateStaticWallSignals({
      strikeExposures: [],
      contracts: [contract(100, "call", 0, null)],
      currentSpotPrice: 100,
      maxPainPrice: null,
      gammaFlipPrice: null,
    });

    expect(signals).toEqual([]);
  });

  it("rejects invalid spot and singleton prices", () => {
    expect(() =>
      calculateStaticWallSignals({
        strikeExposures: [],
        contracts: [],
        currentSpotPrice: 0,
        maxPainPrice: null,
        gammaFlipPrice: null,
      }),
    ).toThrow(RangeError);
    expect(() =>
      calculateStaticWallSignals({
        strikeExposures: [],
        contracts: [],
        currentSpotPrice: 100,
        maxPainPrice: Number.NaN,
        gammaFlipPrice: null,
      }),
    ).toThrow(RangeError);
  });
});
