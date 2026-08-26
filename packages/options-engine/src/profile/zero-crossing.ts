import type {
  GammaProfilePoint,
  QualifyingCrossing,
} from "@options-chart/domain";

const interpolateZero = (
  lower: GammaProfilePoint,
  upper: GammaProfilePoint,
): number =>
  lower.spotPrice +
  ((0 - lower.modeledGexOnePercentUsd) * (upper.spotPrice - lower.spotPrice)) /
    (upper.modeledGexOnePercentUsd - lower.modeledGexOnePercentUsd);

export const findZeroCrossings = (
  profile: readonly GammaProfilePoint[],
  currentSpotPrice: number,
  significanceFraction = 0.005,
): readonly QualifyingCrossing[] => {
  if (
    !Number.isFinite(significanceFraction) ||
    significanceFraction < 0 ||
    significanceFraction > 1
  ) {
    throw new RangeError(
      "Crossing significance fraction must be between zero and one",
    );
  }
  const sortedProfile = [...profile].sort(
    (left, right) => left.spotPrice - right.spotPrice,
  );
  const profilePeak = sortedProfile.reduce(
    (peak, point) => Math.max(peak, Math.abs(point.modeledGexOnePercentUsd)),
    0,
  );
  if (profilePeak === 0) {
    return [];
  }
  const significanceThreshold = profilePeak * significanceFraction;
  const crossings: QualifyingCrossing[] = [];

  for (let index = 0; index < sortedProfile.length - 1; index += 1) {
    const lower = sortedProfile[index];
    const upper = sortedProfile[index + 1];
    if (!lower || !upper) {
      continue;
    }
    const lowerGex = lower.modeledGexOnePercentUsd;
    const upperGex = upper.modeledGexOnePercentUsd;
    if (
      !Number.isFinite(lowerGex) ||
      !Number.isFinite(upperGex) ||
      lowerGex === 0 ||
      upperGex === 0 ||
      Math.sign(lowerGex) === Math.sign(upperGex) ||
      (Math.max(Math.abs(lowerGex), Math.abs(upperGex)) <
        significanceThreshold &&
        Math.abs(upperGex - lowerGex) < significanceThreshold)
    ) {
      continue;
    }
    const price = interpolateZero(lower, upper);
    crossings.push({
      price,
      distanceFromUnderlying: Math.abs(price - currentSpotPrice),
      lowerBracketPrice: lower.spotPrice,
      upperBracketPrice: upper.spotPrice,
      lowerBracketGex: lowerGex,
      upperBracketGex: upperGex,
      significanceThreshold,
    });
  }

  return crossings;
};
