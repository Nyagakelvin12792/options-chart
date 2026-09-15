import { describe, expect, it } from "vitest";

import { createOptionFixture } from "../test-fixtures";
import {
  calculateDaysToExpiry,
  calculateTimeToExpiryYears,
  minimumProfileTimeToExpiryMs,
  millisecondsPerDay,
} from "./dte";
import {
  bucketOptionsByExpiry,
  filterOptionsByExpiryScope,
  formatExpiryScope,
  listActiveOptionExpiries,
  resolveExpiryScopeExpiries,
} from "./filters";

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
    [
      "exact expiry",
      { kind: "exact-expiry", expiry: laterExpiry } as const,
      [laterExpiry],
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

  it("uses strict UTC calendar-day boundaries for 0DTE", () => {
    const lateUtc = Date.UTC(2026, 7, 26, 23, 59);
    const sameUtcDayExpiry = lateUtc + 30_000;
    const nextUtcDayExpiry = Date.UTC(2026, 7, 27, 0);
    const boundaryContracts = [sameUtcDayExpiry, nextUtcDayExpiry].map(
      (expiry) =>
        createOptionFixture({
          expiry,
          strike: 100,
          optionType: "call",
          openInterestBtc: 1,
        }),
    );

    expect(
      resolveExpiryScopeExpiries(boundaryContracts, { kind: "0-dte" }, lateUtc),
    ).toEqual([sameUtcDayExpiry]);
  });

  it("lists only active future expiries in stable ascending order", () => {
    const inactive = createOptionFixture({
      expiry: laterExpiry,
      strike: 200,
      optionType: "call",
      openInterestBtc: 1,
      isActive: false,
    });
    const expired = createOptionFixture({
      expiry: now,
      strike: 100,
      optionType: "put",
      openInterestBtc: 1,
    });

    expect(
      listActiveOptionExpiries(
        [inactive, expired, ...contracts, contracts[0]!],
        now,
      ),
    ).toEqual([todayExpiry, thisFridayExpiry, nextFridayExpiry, laterExpiry]);
    expect(
      filterOptionsByExpiryScope(
        [inactive, expired, ...contracts],
        { kind: "exact-expiry", expiry: laterExpiry },
        now,
      ),
    ).toHaveLength(1);
  });

  it("keeps exact-expiry audit labels distinct from legacy custom scopes", () => {
    expect(
      formatExpiryScope({ kind: "exact-expiry", expiry: laterExpiry }),
    ).toBe(`exact-expiry:${laterExpiry}`);
    expect(formatExpiryScope({ kind: "custom", expiry: laterExpiry })).toBe(
      `custom:${laterExpiry}`,
    );
  });

  it("rejects non-finite timestamps and invalid minimum durations", () => {
    expect(() => listActiveOptionExpiries(contracts, Number.NaN)).toThrowError(
      "Calculation time must be a finite timestamp",
    );
    expect(() => listActiveOptionExpiries(contracts, now, -1)).toThrowError(
      "Minimum time to expiry must be finite and non-negative",
    );
    expect(() =>
      resolveExpiryScopeExpiries(
        contracts,
        { kind: "exact-expiry", expiry: Number.POSITIVE_INFINITY },
        now,
      ),
    ).toThrowError("Exact expiry must be a finite timestamp");
  });
});
