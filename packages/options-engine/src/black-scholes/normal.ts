const INVERSE_SQRT_TWO_PI = 1 / Math.sqrt(2 * Math.PI);

export const standardNormalPdf = (value: number): number =>
  INVERSE_SQRT_TWO_PI * Math.exp(-(value * value) / 2);

export const standardNormalCdf = (value: number): number => {
  if (Number.isNaN(value)) {
    return Number.NaN;
  }
  if (value === Number.POSITIVE_INFINITY) {
    return 1;
  }
  if (value === Number.NEGATIVE_INFINITY) {
    return 0;
  }
  if (value === 0) {
    return 0.5;
  }

  const absoluteValue = Math.abs(value);
  const scale = 1 / (1 + 0.2316419 * absoluteValue);
  const polynomial =
    scale *
    (0.31938153 +
      scale *
        (-0.356563782 +
          scale *
            (1.781477937 + scale * (-1.821255978 + scale * 1.330274429))));
  const upperTail = standardNormalPdf(absoluteValue) * polynomial;

  return value > 0 ? 1 - upperTail : upperTail;
};
