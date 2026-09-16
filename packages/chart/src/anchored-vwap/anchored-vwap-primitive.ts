import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  ISeriesPrimitiveAxisView,
  PrimitiveHoveredItem,
  SeriesAttachedParameter,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import type {
  AnchoredVwapPoint,
  AnchoredVwapPresentationOptions,
  AnchoredVwapRenderInput,
  AnchoredVwapResult,
} from "./types";

interface ComputedPointCoords {
  readonly x: number;
  readonly yVwap: number;
  readonly bandCoords: readonly {
    readonly multiplier: number;
    readonly yUpper: number;
    readonly yLower: number;
  }[];
  readonly rawPoint: AnchoredVwapPoint;
}

const DEFAULT_VWAP_COLOR = "#2962ff";
const DEFAULT_BAND_COLORS = [
  "rgba(41, 98, 255, 0.55)",
  "rgba(41, 98, 255, 0.35)",
  "rgba(41, 98, 255, 0.20)",
];
const DEFAULT_FILL_COLOR = "rgba(41, 98, 255, 0.08)";
const DEFAULT_ANCHOR_COLOR = "rgba(242, 193, 78, 0.7)";

class AnchoredVwapPaneRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly getCoords: () => readonly ComputedPointCoords[],
    private readonly getAnchorX: () => number | null,
    private readonly getPresentation: () => AnchoredVwapPresentationOptions,
  ) {}

  draw(target: Parameters<IPrimitivePaneRenderer["draw"]>[0]): void {
    const coords = this.getCoords();
    if (coords.length === 0) {
      return;
    }

    const anchorX = this.getAnchorX();
    const presentation = this.getPresentation();

    const vwapColor = presentation.vwapColor ?? DEFAULT_VWAP_COLOR;
    const vwapLineWidth = presentation.vwapLineWidth ?? 2;
    const showBands = presentation.showBands ?? true;
    const bandColors = presentation.bandColors ?? DEFAULT_BAND_COLORS;
    const bandLineWidth = presentation.bandLineWidth ?? 1;
    const showFill = presentation.showFill ?? false;
    const bandFillColor = presentation.bandFillColor ?? DEFAULT_FILL_COLOR;
    const showAnchorLine = presentation.showAnchorLine ?? true;
    const anchorLineColor = presentation.anchorLineColor ?? DEFAULT_ANCHOR_COLOR;

    target.useBitmapCoordinateSpace(
      ({ context, horizontalPixelRatio, verticalPixelRatio, bitmapSize }) => {
        context.save();

        // 1. Draw Anchor Vertical Line
        if (showAnchorLine && anchorX !== null) {
          const x = Math.round(anchorX * horizontalPixelRatio);
          if (x >= 0 && x <= bitmapSize.width) {
            context.strokeStyle = anchorLineColor;
            context.lineWidth = Math.max(1, horizontalPixelRatio);
            context.setLineDash([
              4 * horizontalPixelRatio,
              3 * horizontalPixelRatio,
            ]);
            context.beginPath();
            context.moveTo(x, 0);
            context.lineTo(x, bitmapSize.height);
            context.stroke();
          }
        }

        // 2. Optional Band Fill (between innermost upper and lower band)
        if (showBands && showFill && coords.length > 1) {
          const hasBand1 = coords.every((p) => p.bandCoords.length > 0);
          if (hasBand1) {
            context.fillStyle = bandFillColor;
            context.beginPath();

            // Trace upper band forward
            const first = coords[0]!;
            const firstBand = first.bandCoords[0]!;
            context.moveTo(
              Math.round(first.x * horizontalPixelRatio),
              Math.round(firstBand.yUpper * verticalPixelRatio),
            );

            for (let i = 1; i < coords.length; i++) {
              const pt = coords[i]!;
              const band = pt.bandCoords[0]!;
              context.lineTo(
                Math.round(pt.x * horizontalPixelRatio),
                Math.round(band.yUpper * verticalPixelRatio),
              );
            }

            // Trace lower band backward
            for (let i = coords.length - 1; i >= 0; i--) {
              const pt = coords[i]!;
              const band = pt.bandCoords[0]!;
              context.lineTo(
                Math.round(pt.x * horizontalPixelRatio),
                Math.round(band.yLower * verticalPixelRatio),
              );
            }

            context.closePath();
            context.fill();
          }
        }

        // 3. Draw Standard Deviation Bands
        if (showBands && coords.length > 1) {
          const numBands = coords[0]?.bandCoords.length ?? 0;

          for (let b = 0; b < numBands; b++) {
            const color = bandColors[b % bandColors.length] ?? DEFAULT_BAND_COLORS[0]!;
            context.strokeStyle = color;
            context.lineWidth = Math.max(1, bandLineWidth * horizontalPixelRatio);
            context.setLineDash([
              3 * horizontalPixelRatio,
              3 * horizontalPixelRatio,
            ]);

            // Draw Upper Band
            context.beginPath();
            let upperStarted = false;
            for (let i = 0; i < coords.length; i++) {
              const pt = coords[i]!;
              const band = pt.bandCoords[b];
              if (!band) continue;
              const x = Math.round(pt.x * horizontalPixelRatio);
              const y = Math.round(band.yUpper * verticalPixelRatio);
              if (!upperStarted) {
                context.moveTo(x, y);
                upperStarted = true;
              } else {
                context.lineTo(x, y);
              }
            }
            if (upperStarted) {
              context.stroke();
            }

            // Draw Lower Band
            context.beginPath();
            let lowerStarted = false;
            for (let i = 0; i < coords.length; i++) {
              const pt = coords[i]!;
              const band = pt.bandCoords[b];
              if (!band) continue;
              const x = Math.round(pt.x * horizontalPixelRatio);
              const y = Math.round(band.yLower * verticalPixelRatio);
              if (!lowerStarted) {
                context.moveTo(x, y);
                lowerStarted = true;
              } else {
                context.lineTo(x, y);
              }
            }
            if (lowerStarted) {
              context.stroke();
            }
          }
        }

        // 4. Draw Main VWAP Curve
        if (coords.length > 0) {
          context.strokeStyle = vwapColor;
          context.lineWidth = Math.max(1, vwapLineWidth * horizontalPixelRatio);

          if (presentation.vwapLineStyle === 1) {
            context.setLineDash([
              2 * horizontalPixelRatio,
              2 * horizontalPixelRatio,
            ]);
          } else if (presentation.vwapLineStyle === 2) {
            context.setLineDash([
              5 * horizontalPixelRatio,
              4 * horizontalPixelRatio,
            ]);
          } else {
            context.setLineDash([]);
          }

          context.beginPath();
          const first = coords[0]!;
          context.moveTo(
            Math.round(first.x * horizontalPixelRatio),
            Math.round(first.yVwap * verticalPixelRatio),
          );

          for (let i = 1; i < coords.length; i++) {
            const pt = coords[i]!;
            context.lineTo(
              Math.round(pt.x * horizontalPixelRatio),
              Math.round(pt.yVwap * verticalPixelRatio),
            );
          }
          context.stroke();

          // Anchor point bullseye/handle
          const anchorPoint = coords[0]!;
          const ax = Math.round(anchorPoint.x * horizontalPixelRatio);
          const ay = Math.round(anchorPoint.yVwap * verticalPixelRatio);
          const isSelected = Boolean(presentation.isSelected);
          const isHovered = Boolean(presentation.isHovered);

          if (isSelected || isHovered) {
            const handleRadius = Math.max(5, 5 * horizontalPixelRatio);

            if (isHovered) {
              context.beginPath();
              context.arc(ax, ay, handleRadius + 4 * horizontalPixelRatio, 0, Math.PI * 2);
              context.fillStyle = "rgba(41, 98, 255, 0.2)";
              context.fill();
            }

            context.beginPath();
            context.arc(ax, ay, handleRadius, 0, Math.PI * 2);
            context.fillStyle = "#ffffff";
            context.fill();

            context.strokeStyle = isSelected ? "#1d4ed8" : vwapColor;
            context.lineWidth = Math.max(2, 2 * horizontalPixelRatio);
            context.stroke();
          } else {
            const radius = Math.max(3, 3 * horizontalPixelRatio);

            context.fillStyle = vwapColor;
            context.beginPath();
            context.arc(ax, ay, radius, 0, Math.PI * 2);
            context.fill();

            context.strokeStyle = "#ffffff";
            context.lineWidth = Math.max(1, horizontalPixelRatio);
            context.beginPath();
            context.arc(ax, ay, radius, 0, Math.PI * 2);
            context.stroke();
          }
        }

        context.restore();
      },
    );
  }
}

