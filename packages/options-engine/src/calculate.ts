import type {
  CalculationMetadata,
  GammaLevel,
  GammaProfilePoint,
  MaxPainResult,
  OptionsChainSnapshot,
  OptionsSummaryMetrics,
  QualifyingCrossing,
  StrikeExposure,
} from "@options-chart/domain";

import {
  aggregateExposureByExpiry,
  aggregateExposureByStrike,
  type ExpiryExposure,
} from "./exposure/aggregate";
import { calculateContractExposure } from "./exposure/exposure";
import {
  calculateDaysToExpiry,
  minimumProfileTimeToExpiryMs,
} from "./expiry/dte";
import {
  filterOptionsByExpiryScope,
  formatExpiryScope,
  type ExpiryScope,
} from "./expiry/filters";
import { calculateOpenInterestWeightedAverageIv } from "./iv/average-iv";
import { rankSecondaryGexLevels } from "./levels/secondary-gex";
import { selectRawCallWall, selectRawPutWall } from "./levels/walls";
import { calculateMaxPain } from "./max-pain/max-pain";
import { calculateOpenInterestMetrics } from "./metrics/open-interest";
import { calculateGammaFlip } from "./profile/gamma-flip";
import { partitionGammaEligibleContracts } from "./validation/eligibility";
import {
  CALCULATION_AUDIT_SCHEMA_VERSION,
  CALCULATION_ENGINE_VERSION,
  GAMMA_PROFILE_VERSION,
  GEX_MODEL_VERSION,
} from "./version";

export interface OptionsCalculationInput {
  readonly chain: OptionsChainSnapshot;
  readonly underlyingPriceUsd: number;
  readonly calculatedAt: number;
  readonly expiryScope: ExpiryScope;
  readonly interestRateFallbackDecimal: number;
  readonly maxPainExpiry: number | null;
  readonly secondaryLevelCount: number;
}

export interface OptionsCalculationResult {
  readonly summary: OptionsSummaryMetrics;
  readonly strikeExposures: readonly StrikeExposure[];
  readonly expiryExposures: readonly ExpiryExposure[];
  readonly gammaProfile: readonly GammaProfilePoint[];
  readonly gammaFlipPrice: number | null;
  readonly qualifyingCrossings: readonly QualifyingCrossing[];
  readonly maxPain: MaxPainResult | null;
}

interface MetadataInput {
  readonly chain: OptionsChainSnapshot;
  readonly calculatedAt: number;
  readonly expiryScope: string;
  readonly contractsSeen: number;
  readonly contractsIncluded: number;
  readonly excludedCountByReason: CalculationMetadata["excludedCountByReason"];
  readonly nearestIncludedExpiry: number | null;
  readonly nearestIncludedDte: number | null;
  readonly qualifyingCrossings: readonly QualifyingCrossing[];
}

const createMetadata = (input: MetadataInput): CalculationMetadata => ({
  event: {
    source: "calculated",
    sourceTimestamp: input.chain.metadata.normalizedTimestamp,
    receivedTimestamp: input.calculatedAt,
    normalizedTimestamp: input.calculatedAt,
    schemaVersion: CALCULATION_AUDIT_SCHEMA_VERSION,
  },
  calculatedAt: input.calculatedAt,
  calculationEngineVersion: CALCULATION_ENGINE_VERSION,
  gexModelVersion: GEX_MODEL_VERSION,
  gammaProfileVersion: GAMMA_PROFILE_VERSION,
  expiryScope: input.expiryScope,
  contractsSeen: input.contractsSeen,
  contractsIncluded: input.contractsIncluded,
  excludedCountByReason: input.excludedCountByReason,
  nearestIncludedExpiry: input.nearestIncludedExpiry,
  nearestIncludedDte: input.nearestIncludedDte,
  qualifyingCrossings: input.qualifyingCrossings,
  durationMs: 0,
});

const createLevel = (
  kind: GammaLevel["kind"],
  label: string,
  price: number,
  importance: GammaLevel["importance"],
  metadata: CalculationMetadata,
  id: string = kind,
): GammaLevel => ({ id, kind, label, price, importance, metadata });

const assertCalculationInput = (input: OptionsCalculationInput): void => {
  if (
    !Number.isFinite(input.underlyingPriceUsd) ||
    input.underlyingPriceUsd <= 0
  ) {
    throw new RangeError(
      "Underlying price must be finite and greater than zero",
    );
  }
  if (!Number.isFinite(input.calculatedAt)) {
    throw new RangeError("Calculation timestamp must be finite");
  }
  if (!Number.isFinite(input.interestRateFallbackDecimal)) {
    throw new RangeError("Interest-rate fallback must be finite");
  }
  if (
    !Number.isInteger(input.secondaryLevelCount) ||
    input.secondaryLevelCount < 0
  ) {
    throw new RangeError(
      "Secondary level count must be a non-negative integer",
    );
  }
};

