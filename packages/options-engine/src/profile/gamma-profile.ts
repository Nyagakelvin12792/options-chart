import type { GammaProfilePoint, OptionSnapshot } from "@options-chart/domain";

import { calculateTimeToExpiryYears } from "../expiry/dte";
import { generateSpotGrid, type SpotGridOptions } from "./spot-grid";

const INVERSE_SQRT_TWO_PI = 1 / Math.sqrt(2 * Math.PI);

interface PreparedContract {
  readonly invVolatilityTime: number;
  readonly lnKMinusDrift: number;
  readonly coefficient: number;
}

export const calculateGammaProfile = (
  contracts: readonly OptionSnapshot[],
  currentSpotPrice: number,
  calculationTimestamp: number,
  interestRateFallbackDecimal: number,
  gridOptions: SpotGridOptions = {},
): readonly GammaProfilePoint[] => {
  const prepared: PreparedContract[] = [];

  for (let i = 0; i < contracts.length; i++) {
    const contract = contracts[i]!;
    const volatilityDecimal = contract.quote.markIvDecimal;
    if (volatilityDecimal === null) {
      continue;
    }
    const timeToExpiryYears = calculateTimeToExpiryYears(
      contract.instrument.expiry,
      calculationTimestamp,
    );
    if (timeToExpiryYears === null || timeToExpiryYears <= 0) {
      continue;
    }
    const interestRateDecimal =
      contract.quote.interestRateDecimal ?? interestRateFallbackDecimal;
    const volatilityTime = volatilityDecimal * Math.sqrt(timeToExpiryYears);
    if (volatilityTime <= 0) {
      continue;
    }
    const drift =
      (interestRateDecimal + (volatilityDecimal * volatilityDecimal) / 2) *
      timeToExpiryYears;
    const sign = contract.instrument.optionType === "call" ? 1 : -1;
    const coefficient =
      (sign * contract.quote.openInterestBtc * 0.01 * INVERSE_SQRT_TWO_PI) /
      volatilityTime;

    prepared.push({
      invVolatilityTime: 1 / volatilityTime,
      lnKMinusDrift: Math.log(contract.instrument.strike) - drift,
      coefficient,
    });
  }

  const grid = generateSpotGrid(currentSpotPrice, gridOptions);
  const result: GammaProfilePoint[] = new Array(grid.length);

  for (let g = 0; g < grid.length; g++) {
    const spotPrice = grid[g]!;
    const lnS = Math.log(spotPrice);
    let gexSum = 0;

    for (let p = 0; p < prepared.length; p++) {
      const item = prepared[p]!;
      const d1 = (lnS - item.lnKMinusDrift) * item.invVolatilityTime;
      gexSum += item.coefficient * Math.exp(-0.5 * d1 * d1);
    }

    result[g] = {
      spotPrice,
      modeledGexOnePercentUsd: spotPrice * gexSum,
    };
  }

  return result;
};
