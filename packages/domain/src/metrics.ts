import type { DomainEventMetadata } from "./event";
import type { OptionType } from "./options";

export type ExclusionReason =
  | "missingIv"
  | "invalidIv"
  | "invalidStrike"
  | "invalidExpiry"
  | "missingUnderlying"
  | "invalidOi"
  | "expired"
  | "nearExpiryProfileFloor";

export interface CalculationMetadata {
  readonly event: DomainEventMetadata;
  readonly calculatedAt: number;
  readonly calculationEngineVersion: string;
  readonly gexModelVersion: string;
  readonly gammaProfileVersion: string;
  readonly expiryScope: string;
  readonly contractsSeen: number;
  readonly contractsIncluded: number;
  readonly excludedCountByReason: Readonly<
    Partial<Record<ExclusionReason, number>>
  >;
  readonly durationMs: number;
}

export interface GammaPoint {
  readonly instrumentName: string;
  readonly spotPrice: number;
  readonly gammaPerDollar: number;
  readonly grossGammaOnePercentUsd: number;
  readonly modeledGexOnePercentUsd: number;
}

export interface StrikeExposure {
  readonly strike: number;
  readonly optionType: OptionType;
  readonly openInterestBtc: number;
  readonly grossGammaOnePercentUsd: number;
  readonly modeledGexOnePercentUsd: number;
}

export interface GammaProfilePoint {
  readonly spotPrice: number;
  readonly modeledGexOnePercentUsd: number;
}

export type GammaLevelKind =
  "call-wall" | "put-wall" | "gamma-flip" | "max-pain" | "secondary-gex";

export interface GammaLevel {
  readonly id: string;
  readonly kind: GammaLevelKind;
  readonly label: string;
  readonly price: number;
  readonly importance: "primary" | "secondary";
  readonly metadata: CalculationMetadata;
}

export interface OptionsSummaryMetrics {
  readonly totalOpenInterestBtc: number;
  readonly totalCallOpenInterestBtc: number;
  readonly totalPutOpenInterestBtc: number;
  readonly putCallOpenInterestRatio: number | null;
  readonly averageMarkIvDecimal: number | null;
  readonly modeledGexOnePercentUsd: number;
  readonly keyLevels: readonly GammaLevel[];
  readonly metadata: CalculationMetadata;
}

export interface QualifyingCrossing {
  readonly price: number;
  readonly distanceFromUnderlying: number;
  readonly lowerBracketPrice: number;
  readonly upperBracketPrice: number;
  readonly lowerBracketGex: number;
  readonly upperBracketGex: number;
  readonly significanceThreshold: number;
}

export interface MaxPainResult {
  readonly expiry: number;
  readonly price: number | null;
  readonly totalPayoutUsd: number | null;
  readonly metadata: CalculationMetadata;
}
