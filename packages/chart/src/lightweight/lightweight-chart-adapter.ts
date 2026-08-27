import type { Candle, GammaLevel } from "@options-chart/domain";
import {
  CandlestickSeries,
  ColorType,
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
} from "../chart-adapter";
import { VerticalLinePrimitive } from "./vertical-line-primitive";

const LEVEL_COLORS: Readonly<Record<GammaLevel["kind"], string>> = {
  "call-wall": "#29b57a",
  "put-wall": "#e05263",
  "gamma-flip": "#f0b44d",
  "max-pain": "#65a9ff",
  "secondary-gex": "#9aa7b6",
};

const USER_DRAWING_COLOR = "#f2c14e";

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
  private readonly verticalDrawingPrimitives = new Map<
    string,
    VerticalLinePrimitive
  >();
  private readonly viewportListeners = new Set<
    (state: ChartViewportState) => void
  >();
  private readonly drawingsChangeListeners = new Set<
    (drawings: readonly ChartDrawing[]) => void
  >();

  private drawingMode: ChartDrawingMode = "pointer";
  private selectedDrawingId: string | null = null;
  private drawingSequence = 0;
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

    container.addEventListener("click", this.handleContainerClick, true);
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
      this.requireVolumeSeries().setData(candles.map(toChartVolume));
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
      this.requireVolumeSeries().update(toChartVolume(candle));
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
        axisLabelVisible: true,
        title: level.label,
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

  subscribeViewportChange(
    listener: (state: ChartViewportState) => void,
  ): () => void {
    this.viewportListeners.add(listener);
    return () => this.viewportListeners.delete(listener);
  }

  setDrawingMode(mode: ChartDrawingMode): void {
    this.drawingMode = mode;
  }

  addDrawing(drawing: ChartDrawing): void {
    if (!drawing.id || !Number.isFinite(drawing.createdAt)) {
      throw new Error("Chart drawing requires a stable id and timestamp");
    }
    if (
      (drawing.type === "horizontal-line" && !Number.isFinite(drawing.price)) ||
      (drawing.type === "vertical-line" && !Number.isFinite(drawing.timestamp))
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
        this.drawingsChangeListeners.size,
      conflationEnabled: this.conflationEnabled,
      lastOperationDurationMs: this.lastOperationDurationMs,
      maxOperationDurationMs: this.maxOperationDurationMs,
      lastError: this.lastError,
    };
  }

  resize(width: number, height: number): void {
    this.measureOperation(() => {
      this.requireChart().resize(width, height);
      this.resizeVolumePane(height);
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
    this.levelLines.clear();
    this.drawings.clear();
    this.horizontalDrawingLines.clear();
    this.verticalDrawingPrimitives.clear();
    this.viewportListeners.clear();
    this.drawingsChangeListeners.clear();
    this.chart?.remove();
    this.chart = null;
    this.container = null;
    this.series = null;
    this.volumeSeries = null;
    this.selectedDrawingId = null;
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

    const timeScale = this.requireChart().timeScale();
    let chartTime = timeScale.coordinateToTime(x);
    const visibleRange = timeScale.getVisibleRange();
    if (
      chartTime === null &&
      visibleRange &&
      typeof visibleRange.from === "number" &&
      typeof visibleRange.to === "number" &&
      bounds.width > 0
    ) {
      const ratio = Math.min(Math.max(x / bounds.width, 0), 1);
      chartTime = (visibleRange.from +
        (visibleRange.to - visibleRange.from) * ratio) as UTCTimestamp;
    }
    if (typeof chartTime === "number") {
      this.addDrawing({
        id,
        type: "vertical-line",
        timestamp: chartTime * 1_000,
        createdAt,
      });
    }
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
