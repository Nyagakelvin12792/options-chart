import type { Candle, GammaLevel } from "@options-chart/domain";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  HistogramSeries,
  LineStyle,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LogicalRange,
  type UTCTimestamp,
} from "lightweight-charts";

import type {
  ChartAdapter,
  ChartAdapterDiagnostics,
  ChartDrawing,
  ChartDrawingMode,
  ChartDrawingPreview,
  ChartHistoryOptions,
  ChartInitializeOptions,
  ChartVisibleRange,
  ChartViewportState,
  PositionDrawing,
  PositionDirection,
  VolumeProfileRangeDrawing,
} from "../chart-adapter";
import type { AnchoredVwapRenderInput } from "../anchored-vwap/types";
import { AnchoredVwapPrimitive } from "../anchored-vwap/anchored-vwap-primitive";
import {
  createPositionFromGesture,
  isPositionDrawingOrderValid,
  moveCompletePositionRange,
  movePositionDrawingLevel,
  movePositionTimeBoundary,
  type PositionDrawingLevel,
} from "../position-drawing";
import type {
  LevelSegment,
  LevelSegmentsPresentationOptions,
} from "../level-segments/types";
import { LevelSegmentsPrimitive } from "../level-segments/level-segments-primitive";
import type {
  VolumeProfileInput,
  VolumeProfileRenderInput,
} from "../volume-profile/types";
import { VolumeProfilePrimitive } from "../volume-profile/volume-profile-primitive";
import { VolumeProfileController } from "../volume-profile/controller";
import { VpPreviewPrimitive } from "../volume-profile/vp-preview-primitive";
import type { VpPreviewState } from "../volume-profile/vp-preview-primitive";
import { PositionDrawingPrimitive } from "./position-drawing-primitive";
import { VerticalLinePrimitive } from "./vertical-line-primitive";

const LEVEL_COLORS: Readonly<Record<GammaLevel["kind"], string>> = {
  "call-wall": "#29b57a",
  "put-wall": "#e05263",
  "gamma-flip": "#f0b44d",
  "max-pain": "#65a9ff",
  "secondary-gex": "#9aa7b6",
};

const USER_DRAWING_COLOR = "#f2c14e";
const POSITION_DRAG_TOLERANCE_PX = 8;
const MIN_POSITION_REWARD_RISK_RATIO = 0.25;
const MAX_POSITION_REWARD_RISK_RATIO = 20;
const VP_RANGE_MOVE_RAIL_HEIGHT_PX = 28;

const toChartTimestamp = (timestamp: number): UTCTimestamp =>
  Math.floor(timestamp / 1_000) as UTCTimestamp;

const toChartCandle = (candle: Candle): CandlestickData<UTCTimestamp> => ({
  time: toChartTimestamp(candle.openTime),
  open: candle.open,
  high: candle.high,
  low: candle.low,
  close: candle.close,
});

const toChartVolume = (candle: Candle): HistogramData<UTCTimestamp> => ({
  time: toChartTimestamp(candle.openTime),
  value: candle.volume,
  color:
    candle.close >= candle.open
      ? "rgba(37, 169, 119, 0.55)"
      : "rgba(220, 83, 98, 0.55)",
});

const formatVerticalLineLabel = (timestamp: number): string =>
  `${new Date(timestamp).toISOString().slice(5, 16).replace("T", " ")} UTC`;

export class LightweightChartsAdapter implements ChartAdapter {
  readonly name = "lightweight-charts";
  readonly version = "5.2.1";

  private chart: IChartApi | null = null;
  private container: HTMLElement | null = null;
  private ownerDocument: Document | null = null;
  private series: ISeriesApi<"Candlestick"> | null = null;
  private volumeSeries: ISeriesApi<"Histogram"> | null = null;
  private readonly levelLines = new Map<string, IPriceLine>();
  private readonly drawings = new Map<string, ChartDrawing>();
  private readonly horizontalDrawingLines = new Map<string, IPriceLine>();
  private readonly positionDrawingPrimitives = new Map<
    string,
    PositionDrawingPrimitive
  >();
  private readonly verticalDrawingPrimitives = new Map<
    string,
    VerticalLinePrimitive
  >();
  private readonly volumeProfileRangePrimitives = new Map<
    string,
    readonly VerticalLinePrimitive[]
  >();
  private readonly volumeProfilePrimitives = new Map<
    string,
    VolumeProfilePrimitive
  >();
  private readonly anchoredVwapPrimitives = new Map<
    string,
    AnchoredVwapPrimitive
  >();
  private levelSegmentsPrimitive: LevelSegmentsPrimitive | null = null;
  private readonly viewportListeners = new Set<
    (state: ChartViewportState) => void
  >();
  private readonly drawingsChangeListeners = new Set<
    (drawings: readonly ChartDrawing[]) => void
  >();
  private readonly timeSelectionListeners = new Set<
    (timestamp: number) => void
  >();
  private readonly drawingModeListeners = new Set<
    (mode: ChartDrawingMode) => void
  >();
  private readonly drawingPreviewListeners = new Set<
    (preview: ChartDrawingPreview) => void
  >();
  private candleTimestamps: number[] = [];
  private rawCandles: Candle[] = [];
  private vpPreviewPrimitive: VpPreviewPrimitive | null = null;
  private vpSelectionPrimitive: VpPreviewPrimitive | null = null;
  private vpPreviewController: VolumeProfileController | null = null;
  private lastPreviewRange: { from: number; to: number } | null = null;
  private queuedPreviewRange: { from: number; to: number } | null = null;
  private vpPreviewRafHandle: number | null = null;

  private drawingMode: ChartDrawingMode = "pointer";
  private selectedDrawingId: string | null = null;
  private drawingSequence = 0;
  private draggedPositionLevel: {
    readonly drawingId: string;
    readonly level: PositionDrawingLevel;
  } | null = null;
  private draggedRangeBoundary: {
    readonly drawingId: string;
    readonly boundary: "fromTimestamp" | "toTimestamp";
  } | null = null;
  private draggedRangeBody: {
    readonly drawingId: string;
    readonly pointerIndex: number;
    readonly fromIndex: number;
    readonly toIndex: number;
  } | null = null;
  private rangeDragChanged = false;
  private pendingVolumeProfileRange: {
    readonly id: string;
    readonly createdAt: number;
    readonly fromTimestamp: number;
  } | null = null;
  private pendingPositionGesture: {
    readonly id: string;
    readonly direction: PositionDirection;
    readonly entryPrice: number;
    readonly fromTimestamp: number;
  } | null = null;
  private positionPreviewPrimitive: PositionDrawingPrimitive | null = null;
  private positionPreviewRafHandle: number | null = null;
  private positionSettings: { defaultRewardRiskRatio: number } = {
    defaultRewardRiskRatio: 2.0,
  };
  private draggedPositionBoundary: {
    readonly drawingId: string;
    readonly boundary: "fromTimestamp" | "toTimestamp";
  } | null = null;
  private draggedPositionBody: {
    readonly drawingId: string;
    readonly pointerIndex: number;
    readonly fromIndex: number;
    readonly toIndex: number;
  } | null = null;
  private positionDragChanged = false;
  private initializedAt = 0;
  private chartCreateCount = 0;
  private historyReplacementCount = 0;
  private realtimeUpdateCount = 0;
  private resizeCount = 0;
  private dataPointCount = 0;
  private conflationEnabled = false;
  private lastOperationDurationMs = 0;
  private maxOperationDurationMs = 0;
  private lastError: string | null = null;

