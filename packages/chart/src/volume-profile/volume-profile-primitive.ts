import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  ISeriesPrimitiveAxisView,
  SeriesAttachedParameter,
  Time,
} from "lightweight-charts";
import type {
  VolumeProfilePresentationOptions,
  VolumeProfileRenderInput,
  VolumeProfileResult,
  VolumeProfileRow,
} from "./types";

interface ComputedRowCoords {
  readonly row: VolumeProfileRow;
  readonly yTop: number;
  readonly yBottom: number;
}

class VolumeProfilePaneRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly getCoords: () => readonly ComputedRowCoords[],
    private readonly getPocCoord: () => number | null,
    private readonly getVahCoord: () => number | null,
    private readonly getValCoord: () => number | null,
    private readonly getMaxVolume: () => number,
    private readonly getPresentation: () => VolumeProfilePresentationOptions,
  ) {}

  draw(target: Parameters<IPrimitivePaneRenderer["draw"]>[0]): void {
    const coords = this.getCoords();
    const maxVol = this.getMaxVolume();
    if (coords.length === 0 || maxVol <= 0) return;

    const presentation = this.getPresentation();
    const placement = presentation.placement ?? "right";
    const widthFraction = Math.min(0.5, Math.max(0.05, presentation.widthFraction ?? 0.2));
    const showPOC = presentation.showPOC ?? true;
    const showVAH = presentation.showVAH ?? true;
    const showVAL = presentation.showVAL ?? true;
    const showValueAreaShading = presentation.showValueAreaShading ?? true;
    const valueAreaOpacity = presentation.valueAreaOpacity ?? 0.7;
    const nonValueAreaOpacity = presentation.nonValueAreaOpacity ?? 0.25;

    const pocColor = presentation.pocColor ?? "#d97706";
    const vahColor = presentation.vahColor ?? "#3b82f6";
    const valColor = presentation.valColor ?? "#3b82f6";
    const bullishColor = presentation.bullishColor ?? "rgba(37, 169, 119, 0.75)";
    const bearishColor = presentation.bearishColor ?? "rgba(220, 83, 98, 0.75)";
    const neutralColor = presentation.neutralColor ?? "rgba(156, 163, 175, 0.65)";
    const totalColor = presentation.totalColor ?? "rgba(99, 102, 241, 0.65)";

    const yPoc = this.getPocCoord();
    const yVah = this.getVahCoord();
    const yVal = this.getValCoord();

    target.useBitmapCoordinateSpace(
      ({ context, horizontalPixelRatio, verticalPixelRatio, bitmapSize }) => {
        context.save();

        const maxWidthPx = bitmapSize.width * widthFraction;

        for (const item of coords) {
          const y1 = Math.min(item.yTop, item.yBottom) * verticalPixelRatio;
          const y2 = Math.max(item.yTop, item.yBottom) * verticalPixelRatio;
          const h = Math.max(1 * verticalPixelRatio, y2 - y1);

          // Skip offscreen rows
          if (y2 < 0 || y1 > bitmapSize.height) continue;

          const row = item.row;
          const barWidth = (row.totalVolume / maxVol) * maxWidthPx;
          if (barWidth <= 0) continue;

          const opacity =
            showValueAreaShading && !row.isValueArea
              ? nonValueAreaOpacity
              : valueAreaOpacity;

          context.globalAlpha = opacity;

          const hasDirectional =
            (row.bullishVolume > 0 || row.bearishVolume > 0 || row.neutralVolume > 0) &&
            row.bullishVolume + row.bearishVolume + row.neutralVolume > 0;

          if (hasDirectional) {
            const bullW = (row.bullishVolume / maxVol) * maxWidthPx;
            const bearW = (row.bearishVolume / maxVol) * maxWidthPx;
            const neutW = (row.neutralVolume / maxVol) * maxWidthPx;

            if (placement === "right") {
              let currentRight = bitmapSize.width;

              // Neutral first (left-most of right alignment)
              if (neutW > 0) {
                context.fillStyle = neutralColor;
                context.fillRect(currentRight - neutW, y1, neutW, h);
                currentRight -= neutW;
              }
              // Bearish next
              if (bearW > 0) {
                context.fillStyle = bearishColor;
                context.fillRect(currentRight - bearW, y1, bearW, h);
                currentRight -= bearW;
              }
              // Bullish next
              if (bullW > 0) {
                context.fillStyle = bullishColor;
                context.fillRect(currentRight - bullW, y1, bullW, h);
              }
            } else {
              let currentLeft = 0;
              if (bullW > 0) {
                context.fillStyle = bullishColor;
                context.fillRect(currentLeft, y1, bullW, h);
                currentLeft += bullW;
              }
              if (bearW > 0) {
                context.fillStyle = bearishColor;
                context.fillRect(currentLeft, y1, bearW, h);
                currentLeft += bearW;
              }
              if (neutW > 0) {
                context.fillStyle = neutralColor;
                context.fillRect(currentLeft, y1, neutW, h);
              }
            }
          } else {
            // Total volume bar
            context.fillStyle = totalColor;
            if (placement === "right") {
              const x = bitmapSize.width - barWidth;
              context.fillRect(x, y1, barWidth, h);
            } else {
              context.fillRect(0, y1, barWidth, h);
            }
          }
        }

        context.globalAlpha = 1.0;

        // Draw VAH line
        if (showVAH && yVah !== null) {
          const y = Math.round(yVah * verticalPixelRatio);
          if (y >= 0 && y <= bitmapSize.height) {
            context.strokeStyle = vahColor;
            context.lineWidth = Math.max(1, horizontalPixelRatio);
            context.setLineDash([
              4 * horizontalPixelRatio,
              3 * horizontalPixelRatio,
            ]);
            context.beginPath();
            context.moveTo(0, y);
            context.lineTo(bitmapSize.width, y);
            context.stroke();
          }
        }

        // Draw VAL line
        if (showVAL && yVal !== null) {
          const y = Math.round(yVal * verticalPixelRatio);
          if (y >= 0 && y <= bitmapSize.height) {
            context.strokeStyle = valColor;
            context.lineWidth = Math.max(1, horizontalPixelRatio);
            context.setLineDash([
              4 * horizontalPixelRatio,
              3 * horizontalPixelRatio,
            ]);
            context.beginPath();
            context.moveTo(0, y);
            context.lineTo(bitmapSize.width, y);
            context.stroke();
          }
        }

        // Draw POC ray
        if (showPOC && yPoc !== null) {
          const y = Math.round(yPoc * verticalPixelRatio);
          if (y >= 0 && y <= bitmapSize.height) {
            context.strokeStyle = pocColor;
            context.lineWidth = Math.max(2, 2 * horizontalPixelRatio);
            context.setLineDash([]);
            context.beginPath();
            context.moveTo(0, y);
            context.lineTo(bitmapSize.width, y);
            context.stroke();
          }
        }

        context.restore();
      },
    );
  }
}

