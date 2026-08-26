import type { OptionType, StrikeExposure } from "@options-chart/domain";

import { GEX_ASSUMPTIONS } from "../assumptions";

export const selectRawGammaWall = (
  strikeExposures: readonly StrikeExposure[],
  optionType: OptionType,
  currentSpotPrice: number,
): StrikeExposure | null => {
  const sideExposures = strikeExposures.filter(
    (exposure) => exposure.optionType === optionType,
  );
  const totalSameSideGrossGamma = sideExposures.reduce(
    (total, exposure) => total + exposure.grossGammaOnePercentUsd,
    0,
  );
  if (totalSameSideGrossGamma <= 0) {
    return null;
  }

  const lowerBound =
    currentSpotPrice * GEX_ASSUMPTIONS.wallStrikeLowerMultiplier;
  const upperBound =
    currentSpotPrice * GEX_ASSUMPTIONS.wallStrikeUpperMultiplier;
  return (
    sideExposures
      .filter(
        (exposure) =>
          exposure.strike >= lowerBound &&
          exposure.strike <= upperBound &&
          exposure.openInterestBtc >=
            GEX_ASSUMPTIONS.wallMinimumOpenInterestBtc &&
          exposure.grossGammaOnePercentUsd / totalSameSideGrossGamma >=
            GEX_ASSUMPTIONS.wallMinimumSameSideGrossShare,
      )
      .sort(
        (left, right) =>
          right.grossGammaOnePercentUsd - left.grossGammaOnePercentUsd ||
          right.openInterestBtc - left.openInterestBtc ||
          Math.abs(left.strike - currentSpotPrice) -
            Math.abs(right.strike - currentSpotPrice) ||
          left.strike - right.strike,
      )[0] ?? null
  );
};

export const selectRawCallWall = (
  strikeExposures: readonly StrikeExposure[],
  currentSpotPrice: number,
): StrikeExposure | null =>
  selectRawGammaWall(strikeExposures, "call", currentSpotPrice);

export const selectRawPutWall = (
  strikeExposures: readonly StrikeExposure[],
  currentSpotPrice: number,
): StrikeExposure | null =>
  selectRawGammaWall(strikeExposures, "put", currentSpotPrice);
