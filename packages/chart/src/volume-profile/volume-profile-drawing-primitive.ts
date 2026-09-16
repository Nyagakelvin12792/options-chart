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
import type { VolumeProfileRangeDrawing } from "../chart-adapter";
import type { VolumeProfileResult, VolumeProfileRow } from "./types";

const toChartTimestamp = (timestamp: number): UTCTimestamp =>
  Math.floor(timestamp / 1_000) as UTCTimestamp;

interface ComputedRowCoords {
  readonly row: VolumeProfileRow;
  readonly yTop: number;
  readonly yBottom: number;
}

export type VpHitTarget = "start" | "end" | "body";

export interface VpHitTestResult {
  readonly target: VpHitTarget;
  readonly drawingId: string;
}

class VolumeProfileDrawingPaneRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly getCoords: () => {
      readonly minX: number | null;
      readonly maxX: number | null;
      readonly minY: number | null;
      readonly maxY: number | null;
      readonly rows: readonly ComputedRowCoords[];
      readonly yPoc: number | null;
      readonly yVah: number | null;
      readonly yVal: number | null;
      readonly maxVolume: number;
    },
    private readonly getDrawing: () => VolumeProfileRangeDrawing,
  ) {}

  draw(target: Parameters<IPrimitivePaneRenderer["draw"]>[0]): void {
    const coords = this.getCoords();
    const drawing = this.getDrawing();

    if (
      coords.minX === null ||
      coords.maxX === null ||
      coords.minY === null ||
      coords.maxY === null
    ) {
      return;
    }

    const { minX, maxX, minY, maxY, rows, yPoc, yVah, yVal, maxVolume } = coords;

    const isSelected = Boolean(drawing.isSelected);
    const isHovered = Boolean(drawing.isHovered);
    const placement = drawing.placement ?? "left";
    const widthFraction = Math.min(1.0, Math.max(0.05, (drawing.widthPercent ?? 30) / 100));
    const showPOC = drawing.showPOC ?? true;
    const showVAH = drawing.showVAH ?? true;
    const showVAL = drawing.showVAL ?? true;
    const showValueAreaShading = drawing.showValueAreaShading ?? true;

    const baseOpacity = ((drawing.opacityPercent ?? 70) / 100);
    const nonVaOpacity = baseOpacity * 0.4;

    const pocColor = "#f59e0b";
    const vahColor = "#3b82f6";
    const valColor = "#3b82f6";
    const bullishColor = "rgba(37, 169, 119, 0.85)";
    const bearishColor = "rgba(220, 83, 98, 0.85)";
    const neutralColor = "rgba(156, 163, 175, 0.75)";
    const totalColor = "rgba(99, 102, 241, 0.75)";

    target.useBitmapCoordinateSpace(
      ({ context, horizontalPixelRatio, verticalPixelRatio }) => {
        context.save();

        const x1 = Math.round(minX * horizontalPixelRatio);
        const x2 = Math.round(maxX * horizontalPixelRatio);
        const yTop = Math.round(minY * verticalPixelRatio);
        const yBottom = Math.round(maxY * verticalPixelRatio);
        const w = Math.max(1, x2 - x1);
        const h = Math.max(1, yBottom - yTop);

        // 1. Shaded range background
        context.fillStyle = isSelected
          ? "rgba(59, 130, 246, 0.08)"
          : isHovered
            ? "rgba(59, 130, 246, 0.04)"
            : "rgba(100, 116, 139, 0.03)";
        context.fillRect(x1, yTop, w, h);

        // 2. Range bounding box
        context.strokeStyle = isSelected
          ? "#2962ff"
          : isHovered
            ? "rgba(59, 130, 246, 0.6)"
            : "rgba(148, 163, 184, 0.35)";
        context.lineWidth = isSelected
          ? Math.max(1.5, 1.5 * horizontalPixelRatio)
          : Math.max(1, horizontalPixelRatio);
        context.setLineDash(isSelected ? [] : [3 * horizontalPixelRatio, 3 * horizontalPixelRatio]);
        context.strokeRect(x1, yTop, w, h);

        // 3. Spatially attached histogram
        if (rows.length > 0 && maxVolume > 0) {
          const maxHistWidthPx = w * widthFraction;

          for (const item of rows) {
            const ry1 = Math.min(item.yTop, item.yBottom) * verticalPixelRatio;
            const ry2 = Math.max(item.yTop, item.yBottom) * verticalPixelRatio;
            const rh = Math.max(1 * verticalPixelRatio, ry2 - ry1);

            if (ry2 < yTop || ry1 > yBottom) continue;

            const row = item.row;
            const barW = (row.totalVolume / maxVolume) * maxHistWidthPx;
            if (barW <= 0) continue;

            context.globalAlpha = showValueAreaShading && !row.isValueArea
              ? nonVaOpacity
              : baseOpacity;

            const hasDirectional =
              drawing.volumeMode !== "total" &&
              (row.bullishVolume > 0 || row.bearishVolume > 0 || row.neutralVolume > 0);

            if (hasDirectional) {
              const bullW = (row.bullishVolume / maxVolume) * maxHistWidthPx;
              const bearW = (row.bearishVolume / maxVolume) * maxHistWidthPx;
              const neutW = (row.neutralVolume / maxVolume) * maxHistWidthPx;

              if (placement === "right") {
                let curRight = x2;
                if (neutW > 0) {
                  context.fillStyle = neutralColor;
                  context.fillRect(curRight - neutW, ry1, neutW, rh);
                  curRight -= neutW;
                }
                if (bearW > 0) {
                  context.fillStyle = bearishColor;
                  context.fillRect(curRight - bearW, ry1, bearW, rh);
                  curRight -= bearW;
                }
                if (bullW > 0) {
                  context.fillStyle = bullishColor;
                  context.fillRect(curRight - bullW, ry1, bullW, rh);
                }
              } else {
                let curLeft = x1;
                if (bullW > 0) {
                  context.fillStyle = bullishColor;
                  context.fillRect(curLeft, ry1, bullW, rh);
                  curLeft += bullW;
                }
                if (bearW > 0) {
                  context.fillStyle = bearishColor;
                  context.fillRect(curLeft, ry1, bearW, rh);
                  curLeft += bearW;
                }
                if (neutW > 0) {
                  context.fillStyle = neutralColor;
                  context.fillRect(curLeft, ry1, neutW, rh);
                }
              }
            } else {
              context.fillStyle = totalColor;
              if (placement === "right") {
                context.fillRect(x2 - barW, ry1, barW, rh);
              } else {
                context.fillRect(x1, ry1, barW, rh);
              }
            }
          }
        }

        context.globalAlpha = 1.0;

        // 4. VAH Line (across range width)
        if (showVAH && yVah !== null) {
          const y = Math.round(yVah * verticalPixelRatio);
          if (y >= yTop && y <= yBottom) {
            context.strokeStyle = vahColor;
            context.lineWidth = Math.max(1, horizontalPixelRatio);
            context.setLineDash([4 * horizontalPixelRatio, 3 * horizontalPixelRatio]);
            context.beginPath();
            context.moveTo(x1, y);
            context.lineTo(x2, y);
            context.stroke();
          }
        }

        // 5. VAL Line (across range width)
        if (showVAL && yVal !== null) {
          const y = Math.round(yVal * verticalPixelRatio);
          if (y >= yTop && y <= yBottom) {
            context.strokeStyle = valColor;
            context.lineWidth = Math.max(1, horizontalPixelRatio);
            context.setLineDash([4 * horizontalPixelRatio, 3 * horizontalPixelRatio]);
            context.beginPath();
            context.moveTo(x1, y);
            context.lineTo(x2, y);
            context.stroke();
          }
        }

        // 6. POC Ray (across range width with distinct color)
        if (showPOC && yPoc !== null) {
          const y = Math.round(yPoc * verticalPixelRatio);
          if (y >= yTop && y <= yBottom) {
            context.strokeStyle = pocColor;
            context.lineWidth = Math.max(2, 2 * horizontalPixelRatio);
            context.setLineDash([]);
            context.beginPath();
            context.moveTo(x1, y);
            context.lineTo(x2, y);
            context.stroke();
          }
        }

        // 7. Interactive selection handles (at minX and maxX midpoints)
        if (isSelected || isHovered) {
          const handleMidY = (yTop + yBottom) / 2;
          const handleRadius = Math.max(5, 5 * horizontalPixelRatio);

          const drawHandle = (hx: number, hy: number, isActive: boolean) => {
            context.beginPath();
            context.arc(hx, hy, handleRadius + (isActive ? 2 : 0), 0, Math.PI * 2);
            context.fillStyle = "#ffffff";
            context.fill();
            context.lineWidth = Math.max(2, 2 * horizontalPixelRatio);
            context.strokeStyle = isActive ? "#1d4ed8" : "#2962ff";
            context.stroke();
          };

          drawHandle(x1, handleMidY, false);
          drawHandle(x2, handleMidY, false);
        }

        context.restore();
      },
    );
  }
}

