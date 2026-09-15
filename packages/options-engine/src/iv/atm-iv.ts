import type { OptionSnapshot, OptionType } from "@options-chart/domain";

export type AtmIvExclusionReason = "missingIv" | "invalidIv";

export interface AtmIvSideResult {
  readonly markIvDecimal: number | null;
  readonly contractsSeen: number;
  readonly contractsEligible: number;
  readonly excludedCountByReason: Readonly<
    Partial<Record<AtmIvExclusionReason, number>>
  >;
}

export interface NearForwardAtmIvResult {
  readonly expiry: number;
  readonly forwardPriceUsd: number | null;
  readonly strike: number | null;
  readonly averageMarkIvDecimal: number | null;
  readonly call: AtmIvSideResult;
  readonly put: AtmIvSideResult;
  readonly isCompletePair: boolean;
  readonly contractsSeenAtExpiry: number;
  readonly contractsWithEligibleForwardPrice: number;
}

const emptySideResult = (): AtmIvSideResult => ({
  markIvDecimal: null,
  contractsSeen: 0,
  contractsEligible: 0,
  excludedCountByReason: {},
});

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? upper) + upper) / 2
    : upper;
};

const calculateSide = (
  contracts: readonly OptionSnapshot[],
  optionType: OptionType,
): AtmIvSideResult => {
  const sideContracts = contracts.filter(
    ({ instrument }) => instrument.optionType === optionType,
  );
  const excludedCountByReason: Partial<Record<AtmIvExclusionReason, number>> =
    {};
  const eligibleIvs: number[] = [];

  for (const { quote } of sideContracts) {
    if (quote.markIvDecimal === null) {
      excludedCountByReason.missingIv =
        (excludedCountByReason.missingIv ?? 0) + 1;
    } else if (
      !Number.isFinite(quote.markIvDecimal) ||
      quote.markIvDecimal <= 0
    ) {
      excludedCountByReason.invalidIv =
        (excludedCountByReason.invalidIv ?? 0) + 1;
    } else {
      eligibleIvs.push(quote.markIvDecimal);
    }
  }

  return {
    markIvDecimal:
      eligibleIvs.length === 0
        ? null
        : eligibleIvs.reduce((total, iv) => total + iv, 0) / eligibleIvs.length,
    contractsSeen: sideContracts.length,
    contractsEligible: eligibleIvs.length,
    excludedCountByReason,
  };
};

export const calculateNearForwardAtmIv = (
  contracts: readonly OptionSnapshot[],
  expiry: number,
): NearForwardAtmIvResult => {
  if (!Number.isFinite(expiry)) {
    throw new RangeError("Expiry must be a finite timestamp");
  }

  const expiryContracts = contracts.filter(
    ({ instrument }) => instrument.expiry === expiry,
  );
  const forwardPrices = expiryContracts
    .map(({ quote }) => quote.underlyingPriceUsd)
    .filter((price) => Number.isFinite(price) && price > 0);
  const forwardPriceUsd =
    forwardPrices.length === 0 ? null : median(forwardPrices);
  const strikes = [
    ...new Set(
      expiryContracts
        .map(({ instrument }) => instrument.strike)
        .filter((strike) => Number.isFinite(strike) && strike > 0),
    ),
  ].sort((left, right) => left - right);

  const strike =
    forwardPriceUsd === null || strikes.length === 0
      ? null
      : strikes.reduce((nearest, candidate) => {
          const nearestDistance = Math.abs(nearest - forwardPriceUsd);
          const candidateDistance = Math.abs(candidate - forwardPriceUsd);
          return candidateDistance < nearestDistance ? candidate : nearest;
        }, strikes[0] ?? 0) || null;

  if (strike === null) {
    return {
      expiry,
      forwardPriceUsd,
      strike: null,
      averageMarkIvDecimal: null,
      call: emptySideResult(),
      put: emptySideResult(),
      isCompletePair: false,
      contractsSeenAtExpiry: expiryContracts.length,
      contractsWithEligibleForwardPrice: forwardPrices.length,
    };
  }

  const strikeContracts = expiryContracts.filter(
    ({ instrument }) => instrument.strike === strike,
  );
  const call = calculateSide(strikeContracts, "call");
  const put = calculateSide(strikeContracts, "put");
  const isCompletePair =
    call.markIvDecimal !== null && put.markIvDecimal !== null;

  return {
    expiry,
    forwardPriceUsd,
    strike,
    averageMarkIvDecimal: isCompletePair
      ? (call.markIvDecimal + put.markIvDecimal) / 2
      : null,
    call,
    put,
    isCompletePair,
    contractsSeenAtExpiry: expiryContracts.length,
    contractsWithEligibleForwardPrice: forwardPrices.length,
  };
};
