import type { OptionSnapshot, OptionType } from "@options-chart/domain";

import { calculateDeribitInverseGamma } from "../black-scholes/gamma";
import { calculateTimeToExpiryYears } from "../expiry/dte";

export interface ContractExposure {
  readonly instrumentName: string;
  readonly expiry: number;
  readonly strike: number;
  readonly optionType: OptionType;
  readonly spotPrice: number;
  readonly openInterestBtc: number;
  readonly gammaPerDollar: number;
  readonly grossGammaOnePercentUsd: number;
  readonly modeledGexOnePercentUsd: number;
}

const assertExposureInput = (
  value: number,
  name: string,
  allowZero: boolean,
): void => {
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new RangeError(
      `${name} must be finite and ${allowZero ? "non-negative" : "greater than zero"}`,
    );
  }
};

export const calculateGrossGammaOnePercentUsd = (
  gammaPerDollar: number,
  openInterestBtc: number,
  spotPrice: number,
): number => {
  if (!Number.isFinite(gammaPerDollar)) {
    throw new RangeError("Gamma must be finite");
  }
  assertExposureInput(openInterestBtc, "Open interest", true);
  assertExposureInput(spotPrice, "Spot price", false);
  return (
    Math.abs(gammaPerDollar) * openInterestBtc * spotPrice * spotPrice * 0.01
  );
};

export const calculateModeledSignedGexOnePercentUsd = (
  optionType: OptionType,
  gammaPerDollar: number,
  openInterestBtc: number,
  spotPrice: number,
): number =>
  (optionType === "call" ? 1 : -1) *
  calculateGrossGammaOnePercentUsd(gammaPerDollar, openInterestBtc, spotPrice);

export const calculateContractExposure = (
  contract: OptionSnapshot,
  spotPrice: number,
  calculationTimestamp: number,
  interestRateFallbackDecimal: number,
): ContractExposure => {
  const volatilityDecimal = contract.quote.markIvDecimal;
  if (volatilityDecimal === null) {
    throw new RangeError("Mark IV is required for Gamma exposure");
  }
  const timeToExpiryYears = calculateTimeToExpiryYears(
    contract.instrument.expiry,
    calculationTimestamp,
  );
  if (timeToExpiryYears === null) {
    throw new RangeError("Contract must have positive time to expiry");
  }
  const interestRateDecimal =
    contract.quote.interestRateDecimal ?? interestRateFallbackDecimal;
  const gammaPerDollar = calculateDeribitInverseGamma(
    spotPrice,
    contract.instrument.strike,
    timeToExpiryYears,
    volatilityDecimal,
    interestRateDecimal,
  );
  const grossGammaOnePercentUsd = calculateGrossGammaOnePercentUsd(
    gammaPerDollar,
    contract.quote.openInterestBtc,
    spotPrice,
  );

  return {
    instrumentName: contract.instrument.instrumentName,
    expiry: contract.instrument.expiry,
    strike: contract.instrument.strike,
    optionType: contract.instrument.optionType,
    spotPrice,
    openInterestBtc: contract.quote.openInterestBtc,
    gammaPerDollar,
    grossGammaOnePercentUsd,
    modeledGexOnePercentUsd:
      (contract.instrument.optionType === "call" ? 1 : -1) *
      grossGammaOnePercentUsd,
  };
};