class VolumeProfileDrawingPaneView implements IPrimitivePaneView {
  private readonly paneRenderer: VolumeProfileDrawingPaneRenderer;

  constructor(
    getCoords: () => {
      readonly minX: number | null;
      readonly maxX: number | null;
      readonly minY: number | null;
      readonly maxY: number | null;
      readonly rows: readonly ComputedRowCoords[];
      readonly yPoc: number | null;
      readonly yVah: number | null;
      readonly yVal: number | null;
      readonly maxVolume: number;
    },
    getDrawing: () => VolumeProfileRangeDrawing,
  ) {
    this.paneRenderer = new VolumeProfileDrawingPaneRenderer(getCoords, getDrawing);
  }

  zOrder(): "bottom" {
    return "bottom";
  }

  renderer(): IPrimitivePaneRenderer {
    return this.paneRenderer;
  }
}

class VolumeProfileDrawingPriceAxisView implements ISeriesPrimitiveAxisView {
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

export class VolumeProfileDrawingPrimitive implements ISeriesPrimitive<Time> {
  readonly id: string;
  private attachedParams: SeriesAttachedParameter<Time> | null = null;
  private drawing: VolumeProfileRangeDrawing;
  private result: VolumeProfileResult | null = null;

  private minX: number | null = null;
  private maxX: number | null = null;
  private minY: number | null = null;
  private maxY: number | null = null;
  private computedRows: readonly ComputedRowCoords[] = [];
  private yPoc: number | null = null;
  private yVah: number | null = null;
  private yVal: number | null = null;
  private maxVolume = 0;

