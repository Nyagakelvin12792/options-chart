export const millisecondsPerDay = 86_400_000;
export const millisecondsPerYear = 365 * millisecondsPerDay;
export const minimumProfileTimeToExpiryMs = 900_000;

const assertTimestamp = (value: number, name: string): void => {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite timestamp`);
  }
};

export const calculateDaysToExpiry = (
  expiryTimestamp: number,
  calculationTimestamp: number,
): number => {
  assertTimestamp(expiryTimestamp, "Expiry");
  assertTimestamp(calculationTimestamp, "Calculation time");
  return (expiryTimestamp - calculationTimestamp) / millisecondsPerDay;
};

export const calculateTimeToExpiryYears = (
  expiryTimestamp: number,
  calculationTimestamp: number,
  minimumTimeToExpiryMs = 0,
): number | null => {
  const remainingMs =
    calculateDaysToExpiry(expiryTimestamp, calculationTimestamp) *
    millisecondsPerDay;
  if (remainingMs <= 0 || remainingMs < minimumTimeToExpiryMs) {
    return null;
  }
  return remainingMs / millisecondsPerYear;
};
