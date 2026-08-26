import type { ExclusionReason, OptionSnapshot } from "@options-chart/domain";

export interface MaxPainCalculation {
  readonly expiry: number;
  readonly price: number | null;
  readonly totalPayoutUsd: number | null;
  readonly contractsSeen: number;
  readonly contractsIncluded: number;
  readonly excludedCountByReason: Readonly<
    Partial<Record<ExclusionReason, number>>
  >;
}

export const calculateHolderPayoutUsd = (
  contract: OptionSnapshot,
  settlementPrice: number,
): number => {
  const intrinsicValue =
    contract.instrument.optionType === "call"
      ? Math.max(settlementPrice - contract.instrument.strike, 0)
      : Math.max(contract.instrument.strike - settlementPrice, 0);
  return intrinsicValue * contract.quote.openInterestBtc;
};

export const calculateMaxPain = (
  contracts: readonly OptionSnapshot[],
  expiry: number,
): MaxPainCalculation => {
  const expiryContracts = contracts.filter(
    ({ instrument }) => instrument.isActive && instrument.expiry === expiry,
  );
  const excludedCountByReason: Partial<Record<ExclusionReason, number>> = {};
  const eligibleContracts = expiryContracts.filter((contract) => {
    if (
      !Number.isFinite(contract.instrument.strike) ||
      contract.instrument.strike <= 0
    ) {
      excludedCountByReason.invalidStrike =
        (excludedCountByReason.invalidStrike ?? 0) + 1;
      return false;
    }
    if (
      !Number.isFinite(contract.quote.openInterestBtc) ||
      contract.quote.openInterestBtc < 0
    ) {
      excludedCountByReason.invalidOi =
        (excludedCountByReason.invalidOi ?? 0) + 1;
      return false;
    }
    return true;
  });
  const candidatePrices = [
    ...new Set(eligibleContracts.map(({ instrument }) => instrument.strike)),
  ].sort((left, right) => left - right);
  if (candidatePrices.length === 0) {
    return {
      expiry,
      price: null,
      totalPayoutUsd: null,
      contractsSeen: expiryContracts.length,
      contractsIncluded: eligibleContracts.length,
      excludedCountByReason,
    };
  }

  const rankedCandidates = candidatePrices
    .map((price) => ({
      price,
      totalPayoutUsd: eligibleContracts.reduce(
        (total, contract) => total + calculateHolderPayoutUsd(contract, price),
        0,
      ),
    }))
    .sort(
      (left, right) =>
        left.totalPayoutUsd - right.totalPayoutUsd || left.price - right.price,
    );
  const winner = rankedCandidates[0];
  if (!winner) {
    throw new Error(
      "Max Pain candidate ranking unexpectedly produced no result",
    );
  }
  return {
    expiry,
    price: winner.price,
    totalPayoutUsd: winner.totalPayoutUsd,
    contractsSeen: expiryContracts.length,
    contractsIncluded: eligibleContracts.length,
    excludedCountByReason,
  };
};