  private readonly paneViewsValue: readonly IPrimitivePaneView[];
  private readonly priceAxisViewsValue: readonly ISeriesPrimitiveAxisView[];

  constructor(drawing: VolumeProfileRangeDrawing, result: VolumeProfileResult | null = null) {
    this.id = drawing.id;
    this.drawing = drawing;
    this.result = result;

    const getCoords = () => ({
      minX: this.minX,
      maxX: this.maxX,
      minY: this.minY,
      maxY: this.maxY,
      rows: this.computedRows,
      yPoc: this.yPoc,
      yVah: this.yVah,
      yVal: this.yVal,
      maxVolume: this.maxVolume,
    });
    const getDrawing = () => this.drawing;

    this.paneViewsValue = [new VolumeProfileDrawingPaneView(getCoords, getDrawing)];

    this.priceAxisViewsValue = [
      new VolumeProfileDrawingPriceAxisView(
        () => this.yPoc,
        () => `POC ${this.result?.pocPrice?.toFixed(1) ?? ""}`,
        () => "#f59e0b",
        () => (this.drawing.showPOC ?? true) && (this.drawing.showLabels ?? true),
      ),
      new VolumeProfileDrawingPriceAxisView(
        () => this.yVah,
        () => `VAH ${this.result?.vah?.toFixed(1) ?? ""}`,
        () => "#3b82f6",
        () => (this.drawing.showVAH ?? true) && (this.drawing.showLabels ?? true),
      ),
      new VolumeProfileDrawingPriceAxisView(
        () => this.yVal,
        () => `VAL ${this.result?.val?.toFixed(1) ?? ""}`,
        () => "#3b82f6",
        () => (this.drawing.showVAL ?? true) && (this.drawing.showLabels ?? true),
      ),
    ];

    this.recomputeMaxVolume();
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this.attachedParams = param;
    this.updateAllViews();
  }

  detached(): void {
    this.attachedParams = null;
    this.minX = null;
    this.maxX = null;
    this.minY = null;
    this.maxY = null;
    this.computedRows = [];
    this.yPoc = null;
    this.yVah = null;
    this.yVal = null;
  }

  update(drawing: VolumeProfileRangeDrawing, result?: VolumeProfileResult | null): void {
    this.drawing = drawing;
    if (result !== undefined) {
      this.result = result;
      this.recomputeMaxVolume();
    }
    this.updateAllViews();
    this.attachedParams?.requestUpdate();
  }

