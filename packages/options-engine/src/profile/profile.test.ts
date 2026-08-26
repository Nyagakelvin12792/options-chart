import { describe, expect, it } from "vitest";

import { createOptionFixture } from "../test-fixtures";
import { calculateGammaFlip, selectHeadlineGammaFlip } from "./gamma-flip";
import { calculateGammaProfile } from "./gamma-profile";
import { generateSpotGrid } from "./spot-grid";
import { findZeroCrossings } from "./zero-crossing";

describe("Gamma profile and flip", () => {
  it("builds a bounded 0.7x to 1.3x coarse spot grid", () => {
    const grid = generateSpotGrid(100_000);
    expect(grid[0]).toBe(70_000);
    expect(grid.at(-1)).toBe(130_000);
    expect(grid).toContain(100_000);
    expect(grid[1]! - grid[0]!).toBe(500);
  });

  it("interpolates every qualifying sign change and applies the lower tie-break", () => {
    const crossings = findZeroCrossings(
      [
        { spotPrice: 50, modeledGexOnePercentUsd: -10 },
        { spotPrice: 100, modeledGexOnePercentUsd: 10 },
        { spotPrice: 150, modeledGexOnePercentUsd: -10 },
        { spotPrice: 200, modeledGexOnePercentUsd: 10 },
      ],
      100,
    );
    expect(crossings.map(({ price }) => price)).toEqual([75, 125, 175]);
    expect(selectHeadlineGammaFlip(crossings)?.price).toBe(75);
    expect(crossings).toHaveLength(3);
  });

  it("rejects insignificant sign changes and no-crossing profiles", () => {
    expect(
      findZeroCrossings(
        [
          { spotPrice: 90, modeledGexOnePercentUsd: 1_000 },
          { spotPrice: 95, modeledGexOnePercentUsd: 1 },
          { spotPrice: 100, modeledGexOnePercentUsd: -1 },
          { spotPrice: 105, modeledGexOnePercentUsd: -1_000 },
        ],
        100,
      ),
    ).toEqual([]);
    expect(
      findZeroCrossings(
        [
          { spotPrice: 90, modeledGexOnePercentUsd: 10 },
          { spotPrice: 110, modeledGexOnePercentUsd: 20 },
        ],
        100,
      ),
    ).toEqual([]);
  });

  it("calculates a sticky-IV profile and returns no forced crossing", () => {
    const now = Date.UTC(2026, 7, 26);
    const contract = createOptionFixture({
      expiry: now + 30 * 86_400_000,
      strike: 100,
      optionType: "call",
      openInterestBtc: 10,
      markIvDecimal: 0.8,
    });
    const profile = calculateGammaProfile([contract], 100, now, 0);
    expect(profile).toHaveLength(3);
    expect(
      profile.every(
        ({ modeledGexOnePercentUsd }) => modeledGexOnePercentUsd > 0,
      ),
    ).toBe(true);
    const flip = calculateGammaFlip([contract], 100, now, 0);
    expect(flip.price).toBeNull();
    expect(flip.qualifyingCrossings).toEqual([]);
  });
});