class VolumeProfilePaneView implements IPrimitivePaneView {
  private readonly paneRenderer: VolumeProfilePaneRenderer;

  constructor(
    getCoords: () => readonly ComputedRowCoords[],
    getPocCoord: () => number | null,
    getVahCoord: () => number | null,
    getValCoord: () => number | null,
    getMaxVolume: () => number,
    getPresentation: () => VolumeProfilePresentationOptions,
  ) {
    this.paneRenderer = new VolumeProfilePaneRenderer(
      getCoords,
      getPocCoord,
      getVahCoord,
      getValCoord,
      getMaxVolume,
      getPresentation,
    );
  }

  zOrder(): "bottom" {
    return "bottom";
  }

  renderer(): IPrimitivePaneRenderer {
    return this.paneRenderer;
  }
}

class VolumeProfilePriceAxisView implements ISeriesPrimitiveAxisView {
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

export class VolumeProfilePrimitive implements ISeriesPrimitive<Time> {
  readonly id: string;
  private attachedParams: SeriesAttachedParameter<Time> | null = null;
  private result: VolumeProfileResult | null = null;
  private presentation: VolumeProfilePresentationOptions = {};

  private computedCoords: readonly ComputedRowCoords[] = [];
  private yPoc: number | null = null;
  private yVah: number | null = null;
  private yVal: number | null = null;
  private maxRowVolume = 0;

