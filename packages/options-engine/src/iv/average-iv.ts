import type { OptionSnapshot } from "@options-chart/domain";

export const calculateOpenInterestWeightedAverageIv = (
  contracts: readonly OptionSnapshot[],
): number | null => {
  let weightedIv = 0;
  let eligibleOpenInterest = 0;

  for (const contract of contracts) {
    const { markIvDecimal, openInterestBtc } = contract.quote;
    if (
      markIvDecimal === null ||
      !Number.isFinite(markIvDecimal) ||
      markIvDecimal <= 0 ||
      !Number.isFinite(openInterestBtc) ||
      openInterestBtc < 0
    ) {
      continue;
    }
    weightedIv += markIvDecimal * openInterestBtc;
    eligibleOpenInterest += openInterestBtc;
  }

  return eligibleOpenInterest === 0 ? null : weightedIv / eligibleOpenInterest;
};
