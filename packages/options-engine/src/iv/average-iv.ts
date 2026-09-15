import type { OptionSnapshot, OptionType } from "@options-chart/domain";

export type WeightedMarkIvExclusionReason =
  "missingIv" | "invalidIv" | "invalidOpenInterest" | "zeroOpenInterest";

export interface OpenInterestWeightedMarkIvResult {
  readonly averageMarkIvDecimal: number | null;
  readonly contractsSeen: number;
  readonly contractsEligible: number;
  readonly eligibleOpenInterestBtc: number;
  readonly excludedCountByReason: Readonly<
    Partial<Record<WeightedMarkIvExclusionReason, number>>
  >;
}

export interface CallPutOpenInterestWeightedMarkIvResult {
  readonly call: OpenInterestWeightedMarkIvResult;
  readonly put: OpenInterestWeightedMarkIvResult;
}

const incrementReason = (
  counts: Partial<Record<WeightedMarkIvExclusionReason, number>>,
  reason: WeightedMarkIvExclusionReason,
): void => {
  counts[reason] = (counts[reason] ?? 0) + 1;
};

export const calculateOpenInterestWeightedMarkIv = (
  contracts: readonly OptionSnapshot[],
): OpenInterestWeightedMarkIvResult => {
  const excludedCountByReason: Partial<
    Record<WeightedMarkIvExclusionReason, number>
  > = {};
  let weightedIv = 0;
  let eligibleOpenInterestBtc = 0;
  let contractsEligible = 0;

  for (const contract of contracts) {
    const { markIvDecimal, openInterestBtc } = contract.quote;
    if (markIvDecimal === null) {
      incrementReason(excludedCountByReason, "missingIv");
      continue;
    }
    if (!Number.isFinite(markIvDecimal) || markIvDecimal <= 0) {
      incrementReason(excludedCountByReason, "invalidIv");
      continue;
    }
    if (!Number.isFinite(openInterestBtc) || openInterestBtc < 0) {
      incrementReason(excludedCountByReason, "invalidOpenInterest");
      continue;
    }
    if (openInterestBtc === 0) {
      incrementReason(excludedCountByReason, "zeroOpenInterest");
      continue;
    }

    weightedIv += markIvDecimal * openInterestBtc;
    eligibleOpenInterestBtc += openInterestBtc;
    contractsEligible += 1;
  }

  return {
    averageMarkIvDecimal:
      eligibleOpenInterestBtc === 0
        ? null
        : weightedIv / eligibleOpenInterestBtc,
    contractsSeen: contracts.length,
    contractsEligible,
    eligibleOpenInterestBtc,
    excludedCountByReason,
  };
};

export const calculateOpenInterestWeightedAverageIv = (
  contracts: readonly OptionSnapshot[],
): number | null =>
  calculateOpenInterestWeightedMarkIv(contracts).averageMarkIvDecimal;

const calculateForOptionType = (
  contracts: readonly OptionSnapshot[],
  optionType: OptionType,
): OpenInterestWeightedMarkIvResult =>
  calculateOpenInterestWeightedMarkIv(
    contracts.filter(({ instrument }) => instrument.optionType === optionType),
  );

export const calculateCallPutOpenInterestWeightedMarkIv = (
  contracts: readonly OptionSnapshot[],
): CallPutOpenInterestWeightedMarkIvResult => ({
  call: calculateForOptionType(contracts, "call"),
  put: calculateForOptionType(contracts, "put"),
});
