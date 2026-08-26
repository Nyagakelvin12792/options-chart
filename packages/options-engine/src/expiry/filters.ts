import type { ExpiryBucket, OptionSnapshot } from "@options-chart/domain";

import { calculateDaysToExpiry, millisecondsPerDay } from "./dte";

export type ExpiryScope =
  | { readonly kind: "0-dte" }
  | { readonly kind: "next-expiry" }
  | { readonly kind: "this-friday" }
  | { readonly kind: "next-friday" }
  | { readonly kind: "less-than-or-equal-7-dte" }
  | { readonly kind: "less-than-or-equal-30-dte" }
  | { readonly kind: "all" }
  | { readonly kind: "custom"; readonly expiry: number };

const utcDayStart = (timestamp: number): number => {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

const fridayWindow = (
  calculationTimestamp: number,
  weekOffset: number,
): readonly [number, number] => {
  const todayStart = utcDayStart(calculationTimestamp);
  const dayOfWeek = new Date(todayStart).getUTCDay();
  const mondayStart = todayStart - ((dayOfWeek + 6) % 7) * millisecondsPerDay;
  const fridayStart = mondayStart + (4 + weekOffset * 7) * millisecondsPerDay;
  return [fridayStart, fridayStart + millisecondsPerDay];
};

const sortContracts = (
  contracts: readonly OptionSnapshot[],
): OptionSnapshot[] =>
  [...contracts].sort(
    (left, right) =>
      left.instrument.expiry - right.instrument.expiry ||
      left.instrument.strike - right.instrument.strike ||
      left.instrument.optionType.localeCompare(right.instrument.optionType) ||
      left.instrument.instrumentName.localeCompare(
        right.instrument.instrumentName,
      ),
  );

export const filterOptionsByExpiryScope = (
  contracts: readonly OptionSnapshot[],
  scope: ExpiryScope,
  calculationTimestamp: number,
): readonly OptionSnapshot[] => {
  const activeContracts = contracts.filter(
    ({ instrument }) =>
      instrument.isActive &&
      Number.isFinite(instrument.expiry) &&
      instrument.expiry > calculationTimestamp,
  );
  const activeExpiries = [
    ...new Set(activeContracts.map(({ instrument }) => instrument.expiry)),
  ].sort((left, right) => left - right);

  let selectedExpiries: ReadonlySet<number>;
  if (scope.kind === "all") {
    selectedExpiries = new Set(activeExpiries);
  } else if (scope.kind === "next-expiry") {
    selectedExpiries = new Set(activeExpiries.slice(0, 1));
  } else if (scope.kind === "custom") {
    selectedExpiries = new Set([scope.expiry]);
  } else if (scope.kind === "0-dte") {
    const dayStart = utcDayStart(calculationTimestamp);
    selectedExpiries = new Set(
      activeExpiries.filter(
        (expiry) =>
          expiry >= dayStart && expiry < dayStart + millisecondsPerDay,
      ),
    );
  } else if (scope.kind === "this-friday" || scope.kind === "next-friday") {
    const [start, end] = fridayWindow(
      calculationTimestamp,
      scope.kind === "next-friday" ? 1 : 0,
    );
    selectedExpiries = new Set(
      activeExpiries.filter((expiry) => expiry >= start && expiry < end),
    );
  } else {
    const maximumDte = scope.kind === "less-than-or-equal-7-dte" ? 7 : 30;
    selectedExpiries = new Set(
      activeExpiries.filter(
        (expiry) =>
          calculateDaysToExpiry(expiry, calculationTimestamp) <= maximumDte,
      ),
    );
  }

  return sortContracts(
    activeContracts.filter(({ instrument }) =>
      selectedExpiries.has(instrument.expiry),
    ),
  );
};

export const bucketOptionsByExpiry = (
  contracts: readonly OptionSnapshot[],
  calculationTimestamp: number,
): readonly ExpiryBucket[] => {
  const buckets = new Map<number, OptionSnapshot[]>();
  for (const contract of contracts) {
    const bucket = buckets.get(contract.instrument.expiry) ?? [];
    bucket.push(contract);
    buckets.set(contract.instrument.expiry, bucket);
  }

  return [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([expiry, expiryContracts]) => ({
      expiry,
      daysToExpiry: calculateDaysToExpiry(expiry, calculationTimestamp),
      contracts: sortContracts(expiryContracts),
    }));
};

export const formatExpiryScope = (scope: ExpiryScope): string =>
  scope.kind === "custom" ? `custom:${scope.expiry}` : scope.kind;
