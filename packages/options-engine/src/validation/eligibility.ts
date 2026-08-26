import type { ExclusionReason, OptionSnapshot } from "@options-chart/domain";

import { minimumProfileTimeToExpiryMs } from "../expiry/dte";

export interface GammaEligibilityResult {
  readonly eligibleContracts: readonly OptionSnapshot[];
  readonly excludedCountByReason: Readonly<
    Partial<Record<ExclusionReason, number>>
  >;
}

export const getGammaExclusionReason = (
  contract: OptionSnapshot,
  calculationTimestamp: number,
): ExclusionReason | null => {
  if (
    !Number.isFinite(contract.quote.openInterestBtc) ||
    contract.quote.openInterestBtc < 0
  ) {
    return "invalidOi";
  }
  if (
    !Number.isFinite(contract.instrument.strike) ||
    contract.instrument.strike <= 0
  ) {
    return "invalidStrike";
  }
  if (
    !Number.isFinite(contract.instrument.expiry) ||
    contract.instrument.expiry <= 0
  ) {
    return "invalidExpiry";
  }
  if (
    !Number.isFinite(contract.quote.underlyingPriceUsd) ||
    contract.quote.underlyingPriceUsd <= 0
  ) {
    return "missingUnderlying";
  }
  if (contract.quote.markIvDecimal === null) {
    return "missingIv";
  }
  if (
    !Number.isFinite(contract.quote.markIvDecimal) ||
    contract.quote.markIvDecimal <= 0
  ) {
    return "invalidIv";
  }
  const remainingMs = contract.instrument.expiry - calculationTimestamp;
  if (remainingMs <= 0) {
    return "expired";
  }
  if (remainingMs < minimumProfileTimeToExpiryMs) {
    return "nearExpiryProfileFloor";
  }
  return null;
};

export const partitionGammaEligibleContracts = (
  contracts: readonly OptionSnapshot[],
  calculationTimestamp: number,
): GammaEligibilityResult => {
  const eligibleContracts: OptionSnapshot[] = [];
  const excludedCountByReason: Partial<Record<ExclusionReason, number>> = {};

  for (const contract of contracts) {
    const reason = getGammaExclusionReason(contract, calculationTimestamp);
    if (reason === null) {
      eligibleContracts.push(contract);
      continue;
    }
    excludedCountByReason[reason] = (excludedCountByReason[reason] ?? 0) + 1;
  }

  return { eligibleContracts, excludedCountByReason };
};
