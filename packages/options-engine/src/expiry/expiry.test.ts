import { describe, expect, it } from "vitest";

import { createOptionFixture } from "../test-fixtures";
import {
  calculateDaysToExpiry,
  calculateTimeToExpiryYears,
  minimumProfileTimeToExpiryMs,
  millisecondsPerDay,
} from "./dte";
import { bucketOptionsByExpiry, filterOptionsByExpiryScope } from "./filters";

const now = Date.UTC(2026, 7, 26, 1);
const todayExpiry = Date.UTC(2026, 7, 26, 8);
const thisFridayExpiry = Date.UTC(2026, 7, 28, 8);
const nextFridayExpiry = Date.UTC(2026, 8, 4, 8);
const laterExpiry = Date.UTC(2026, 9, 30, 8);
const contracts = [
  todayExpiry,
  thisFridayExpiry,
  nextFridayExpiry,
  laterExpiry,
].map((expiry, index) =>
  createOptionFixture({
    expiry,
    strike: 90 + index * 10,
    optionType: index % 2 === 0 ? "call" : "put",
    openInterestBtc: 1,
  }),
);

describe("DTE and expiry scopes", () => {
  it("calculates exact fractional DTE and enforces the 15-minute profile floor", () => {
    expect(calculateDaysToExpiry(now + 1.5 * millisecondsPerDay, now)).toBe(
      1.5,
    );
    expect(minimumProfileTimeToExpiryMs).toBe(900_000);
    expect(
      calculateTimeToExpiryYears(
        now + minimumProfileTimeToExpiryMs - 1,
        now,
        minimumProfileTimeToExpiryMs,
      ),
    ).toBeNull();
    expect(
      calculateTimeToExpiryYears(
        now + minimumProfileTimeToExpiryMs,
        now,
        minimumProfileTimeToExpiryMs,
      ),
    ).not.toBeNull();
  });

  it.each([
    ["0-dte", { kind: "0-dte" } as const, [todayExpiry]],
    ["next expiry", { kind: "next-expiry" } as const, [todayExpiry]],
    ["this Friday", { kind: "this-friday" } as const, [thisFridayExpiry]],
    ["next Friday", { kind: "next-friday" } as const, [nextFridayExpiry]],
    [
      "<=7 DTE",
      { kind: "less-than-or-equal-7-dte" } as const,
      [todayExpiry, thisFridayExpiry],
    ],
    [
      "<=30 DTE",
      { kind: "less-than-or-equal-30-dte" } as const,
      [todayExpiry, thisFridayExpiry, nextFridayExpiry],
    ],
    [
      "all",
      { kind: "all" } as const,
      [todayExpiry, thisFridayExpiry, nextFridayExpiry, laterExpiry],
    ],
    ["custom", { kind: "custom", expiry: laterExpiry } as const, [laterExpiry]],
  ])("selects the %s scope in UTC", (_label, scope, expectedExpiries) => {
    expect(
      filterOptionsByExpiryScope(contracts, scope, now).map(
        ({ instrument }) => instrument.expiry,
      ),
    ).toEqual(expectedExpiries);
  });

  it("aggregates contracts into sorted expiry buckets", () => {
    const buckets = bucketOptionsByExpiry([...contracts].reverse(), now);
    expect(buckets.map(({ expiry }) => expiry)).toEqual([
      todayExpiry,
      thisFridayExpiry,
      nextFridayExpiry,
      laterExpiry,
    ]);
    expect(buckets[0]?.daysToExpiry).toBeCloseTo(7 / 24, 12);
  });
});
