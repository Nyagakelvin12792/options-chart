export interface BlackScholesD1D2 {
  readonly d1: number;
  readonly d2: number;
}

const assertPositiveFinite = (value: number, name: string): void => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be finite and greater than zero`);
  }
};

export const calculateBlackScholesD1D2 = (
  spotPrice: number,
  strike: number,
  timeToExpiryYears: number,
  volatilityDecimal: number,
  interestRateDecimal: number,
): BlackScholesD1D2 => {
  assertPositiveFinite(spotPrice, "Spot price");
  assertPositiveFinite(strike, "Strike");
  assertPositiveFinite(timeToExpiryYears, "Time to expiry");
  assertPositiveFinite(volatilityDecimal, "Volatility");
  if (!Number.isFinite(interestRateDecimal)) {
    throw new RangeError("Interest rate must be finite");
  }

  const volatilityTime = volatilityDecimal * Math.sqrt(timeToExpiryYears);
  const d1 =
    (Math.log(spotPrice / strike) +
      (interestRateDecimal + (volatilityDecimal * volatilityDecimal) / 2) *
        timeToExpiryYears) /
    volatilityTime;

  return { d1, d2: d1 - volatilityTime };
};
