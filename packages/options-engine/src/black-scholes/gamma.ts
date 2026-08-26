import { calculateBlackScholesD1D2 } from "./d1d2";
import { standardNormalPdf } from "./normal";

export const calculateDeribitInverseGamma = (
  spotPrice: number,
  strike: number,
  timeToExpiryYears: number,
  volatilityDecimal: number,
  interestRateDecimal: number,
): number => {
  const { d1 } = calculateBlackScholesD1D2(
    spotPrice,
    strike,
    timeToExpiryYears,
    volatilityDecimal,
    interestRateDecimal,
  );

  return (
    standardNormalPdf(d1) /
    (spotPrice * volatilityDecimal * Math.sqrt(timeToExpiryYears))
  );
};
