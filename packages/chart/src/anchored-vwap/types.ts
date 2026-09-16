import type { Candle } from "@options-chart/domain";

export type AnchoredVwapPriceSource =
  | "typical"
  | "hlc3"
  | "close"
  | "hl2"
  | "ohlc4"
  | "weighted";

export interface AnchoredVwapBandPoint {
  readonly multiplier: number;
  readonly upper: number;
  readonly lower: number;
}

export interface AnchoredVwapPoint {
  readonly timestamp: number;
  readonly vwap: number;
  readonly variance: number;
  readonly standardDeviation: number;
  readonly cumulativeVolume: number;
  readonly cumulativeTypicalPriceVolume: number;
  readonly bands: readonly AnchoredVwapBandPoint[];
}

export type AnchoredVwapExclusionReason =
  | "before_anchor"
  | "after_replay_cutoff"
  | "unclosed_in_replay"
  | "non_positive_price"
  | "non_finite_values"
  | "zero_volume";

export interface AnchoredVwapExclusion {
  readonly candleOpenTime: number;
  readonly reason: AnchoredVwapExclusionReason;
  readonly detail?: string | undefined;
}

export interface PreparedCandleSeries {
  readonly count: number;
  readonly openTimes: Float64Array;
  readonly closeTimes: Float64Array;
  readonly opens: Float64Array;
  readonly highs: Float64Array;
  readonly lows: Float64Array;
  readonly closes: Float64Array;
  readonly volumes: Float64Array;
  readonly quoteVolumes: Float64Array;
  readonly isClosed: Uint8Array;
}

export interface AnchoredVwapInput {
  readonly anchorTimestamp: number;
  readonly candles: readonly Candle[];
  readonly preparedSeries?: PreparedCandleSeries | undefined;
  readonly priceSource?: AnchoredVwapPriceSource | undefined;
  readonly bandMultipliers?: readonly number[] | undefined;
  readonly replayCutoff?: number | undefined;
  readonly symbol?: string | undefined;
  readonly timeframe?: string | undefined;
}

export interface AnchoredVwapResult {
  readonly anchorTimestamp: number;
  readonly resolvedAnchorIndex: number | null;
  readonly points: readonly AnchoredVwapPoint[];
  readonly latestPoint: AnchoredVwapPoint | null;
  readonly totalCandlesConsidered: number;
  readonly candlesIncluded: number;
  readonly candlesExcluded: number;
  readonly exclusions: readonly AnchoredVwapExclusion[];
  readonly calculationDurationMs: number;
  readonly priceSource: AnchoredVwapPriceSource;
  readonly bandMultipliers: readonly number[];
}

export interface AnchoredVwapPresentationOptions {
  readonly vwapColor?: string | undefined;
  readonly vwapLineWidth?: number | undefined;
  readonly vwapLineStyle?: number | undefined;
  readonly showBands?: boolean | undefined;
  readonly bandColors?: readonly string[] | undefined;
  readonly bandLineWidth?: number | undefined;
  readonly bandLineStyle?: number | undefined;
  readonly bandFillColor?: string | undefined;
  readonly showFill?: boolean | undefined;
  readonly showAnchorLine?: boolean | undefined;
  readonly anchorLineColor?: string | undefined;
  readonly anchorLineStyle?: number | undefined;
  readonly showLabels?: boolean | undefined;
  readonly labelPrecision?: number | undefined;
  readonly isSelected?: boolean | undefined;
  readonly isHovered?: boolean | undefined;
}

export interface AnchoredVwapRenderInput {
  readonly vwapId: string;
  readonly result: AnchoredVwapResult;
  readonly presentation?: AnchoredVwapPresentationOptions | undefined;
}