  initialize(container: HTMLElement, options: ChartInitializeOptions): void {
    if (this.chart) {
      throw new Error("Chart adapter is already initialized");
    }

    this.initializedAt = Date.now();
    this.conflationEnabled = options.enableConflation ?? false;
    this.container = container;
    this.ownerDocument =
      container.ownerDocument ??
      (typeof document !== "undefined" ? document : null);
    this.chart = createChart(container, {
      width: options.width,
      height: options.height,
      layout: {
        background: { type: ColorType.Solid, color: options.backgroundColor },
        textColor: options.textColor,
        fontFamily: "Arial, Helvetica, sans-serif",
        panes: {
          separatorColor: "#26323d",
          separatorHoverColor: "#40515e",
          enableResize: true,
        },
      },
      grid: {
        vertLines: { color: "#202b35" },
        horzLines: { color: "#202b35" },
      },
      rightPriceScale: {
        borderColor: "#33414e",
        scaleMargins: { top: 0.08, bottom: 0.06 },
      },
      timeScale: {
        borderColor: "#33414e",
        timeVisible: true,
        secondsVisible: false,
        enableConflation: this.conflationEnabled,
        precomputeConflationOnInit: false,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#7d8b99", labelBackgroundColor: "#25313c" },
        horzLine: { color: "#7d8b99", labelBackgroundColor: "#25313c" },
      },
      handleScale: true,
      handleScroll: true,
    });
    this.chartCreateCount += 1;

    this.series = this.chart.addSeries(CandlestickSeries, {
      upColor: "#25a977",
      downColor: "#dc5362",
      borderVisible: false,
      wickUpColor: "#25a977",
      wickDownColor: "#dc5362",
      priceLineVisible: true,
      lastValueVisible: true,
    });

    if (options.showVolumePane ?? true) {
      this.volumeSeries = this.chart.addSeries(
        HistogramSeries,
        {
          priceFormat: { type: "volume" },
          priceLineVisible: false,
          lastValueVisible: false,
          priceScaleId: "right",
        },
        1,
      );
      this.volumeSeries.priceScale().applyOptions({
        borderVisible: false,
        scaleMargins: { top: 0.12, bottom: 0 },
      });
      this.resizeVolumePane(options.height);
    }

    container.addEventListener("click", this.handleContainerClick, true);
    container.addEventListener("pointerdown", this.handlePointerDown, true);
    container.addEventListener("pointermove", this.handlePointerMove, true);
    container.addEventListener("pointerup", this.handlePointerUp, true);
    container.addEventListener("pointercancel", this.handlePointerCancel, true);
    this.ownerDocument?.addEventListener("keydown", this.handleKeyDown, true);
    this.chart
      .timeScale()
      .subscribeVisibleLogicalRangeChange(this.handleLogicalRangeChange);
  }

  setHistory(
    candles: readonly Candle[],
    options: ChartHistoryOptions = {},
  ): void {
    const preservedRange = options.preserveVisibleRange
      ? this.getVisibleRange()
      : null;

    this.measureOperation(() => {
      this.requireSeries().setData(candles.map(toChartCandle));
      this.volumeSeries?.setData(candles.map(toChartVolume));
    });
    this.historyReplacementCount += 1;
    this.dataPointCount = candles.length;
    this.rawCandles = [...candles].sort(
      (left, right) => left.openTime - right.openTime,
    );
    this.candleTimestamps = this.rawCandles.map((candle) =>
      Math.floor(candle.openTime / 1_000),
    );

    if (preservedRange) {
      this.setVisibleRange(preservedRange);
    } else if (options.fitContent ?? true) {
      this.requireChart().timeScale().fitContent();
    }
  }

  updateCandle(candle: Candle): void {
    this.measureOperation(() => {
      this.requireSeries().update(toChartCandle(candle));
      this.volumeSeries?.update(toChartVolume(candle));
    });
    this.realtimeUpdateCount += 1;
    const epochSec = Math.floor(candle.openTime / 1_000);
    const idx = this.binarySearchCandleIndex(epochSec);
    if (
      idx >= this.candleTimestamps.length ||
      this.candleTimestamps[idx] !== epochSec
    ) {
      this.candleTimestamps.splice(idx, 0, epochSec);
      this.rawCandles.splice(idx, 0, candle);
    } else {
      this.rawCandles[idx] = candle;
    }
    this.dataPointCount = Math.max(this.dataPointCount, 1);
  }

  setLevels(levels: readonly GammaLevel[]): void {
    const series = this.requireSeries();
    for (const line of this.levelLines.values()) {
      series.removePriceLine(line);
    }
    this.levelLines.clear();

    for (const level of levels) {
      const line = series.createPriceLine({
        price: level.price,
        color: LEVEL_COLORS[level.kind],
        lineWidth: level.importance === "primary" ? 2 : 1,
        lineStyle:
          level.importance === "primary" ? LineStyle.Solid : LineStyle.Dashed,
        axisLabelVisible: false,
        title: "",
      });
      this.levelLines.set(level.id, line);
    }
  }

  removeLevel(id: string): void {
    const line = this.levelLines.get(id);
    if (!line) return;
    this.requireSeries().removePriceLine(line);
    this.levelLines.delete(id);
  }

  setVolumeProfile(id: string, renderInput: VolumeProfileRenderInput): void {
    const series = this.requireSeries();
    const existing = this.volumeProfilePrimitives.get(id);
    if (existing) {
      existing.update(renderInput);
      return;
    }
    const primitive = new VolumeProfilePrimitive(renderInput);
    series.attachPrimitive(primitive);
    this.volumeProfilePrimitives.set(id, primitive);
  }

  removeVolumeProfile(id: string): void {
    const primitive = this.volumeProfilePrimitives.get(id);
    if (!primitive) return;
    if (this.series) {
      this.series.detachPrimitive(primitive);
    }
    this.volumeProfilePrimitives.delete(id);
  }

  setAnchoredVwap(id: string, renderInput: AnchoredVwapRenderInput): void {
    const series = this.requireSeries();
    const existing = this.anchoredVwapPrimitives.get(id);
    if (existing) {
      existing.update(renderInput);
      return;
    }
    const primitive = new AnchoredVwapPrimitive(renderInput);
    series.attachPrimitive(primitive);
    this.anchoredVwapPrimitives.set(id, primitive);
  }

  removeAnchoredVwap(id: string): void {
    const primitive = this.anchoredVwapPrimitives.get(id);
    if (!primitive) return;
    if (this.series) {
      this.series.detachPrimitive(primitive);
    }
    this.anchoredVwapPrimitives.delete(id);
  }

  setLevelSegments(
    segments: readonly LevelSegment[],
    presentation?: LevelSegmentsPresentationOptions,
  ): void {
    const series = this.requireSeries();
    if (this.levelSegmentsPrimitive) {
      this.levelSegmentsPrimitive.updateSegments(segments, presentation);
      return;
    }
    const primitive = new LevelSegmentsPrimitive(segments, presentation);
    series.attachPrimitive(primitive);
    this.levelSegmentsPrimitive = primitive;
  }

