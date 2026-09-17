import type {
  ISeriesPrimitive,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  SeriesAttachedParameter,
  Time,
} from "lightweight-charts";
import type { VolumeProfilePresentationOptions, VolumeProfileResult, VolumeProfileRow } from "./types";

export interface VpPreviewState {
  readonly fromEpoch: number; // epoch-seconds
  readonly toEpoch: number;   // epoch-seconds
  readonly provisionalResult?: VolumeProfileResult | undefined;
  readonly presentation?: VolumeProfilePresentationOptions | undefined;
}

interface ComputedPreviewRowCoords {
  readonly row: VolumeProfileRow;
  readonly yTop: number;
  readonly yBottom: number;
}

class VpPreviewPaneRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly getState: () => VpPreviewState | null,
    private readonly getFromX: () => number | null,
    private readonly getToX: () => number | null,
    private readonly getPreviewCoords: () => readonly ComputedPreviewRowCoords[],
    private readonly getMaxVolume: () => number,
  ) {}

  draw(target: Parameters<IPrimitivePaneRenderer["draw"]>[0]): void {
    const state = this.getState();
    if (!state) return;

    const fromX = this.getFromX();
    const toX = this.getToX();

    target.useBitmapCoordinateSpace(({ context, horizontalPixelRatio, verticalPixelRatio, bitmapSize }) => {
      context.save();

      // Draw range shading
      if (fromX !== null && toX !== null) {
        const x1 = Math.min(fromX, toX) * horizontalPixelRatio;
        const x2 = Math.max(fromX, toX) * horizontalPixelRatio;
        const w = Math.max(1, x2 - x1);

        context.fillStyle = "rgba(231, 184, 75, 0.08)";
        context.fillRect(x1, 0, w, bitmapSize.height);

        // Left boundary
        context.strokeStyle = "rgba(231, 184, 75, 0.7)";
        context.lineWidth = Math.max(1, horizontalPixelRatio);
        context.setLineDash([4 * horizontalPixelRatio, 3 * horizontalPixelRatio]);
        context.beginPath();
        context.moveTo(x1, 0);
        context.lineTo(x1, bitmapSize.height);
        context.stroke();

        // Right boundary
        context.beginPath();
        context.moveTo(x2, 0);
        context.lineTo(x2, bitmapSize.height);
        context.stroke();
        context.setLineDash([]);
      }

      // Draw provisional histogram (right-side, bounded within range)
      const coords = this.getPreviewCoords();
      const maxVol = this.getMaxVolume();
      const presentation = state.presentation;
      if (coords.length > 0 && maxVol > 0 && fromX !== null && toX !== null) {
        const rangeLeft = Math.min(fromX, toX) * horizontalPixelRatio;
        const rangeRight = Math.max(fromX, toX) * horizontalPixelRatio;
        const maxBarWidth = rangeRight - rangeLeft;
        const bullishColor = presentation?.bullishColor ?? "rgba(37, 169, 119, 0.55)";
        const bearishColor = presentation?.bearishColor ?? "rgba(220, 83, 98, 0.55)";
        const totalColor = presentation?.totalColor ?? "rgba(99, 102, 241, 0.55)";

        context.globalAlpha = 0.6;
        for (const item of coords) {
          const y1 = Math.min(item.yTop, item.yBottom) * verticalPixelRatio;
          const y2 = Math.max(item.yTop, item.yBottom) * verticalPixelRatio;
          const h = Math.max(1 * verticalPixelRatio, y2 - y1);
          if (y2 < 0 || y1 > bitmapSize.height) continue;

          const row = item.row;
          const barWidth = (row.totalVolume / maxVol) * maxBarWidth;
          if (barWidth <= 0) continue;

          const hasDirectional = row.bullishVolume + row.bearishVolume > 0;
          if (hasDirectional) {
            const bullW = (row.bullishVolume / maxVol) * maxBarWidth;
            const bearW = (row.bearishVolume / maxVol) * maxBarWidth;
            // Right-side placement
            let cur = rangeRight;
            if (bearW > 0) {
              context.fillStyle = bearishColor;
              context.fillRect(cur - bearW, y1, bearW, h);
              cur -= bearW;
            }
            if (bullW > 0) {
              context.fillStyle = bullishColor;
              context.fillRect(cur - bullW, y1, bullW, h);
            }
          } else {
            context.fillStyle = totalColor;
            context.fillRect(rangeRight - barWidth, y1, barWidth, h);
          }
        }
        context.globalAlpha = 1.0;

        // POC line in preview
        // (poc coordinate computed in updateAllViews)
      }

      context.restore();
    });
  }
}

class VpPreviewPaneView implements IPrimitivePaneView {
  private readonly _renderer: VpPreviewPaneRenderer;
  constructor(
    getState: () => VpPreviewState | null,
    getFromX: () => number | null,
    getToX: () => number | null,
    getPreviewCoords: () => readonly ComputedPreviewRowCoords[],
    getMaxVolume: () => number,
  ) {
    this._renderer = new VpPreviewPaneRenderer(getState, getFromX, getToX, getPreviewCoords, getMaxVolume);
  }
  zOrder(): "top" { return "top"; }
  renderer(): VpPreviewPaneRenderer { return this._renderer; }
}

export class VpPreviewPrimitive implements ISeriesPrimitive<Time> {
  private attachedParams: SeriesAttachedParameter<Time> | null = null;
  private state: VpPreviewState | null = null;
  private fromX: number | null = null;
  private toX: number | null = null;
  private previewCoords: readonly ComputedPreviewRowCoords[] = [];
  private maxRowVolume = 0;

  private readonly paneViewsValue: readonly IPrimitivePaneView[];

  constructor() {
    this.paneViewsValue = [
      new VpPreviewPaneView(
        () => this.state,
        () => this.fromX,
        () => this.toX,
        () => this.previewCoords,
        () => this.maxRowVolume,
      ),
    ];
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this.attachedParams = param;
  }

  detached(): void {
    this.attachedParams = null;
    this.state = null;
    this.fromX = null;
    this.toX = null;
    this.previewCoords = [];
  }

  update(state: VpPreviewState | null): void {
    this.state = state;
    this.updateAllViews();
    this.attachedParams?.requestUpdate();
  }

  updateAllViews(): void {
    if (!this.attachedParams || !this.state) {
      this.fromX = null;
      this.toX = null;
      this.previewCoords = [];
      this.maxRowVolume = 0;
      return;
    }

    const chart = this.attachedParams.chart;
    const series = this.attachedParams.series;
    const timeScale = chart.timeScale();

    // Convert epoch-seconds to chart timestamps (UTCTimestamp = epoch-seconds)
    this.fromX = timeScale.timeToCoordinate(this.state.fromEpoch as Time);
    this.toX = timeScale.timeToCoordinate(this.state.toEpoch as Time);

    const result = this.state.provisionalResult;
    if (result && result.rows.length > 0) {
      const coords: ComputedPreviewRowCoords[] = [];
      let max = 0;
      for (const row of result.rows) {
        const yTop = series.priceToCoordinate(row.high);
        const yBottom = series.priceToCoordinate(row.low);
        if (yTop !== null && yBottom !== null) {
          coords.push({ row, yTop, yBottom });
        }
        if (row.totalVolume > max) max = row.totalVolume;
      }
      this.previewCoords = coords;
      this.maxRowVolume = max;
    } else {
      this.previewCoords = [];
      this.maxRowVolume = 0;
    }
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.paneViewsValue;
  }

  autoscaleInfo(): null {
    return null;
  }
}
