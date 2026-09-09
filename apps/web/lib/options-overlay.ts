import type { OptionsChainSnapshot } from "@options-chart/domain";
import {
  filterOptionsByExpiryScope,
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

export const buildUnavailableOptionsChain = (
  now: number,
): OptionsChainSnapshot => ({
  metadata: {
    source: "system",
    sourceTimestamp: now,
    receivedTimestamp: now,
    normalizedTimestamp: now,
    schemaVersion: "m10-unavailable-chain-v1",
  },
  currency: "BTC",
  instruments: [],
});
