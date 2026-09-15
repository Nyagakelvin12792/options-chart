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
  createPositionDrawing,
  isPositionDrawingOrderValid,
  movePositionDrawingLevel,
  type PositionDrawingLevel,
} from "../position-drawing";
import type {
  LevelSegment,
  LevelSegmentsPresentationOptions,
} from "../level-segments/types";
import { LevelSegmentsPrimitive } from "../level-segments/level-segments-primitive";
import type { VolumeProfileRenderInput } from "../volume-profile/types";
import { VolumeProfilePrimitive } from "../volume-profile/volume-profile-primitive";
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
const POSITION_COLORS = {
  entry: "#5fa8ff",
  stopLoss: "#e05263",
  takeProfit: "#29b57a",
} as const;
const POSITION_DRAG_TOLERANCE_PX = 8;

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
  private pendingVolumeProfileRange: {
    readonly id: string;
    readonly createdAt: number;
    readonly fromTimestamp: number;
  } | null = null;
  private pendingPosition: {
    readonly id: string;
    readonly direction: PositionDirection;
    readonly entry: number;
    readonly stopLoss?: number;
    readonly createdAt: number;
    readonly fromTimestamp: number;
  } | null = null;
  private pendingPositionLines: IPriceLine[] = [];
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
    container.addEventListener("pointercancel", this.handlePointerUp, true);
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

  setDrawingMode(mode: ChartDrawingMode): void {
    if (mode !== this.drawingMode) {
      this.clearPendingPosition();
      this.pendingVolumeProfileRange = null;
    }
    this.drawingMode = mode;
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
    this.drawings.set(drawing.id, drawing);
    this.renderDrawing(drawing);
    this.selectedDrawingId = drawing.id;
    this.notifyDrawingsChange();
  }

  removeDrawing(id: string): void {
    if (!this.drawings.has(id)) return;
    this.removeRenderedDrawing(id);
    this.drawings.delete(id);
    if (this.selectedDrawingId === id) this.selectedDrawingId = null;
    this.notifyDrawingsChange();
  }

  deleteSelectedDrawing(): void {
    if (this.selectedDrawingId) this.removeDrawing(this.selectedDrawingId);
  }

  clearDrawings(): void {
    for (const id of this.drawings.keys()) this.removeRenderedDrawing(id);
    this.drawings.clear();
    this.selectedDrawingId = null;
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
        this.timeSelectionListeners.size,
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
      this.handlePointerUp,
      true,
    );
    this.levelLines.clear();
    this.drawings.clear();
    this.horizontalDrawingLines.clear();
    this.positionDrawingPrimitives.clear();
    this.volumeProfileRangePrimitives.clear();
    this.verticalDrawingPrimitives.clear();
    if (this.series) {
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
    this.series = null;
    this.volumeSeries = null;
    this.selectedDrawingId = null;
    this.draggedPositionLevel = null;
    this.draggedRangeBoundary = null;
    this.pendingVolumeProfileRange = null;
    this.clearPendingPosition();
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
      }
      return;
    }

    if (this.drawingMode === "fixed-range-volume-profile") return;

    const chartTime = this.timeAtCoordinate(x, bounds.width);
    if (
      this.drawingMode === "long-position" ||
      this.drawingMode === "short-position"
    ) {
      const price = this.requireSeries().coordinateToPrice(y);
      if (
        price !== null &&
        Number.isFinite(price) &&
        price > 0 &&
        chartTime !== null
      ) {
        this.advancePositionCreation(
          this.drawingMode === "long-position" ? "long" : "short",
          price,
          chartTime * 1_000,
        );
      }
      return;
    }

    if (typeof chartTime === "number") {
      if (this.drawingMode === "anchored-vwap") {
        const timestamp = chartTime * 1_000;
        for (const listener of this.timeSelectionListeners) listener(timestamp);
        return;
      }
      this.addDrawing({
        id,
        type: "vertical-line",
        timestamp: chartTime * 1_000,
        createdAt,
      });
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
      this.pendingVolumeProfileRange = {
        id: `drawing-${Date.now()}-${this.drawingSequence++}`,
        createdAt: Date.now(),
        fromTimestamp: chartTime * 1_000,
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
      this.draggedRangeBoundary = {
        drawingId: closestRange.drawingId,
        boundary: closestRange.boundary,
      };
      this.selectedDrawingId = closestRange.drawingId;
      event.preventDefault();
      return;
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
    this.selectedDrawingId = closest.drawingId;
    event.preventDefault();
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
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
      const timestamp = chartTime * 1_000;
      const opposite =
        this.draggedRangeBoundary.boundary === "fromTimestamp"
          ? drawing.toTimestamp
          : drawing.fromTimestamp;
      if (timestamp === opposite) return;
      const nextDrawing: VolumeProfileRangeDrawing = {
        ...drawing,
        [this.draggedRangeBoundary.boundary]: timestamp,
      };
      this.removeRenderedDrawing(drawing.id);
      this.drawings.set(drawing.id, nextDrawing);
      this.renderDrawing(nextDrawing);
      this.notifyDrawingsChange();
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
    this.notifyDrawingsChange();
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
      if (chartTime !== null) {
        const toTimestamp = chartTime * 1_000;
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
      event.preventDefault();
    }
    this.draggedPositionLevel = null;
    this.draggedRangeBoundary = null;
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
    const primitive = new PositionDrawingPrimitive(drawing);
    series.attachPrimitive(primitive);
    this.positionDrawingPrimitives.set(drawing.id, primitive);
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

  private advancePositionCreation(
    direction: PositionDirection,
    price: number,
    timestamp: number,
  ): void {
    const pending = this.pendingPosition;
    if (!pending || pending.direction !== direction) {
      this.clearPendingPosition();
      this.pendingPosition = {
        id: `drawing-${Date.now()}-${this.drawingSequence++}`,
        direction,
        entry: price,
        createdAt: Date.now(),
        fromTimestamp: timestamp,
      };
      this.pendingPositionLines.push(
        this.requireSeries().createPriceLine({
          price,
          color: POSITION_COLORS.entry,
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: `${direction.toUpperCase()} ENTRY · select SL`,
        }),
      );
      return;
    }

    if (pending.stopLoss === undefined) {
      const validStop =
        direction === "long" ? price < pending.entry : price > pending.entry;
      if (!validStop) return;
      this.pendingPosition = { ...pending, stopLoss: price };
      this.pendingPositionLines.push(
        this.requireSeries().createPriceLine({
          price,
          color: POSITION_COLORS.stopLoss,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "SL · select TP",
        }),
      );
      return;
    }

    const validTarget =
      direction === "long" ? price > pending.entry : price < pending.entry;
    if (!validTarget) return;
    const drawing = createPositionDrawing({
      id: pending.id,
      direction,
      entry: pending.entry,
      stopLoss: pending.stopLoss,
      takeProfit: price,
      createdAt: pending.createdAt,
      fromTimestamp: pending.fromTimestamp,
      toTimestamp: timestamp,
    });
    this.clearPendingPosition();
    this.addDrawing(drawing);
  }

  private clearPendingPosition(): void {
    if (this.series) {
      for (const line of this.pendingPositionLines) {
        this.series.removePriceLine(line);
      }
    }
    this.pendingPositionLines = [];
    this.pendingPosition = null;
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
