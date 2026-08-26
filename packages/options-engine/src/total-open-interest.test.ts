import { describe, expect, it } from "vitest";

import { calculateTotalOpenInterestBtc } from "./total-open-interest";

describe("calculateTotalOpenInterestBtc", () => {
  it("returns a deterministic sum for validated option open interest", () => {
    expect(calculateTotalOpenInterestBtc([42.5, 18.25, 73, 7.5])).toBe(141.25);
  });

  it("rejects invalid open interest instead of hiding it as zero", () => {
    expect(() => calculateTotalOpenInterestBtc([1, Number.NaN])).toThrow(
      RangeError,
    );
    expect(() => calculateTotalOpenInterestBtc([-1])).toThrow(RangeError);
  });
});