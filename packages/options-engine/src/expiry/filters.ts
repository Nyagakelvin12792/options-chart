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
  | { readonly kind: "exact-expiry"; readonly expiry: number }
  | { readonly kind: "custom"; readonly expiry: number };

const assertFiniteTimestamp = (value: number, name: string): void => {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite timestamp`);
  }
};

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

const getActiveContracts = (
  contracts: readonly OptionSnapshot[],
  calculationTimestamp: number,
): readonly OptionSnapshot[] => {
  assertFiniteTimestamp(calculationTimestamp, "Calculation time");
  return contracts.filter(
    ({ instrument }) =>
      instrument.isActive &&
      Number.isFinite(instrument.expiry) &&
      instrument.expiry > calculationTimestamp,
  );
};

export const listActiveOptionExpiries = (
  contracts: readonly OptionSnapshot[],
  calculationTimestamp: number,
  minimumTimeToExpiryMs = 0,
): readonly number[] => {
  if (!Number.isFinite(minimumTimeToExpiryMs) || minimumTimeToExpiryMs < 0) {
    throw new RangeError(
      "Minimum time to expiry must be finite and non-negative",
    );
  }

  return [
    ...new Set(
      getActiveContracts(contracts, calculationTimestamp)
        .filter(
          ({ instrument }) =>
            instrument.expiry - calculationTimestamp >= minimumTimeToExpiryMs,
        )
        .map(({ instrument }) => instrument.expiry),
    ),
  ].sort((left, right) => left - right);
};

export const resolveExpiryScopeExpiries = (
  contracts: readonly OptionSnapshot[],
  scope: ExpiryScope,
  calculationTimestamp: number,
): readonly number[] => {
  const activeExpiries = listActiveOptionExpiries(
    contracts,
    calculationTimestamp,
  );

  if (scope.kind === "all") {
    return activeExpiries;
  }
  if (scope.kind === "next-expiry") {
    return activeExpiries.slice(0, 1);
  }
  if (scope.kind === "custom" || scope.kind === "exact-expiry") {
    assertFiniteTimestamp(scope.expiry, "Exact expiry");
    return activeExpiries.includes(scope.expiry) ? [scope.expiry] : [];
  }
  if (scope.kind === "0-dte") {
    const dayStart = utcDayStart(calculationTimestamp);
    return activeExpiries.filter(
      (expiry) => expiry >= dayStart && expiry < dayStart + millisecondsPerDay,
    );
  }
  if (scope.kind === "this-friday" || scope.kind === "next-friday") {
    const [start, end] = fridayWindow(
      calculationTimestamp,
      scope.kind === "next-friday" ? 1 : 0,
    );
    return activeExpiries.filter((expiry) => expiry >= start && expiry < end);
  }

  const maximumDte = scope.kind === "less-than-or-equal-7-dte" ? 7 : 30;
  return activeExpiries.filter(
    (expiry) =>
      calculateDaysToExpiry(expiry, calculationTimestamp) <= maximumDte,
  );
};

export const filterOptionsByExpiryScope = (
  contracts: readonly OptionSnapshot[],
  scope: ExpiryScope,
  calculationTimestamp: number,
): readonly OptionSnapshot[] => {
  const activeContracts = getActiveContracts(contracts, calculationTimestamp);
  const selectedExpiries = new Set(
    resolveExpiryScopeExpiries(contracts, scope, calculationTimestamp),
  );

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
  scope.kind === "custom" || scope.kind === "exact-expiry"
    ? `${scope.kind}:${scope.expiry}`
    : scope.kind;