  clearLevelSegments(): void {
    if (!this.levelSegmentsPrimitive) return;
    if (this.series) {
      this.series.detachPrimitive(this.levelSegmentsPrimitive);
    }
    this.levelSegmentsPrimitive = null;
  }

  setVisibleRange(range: ChartVisibleRange): void {
    this.requireChart()
      .timeScale()
      .setVisibleRange({
        from: toChartTimestamp(range.fromTimestamp),
        to: toChartTimestamp(range.toTimestamp),
      });
  }

  getVisibleRange(): ChartVisibleRange | null {
    const range = this.requireChart().timeScale().getVisibleRange();
    if (
      !range ||
      typeof range.from !== "number" ||
      typeof range.to !== "number"
    ) {
      return null;
    }
    return {
      fromTimestamp: range.from * 1_000,
      toTimestamp: range.to * 1_000,
    };
  }

  priceToCoordinate(price: number): number | null {
    if (!Number.isFinite(price)) return null;
    return this.requireSeries().priceToCoordinate(price);
  }

  subscribeViewportChange(
    listener: (state: ChartViewportState) => void,
  ): () => void {
    this.viewportListeners.add(listener);
    return () => this.viewportListeners.delete(listener);
  }

  subscribeDrawingModeChange(
    listener: (mode: ChartDrawingMode) => void,
  ): () => void {
    this.drawingModeListeners.add(listener);
    return () => this.drawingModeListeners.delete(listener);
  }

  subscribeDrawingPreviewChange(
    listener: (preview: ChartDrawingPreview) => void,
  ): () => void {
    this.drawingPreviewListeners.add(listener);
    return () => this.drawingPreviewListeners.delete(listener);
  }

  setPositionSettings(settings: {
    readonly defaultRewardRiskRatio: number;
  }): void {
    if (
      Number.isFinite(settings.defaultRewardRiskRatio) &&
      settings.defaultRewardRiskRatio > 0
    ) {
      this.positionSettings = {
        defaultRewardRiskRatio: Math.min(
          Math.max(
            settings.defaultRewardRiskRatio,
            MIN_POSITION_REWARD_RISK_RATIO,
          ),
          MAX_POSITION_REWARD_RISK_RATIO,
        ),
      };
    }
  }

  setDrawingMode(mode: ChartDrawingMode): void {
    const changed = mode !== this.drawingMode;
    if (changed) {
      this.clearPositionPreview();
      this.pendingVolumeProfileRange = null;
      this.clearVpPreview();
    }
    this.drawingMode = mode;
    if (changed) {
      for (const l of this.drawingModeListeners) l(mode);
    }
  }

  addDrawing(drawing: ChartDrawing): void {
    if (!drawing.id || !Number.isFinite(drawing.createdAt)) {
      throw new Error("Chart drawing requires a stable id and timestamp");
    }
    if (
      (drawing.type === "horizontal-line" && !Number.isFinite(drawing.price)) ||
      (drawing.type === "vertical-line" &&
        !Number.isFinite(drawing.timestamp)) ||
      (drawing.type === "position" &&
        (!Number.isFinite(drawing.entry) ||
          !Number.isFinite(drawing.stopLoss) ||
          !Number.isFinite(drawing.takeProfit) ||
          !isPositionDrawingOrderValid(drawing))) ||
      (drawing.type === "volume-profile-range" &&
        (!Number.isFinite(drawing.fromTimestamp) ||
          !Number.isFinite(drawing.toTimestamp) ||
          drawing.fromTimestamp === drawing.toTimestamp))
    ) {
      throw new Error("Chart drawing coordinate must be finite");
    }

    this.removeRenderedDrawing(drawing.id);
    this.selectDrawing(drawing.id);
    this.drawings.set(drawing.id, drawing);
    this.renderDrawing(drawing);
    if (drawing.type === "volume-profile-range") {
      this.showSelectedVpRange(drawing);
    } else {
      this.clearSelectedVpRange();
    }
    this.notifyDrawingsChange();
  }

  removeDrawing(id: string): void {
    if (!this.drawings.has(id)) return;
    this.removeRenderedDrawing(id);
    this.drawings.delete(id);
    if (this.selectedDrawingId === id) {
      this.selectedDrawingId = null;
      this.clearSelectedVpRange();
    }
    this.notifyDrawingsChange();
  }

  deleteSelectedDrawing(): void {
    if (this.selectedDrawingId) this.removeDrawing(this.selectedDrawingId);
  }

  clearDrawings(): void {
    for (const id of this.drawings.keys()) this.removeRenderedDrawing(id);
    this.drawings.clear();
    this.selectedDrawingId = null;
    this.clearSelectedVpRange();
    this.notifyDrawingsChange();
  }

  getDrawings(): readonly ChartDrawing[] {
    return Array.from(this.drawings.values());
  }

  subscribeDrawingsChange(
    listener: (drawings: readonly ChartDrawing[]) => void,
  ): () => void {
    this.drawingsChangeListeners.add(listener);
    return () => this.drawingsChangeListeners.delete(listener);
  }

  subscribeTimeSelection(listener: (timestamp: number) => void): () => void {
    this.timeSelectionListeners.add(listener);
    return () => this.timeSelectionListeners.delete(listener);
  }

  getDiagnostics(): ChartAdapterDiagnostics {
    return {
      initializedAt: this.initializedAt,
      chartCreateCount: this.chartCreateCount,
      historyReplacementCount: this.historyReplacementCount,
      realtimeUpdateCount: this.realtimeUpdateCount,
      resizeCount: this.resizeCount,
      dataPointCount: this.dataPointCount,
      drawingCount: this.drawings.size,
      listenerCount:
        (this.chart ? 2 : 0) +
        this.viewportListeners.size +
        this.drawingsChangeListeners.size +
        this.timeSelectionListeners.size +
        this.drawingModeListeners.size +
        this.drawingPreviewListeners.size,
      conflationEnabled: this.conflationEnabled,
      lastOperationDurationMs: this.lastOperationDurationMs,
      maxOperationDurationMs: this.maxOperationDurationMs,
      lastError: this.lastError,
    };
  }

  resize(width: number, height: number): void {
    this.measureOperation(() => {
      this.requireChart().resize(width, height);
      if (this.volumeSeries) this.resizeVolumePane(height);
    });
    this.resizeCount += 1;
  }

