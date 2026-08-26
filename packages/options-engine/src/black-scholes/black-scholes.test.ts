import { describe, expect, it } from "vitest";

import { calculateBlackScholesD1D2 } from "./d1d2";
import { calculateDeribitInverseGamma } from "./gamma";

describe("Black-Scholes helpers", () => {
  it("calculates the canonical d1, d2, and inverse gamma", () => {
    const result = calculateBlackScholesD1D2(100, 100, 1, 0.2, 0.05);
    expect(result.d1).toBeCloseTo(0.35, 12);
    expect(result.d2).toBeCloseTo(0.15, 12);
    expect(calculateDeribitInverseGamma(100, 100, 1, 0.2, 0.05)).toBeCloseTo(
      0.0187620173,
      9,
    );
  });

  it("remains finite for extreme but valid implied volatility", () => {
    const gamma = calculateDeribitInverseGamma(100_000, 200_000, 1 / 365, 5, 0);
    expect(gamma).toBeGreaterThan(0);
    expect(Number.isFinite(gamma)).toBe(true);
  });

  it("rejects invalid mathematical domains", () => {
    expect(() => calculateBlackScholesD1D2(0, 100, 1, 0.2, 0)).toThrow(
      RangeError,
    );
    expect(() => calculateBlackScholesD1D2(100, 100, 0, 0.2, 0)).toThrow(
      RangeError,
    );
    expect(() => calculateBlackScholesD1D2(100, 100, 1, 0, 0)).toThrow(
      RangeError,
    );
  });
});
