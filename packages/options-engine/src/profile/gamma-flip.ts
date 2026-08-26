import type {
  GammaProfilePoint,
  OptionSnapshot,
  QualifyingCrossing,
} from "@options-chart/domain";

import { calculateGammaProfile } from "./gamma-profile";
import { findZeroCrossings } from "./zero-crossing";

export interface GammaFlipResult {
  readonly price: number | null;
  readonly profile: readonly GammaProfilePoint[];
  readonly qualifyingCrossings: readonly QualifyingCrossing[];
  readonly profilePeak: number;
  readonly crossingSignificanceThreshold: number;
}

export const selectHeadlineGammaFlip = (
  crossings: readonly QualifyingCrossing[],
): QualifyingCrossing | null =>
  [...crossings].sort(
    (left, right) =>
      left.distanceFromUnderlying - right.distanceFromUnderlying ||
      left.price - right.price,
  )[0] ?? null;

export const calculateGammaFlip = (
  contracts: readonly OptionSnapshot[],
  currentSpotPrice: number,
  calculationTimestamp: number,
  interestRateFallbackDecimal: number,
): GammaFlipResult => {
  const profile = calculateGammaProfile(
    contracts,
    currentSpotPrice,
    calculationTimestamp,
    interestRateFallbackDecimal,
  );
  const profilePeak = profile.reduce(
    (peak, point) => Math.max(peak, Math.abs(point.modeledGexOnePercentUsd)),
    0,
  );
  const coarseCrossings = findZeroCrossings(profile, currentSpotPrice);
  const fineStep = Math.max(10, currentSpotPrice * 0.00025);
  const qualifyingCrossings = coarseCrossings.map((coarseCrossing) => {
    const fineProfile = calculateGammaProfile(
      contracts,
      currentSpotPrice,
      calculationTimestamp,
      interestRateFallbackDecimal,
      {
        lowerPrice: coarseCrossing.lowerBracketPrice,
        upperPrice: coarseCrossing.upperBracketPrice,
        step: fineStep,
      },
    );
    const refined = [
      ...findZeroCrossings(fineProfile, currentSpotPrice, 0),
    ].sort(
      (left, right) =>
        Math.abs(left.price - coarseCrossing.price) -
        Math.abs(right.price - coarseCrossing.price),
    )[0];
    return refined
      ? {
          ...refined,
          significanceThreshold: coarseCrossing.significanceThreshold,
        }
      : coarseCrossing;
  });
  const headline = selectHeadlineGammaFlip(qualifyingCrossings);

  return {
    price: headline?.price ?? null,
    profile,
    qualifyingCrossings,
    profilePeak,
    crossingSignificanceThreshold: profilePeak * 0.005,
  };
};