  private readonly paneViewsValue: readonly IPrimitivePaneView[];
  private readonly priceAxisViewsValue: readonly ISeriesPrimitiveAxisView[];

  constructor(renderInput: VolumeProfileRenderInput) {
    this.id = renderInput.profileId;
    this.result = renderInput.result;
    this.presentation = renderInput.presentation ?? {};

    const getCoords = () => this.computedCoords;
    const getPocCoord = () => this.yPoc;
    const getVahCoord = () => this.yVah;
    const getValCoord = () => this.yVal;
    const getMaxVolume = () => this.maxRowVolume;
    const getPresentation = () => this.presentation;

    this.paneViewsValue = [
      new VolumeProfilePaneView(
        getCoords,
        getPocCoord,
        getVahCoord,
        getValCoord,
        getMaxVolume,
        getPresentation,
      ),
    ];

    this.priceAxisViewsValue = [
      new VolumeProfilePriceAxisView(
        getPocCoord,
        () => `POC ${this.result?.pocPrice?.toFixed(1) ?? ""}`,
        () => this.presentation.pocColor ?? "#d97706",
        () => (this.presentation.showPOC ?? true) && (this.presentation.showLabels ?? true),
      ),
      new VolumeProfilePriceAxisView(
        getVahCoord,
        () => `VAH ${this.result?.vah?.toFixed(1) ?? ""}`,
        () => this.presentation.vahColor ?? "#3b82f6",
        () => (this.presentation.showVAH ?? true) && (this.presentation.showLabels ?? true),
      ),
      new VolumeProfilePriceAxisView(
        getValCoord,
        () => `VAL ${this.result?.val?.toFixed(1) ?? ""}`,
        () => this.presentation.valColor ?? "#3b82f6",
        () => (this.presentation.showVAL ?? true) && (this.presentation.showLabels ?? true),
      ),
    ];

    this.recomputeLocalMaxVolume();
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this.attachedParams = param;
    this.updateAllViews();
  }

  detached(): void {
    this.attachedParams = null;
    this.computedCoords = [];
    this.yPoc = null;
    this.yVah = null;
    this.yVal = null;
  }

  update(renderInput: VolumeProfileRenderInput): void {
    this.result = renderInput.result;
    this.presentation = renderInput.presentation ?? {};
    this.recomputeLocalMaxVolume();
    this.updateAllViews();
    this.attachedParams?.requestUpdate();
  }

  updateAllViews(): void {
    if (!this.attachedParams || !this.result || this.result.rows.length === 0) {
      this.computedCoords = [];
      this.yPoc = null;
      this.yVah = null;
      this.yVal = null;
      return;
    }

    const series = this.attachedParams.series;

    const coords: ComputedRowCoords[] = [];
    for (const row of this.result.rows) {
      const yTop = series.priceToCoordinate(row.high);
      const yBottom = series.priceToCoordinate(row.low);
      if (yTop !== null && yBottom !== null) {
        coords.push({ row, yTop, yBottom });
      }
    }
    this.computedCoords = coords;

    this.yPoc =
      this.result.pocPrice !== null
        ? series.priceToCoordinate(this.result.pocPrice)
        : null;
    this.yVah =
      this.result.vah !== null ? series.priceToCoordinate(this.result.vah) : null;
    this.yVal =
      this.result.val !== null ? series.priceToCoordinate(this.result.val) : null;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.paneViewsValue;
  }

  priceAxisViews(): readonly ISeriesPrimitiveAxisView[] {
    return this.priceAxisViewsValue;
  }

  // Prevents altering autoscale bounds with offscreen fixed profiles
  autoscaleInfo(): null {
    return null;
  }

  private recomputeLocalMaxVolume(): void {
    if (!this.result || this.result.rows.length === 0) {
      this.maxRowVolume = 0;
      return;
    }
    let max = 0;
    for (const row of this.result.rows) {
      if (row.totalVolume > max) max = row.totalVolume;
    }
    this.maxRowVolume = max;
  }
}
