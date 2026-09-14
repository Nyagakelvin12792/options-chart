import type { Candle } from "@options-chart/domain";

export type VolumeProfileVolumeUnit = "base" | "quote";

export type VolumeProfileDirectionMode = "total" | "candle-direction";

export interface VolumeProfileRowCountConfig {
  readonly mode: "rowCount";
  readonly rowCount: number;
}

export interface VolumeProfileBinSizeConfig {
  readonly mode: "binSize";
  readonly binSize: number;
  readonly tickOrigin?: number | undefined;
}

export type VolumeProfileBinConfig =
  | VolumeProfileRowCountConfig
  | VolumeProfileBinSizeConfig;

export interface VolumeProfileRange {
  readonly from: number;
  readonly to: number;
}

export interface VolumeProfileSourceMetadata {
  readonly exchange: string;
  readonly market: string;
  readonly symbol: string;
  readonly sourceTimeframe: string;
  readonly displayTimeframe: string;
  readonly volumeUnit: VolumeProfileVolumeUnit;
  readonly calculationVersion: string;
  readonly sourceRevision?: string | undefined;
}

export interface VolumeProfileInput {
  readonly candles: readonly Candle[];
  readonly range: VolumeProfileRange;
  readonly replayCutoff?: number | undefined;
  readonly binConfig: VolumeProfileBinConfig;
  readonly volumeUnit?: VolumeProfileVolumeUnit | undefined;
  readonly directionMode?: VolumeProfileDirectionMode | undefined;
  readonly valueAreaPercent?: number | undefined;
  readonly sourceMetadata: VolumeProfileSourceMetadata;
}

export interface VolumeProfileRow {
  readonly low: number;
  readonly high: number;
  readonly mid: number;
  readonly totalVolume: number;
  readonly bullishVolume: number;
  readonly bearishVolume: number;
  readonly neutralVolume: number;
  readonly takerBuyVolume?: number | undefined;
  readonly takerSellVolume?: number | undefined;
  readonly isValueArea: boolean;
  readonly isPOC: boolean;
}

export interface VolumeProfileExclusions {
  readonly missingVolumeCount: number;
  readonly negativeOrNonFiniteVolumeCount: number;
  readonly malformedOhlcCount: number;
  readonly nonFinitePriceCount: number;
  readonly reversedTimestampCount: number;
  readonly duplicateCandleCount: number;
  readonly conflictingDuplicateCount: number;
  readonly straddlingBoundaryCount: number;
  readonly replayExcludedCount: number;
}

export interface VolumeProfileQualityMetadata {
  readonly eligibleCandleCount: number;
  readonly excludedCandleCount: number;
  readonly sparseRowCount: number;
  readonly hasGaps: boolean;
  readonly isProvisional: boolean;
  readonly sourceFallback: boolean;
  readonly coverageStart: number | null;
  readonly coverageEnd: number | null;
}

export interface VolumeProfileResult {
  readonly rows: readonly VolumeProfileRow[];
  readonly pocPrice: number | null;
  readonly pocRowIndex: number | null;
  readonly vah: number | null;
  readonly val: number | null;
  readonly targetValueAreaPercent: number;
  readonly achievedValueAreaPercent: number;
  readonly totalEligibleVolume: number;
  readonly valueAreaVolume: number;
  readonly exclusions: VolumeProfileExclusions;
  readonly qualityMetadata: VolumeProfileQualityMetadata;
  readonly version: string;
}

export type VolumeProfilePlacement = "left" | "right";

export interface VolumeProfilePresentationOptions {
  readonly placement?: VolumeProfilePlacement | undefined;
  readonly widthFraction?: number | undefined;
  readonly barOpacity?: number | undefined;
  readonly showPOC?: boolean | undefined;
  readonly showVAH?: boolean | undefined;
  readonly showVAL?: boolean | undefined;
  readonly showValueAreaShading?: boolean | undefined;
  readonly valueAreaOpacity?: number | undefined;
  readonly nonValueAreaOpacity?: number | undefined;
  readonly pocColor?: string | undefined;
  readonly vahColor?: string | undefined;
  readonly valColor?: string | undefined;
  readonly bullishColor?: string | undefined;
  readonly bearishColor?: string | undefined;
  readonly neutralColor?: string | undefined;
  readonly totalColor?: string | undefined;
  readonly showLabels?: boolean | undefined;
}

export interface VolumeProfileRenderInput {
  readonly profileId: string;
  readonly result: VolumeProfileResult;
  readonly presentation?: VolumeProfilePresentationOptions | undefined;
}

export interface BinanceAggTrade {
  readonly tradeId: number;
  readonly price: number;
  readonly quantity: number;
  readonly firstTradeId?: number | undefined;
  readonly lastTradeId?: number | undefined;
  readonly timestamp: number;
  readonly isBuyerMaker: boolean;
}

export interface VolumeProfileTradeInput {
  readonly trades: readonly BinanceAggTrade[];
  readonly range: VolumeProfileRange;
  readonly replayCutoff?: number | undefined;
  readonly binConfig: VolumeProfileBinConfig;
  readonly valueAreaPercent?: number | undefined;
  readonly sourceMetadata: VolumeProfileSourceMetadata;
}
