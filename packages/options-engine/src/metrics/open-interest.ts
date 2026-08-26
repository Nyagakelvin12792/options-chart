import type { OptionSnapshot } from "@options-chart/domain";

import { calculateTotalOpenInterestBtc } from "../total-open-interest";

export interface OpenInterestMetrics {
  readonly totalOpenInterestBtc: number;
  readonly totalCallOpenInterestBtc: number;
  readonly totalPutOpenInterestBtc: number;
  readonly putCallOpenInterestRatio: number | null;
  readonly invalidOpenInterestCount: number;
}

export const calculatePutCallOpenInterestRatio = (
  totalPutOpenInterestBtc: number,
  totalCallOpenInterestBtc: number,
): number | null => {
  if (
    !Number.isFinite(totalPutOpenInterestBtc) ||
    totalPutOpenInterestBtc < 0 ||
    !Number.isFinite(totalCallOpenInterestBtc) ||
    totalCallOpenInterestBtc < 0
  ) {
    throw new RangeError(
      "Put and call open interest must be finite and non-negative",
    );
  }
  return totalCallOpenInterestBtc === 0
    ? null
    : totalPutOpenInterestBtc / totalCallOpenInterestBtc;
};

export const calculateOpenInterestMetrics = (
  contracts: readonly OptionSnapshot[],
): OpenInterestMetrics => {
  const callOpenInterest: number[] = [];
  const putOpenInterest: number[] = [];
  let invalidOpenInterestCount = 0;

  for (const contract of contracts) {
    const openInterestBtc = contract.quote.openInterestBtc;
    if (!Number.isFinite(openInterestBtc) || openInterestBtc < 0) {
      invalidOpenInterestCount += 1;
      continue;
    }
    (contract.instrument.optionType === "call"
      ? callOpenInterest
      : putOpenInterest
    ).push(openInterestBtc);
  }

  const totalCallOpenInterestBtc =
    calculateTotalOpenInterestBtc(callOpenInterest);
  const totalPutOpenInterestBtc =
    calculateTotalOpenInterestBtc(putOpenInterest);
  return {
    totalOpenInterestBtc: calculateTotalOpenInterestBtc([
      totalCallOpenInterestBtc,
      totalPutOpenInterestBtc,
    ]),
    totalCallOpenInterestBtc,
    totalPutOpenInterestBtc,
    putCallOpenInterestRatio: calculatePutCallOpenInterestRatio(
      totalPutOpenInterestBtc,
      totalCallOpenInterestBtc,
    ),
    invalidOpenInterestCount,
  };
};
