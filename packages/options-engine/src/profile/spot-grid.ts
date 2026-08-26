export interface SpotGridOptions {
  readonly lowerPrice?: number;
  readonly upperPrice?: number;
  readonly step?: number;
}

const normalizeGridPrice = (price: number): number =>
  Math.round(price * 100_000_000) / 100_000_000;

export const generateSpotGrid = (
  currentSpotPrice: number,
  options: SpotGridOptions = {},
): readonly number[] => {
  if (!Number.isFinite(currentSpotPrice) || currentSpotPrice <= 0) {
    throw new RangeError(
      "Current spot price must be finite and greater than zero",
    );
  }
  const lowerPrice = options.lowerPrice ?? currentSpotPrice * 0.7;
  const upperPrice = options.upperPrice ?? currentSpotPrice * 1.3;
  const step = options.step ?? Math.max(100, currentSpotPrice * 0.005);
  if (
    !Number.isFinite(lowerPrice) ||
    !Number.isFinite(upperPrice) ||
    !Number.isFinite(step) ||
    lowerPrice <= 0 ||
    upperPrice <= lowerPrice ||
    step <= 0
  ) {
    throw new RangeError(
      "Spot grid bounds and step must define a positive range",
    );
  }

  const prices = new Set<number>([
    normalizeGridPrice(lowerPrice),
    normalizeGridPrice(upperPrice),
  ]);
  for (let price = lowerPrice; price < upperPrice; price += step) {
    prices.add(normalizeGridPrice(price));
  }
  if (currentSpotPrice > lowerPrice && currentSpotPrice < upperPrice) {
    prices.add(normalizeGridPrice(currentSpotPrice));
  }
  return [...prices].sort((left, right) => left - right);
};
