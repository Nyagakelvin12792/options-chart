export type SegmentLineStyle = "solid" | "dashed" | "dotted";

export interface LevelSegment {
  readonly id: string;
  readonly kind:
    | "call-wall"
    | "put-wall"
    | "gamma-flip"
    | "max-pain"
    | "secondary-gex"
    | "confluence-zone"
    | string;
  readonly label: string;
  readonly price: number;
  readonly priceLow?: number | undefined;
  readonly priceHigh?: number | undefined;
  /**
   * Authoritative timestamp (ms epoch) when this level shifted / was established.
   * If null or undefined, the segment extends from the left edge of the chart.
   * When set, it begins at the corresponding candle timestamp and extends rightward.
   */
  readonly activationTimestamp?: number | null | undefined;
  readonly importance?: "primary" | "secondary" | undefined;
  readonly color?: string | undefined;
  readonly lineWidth?: number | undefined;
  readonly lineStyle?: SegmentLineStyle | undefined;
  readonly bias?: "support" | "resistance" | "pivot" | "neutral" | undefined;
  readonly score?: number | undefined;
}

export interface LevelSegmentsPresentationOptions {
  /**
   * Whether to render an anchor dot/pip at the activation timestamp start.
   * Default: true.
   */
  readonly showPips?: boolean | undefined;
  /**
   * Anchor pip radius in logical pixels.
   * Default: 3.
   */
  readonly pipRadius?: number | undefined;
  readonly defaultLineWidth?: number | undefined;
  /**
   * Fill opacity for confluence zone bands.
   * Default: 0.15.
   */
  readonly confluenceFillOpacity?: number | undefined;
}
