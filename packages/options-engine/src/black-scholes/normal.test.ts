import { describe, expect, it } from "vitest";

import { standardNormalCdf, standardNormalPdf } from "./normal";

describe("standard normal distribution helpers", () => {
  it("matches canonical density and distribution values", () => {
    expect(standardNormalPdf(0)).toBeCloseTo(0.3989422804, 10);
    expect(standardNormalCdf(0)).toBe(0.5);
    expect(standardNormalCdf(1.959964)).toBeCloseTo(0.975, 6);
    expect(standardNormalCdf(-1.959964)).toBeCloseTo(0.025, 6);
  });

  it("handles symmetry, tails, and non-finite boundaries", () => {
    expect(standardNormalCdf(-0.75)).toBeCloseTo(
      1 - standardNormalCdf(0.75),
      12,
    );
    expect(standardNormalCdf(Number.POSITIVE_INFINITY)).toBe(1);
    expect(standardNormalCdf(Number.NEGATIVE_INFINITY)).toBe(0);
    expect(standardNormalPdf(Number.POSITIVE_INFINITY)).toBe(0);
    expect(standardNormalCdf(Number.NaN)).toBeNaN();
  });
});