class AnchoredVwapPaneView implements IPrimitivePaneView {
  private readonly paneRenderer: AnchoredVwapPaneRenderer;

  constructor(
    getCoords: () => readonly ComputedPointCoords[],
    getAnchorX: () => number | null,
    getPresentation: () => AnchoredVwapPresentationOptions,
  ) {
    this.paneRenderer = new AnchoredVwapPaneRenderer(
      getCoords,
      getAnchorX,
      getPresentation,
    );
  }

  zOrder(): "normal" {
    return "normal";
  }

  renderer(): IPrimitivePaneRenderer {
    return this.paneRenderer;
  }
}

class AnchoredVwapPriceAxisView implements ISeriesPrimitiveAxisView {
  constructor(
    private readonly coordinateValue: () => number | null,
    private readonly label: () => string,
    private readonly color: () => string,
    private readonly isVisible: () => boolean,
  ) {}

  coordinate(): number {
    return this.coordinateValue() ?? -1_000;
  }

  text(): string {
    return this.label();
  }

  textColor(): string {
    return "#ffffff";
  }

  backColor(): string {
    return this.color();
  }

  visible(): boolean {
    return this.isVisible() && this.coordinateValue() !== null;
  }
}

export class AnchoredVwapPrimitive implements ISeriesPrimitive<Time> {
  readonly id: string;
  private attachedParams: SeriesAttachedParameter<Time> | null = null;
  private result: AnchoredVwapResult | null = null;
  private presentation: AnchoredVwapPresentationOptions = {};