  destroy(): void {
    if (this.chart) {
      this.chart
        .timeScale()
        .unsubscribeVisibleLogicalRangeChange(this.handleLogicalRangeChange);
    }
    this.container?.removeEventListener(
      "click",
      this.handleContainerClick,
      true,
    );
    this.container?.removeEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );
    this.container?.removeEventListener(
      "pointermove",
      this.handlePointerMove,
      true,
    );
    this.container?.removeEventListener(
      "pointerup",
      this.handlePointerUp,
      true,
    );
    this.container?.removeEventListener(
      "pointercancel",
      this.handlePointerCancel,
      true,
    );
    this.ownerDocument?.removeEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );
    if (this.vpPreviewRafHandle !== null) {
      cancelAnimationFrame(this.vpPreviewRafHandle);
      this.vpPreviewRafHandle = null;
    }
    this.candleTimestamps = [];
    this.rawCandles = [];
    this.queuedPreviewRange = null;
    this.vpPreviewController?.dispose();
    this.vpPreviewController = null;
    this.drawingModeListeners.clear();
    this.drawingPreviewListeners.clear();
    this.levelLines.clear();
    this.drawings.clear();
    this.horizontalDrawingLines.clear();
    this.positionDrawingPrimitives.clear();
    this.volumeProfileRangePrimitives.clear();
    this.verticalDrawingPrimitives.clear();
    if (this.series) {
      if (this.vpPreviewPrimitive) {
        this.series.detachPrimitive(this.vpPreviewPrimitive);
        this.vpPreviewPrimitive = null;
      }
      if (this.vpSelectionPrimitive) {
        this.series.detachPrimitive(this.vpSelectionPrimitive);
        this.vpSelectionPrimitive = null;
      }
      if (this.levelSegmentsPrimitive) {
        this.series.detachPrimitive(this.levelSegmentsPrimitive);
        this.levelSegmentsPrimitive = null;
      }
      for (const primitive of this.volumeProfilePrimitives.values()) {
        this.series.detachPrimitive(primitive);
      }
      for (const primitive of this.anchoredVwapPrimitives.values()) {
        this.series.detachPrimitive(primitive);
      }
    }
    this.volumeProfilePrimitives.clear();
    this.anchoredVwapPrimitives.clear();
    this.viewportListeners.clear();
    this.drawingsChangeListeners.clear();
    this.timeSelectionListeners.clear();
    this.chart?.remove();
    this.chart = null;
    this.container = null;
    this.ownerDocument = null;
    this.series = null;
    this.volumeSeries = null;
    this.selectedDrawingId = null;
    this.draggedPositionLevel = null;
    this.draggedPositionBoundary = null;
    this.draggedPositionBody = null;
    this.draggedRangeBoundary = null;
    this.draggedRangeBody = null;
    this.pendingVolumeProfileRange = null;
    this.clearPositionPreview();
  }

  private clearPositionPreview(): void {
    if (this.positionPreviewRafHandle !== null) {
      cancelAnimationFrame(this.positionPreviewRafHandle);
      this.positionPreviewRafHandle = null;
    }
    if (this.positionPreviewPrimitive && this.series) {
      this.series.detachPrimitive(this.positionPreviewPrimitive);
      this.positionPreviewPrimitive = null;
    } else {
      this.positionPreviewPrimitive = null;
    }
    this.pendingPositionGesture = null;
    for (const l of this.drawingPreviewListeners) l(null);
  }

  private getOrCreateVpPreviewPrimitive(): VpPreviewPrimitive {
    if (!this.vpPreviewPrimitive) {
      this.vpPreviewPrimitive = new VpPreviewPrimitive();
      this.requireSeries().attachPrimitive(this.vpPreviewPrimitive);
    }
    return this.vpPreviewPrimitive;
  }

  private getOrCreateVpSelectionPrimitive(): VpPreviewPrimitive {
    if (!this.vpSelectionPrimitive) {
      this.vpSelectionPrimitive = new VpPreviewPrimitive();
      this.requireSeries().attachPrimitive(this.vpSelectionPrimitive);
    }
    return this.vpSelectionPrimitive;
  }

  private showSelectedVpRange(drawing: VolumeProfileRangeDrawing): void {
    this.getOrCreateVpSelectionPrimitive().update({
      fromEpoch: drawing.fromTimestamp / 1_000,
      toEpoch: drawing.toTimestamp / 1_000,
      selectionOnly: true,
    });
  }

  private clearSelectedVpRange(): void {
    this.vpSelectionPrimitive?.update(null);
  }

  private clearVpPreview(): void {
    if (this.vpPreviewRafHandle !== null) {
      cancelAnimationFrame(this.vpPreviewRafHandle);
      this.vpPreviewRafHandle = null;
    }
    this.queuedPreviewRange = null;
    if (this.vpPreviewPrimitive) {
      this.vpPreviewPrimitive.update(null);
    }
    this.lastPreviewRange = null;
    this.vpPreviewController?.dispose();
    this.vpPreviewController = null;
    for (const l of this.drawingPreviewListeners) l(null);
  }

  private scheduleVpPreview(fromEpoch: number, toEpoch: number): void {
    this.queuedPreviewRange = { from: fromEpoch, to: toEpoch };
    if (this.vpPreviewRafHandle !== null) return;
    this.vpPreviewRafHandle = requestAnimationFrame(() => {
      this.vpPreviewRafHandle = null;
      const range = this.queuedPreviewRange;
      this.queuedPreviewRange = null;
      if (range) this.updateVpPreview(range.from, range.to);
    });
  }

  private updateVpPreview(fromEpoch: number, toEpoch: number): void {
    const rangeChanged =
      !this.lastPreviewRange ||
      this.lastPreviewRange.from !== fromEpoch ||
      this.lastPreviewRange.to !== toEpoch;

    if (!rangeChanged) return;
    this.lastPreviewRange = { from: fromEpoch, to: toEpoch };

    // Notify preview subscribers
    const previewChange = {
      type: "volume-profile-range" as const,
      fromTimestamp: fromEpoch * 1_000,
      toTimestamp: toEpoch * 1_000,
    };
    for (const l of this.drawingPreviewListeners) l(previewChange);

    // Update primitive boundary visual immediately with current histogram (if any)
    const primitive = this.getOrCreateVpPreviewPrimitive();
    const currentResult =
      this.vpPreviewController?.getCurrentResult() ?? undefined;
    const previewState: VpPreviewState = {
      fromEpoch,
      toEpoch,
      provisionalResult: currentResult ?? undefined,
    };
    primitive.update(previewState);

    // Schedule debounced VP calculation (~16 updates/sec max)
    const candles = this.rawCandles;
    if (candles.length > 0) {
      if (!this.vpPreviewController) {
        this.vpPreviewController = new VolumeProfileController({
          profileId: "__preview__",
          debounceMs: 60,
          maxDelayMs: 120,
          onRender: (renderInput) => {
            const p = this.vpPreviewPrimitive;
            if (!p || !this.lastPreviewRange) return;
            p.update({
              fromEpoch: this.lastPreviewRange.from,
              toEpoch: this.lastPreviewRange.to,
              provisionalResult: renderInput.result,
            });
          },
        });
      }
      const input: VolumeProfileInput = {
        candles,
        range: { from: fromEpoch * 1_000, to: toEpoch * 1_000 },
        binConfig: { mode: "rowCount", rowCount: 50 },
        sourceMetadata: {
          exchange: "",
          market: "",
          symbol: "",
          sourceTimeframe: "",
          displayTimeframe: "",
          volumeUnit: "base",
          calculationVersion: "preview",
        },
      };
      this.vpPreviewController.setInput(input);
    }
  }

  private binarySearchCandleIndex(epochSec: number): number {
    let lo = 0;
    let hi = this.candleTimestamps.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const midVal = this.candleTimestamps[mid];
      if (midVal !== undefined && midVal < epochSec) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  private snapToCandle(epochSec: number): number | null {
    const arr = this.candleTimestamps;
    if (arr.length === 0) return null;
    const idx = this.binarySearchCandleIndex(epochSec);
    const first = arr[0];
    const last = arr[arr.length - 1];
    if (idx === 0) return first !== undefined ? first : null;
    if (idx >= arr.length) return last !== undefined ? last : null;
    const before = arr[idx - 1];
    const after = arr[idx];
    if (before === undefined || after === undefined) {
      return before ?? after ?? null;
    }
    return Math.abs(epochSec - before) <= Math.abs(after - epochSec)
      ? before
      : after;
  }

  private readonly handleContainerClick = (event: MouseEvent): void => {
    if (this.drawingMode === "pointer" || !this.container) return;
    if (event.target instanceof Element && event.target.closest("a")) return;

    const bounds = this.container.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    if (x < 0 || y < 0 || x > bounds.width || y > bounds.height) return;

    const id = `drawing-${Date.now()}-${this.drawingSequence++}`;
    const createdAt = Date.now();
    if (this.drawingMode === "horizontal-line") {
      const price = this.requireSeries().coordinateToPrice(y);
      if (price !== null) {
        this.addDrawing({ id, type: "horizontal-line", price, createdAt });
        this.setDrawingMode("pointer");
      }
      return;
    }

    if (
      this.drawingMode === "fixed-range-volume-profile" ||
      this.drawingMode === "long-position" ||
      this.drawingMode === "short-position"
    ) {
      return;
    }

    const chartTime = this.timeAtCoordinate(x, bounds.width);
    if (typeof chartTime === "number") {
      if (this.drawingMode === "anchored-vwap") {
        const timestamp = chartTime * 1_000;
        for (const listener of this.timeSelectionListeners) listener(timestamp);
        this.setDrawingMode("pointer");
        return;
      }
      this.addDrawing({
        id,
        type: "vertical-line",
        timestamp: chartTime * 1_000,
        createdAt,
      });
      this.setDrawingMode("pointer");
    }
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.container) return;
    const bounds = this.container.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;

    if (this.drawingMode === "fixed-range-volume-profile") {
      const chartTime = this.timeAtCoordinate(x, bounds.width);
      if (chartTime === null) return;
      const snapped = this.snapToCandle(chartTime) ?? chartTime;
      this.pendingVolumeProfileRange = {
        id: `drawing-${Date.now()}-${this.drawingSequence++}`,
        createdAt: Date.now(),
        fromTimestamp: snapped * 1_000,
      };
      this.container.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      return;
    }
    if (
      this.drawingMode === "long-position" ||
      this.drawingMode === "short-position"
    ) {
      const entryPrice = this.requireSeries().coordinateToPrice(y);
      if (entryPrice === null || !Number.isFinite(entryPrice)) return;
      const chartTime = this.timeAtCoordinate(x, bounds.width);
      if (chartTime === null) return;
      const snapped = this.snapToCandle(chartTime) ?? chartTime;
      const fromTimestamp = snapped * 1_000;
      this.pendingPositionGesture = {
        id: `drawing-${Date.now()}-${this.drawingSequence++}`,
        direction: this.drawingMode === "long-position" ? "long" : "short",
        entryPrice,
        fromTimestamp,
      };
      this.container.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      return;
    }
    if (this.drawingMode !== "pointer") return;

    let closestRange:
      | {
          readonly drawingId: string;
          readonly boundary: "fromTimestamp" | "toTimestamp";
          readonly distance: number;
        }
      | undefined;
    for (const drawing of this.drawings.values()) {
      if (drawing.type !== "volume-profile-range") continue;
      for (const boundary of ["fromTimestamp", "toTimestamp"] as const) {
        const coordinate = this.requireChart()
          .timeScale()
          .timeToCoordinate(toChartTimestamp(drawing[boundary]));
        if (coordinate === null) continue;
        const distance = Math.abs(coordinate - x);
        if (
          distance <= POSITION_DRAG_TOLERANCE_PX &&
          (!closestRange || distance < closestRange.distance)
        ) {
          closestRange = { drawingId: drawing.id, boundary, distance };
        }
      }
    }
    if (closestRange) {
      const drawing = this.drawings.get(closestRange.drawingId);
      this.draggedRangeBoundary = {
        drawingId: closestRange.drawingId,
        boundary: closestRange.boundary,
      };
      this.selectDrawing(closestRange.drawingId);
      this.rangeDragChanged = false;
      if (drawing?.type === "volume-profile-range") {
        this.showSelectedVpRange(drawing);
      }
      event.preventDefault();
      return;
    }

    const selectedRange = this.selectedDrawingId
      ? this.drawings.get(this.selectedDrawingId)
      : undefined;
    if (
      selectedRange?.type === "volume-profile-range" &&
      y <= VP_RANGE_MOVE_RAIL_HEIGHT_PX
    ) {
      const fromCoordinate = this.requireChart()
        .timeScale()
        .timeToCoordinate(toChartTimestamp(selectedRange.fromTimestamp));
      const toCoordinate = this.requireChart()
        .timeScale()
        .timeToCoordinate(toChartTimestamp(selectedRange.toTimestamp));
      const chartTime = this.timeAtCoordinate(x, bounds.width);
      const snapped = chartTime === null ? null : this.snapToCandle(chartTime);
      if (
        fromCoordinate !== null &&
        toCoordinate !== null &&
        snapped !== null &&
        x >= Math.min(fromCoordinate, toCoordinate) &&
        x <= Math.max(fromCoordinate, toCoordinate)
      ) {
        this.draggedRangeBody = {
          drawingId: selectedRange.id,
          pointerIndex: this.binarySearchCandleIndex(snapped),
          fromIndex: this.binarySearchCandleIndex(
            selectedRange.fromTimestamp / 1_000,
          ),
          toIndex: this.binarySearchCandleIndex(
            selectedRange.toTimestamp / 1_000,
          ),
        };
        this.rangeDragChanged = false;
        event.preventDefault();
        return;
      }
    }

    let closestPositionBoundary:
      | {
          readonly drawingId: string;
          readonly boundary: "fromTimestamp" | "toTimestamp";
          readonly distance: number;
        }
      | undefined;
    for (const drawing of this.drawings.values()) {
      if (
        drawing.type !== "position" ||
        drawing.fromTimestamp === undefined ||
        drawing.toTimestamp === undefined
      ) {
        continue;
      }
      for (const boundary of ["fromTimestamp", "toTimestamp"] as const) {
        const ts =
          boundary === "fromTimestamp"
            ? drawing.fromTimestamp
            : drawing.toTimestamp;
        if (ts === undefined) continue;
        const coordinate = this.requireChart()
          .timeScale()
          .timeToCoordinate(toChartTimestamp(ts));
        if (coordinate === null) continue;
        const distance = Math.abs(coordinate - x);
        if (
          distance <= POSITION_DRAG_TOLERANCE_PX &&
          (!closestPositionBoundary ||
            distance < closestPositionBoundary.distance)
        ) {
          closestPositionBoundary = {
            drawingId: drawing.id,
            boundary,
            distance,
          };
        }
      }
    }
    if (closestPositionBoundary) {
      this.draggedPositionBoundary = {
        drawingId: closestPositionBoundary.drawingId,
        boundary: closestPositionBoundary.boundary,
      };
      this.positionDragChanged = false;
      this.selectDrawing(closestPositionBoundary.drawingId);
      event.preventDefault();
      return;
    }

    for (const drawing of this.drawings.values()) {
      if (
        drawing.type !== "position" ||
        drawing.fromTimestamp === undefined ||
        drawing.toTimestamp === undefined
      ) {
        continue;
      }
      const fromCoordinate = this.requireChart()
        .timeScale()
        .timeToCoordinate(toChartTimestamp(drawing.fromTimestamp));
      const toCoordinate = this.requireChart()
        .timeScale()
        .timeToCoordinate(toChartTimestamp(drawing.toTimestamp));
      const entryCoordinate = this.requireSeries().priceToCoordinate(
        drawing.entry,
      );
      if (
        fromCoordinate === null ||
        toCoordinate === null ||
        entryCoordinate === null
      ) {
        continue;
      }
      const minX = Math.min(fromCoordinate, toCoordinate);
      const maxX = Math.max(fromCoordinate, toCoordinate);
      const isWithinX = x >= minX && x <= maxX;
      const isNearEntry =
        Math.abs(entryCoordinate - y) <= POSITION_DRAG_TOLERANCE_PX;
      if (isWithinX && isNearEntry) {
        const chartTime = this.timeAtCoordinate(x, bounds.width);
        const snapped =
          chartTime === null ? null : this.snapToCandle(chartTime);
        const snappedTime = snapped ?? chartTime;
        if (snappedTime !== null) {
          this.draggedPositionBody = {
            drawingId: drawing.id,
            pointerIndex: this.binarySearchCandleIndex(snappedTime),
            fromIndex: this.binarySearchCandleIndex(
              drawing.fromTimestamp / 1_000,
            ),
            toIndex: this.binarySearchCandleIndex(
              drawing.toTimestamp / 1_000,
            ),
          };
          this.positionDragChanged = false;
          this.selectDrawing(drawing.id);
          event.preventDefault();
          return;
        }
      }
    }

    let closest:
      | {
          readonly drawingId: string;
          readonly level: PositionDrawingLevel;
          readonly distance: number;
        }
      | undefined;

    for (const drawing of this.drawings.values()) {
      if (drawing.type !== "position") continue;
      for (const level of ["entry", "stopLoss", "takeProfit"] as const) {
        const coordinate = this.requireSeries().priceToCoordinate(
          drawing[level],
        );
        if (coordinate === null) continue;
        const distance = Math.abs(coordinate - y);
        if (
          distance <= POSITION_DRAG_TOLERANCE_PX &&
          (!closest || distance < closest.distance)
        ) {
          closest = { drawingId: drawing.id, level, distance };
        }
      }
    }

    if (!closest) return;
    this.draggedPositionLevel = {
      drawingId: closest.drawingId,
      level: closest.level,
    };
    this.selectDrawing(closest.drawingId);
    this.clearSelectedVpRange();
    event.preventDefault();
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.pendingVolumeProfileRange && this.container) {
      const bounds = this.container.getBoundingClientRect();
      const chartTime = this.timeAtCoordinate(
        event.clientX - bounds.left,
        bounds.width,
      );
      if (chartTime !== null) {
        const toEpoch = this.snapToCandle(chartTime) ?? chartTime;
        const fromEpoch = this.pendingVolumeProfileRange.fromTimestamp / 1_000;
        if (toEpoch !== fromEpoch) {
          const normalFrom = Math.min(fromEpoch, toEpoch);
          const normalTo = Math.max(fromEpoch, toEpoch);
          this.scheduleVpPreview(normalFrom, normalTo);
        }
      }
      event.preventDefault();
      return;
    }
    if (this.pendingPositionGesture && this.container) {
      const bounds = this.container.getBoundingClientRect();
      const nextPrice = this.requireSeries().coordinateToPrice(
        event.clientY - bounds.top,
      );
      const chartTime = this.timeAtCoordinate(
        event.clientX - bounds.left,
        bounds.width,
      );
      if (
        nextPrice !== null &&
        Number.isFinite(nextPrice) &&
        chartTime !== null
      ) {
        const toTimestamp = (this.snapToCandle(chartTime) ?? chartTime) * 1_000;
        const pending = this.pendingPositionGesture;
        if (this.positionPreviewRafHandle !== null) {
          cancelAnimationFrame(this.positionPreviewRafHandle);
        }
        this.positionPreviewRafHandle = requestAnimationFrame(() => {
          this.positionPreviewRafHandle = null;
          if (!this.pendingPositionGesture) return;
          const drawing = createPositionFromGesture({
            id: pending.id,
            direction: pending.direction,
            entryPrice: pending.entryPrice,
            currentPrice: nextPrice,
            fromTimestamp: pending.fromTimestamp,
            toTimestamp,
            defaultRewardRiskRatio: this.positionSettings.defaultRewardRiskRatio,
          });
          if (drawing) {
            if (!this.positionPreviewPrimitive) {
              this.positionPreviewPrimitive = new PositionDrawingPrimitive(
                drawing,
              );
              this.requireSeries().attachPrimitive(
                this.positionPreviewPrimitive,
              );
            } else {
              this.positionPreviewPrimitive.update(drawing);
            }
            for (const l of this.drawingPreviewListeners) {
              l({ type: "position", drawing });
            }
          }
        });
      }
      event.preventDefault();
      return;
    }
    if (this.draggedRangeBody && this.container) {
      const drawing = this.drawings.get(this.draggedRangeBody.drawingId);
      if (!drawing || drawing.type !== "volume-profile-range") {
        this.draggedRangeBody = null;
        return;
      }
      const bounds = this.container.getBoundingClientRect();
      const chartTime = this.timeAtCoordinate(
        event.clientX - bounds.left,
        bounds.width,
      );
      const snapped = chartTime === null ? null : this.snapToCandle(chartTime);
      if (snapped === null || this.candleTimestamps.length === 0) return;
      const currentIndex = this.binarySearchCandleIndex(snapped);
      const originalSpan =
        this.draggedRangeBody.toIndex - this.draggedRangeBody.fromIndex;
      const desiredFrom =
        this.draggedRangeBody.fromIndex +
        currentIndex -
        this.draggedRangeBody.pointerIndex;
      const fromIndex = Math.min(
        Math.max(0, desiredFrom),
        this.candleTimestamps.length - 1 - originalSpan,
      );
      const toIndex = fromIndex + originalSpan;
      const fromEpoch = this.candleTimestamps[fromIndex];
      const toEpoch = this.candleTimestamps[toIndex];
      if (fromEpoch === undefined || toEpoch === undefined) return;
      const nextDrawing: VolumeProfileRangeDrawing = {
        ...drawing,
        fromTimestamp: fromEpoch * 1_000,
        toTimestamp: toEpoch * 1_000,
      };
      this.removeRenderedDrawing(drawing.id);
      this.drawings.set(drawing.id, nextDrawing);
      this.renderDrawing(nextDrawing);
      this.showSelectedVpRange(nextDrawing);
      this.scheduleVpPreview(fromEpoch, toEpoch);
      this.rangeDragChanged = true;
      event.preventDefault();
      return;
    }
    if (this.draggedPositionBody && this.container) {
      const drawing = this.drawings.get(this.draggedPositionBody.drawingId);
      if (!drawing || drawing.type !== "position") {
        this.draggedPositionBody = null;
        return;
      }
      const bounds = this.container.getBoundingClientRect();
      const chartTime = this.timeAtCoordinate(
        event.clientX - bounds.left,
        bounds.width,
      );
      const snapped = chartTime === null ? null : this.snapToCandle(chartTime);
      const currentEpoch = snapped ?? chartTime;
      if (currentEpoch === null) return;

      if (this.candleTimestamps.length > 0) {
        const currentIndex = this.binarySearchCandleIndex(currentEpoch);
        const originalSpan =
          this.draggedPositionBody.toIndex - this.draggedPositionBody.fromIndex;
        const desiredFrom =
          this.draggedPositionBody.fromIndex +
          currentIndex -
          this.draggedPositionBody.pointerIndex;
        const fromIndex = Math.min(
          Math.max(0, desiredFrom),
          this.candleTimestamps.length - 1 - originalSpan,
        );
        const toIndex = fromIndex + originalSpan;
        const fromEpoch = this.candleTimestamps[fromIndex];
        const toEpoch = this.candleTimestamps[toIndex];
        if (fromEpoch === undefined || toEpoch === undefined) return;
        const nextDrawing: PositionDrawing = {
          ...drawing,
          fromTimestamp: fromEpoch * 1_000,
          toTimestamp: toEpoch * 1_000,
        };
        this.removeRenderedDrawing(drawing.id);
        this.drawings.set(drawing.id, nextDrawing);
        this.renderDrawing(nextDrawing);
        this.positionDragChanged = true;
      } else {
        const pointerEpoch = (drawing.fromTimestamp ?? 0) / 1_000;
        const deltaTimestamp = (currentEpoch - pointerEpoch) * 1_000;
        const nextDrawing = moveCompletePositionRange(drawing, deltaTimestamp);
        this.removeRenderedDrawing(drawing.id);
        this.drawings.set(drawing.id, nextDrawing);
        this.renderDrawing(nextDrawing);
        this.positionDragChanged = true;
      }
      event.preventDefault();
      return;
    }
    if (this.draggedRangeBoundary && this.container) {
      const drawing = this.drawings.get(this.draggedRangeBoundary.drawingId);
      if (!drawing || drawing.type !== "volume-profile-range") {
        this.draggedRangeBoundary = null;
        return;
      }
      const bounds = this.container.getBoundingClientRect();
      const chartTime = this.timeAtCoordinate(
        event.clientX - bounds.left,
        bounds.width,
      );
      if (chartTime === null) return;
      const timestamp = (this.snapToCandle(chartTime) ?? chartTime) * 1_000;
      const opposite =
        this.draggedRangeBoundary.boundary === "fromTimestamp"
          ? drawing.toTimestamp
          : drawing.fromTimestamp;
      if (timestamp === opposite) return;
      const candidateFrom =
        this.draggedRangeBoundary.boundary === "fromTimestamp"
          ? timestamp
          : drawing.fromTimestamp;
      const candidateTo =
        this.draggedRangeBoundary.boundary === "toTimestamp"
          ? timestamp
          : drawing.toTimestamp;
      const nextDrawing: VolumeProfileRangeDrawing = {
        ...drawing,
        fromTimestamp: Math.min(candidateFrom, candidateTo),
        toTimestamp: Math.max(candidateFrom, candidateTo),
      };
      this.removeRenderedDrawing(drawing.id);
      this.drawings.set(drawing.id, nextDrawing);
      this.renderDrawing(nextDrawing);
      this.showSelectedVpRange(nextDrawing);
      this.scheduleVpPreview(
        nextDrawing.fromTimestamp / 1_000,
        nextDrawing.toTimestamp / 1_000,
      );
      this.rangeDragChanged = true;
      event.preventDefault();
      return;
    }
    if (this.draggedPositionBoundary && this.container) {
      const drawing = this.drawings.get(this.draggedPositionBoundary.drawingId);
      if (!drawing || drawing.type !== "position") {
        this.draggedPositionBoundary = null;
        return;
      }
      const bounds = this.container.getBoundingClientRect();
      const chartTime = this.timeAtCoordinate(
        event.clientX - bounds.left,
        bounds.width,
      );
      if (chartTime === null) return;
      const timestamp = (this.snapToCandle(chartTime) ?? chartTime) * 1_000;
      const nextDrawing = movePositionTimeBoundary(
        drawing,
        this.draggedPositionBoundary.boundary,
        timestamp,
      );
      this.removeRenderedDrawing(drawing.id);
      this.drawings.set(drawing.id, nextDrawing);
      this.renderDrawing(nextDrawing);
      this.positionDragChanged = true;
      event.preventDefault();
      return;
    }
    if (!this.draggedPositionLevel || !this.container) return;
    const drawing = this.drawings.get(this.draggedPositionLevel.drawingId);
    if (!drawing || drawing.type !== "position") {
      this.draggedPositionLevel = null;
      return;
    }

    const bounds = this.container.getBoundingClientRect();
    const nextPrice = this.requireSeries().coordinateToPrice(
      event.clientY - bounds.top,
    );
    if (nextPrice === null || !Number.isFinite(nextPrice) || nextPrice <= 0) {
      return;
    }

    const nextDrawing = movePositionDrawingLevel(
      drawing,
      this.draggedPositionLevel.level,
      nextPrice,
    );
    this.removeRenderedDrawing(drawing.id);
    this.drawings.set(drawing.id, nextDrawing);
    this.renderDrawing(nextDrawing);
    this.positionDragChanged = true;
    event.preventDefault();
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.pendingVolumeProfileRange && this.container) {
      const bounds = this.container.getBoundingClientRect();
      const chartTime = this.timeAtCoordinate(
        event.clientX - bounds.left,
        bounds.width,
      );
      const pending = this.pendingVolumeProfileRange;
      this.pendingVolumeProfileRange = null;
      this.clearVpPreview();
      if (chartTime !== null) {
        const snapped = this.snapToCandle(chartTime);
        const toTimestamp = (snapped ?? chartTime) * 1_000;
        if (toTimestamp !== pending.fromTimestamp) {
          this.addDrawing({
            ...pending,
            type: "volume-profile-range",
            fromTimestamp: Math.min(pending.fromTimestamp, toTimestamp),
            toTimestamp: Math.max(pending.fromTimestamp, toTimestamp),
          });
        }
      }
      this.container.releasePointerCapture?.(event.pointerId);
      this.setDrawingMode("pointer");
      event.preventDefault();
    }
    if (this.pendingPositionGesture && this.container) {
      const pending = this.pendingPositionGesture;
      const bounds = this.container.getBoundingClientRect();
      const finalPrice = this.requireSeries().coordinateToPrice(
        event.clientY - bounds.top,
      );
      const chartTime = this.timeAtCoordinate(
        event.clientX - bounds.left,
        bounds.width,
      );
      const toTimestamp =
        chartTime !== null
          ? (this.snapToCandle(chartTime) ?? chartTime) * 1_000
          : pending.fromTimestamp;
      const drawing =
        finalPrice !== null && Number.isFinite(finalPrice)
          ? createPositionFromGesture({
              id: pending.id,
              direction: pending.direction,
              entryPrice: pending.entryPrice,
              currentPrice: finalPrice,
              fromTimestamp: pending.fromTimestamp,
              toTimestamp,
              defaultRewardRiskRatio: this.positionSettings.defaultRewardRiskRatio,
            })
          : null;

      this.clearPositionPreview();

      if (drawing) {
        this.addDrawing(drawing);
      }
      try {
        this.container.releasePointerCapture?.(event.pointerId);
      } catch {
        // ignore
      }
      this.setDrawingMode("pointer");
      event.preventDefault();
    }
    if (
      this.rangeDragChanged &&
      (this.draggedRangeBoundary || this.draggedRangeBody)
    ) {
      this.clearVpPreview();
      this.notifyDrawingsChange();
    }
    if (this.positionDragChanged) {
      this.notifyDrawingsChange();
      this.positionDragChanged = false;
    }
    this.draggedPositionLevel = null;
    this.draggedPositionBoundary = null;
    this.draggedPositionBody = null;
    this.draggedRangeBoundary = null;
    this.draggedRangeBody = null;
    this.rangeDragChanged = false;
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    if (this.drawingMode !== "pointer") {
      this.pendingVolumeProfileRange = null;
      this.clearPositionPreview();
      this.clearVpPreview();
      this.setDrawingMode("pointer");
    }
  };

  private readonly handlePointerCancel = (): void => {
    if (this.pendingVolumeProfileRange !== null) {
      this.pendingVolumeProfileRange = null;
      this.clearVpPreview();
      if (this.drawingMode === "fixed-range-volume-profile") {
        this.setDrawingMode("pointer");
      }
    }
    if (this.pendingPositionGesture !== null) {
      this.clearPositionPreview();
      if (
        this.drawingMode === "long-position" ||
        this.drawingMode === "short-position"
      ) {
        this.setDrawingMode("pointer");
      }
    }
    if (this.rangeDragChanged) {
      this.clearVpPreview();
      this.notifyDrawingsChange();
    }
    if (this.positionDragChanged) {
      this.notifyDrawingsChange();
      this.positionDragChanged = false;
    }
    this.draggedPositionLevel = null;
    this.draggedPositionBoundary = null;
    this.draggedPositionBody = null;
    this.draggedRangeBoundary = null;
    this.draggedRangeBody = null;
    this.rangeDragChanged = false;
  };

  private readonly handleLogicalRangeChange = (
    logicalRange: LogicalRange | null,
  ): void => {
    if (!logicalRange || this.viewportListeners.size === 0) return;
    const bars = this.requireSeries().barsInLogicalRange(logicalRange);
    const state: ChartViewportState = {
      visibleRange: this.getVisibleRange(),
      barsBefore: bars?.barsBefore ?? Number.POSITIVE_INFINITY,
      barsAfter: bars?.barsAfter ?? Number.POSITIVE_INFINITY,
    };
    for (const listener of this.viewportListeners) listener(state);
  };

  private renderDrawing(drawing: ChartDrawing): void {
    const series = this.requireSeries();
    if (drawing.type === "horizontal-line") {
      const line = series.createPriceLine({
        price: drawing.price,
        color: USER_DRAWING_COLOR,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "User",
      });
      this.horizontalDrawingLines.set(drawing.id, line);
      return;
    }

    if (drawing.type === "position") {
      this.renderPositionDrawing(drawing);
      return;
    }

    if (drawing.type === "volume-profile-range") {
      const primitives = [
        new VerticalLinePrimitive({
          id: `${drawing.id}-from`,
          timestamp: drawing.fromTimestamp,
          color: "#e7b84b",
          label: "VP FROM",
        }),
        new VerticalLinePrimitive({
          id: `${drawing.id}-to`,
          timestamp: drawing.toTimestamp,
          color: "#e7b84b",
          label: "VP TO",
        }),
      ];
      for (const primitive of primitives) series.attachPrimitive(primitive);
      this.volumeProfileRangePrimitives.set(drawing.id, primitives);
      return;
    }

    const primitive = new VerticalLinePrimitive({
      id: drawing.id,
      timestamp: drawing.timestamp,
      color: USER_DRAWING_COLOR,
      label: formatVerticalLineLabel(drawing.timestamp),
    });
    series.attachPrimitive(primitive);
    this.verticalDrawingPrimitives.set(drawing.id, primitive);
  }

  private removeRenderedDrawing(id: string): void {
    const series = this.requireSeries();
    const horizontalLine = this.horizontalDrawingLines.get(id);
    if (horizontalLine) {
      series.removePriceLine(horizontalLine);
      this.horizontalDrawingLines.delete(id);
    }
    const verticalPrimitive = this.verticalDrawingPrimitives.get(id);
    if (verticalPrimitive) {
      series.detachPrimitive(verticalPrimitive);
      this.verticalDrawingPrimitives.delete(id);
    }
    const positionPrimitive = this.positionDrawingPrimitives.get(id);
    if (positionPrimitive) {
      series.detachPrimitive(positionPrimitive);
      this.positionDrawingPrimitives.delete(id);
    }
    const rangePrimitives = this.volumeProfileRangePrimitives.get(id);
    if (rangePrimitives) {
      for (const primitive of rangePrimitives)
        series.detachPrimitive(primitive);
      this.volumeProfileRangePrimitives.delete(id);
    }
  }

  private renderPositionDrawing(drawing: PositionDrawing): void {
    const series = this.requireSeries();
    const primitive = new PositionDrawingPrimitive(drawing, {
      selected: this.selectedDrawingId === drawing.id,
    });
    series.attachPrimitive(primitive);
    this.positionDrawingPrimitives.set(drawing.id, primitive);
  }

  private selectDrawing(id: string): void {
    if (this.selectedDrawingId === id) {
      this.positionDrawingPrimitives.get(id)?.setSelected(true);
      return;
    }
    if (this.selectedDrawingId) {
      this.positionDrawingPrimitives
        .get(this.selectedDrawingId)
        ?.setSelected(false);
    }
    this.selectedDrawingId = id;
    this.positionDrawingPrimitives.get(id)?.setSelected(true);
  }

  private timeAtCoordinate(x: number, width: number): UTCTimestamp | null {
    const timeScale = this.requireChart().timeScale();
    const direct = timeScale.coordinateToTime(x);
    if (typeof direct === "number") return direct;
    const visibleRange = timeScale.getVisibleRange();
    if (
      !visibleRange ||
      typeof visibleRange.from !== "number" ||
      typeof visibleRange.to !== "number" ||
      width <= 0
    ) {
      return null;
    }
    const ratio = Math.min(Math.max(x / width, 0), 1);
    return (visibleRange.from +
      (visibleRange.to - visibleRange.from) * ratio) as UTCTimestamp;
  }
  private notifyDrawingsChange(): void {
    const drawings = this.getDrawings();
    for (const listener of this.drawingsChangeListeners) listener(drawings);
  }

  private resizeVolumePane(height: number): void {
    this.requireVolumeSeries()
      .getPane()
      .setHeight(Math.max(72, Math.floor(height * 0.22)));
  }

  private measureOperation(operation: () => void): void {
    const startedAt = performance.now();
    try {
      operation();
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "Chart error";
      throw error;
    } finally {
      this.lastOperationDurationMs = performance.now() - startedAt;
      this.maxOperationDurationMs = Math.max(
        this.maxOperationDurationMs,
        this.lastOperationDurationMs,
      );
    }
  }

  private requireChart(): IChartApi {
    if (!this.chart) throw new Error("Chart adapter is not initialized");
    return this.chart;
  }

  private requireSeries(): ISeriesApi<"Candlestick"> {
    if (!this.series) throw new Error("Chart adapter is not initialized");
    return this.series;
  }

  private requireVolumeSeries(): ISeriesApi<"Histogram"> {
    if (!this.volumeSeries) throw new Error("Chart adapter is not initialized");
    return this.volumeSeries;
  }
}
