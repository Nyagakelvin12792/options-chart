import type { StrikeExposure } from "@options-chart/domain";

export interface SecondaryGexCandidate {
  readonly strike: number;
  readonly openInterestBtc: number;
  readonly grossGammaOnePercentUsd: number;
  readonly modeledGexOnePercentUsd: number;
}

export const rankSecondaryGexLevels = (
  strikeExposures: readonly StrikeExposure[],
  excludedStrikes: ReadonlySet<number>,
  count = 3,
): readonly SecondaryGexCandidate[] => {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError("Secondary GEX count must be a non-negative integer");
  }
  const combined = new Map<number, SecondaryGexCandidate>();
  for (const exposure of strikeExposures) {
    const current = combined.get(exposure.strike);
    combined.set(exposure.strike, {
      strike: exposure.strike,
      openInterestBtc:
        (current?.openInterestBtc ?? 0) + exposure.openInterestBtc,
      grossGammaOnePercentUsd:
        (current?.grossGammaOnePercentUsd ?? 0) +
        exposure.grossGammaOnePercentUsd,
      modeledGexOnePercentUsd:
        (current?.modeledGexOnePercentUsd ?? 0) +
        exposure.modeledGexOnePercentUsd,
    });
  }

  return [...combined.values()]
    .filter(
      (candidate) =>
        !excludedStrikes.has(candidate.strike) &&
        candidate.grossGammaOnePercentUsd > 0,
    )
    .sort(
      (left, right) =>
        right.grossGammaOnePercentUsd - left.grossGammaOnePercentUsd ||
        Math.abs(right.modeledGexOnePercentUsd) -
          Math.abs(left.modeledGexOnePercentUsd) ||
        right.openInterestBtc - left.openInterestBtc ||
        left.strike - right.strike,
    )
    .slice(0, count);
};