  private computedCoords: readonly ComputedPointCoords[] = [];
  private anchorX: number | null = null;
  private latestY: number | null = null;

  private readonly paneViewsValue: readonly IPrimitivePaneView[];
  private readonly priceAxisViewsValue: readonly ISeriesPrimitiveAxisView[];

  constructor(renderInput: AnchoredVwapRenderInput) {
    this.id = renderInput.vwapId;
    this.result = renderInput.result;
    this.presentation = renderInput.presentation ?? {};

    const getCoords = () => this.computedCoords;
    const getAnchorX = () => this.anchorX;
    const getPresentation = () => this.presentation;

    this.paneViewsValue = [
      new AnchoredVwapPaneView(getCoords, getAnchorX, getPresentation),
    ];

    this.priceAxisViewsValue = [
      new AnchoredVwapPriceAxisView(
        () => this.latestY,
        () => {
          const v = this.result?.latestPoint?.vwap;
          const prec = this.presentation.labelPrecision ?? 2;
          return v !== undefined && Number.isFinite(v)
            ? `AVWAP ${v.toFixed(prec)}`
            : "AVWAP";
        },
        () => this.presentation.vwapColor ?? DEFAULT_VWAP_COLOR,
        () =>
          (this.presentation.showLabels ?? true) &&
          this.result?.latestPoint !== null,
      ),
    ];
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this.attachedParams = param;
    this.updateAllViews();
  }

  detached(): void {
    this.attachedParams = null;
    this.computedCoords = [];
    this.anchorX = null;
    this.latestY = null;
  }

  update(renderInput: AnchoredVwapRenderInput): void {
    this.result = renderInput.result;
    this.presentation = renderInput.presentation ?? {};
    this.updateAllViews();
    this.attachedParams?.requestUpdate();
  }

  updateAllViews(): void {
    if (!this.attachedParams || !this.result || this.result.points.length === 0) {
      this.computedCoords = [];
      this.anchorX = null;
      this.latestY = null;
      return;
    }

    const series = this.attachedParams.series;
    const timeScale = this.attachedParams.chart.timeScale();

    // Resolve Anchor X
    const anchorChartTime = Math.floor(
      this.result.anchorTimestamp / 1_000,
    ) as UTCTimestamp;
    this.anchorX = timeScale.timeToCoordinate(anchorChartTime);

    const coords: ComputedPointCoords[] = [];

    for (const pt of this.result.points) {
      const chartTime = Math.floor(pt.timestamp / 1_000) as UTCTimestamp;
      const x = timeScale.timeToCoordinate(chartTime);
      const yVwap = series.priceToCoordinate(pt.vwap);

      if (x === null || yVwap === null) {
        continue;
      }

      const bandCoords: {
        multiplier: number;
        yUpper: number;
        yLower: number;
      }[] = [];

      for (const band of pt.bands) {
        const yUpper = series.priceToCoordinate(band.upper);
        const yLower = series.priceToCoordinate(band.lower);
        if (yUpper !== null && yLower !== null) {
          bandCoords.push({
            multiplier: band.multiplier,
            yUpper,
            yLower,
          });
        }
      }

      coords.push({
        x,
        yVwap,
        bandCoords,
        rawPoint: pt,
      });
    }

    this.computedCoords = coords;

    if (coords.length > 0) {
      const lastCoord = coords[coords.length - 1]!;
      this.latestY = lastCoord.yVwap;
      if (this.anchorX === null) {
        this.anchorX = coords[0]!.x;
      }
    } else {
      this.latestY = null;
    }
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.paneViewsValue;
  }

  priceAxisViews(): readonly ISeriesPrimitiveAxisView[] {
    return this.priceAxisViewsValue;
  }

  autoscaleInfo(): null {
    return null;
  }

  /**
   * Hit test against the anchor handle or the VWAP line.
   */
  hitTestTarget(
    x: number,
    y: number,
    tolerancePx = 10,
  ): "anchor" | "line" | null {
    if (this.computedCoords.length === 0) return null;
    const first = this.computedCoords[0]!;
    if (Math.hypot(x - first.x, y - first.yVwap) <= tolerancePx + 4) {
      return "anchor";
    }
    // Check if near VWAP curve
    for (let i = 0; i < this.computedCoords.length; i += 2) {
      const pt = this.computedCoords[i]!;
      if (Math.hypot(x - pt.x, y - pt.yVwap) <= tolerancePx) {
        return "line";
      }
    }
    return null;
  }

  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    const target = this.hitTestTarget(x, y);
    if (!target) return null;
    return {
      cursorStyle: target === "anchor" ? "grab" : "pointer",
      externalId: this.id,
      zOrder: "top",
    };
  }

  getAnchorCoordinates(): { x: number | null; y: number | null } {
    if (this.computedCoords.length === 0) {
      return { x: this.anchorX, y: null };
    }
    return { x: this.computedCoords[0]!.x, y: this.computedCoords[0]!.yVwap };
  }
}

export { AnchoredVwapPrimitive as AnchoredVwapDrawingPrimitive };