  updateAllViews(): void {
    if (!this.attachedParams) {
      return;
    }

    const chart = this.attachedParams.chart;
    const series = this.attachedParams.series;

    const fromTimestamp = (this.drawing as any).from ?? this.drawing.fromTimestamp;
    const toTimestamp = (this.drawing as any).to ?? this.drawing.toTimestamp;

    const fromX = chart.timeScale().timeToCoordinate(toChartTimestamp(fromTimestamp));
    const toX = chart.timeScale().timeToCoordinate(toChartTimestamp(toTimestamp));

    if (fromX === null && toX === null) {
      this.minX = null;
      this.maxX = null;
      this.minY = null;
      this.maxY = null;
      this.computedRows = [];
      return;
    }

    const validX1 = fromX ?? toX!;
    const validX2 = toX ?? fromX!;
    this.minX = Math.min(validX1, validX2);
    this.maxX = Math.max(validX1, validX2);

    if (this.result && this.result.rows.length > 0) {
      const topRow = this.result.rows[this.result.rows.length - 1]!;
      const bottomRow = this.result.rows[0]!;
      const y1 = series.priceToCoordinate(topRow.high);
      const y2 = series.priceToCoordinate(bottomRow.low);

      if (y1 !== null && y2 !== null) {
        this.minY = Math.min(y1, y2);
        this.maxY = Math.max(y1, y2);
      } else {
        this.minY = 0;
        this.maxY = 1_000;
      }

      const rows: ComputedRowCoords[] = [];
      for (const row of this.result.rows) {
        const yTop = series.priceToCoordinate(row.high);
        const yBottom = series.priceToCoordinate(row.low);
        if (yTop !== null && yBottom !== null) {
          rows.push({ row, yTop, yBottom });
        }
      }
      this.computedRows = rows;

      this.yPoc =
        this.result.pocPrice !== null
          ? series.priceToCoordinate(this.result.pocPrice)
          : null;
      this.yVah =
        this.result.vah !== null ? series.priceToCoordinate(this.result.vah) : null;
      this.yVal =
        this.result.val !== null ? series.priceToCoordinate(this.result.val) : null;
    } else {
      this.minY = 0;
      this.maxY = 1_000;
      this.computedRows = [];
      this.yPoc = null;
      this.yVah = null;
      this.yVal = null;
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
   * Hit test against handles, boundary lines, or range body.
   */
  hitTestTarget(x: number, y: number, tolerancePx = 10): VpHitTarget | null {
    if (
      this.minX === null ||
      this.maxX === null ||
      this.minY === null ||
      this.maxY === null
    ) {
      return null;
    }

    const midY = (this.minY + this.maxY) / 2;

    // Handle 1: start boundary handle
    if (Math.hypot(x - this.minX, y - midY) <= tolerancePx + 4) {
      return "start";
    }

    // Handle 2: end boundary handle
    if (Math.hypot(x - this.maxX, y - midY) <= tolerancePx + 4) {
      return "end";
    }

    // Start boundary line
    if (
      Math.abs(x - this.minX) <= tolerancePx &&
      y >= this.minY - tolerancePx &&
      y <= this.maxY + tolerancePx
    ) {
      return "start";
    }

    // End boundary line
    if (
      Math.abs(x - this.maxX) <= tolerancePx &&
      y >= this.minY - tolerancePx &&
      y <= this.maxY + tolerancePx
    ) {
      return "end";
    }

    // Body (inside range box)
    if (
      x >= this.minX - tolerancePx &&
      x <= this.maxX + tolerancePx &&
      y >= this.minY - tolerancePx &&
      y <= this.maxY + tolerancePx
    ) {
      return "body";
    }

    return null;
  }

  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    const target = this.hitTestTarget(x, y);
    if (!target) return null;
    return {
      cursorStyle:
        target === "start" || target === "end" ? "ew-resize" : "move",
      externalId: this.id,
      zOrder: "top",
    };
  }

  getCoordinates(): {
    minX: number | null;
    maxX: number | null;
    minY: number | null;
    maxY: number | null;
  } {
    return {
      minX: this.minX,
      maxX: this.maxX,
      minY: this.minY,
      maxY: this.maxY,
    };
  }

  private recomputeMaxVolume(): void {
    if (!this.result || this.result.rows.length === 0) {
      this.maxVolume = 0;
      return;
    }
    let max = 0;
    for (const row of this.result.rows) {
      if (row.totalVolume > max) max = row.totalVolume;
    }
    this.maxVolume = max;
  }
}