export const calculateOptionsMetrics = (
  input: OptionsCalculationInput,
): OptionsCalculationResult => {
  assertCalculationInput(input);
  const scopedContracts = filterOptionsByExpiryScope(
    input.chain.instruments,
    input.expiryScope,
    input.calculatedAt,
  );
  const eligibility = partitionGammaEligibleContracts(
    scopedContracts,
    input.calculatedAt,
  );
  const contractExposures = eligibility.eligibleContracts.map((contract) =>
    calculateContractExposure(
      contract,
      input.underlyingPriceUsd,
      input.calculatedAt,
      input.interestRateFallbackDecimal,
    ),
  );
  const strikeExposures = aggregateExposureByStrike(contractExposures);
  const expiryExposures = aggregateExposureByExpiry(contractExposures);
  const gammaFlip = calculateGammaFlip(
    eligibility.eligibleContracts,
    input.underlyingPriceUsd,
    input.calculatedAt,
    input.interestRateFallbackDecimal,
  );
  const nearestIncludedExpiry =
    expiryExposures
      .map(({ expiry }) => expiry)
      .sort((left, right) => left - right)[0] ?? null;
  const metadata = createMetadata({
    chain: input.chain,
    calculatedAt: input.calculatedAt,
    expiryScope: formatExpiryScope(input.expiryScope),
    contractsSeen: scopedContracts.length,
    contractsIncluded: eligibility.eligibleContracts.length,
    excludedCountByReason: eligibility.excludedCountByReason,
    nearestIncludedExpiry,
    nearestIncludedDte:
      nearestIncludedExpiry === null
        ? null
        : calculateDaysToExpiry(nearestIncludedExpiry, input.calculatedAt),
    qualifyingCrossings: gammaFlip.qualifyingCrossings,
  });
  const callWall = selectRawCallWall(strikeExposures, input.underlyingPriceUsd);
  const putWall = selectRawPutWall(strikeExposures, input.underlyingPriceUsd);
  const primaryWallStrikes = new Set<number>();
  if (callWall) {
    primaryWallStrikes.add(callWall.strike);
  }
  if (putWall) {
    primaryWallStrikes.add(putWall.strike);
  }
  const secondaryLevels = rankSecondaryGexLevels(
    strikeExposures,
    primaryWallStrikes,
    input.secondaryLevelCount,
  );
  const keyLevels: GammaLevel[] = [];
  if (callWall) {
    keyLevels.push(
      createLevel(
        "call-wall",
        "Call Wall",
        callWall.strike,
        "primary",
        metadata,
      ),
    );
  }
  if (putWall) {
    keyLevels.push(
      createLevel("put-wall", "Put Wall", putWall.strike, "primary", metadata),
    );
  }
  if (gammaFlip.price !== null) {
    keyLevels.push(
      createLevel(
        "gamma-flip",
        "Modeled Gamma Flip",
        gammaFlip.price,
        "primary",
        metadata,
      ),
    );
  }

  let maxPain: MaxPainResult | null = null;
  if (input.maxPainExpiry !== null) {
    const maxPainCalculation = calculateMaxPain(
      input.chain.instruments,
      input.maxPainExpiry,
    );
    const maxPainMetadata = createMetadata({
      chain: input.chain,
      calculatedAt: input.calculatedAt,
      expiryScope: `expiry:${input.maxPainExpiry}`,
      contractsSeen: maxPainCalculation.contractsSeen,
      contractsIncluded: maxPainCalculation.contractsIncluded,
      excludedCountByReason: maxPainCalculation.excludedCountByReason,
      nearestIncludedExpiry: input.maxPainExpiry,
      nearestIncludedDte: calculateDaysToExpiry(
        input.maxPainExpiry,
        input.calculatedAt,
      ),
      qualifyingCrossings: [],
    });
    maxPain = {
      expiry: maxPainCalculation.expiry,
      price: maxPainCalculation.price,
      totalPayoutUsd: maxPainCalculation.totalPayoutUsd,
      metadata: maxPainMetadata,
    };
    if (maxPain.price !== null) {
      keyLevels.push(
        createLevel(
          "max-pain",
          "Max Pain",
          maxPain.price,
          "primary",
          maxPainMetadata,
        ),
      );
    }
  }
  secondaryLevels.forEach((level, index) => {
    keyLevels.push(
      createLevel(
        "secondary-gex",
        `GEX ${index + 1}`,
        level.strike,
        "secondary",
        metadata,
        `secondary-gex-${index + 1}`,
      ),
    );
  });

  const openInterest = calculateOpenInterestMetrics(scopedContracts);
  const summary: OptionsSummaryMetrics = {
    totalOpenInterestBtc: openInterest.totalOpenInterestBtc,
    totalCallOpenInterestBtc: openInterest.totalCallOpenInterestBtc,
    totalPutOpenInterestBtc: openInterest.totalPutOpenInterestBtc,
    putCallOpenInterestRatio: openInterest.putCallOpenInterestRatio,
    averageMarkIvDecimal:
      calculateOpenInterestWeightedAverageIv(scopedContracts),
    modeledGexOnePercentUsd: contractExposures.reduce(
      (total, exposure) => total + exposure.modeledGexOnePercentUsd,
      0,
    ),
    keyLevels,
    metadata,
  };

  return {
    summary,
    strikeExposures,
    expiryExposures,
    gammaProfile: gammaFlip.profile,
    gammaFlipPrice: gammaFlip.price,
    qualifyingCrossings: gammaFlip.qualifyingCrossings,
    maxPain,
  };
};

export { minimumProfileTimeToExpiryMs };
