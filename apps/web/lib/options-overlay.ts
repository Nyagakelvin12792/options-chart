import type {
  OptionsChainSnapshot,
  OptionSnapshot,
  OptionType,
} from "@options-chart/domain";
import {
  filterOptionsByExpiryScope,
  millisecondsPerDay,
  minimumProfileTimeToExpiryMs,
  type ExpiryScope,
} from "@options-chart/options-engine";

export const EXPIRY_SCOPE_OPTIONS = [
  { label: "0DTE", kind: "0-dte" },
  { label: "Next Expiry", kind: "next-expiry" },
  { label: "This Friday", kind: "this-friday" },
  { label: "Next Friday", kind: "next-friday" },
  { label: "<= 7 DTE", kind: "less-than-or-equal-7-dte" },
  { label: "<= 30 DTE", kind: "less-than-or-equal-30-dte" },
  { label: "All Expiries", kind: "all" },
  { label: "Custom", kind: "custom" },
] as const;

export type ExpiryScopeKind = (typeof EXPIRY_SCOPE_OPTIONS)[number]["kind"];

const utcFriday = (now: number, weekOffset: number): number => {
  const date = new Date(now);
  const dayStart = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  const dayOfWeek = date.getUTCDay();
  const monday = dayStart - ((dayOfWeek + 6) % 7) * millisecondsPerDay;
  return monday + (4 + weekOffset * 7) * millisecondsPerDay + 16 * 3_600_000;
};

export const listActiveExpiries = (
  chain: OptionsChainSnapshot,
  now: number,
): readonly number[] =>
  [...new Set(chain.instruments.map(({ instrument }) => instrument.expiry))]
    .filter((expiry) => expiry - now >= minimumProfileTimeToExpiryMs)
    .sort((left, right) => left - right);

const DERIBIT_MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

export const formatDeribitExpiryDate = (expiry: number): string => {
  const date = new Date(expiry);
  const month = DERIBIT_MONTHS[date.getUTCMonth()];
  if (!Number.isFinite(expiry) || !month) return "INVALID EXPIRY";
  const day = String(date.getUTCDate()).padStart(2, "0");
  const year = String(date.getUTCFullYear()).slice(-2);
  return `${day} ${month} ${year}`;
};

export const createExpiryScope = (
  kind: ExpiryScopeKind,
  customExpiry: number | null,
): ExpiryScope =>
  kind === "custom"
    ? { kind, expiry: customExpiry ?? 0 }
    : ({ kind } as ExpiryScope);

export const selectMaxPainExpiry = (
  chain: OptionsChainSnapshot,
  scope: ExpiryScope,
  now: number,
): number | null =>
  filterOptionsByExpiryScope(chain.instruments, scope, now)
    .map(({ instrument }) => instrument.expiry)
    .sort((left, right) => left - right)[0] ?? null;

const createFallbackContract = (
  spot: number,
  expiry: number,
  strike: number,
  optionType: OptionType,
  expiryIndex: number,
  strikeIndex: number,
  now: number,
): OptionSnapshot => {
  const distance = Math.abs(strike / spot - 1);
  const callConcentration = optionType === "call" && strikeIndex >= 4 ? 38 : 0;
  const putConcentration = optionType === "put" && strikeIndex <= 2 ? 42 : 0;
  const openInterestBtc =
    12 +
    expiryIndex * 3 +
    (6 - Math.abs(3 - strikeIndex)) * 4 +
    callConcentration +
    putConcentration;
  const volumeBtc =
    2 +
    expiryIndex * 0.75 +
    Math.max(0, 4 - Math.abs(3 - strikeIndex)) * 1.5 +
    (callConcentration + putConcentration) * 0.18;
  const instrumentName = `BTC-FALLBACK-${expiry}-${strike}-${optionType === "call" ? "C" : "P"}`;
  const metadata = {
    source: "system" as const,
    sourceTimestamp: now,
    receivedTimestamp: now,
    normalizedTimestamp: now,
    schemaVersion: "m6-fallback-chain-v1",
  };

  return {
    instrument: {
      metadata,
      instrumentName,
      symbol: "BTC",
      expiry,
      strike,
      optionType,
      creationTimestamp: now - 30 * millisecondsPerDay,
      isActive: true,
      settlementAsset: "BTC",
      contractMultiplierBtc: 1,
    },
    quote: {
      metadata,
      instrumentName,
      symbol: "BTC",
      expiry,
      strike,
      optionType,
      underlyingPriceUsd: spot,
      openInterestBtc,
      volumeBtc,
      volumeUsd: volumeBtc * spot,
      markPriceBtc: Math.max(0.002, 0.045 - distance * 0.18),
      markIvDecimal: 0.48 + distance * 0.55 + expiryIndex * 0.015,
      interestRateDecimal: 0.01,
    },
  };
};

export const buildFallbackOptionsChain = (
  spotPrice: number,
  now: number,
): OptionsChainSnapshot => {
  const dayStart = new Date(now);
  const todayExpiry = Date.UTC(
    dayStart.getUTCFullYear(),
    dayStart.getUTCMonth(),
    dayStart.getUTCDate(),
    23,
  );
  const expiries = [
    todayExpiry > now ? todayExpiry : now + 6 * 3_600_000,
    utcFriday(now, 0) > now ? utcFriday(now, 0) : now + 2 * millisecondsPerDay,
    utcFriday(now, 1),
    now + 21 * millisecondsPerDay,
  ].filter((expiry, index, values) => values.indexOf(expiry) === index);
  const strikeBase = Math.round(spotPrice / 1_000) * 1_000;
  const strikes = [-3, -2, -1, 0, 1, 2, 3].map(
    (offset) => strikeBase + offset * Math.max(1_000, strikeBase * 0.025),
  );
  const instruments = expiries.flatMap((expiry, expiryIndex) =>
    strikes.flatMap((strike, strikeIndex) =>
      (["call", "put"] as const).map((optionType) =>
        createFallbackContract(
          spotPrice,
          expiry,
          Math.round(strike),
          optionType,
          expiryIndex,
          strikeIndex,
          now,
        ),
      ),
    ),
  );

  return {
    metadata: {
      source: "system",
      sourceTimestamp: now,
      receivedTimestamp: now,
      normalizedTimestamp: now,
      schemaVersion: "m6-fallback-chain-v1",
    },
    currency: "BTC",
    instruments,
  };
};
