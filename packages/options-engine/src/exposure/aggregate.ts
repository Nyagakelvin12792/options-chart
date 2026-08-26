import type { OptionType, StrikeExposure } from "@options-chart/domain";

import type { ContractExposure } from "./exposure";

export interface ExpiryExposure {
  readonly expiry: number;
  readonly openInterestBtc: number;
  readonly grossGammaOnePercentUsd: number;
  readonly modeledGexOnePercentUsd: number;
}

export const aggregateExposureByStrike = (
  exposures: readonly ContractExposure[],
): readonly StrikeExposure[] => {
  const aggregate = new Map<string, StrikeExposure>();
  for (const exposure of exposures) {
    const key = `${exposure.strike}:${exposure.optionType}`;
    const current = aggregate.get(key);
    aggregate.set(key, {
      strike: exposure.strike,
      optionType: exposure.optionType,
      openInterestBtc:
        (current?.openInterestBtc ?? 0) + exposure.openInterestBtc,
      grossGammaOnePercentUsd:
        (current?.grossGammaOnePercentUsd ?? 0) +
        exposure.grossGammaOnePercentUsd,
      modeledGexOnePercentUsd:
        (current?.modeledGexOnePercentUsd ?? 0) +
        exposure.modeledGexOnePercentUsd,
    });
  }

  const optionOrder: Readonly<Record<OptionType, number>> = { call: 0, put: 1 };
  return [...aggregate.values()].sort(
    (left, right) =>
      left.strike - right.strike ||
      optionOrder[left.optionType] - optionOrder[right.optionType],
  );
};

export const aggregateExposureByExpiry = (
  exposures: readonly ContractExposure[],
): readonly ExpiryExposure[] => {
  const aggregate = new Map<number, ExpiryExposure>();
  for (const exposure of exposures) {
    const current = aggregate.get(exposure.expiry);
    aggregate.set(exposure.expiry, {
      expiry: exposure.expiry,
      openInterestBtc:
        (current?.openInterestBtc ?? 0) + exposure.openInterestBtc,
      grossGammaOnePercentUsd:
        (current?.grossGammaOnePercentUsd ?? 0) +
        exposure.grossGammaOnePercentUsd,
      modeledGexOnePercentUsd:
        (current?.modeledGexOnePercentUsd ?? 0) +
        exposure.modeledGexOnePercentUsd,
    });
  }

  return [...aggregate.values()].sort(
    (left, right) => left.expiry - right.expiry,
  );
};
