import type { Candle } from "@options-chart/domain";
import type { IChartApi, ISeriesApi, Logical, UTCTimestamp } from "lightweight-charts";
import type {
  AnchoredVwapDrawing,
  ChartDrawing,
  ChartDrawingMode,
  PositionDirection,
  PositionDrawing,
  VolumeProfileRangeDrawing,
} from "../chart-adapter";
import {
  createPositionDrawing,
  movePositionDrawingLevel,
  type PositionDrawingLevel,
} from "../position-drawing";
import type { VolumeProfileDrawingPrimitive } from "../volume-profile/volume-profile-drawing-primitive";
import type { AnchoredVwapDrawingPrimitive } from "../anchored-vwap/anchored-vwap-primitive";

const toChartTimestamp = (timestamp: number): UTCTimestamp =>
  Math.floor(timestamp / 1_000) as UTCTimestamp;

export type DrawingDragState =
  | { readonly type: "idle" }
  | {
      readonly type: "creating-vp";
      readonly id: string;
      readonly fromTimestamp: number;
    }
  | {
      readonly type: "creating-position";
      readonly id: string;
      readonly direction: PositionDirection;
      readonly entry: number;
      readonly fromTimestamp: number;
      readonly createdAt: number;
    }
  | {
      readonly type: "dragging-vp-start";
      readonly drawingId: string;
      readonly initialFrom: number;
      readonly initialTo: number;
    }
  | {
      readonly type: "dragging-vp-end";
      readonly drawingId: string;
      readonly initialFrom: number;
      readonly initialTo: number;
    }
  | {
      readonly type: "dragging-vp-body";
      readonly drawingId: string;
      readonly initialFrom: number;
      readonly initialTo: number;
      readonly clickTimestamp: number;
    }
  | {
      readonly type: "dragging-avwap-anchor";
      readonly drawingId: string;
    }
  | {
      readonly type: "dragging-position-level";
      readonly drawingId: string;
      readonly level: PositionDrawingLevel;
    };

export interface DrawingInteractionControllerOptions {
  readonly getContainer: () => HTMLElement | null;
  readonly getChart: () => IChartApi | null;
  readonly getSeries: () => ISeriesApi<"Candlestick"> | null;
  readonly getCandles: () => readonly Candle[];
  readonly getDrawings: () => readonly ChartDrawing[];
  readonly getVpPrimitive: (id: string) => VolumeProfileDrawingPrimitive | undefined;
  readonly getAvwapPrimitive: (id: string) => AnchoredVwapDrawingPrimitive | undefined;
  readonly onDrawingAdd: (drawing: ChartDrawing) => void;
  readonly onDrawingUpdate: (drawing: ChartDrawing, commitToHistory: boolean) => void;
  readonly onDrawingDelete: (drawingId: string) => void;
  readonly onDrawingSelect: (drawingId: string | null) => void;
  readonly onDrawingModeChange?: (mode: ChartDrawingMode) => void;
}

export class DrawingInteractionController {
  private drawingMode: ChartDrawingMode = "pointer";
  private selectedDrawingId: string | null = null;
  private dragState: DrawingDragState = { type: "idle" };
  private drawingSequence = 0;
  private rafId: number | null = null;
  private pendingPointerEvent: { clientX: number; clientY: number } | null = null;

  constructor(private readonly options: DrawingInteractionControllerOptions) {
    this.bindEvents();
  }

  getDrawingMode(): ChartDrawingMode {
    return this.drawingMode;
  }

  setDrawingMode(mode: ChartDrawingMode): void {
    if (this.drawingMode === mode) return;
    this.drawingMode = mode;
    this.dragState = { type: "idle" };
    this.updateCursor("default");
    this.options.onDrawingModeChange?.(mode);
  }

  getSelectedDrawingId(): string | null {
    return this.selectedDrawingId;
  }

  selectDrawing(id: string | null): void {
    if (this.selectedDrawingId === id) return;
    this.selectedDrawingId = id;
    this.options.onDrawingSelect(id);
  }

  destroy(): void {
    this.unbindEvents();
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private bindEvents(): void {
    const container = this.options.getContainer();
    if (!container) return;

    container.addEventListener("pointerdown", this.handlePointerDown, true);
    container.addEventListener("pointermove", this.handlePointerMove, true);
    container.addEventListener("pointerup", this.handlePointerUp, true);
    container.addEventListener("pointercancel", this.handlePointerUp, true);
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this.handleKeyDown, true);
    }
  }

  private unbindEvents(): void {
    const container = this.options.getContainer();
    if (!container) return;

    container.removeEventListener("pointerdown", this.handlePointerDown, true);
    container.removeEventListener("pointermove", this.handlePointerMove, true);
    container.removeEventListener("pointerup", this.handlePointerUp, true);
    container.removeEventListener("pointercancel", this.handlePointerUp, true);
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this.handleKeyDown, true);
    }
  }

  public readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      if (this.dragState.type !== "idle") {
        this.dragState = { type: "idle" };
        this.restoreChartScroll();
      } else if (this.drawingMode !== "pointer") {
        this.setDrawingMode("pointer");
      } else if (this.selectedDrawingId) {
        this.selectDrawing(null);
      }
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      // Avoid deleting if user is focused on an input element
      const activeTag = typeof document !== "undefined"
        ? document.activeElement?.tagName.toLowerCase()
        : undefined;
      if (activeTag === "input" || activeTag === "textarea" || activeTag === "select") {
        return;
      }
      if (this.selectedDrawingId) {
        this.options.onDrawingDelete(this.selectedDrawingId);
        this.selectDrawing(null);
        this.updateCursor("default");
      }
    }
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    const container = this.options.getContainer();
    if (!container) return;

    const bounds = container.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    if (x < 0 || y < 0 || x > bounds.width || y > bounds.height) return;

    const tolerance = event.pointerType === "touch" ? 24 : 10;
    const chartTime = this.timeAtCoordinate(x, bounds.width);
    const snappedTime = this.snapToCandleTime(chartTime);

    // 1. If in drawing placement mode:
    if (this.drawingMode === "fixed-range-volume-profile") {
      if (snappedTime === null) return;
      const id = `drawing-vp-${Date.now()}-${this.drawingSequence++}`;
      this.dragState = {
        type: "creating-vp",
        id,
        fromTimestamp: snappedTime,
      };
      container.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      return;
    }

    if (this.drawingMode === "anchored-vwap") {
      if (snappedTime === null) return;
      const id = `drawing-avwap-${Date.now()}-${this.drawingSequence++}`;
      const newDrawing: AnchoredVwapDrawing = {
        id,
        type: "anchored-vwap",
        anchorTimestamp: snappedTime,
        priceSource: "typical",
        bandMultipliers: [1, 2, 3],
        showBands: true,
        showFill: false,
        showAnchorLine: true,
        showLabels: true,
        isSelected: true,
        createdAt: Date.now(),
      };
      this.options.onDrawingAdd(newDrawing);
      this.selectDrawing(id);
      this.setDrawingMode("pointer");
      event.preventDefault();
      return;
    }

    if (this.drawingMode === "horizontal-line") {
      const series = this.options.getSeries();
      const price = series?.coordinateToPrice(y);
      if (price !== null && price !== undefined && Number.isFinite(price)) {
        const id = `drawing-h-${Date.now()}-${this.drawingSequence++}`;
        this.options.onDrawingAdd({
          id,
          type: "horizontal-line",
          price,
          createdAt: Date.now(),
        });
        this.setDrawingMode("pointer");
      }
      return;
    }

    if (this.drawingMode === "vertical-line") {
      if (snappedTime !== null) {
        const id = `drawing-v-${Date.now()}-${this.drawingSequence++}`;
        this.options.onDrawingAdd({
          id,
          type: "vertical-line",
          timestamp: snappedTime,
          createdAt: Date.now(),
        });
        this.setDrawingMode("pointer");
      }
      return;
    }

    if (this.drawingMode === "long-position" || this.drawingMode === "short-position") {
      const series = this.options.getSeries();
      const price = series?.coordinateToPrice(y);
      if (price !== null && price !== undefined && Number.isFinite(price) && price > 0 && snappedTime !== null) {
        const direction: PositionDirection = this.drawingMode === "long-position" ? "long" : "short";
        const id = `drawing-pos-${Date.now()}-${this.drawingSequence++}`;
        this.dragState = {
          type: "creating-position",
          id,
          direction,
          entry: price,
          fromTimestamp: snappedTime,
          createdAt: Date.now(),
        };
        container.setPointerCapture?.(event.pointerId);
        event.preventDefault();
      }
      return;
    }

    // 2. "pointer" mode: Hit test existing drawings
    const drawings = this.options.getDrawings();

    // Prioritize currently selected drawing
    if (this.selectedDrawingId) {
      const selected = drawings.find((d) => d.id === this.selectedDrawingId);
      if (selected) {
        const hit = this.hitTestDrawing(selected, x, y, tolerance);
        if (hit) {
          this.startDrag(hit, event);
          return;
        }
      }
    }

    // Hit test all other drawings
    for (let i = drawings.length - 1; i >= 0; i--) {
      const drawing = drawings[i]!;
      if (drawing.id === this.selectedDrawingId) continue;
      const hit = this.hitTestDrawing(drawing, x, y, tolerance);
      if (hit) {
        this.selectDrawing(drawing.id);
        this.startDrag(hit, event);
        return;
      }
    }

    // Clicked empty space: deselect
    this.selectDrawing(null);
  };

  private hitTestDrawing(
    drawing: ChartDrawing,
    x: number,
    y: number,
    tolerance: number,
  ):
    | { drawing: VolumeProfileRangeDrawing; target: "start" | "end" | "body" }
    | { drawing: AnchoredVwapDrawing; target: "anchor" | "line" }
    | { drawing: PositionDrawing; level: PositionDrawingLevel }
    | null {
    if (drawing.type === "volume-profile-range") {
      const primitive = this.options.getVpPrimitive(drawing.id);
      if (primitive) {
        const target = primitive.hitTestTarget(x, y, tolerance);
        if (target) {
          return { drawing, target };
        }
      } else {
        // Fallback coordinate check
        const chart = this.options.getChart();
        if (chart) {
          const from = drawing.fromTimestamp ?? (drawing as any).from;
          const to = drawing.toTimestamp ?? (drawing as any).to;
          const x1 = chart.timeScale().timeToCoordinate(toChartTimestamp(from));
          const x2 = chart.timeScale().timeToCoordinate(toChartTimestamp(to));
          if (x1 !== null && x2 !== null) {
            const minX = Math.min(x1, x2);
            const maxX = Math.max(x1, x2);
            if (Math.abs(x - minX) <= tolerance) return { drawing, target: "start" };
            if (Math.abs(x - maxX) <= tolerance) return { drawing, target: "end" };
            if (x >= minX && x <= maxX) return { drawing, target: "body" };
          }
        }
      }
    }

    if (drawing.type === "anchored-vwap") {
      const primitive = this.options.getAvwapPrimitive(drawing.id);
      if (primitive) {
        const target = primitive.hitTestTarget(x, y, tolerance);
        if (target) {
          return { drawing, target };
        }
      } else {
        const chart = this.options.getChart();
        if (chart) {
          const ax = chart.timeScale().timeToCoordinate(toChartTimestamp(drawing.anchorTimestamp));
          if (ax !== null && Math.abs(x - ax) <= tolerance) {
            return { drawing, target: "anchor" };
          }
        }
      }
    }

    if (drawing.type === "position") {
      const series = this.options.getSeries();
      if (series) {
        for (const level of ["entry", "stopLoss", "takeProfit"] as const) {
          const py = series.priceToCoordinate(drawing[level]);
          if (py !== null && Math.abs(y - py) <= tolerance) {
            return { drawing, level };
          }
        }
      }
    }

    return null;
  }

  private startDrag(
    hit:
      | { drawing: VolumeProfileRangeDrawing; target: "start" | "end" | "body" }
      | { drawing: AnchoredVwapDrawing; target: "anchor" | "line" }
      | { drawing: PositionDrawing; level: PositionDrawingLevel },
    event: PointerEvent,
  ): void {
    const container = this.options.getContainer();
    container?.setPointerCapture?.(event.pointerId);
    this.suppressChartScroll();

    if ("level" in hit) {
      this.dragState = {
        type: "dragging-position-level",
        drawingId: hit.drawing.id,
        level: hit.level,
      };
      event.preventDefault();
      return;
    }

    if (hit.drawing.type === "volume-profile-range") {
      const drawing = hit.drawing;
      const bounds = container?.getBoundingClientRect();
      const x = bounds ? event.clientX - bounds.left : 0;
      const chartTime = this.timeAtCoordinate(x, bounds?.width ?? 1);
      const from = drawing.fromTimestamp ?? (drawing as any).from;
      const to = drawing.toTimestamp ?? (drawing as any).to;
      const clickTime = this.snapToCandleTime(chartTime) ?? from;

      if (hit.target === "start") {
        this.dragState = {
          type: "dragging-vp-start",
          drawingId: drawing.id,
          initialFrom: from,
          initialTo: to,
        };
      } else if (hit.target === "end") {
        this.dragState = {
          type: "dragging-vp-end",
          drawingId: drawing.id,
          initialFrom: from,
          initialTo: to,
        };
      } else {
        this.dragState = {
          type: "dragging-vp-body",
          drawingId: drawing.id,
          initialFrom: from,
          initialTo: to,
          clickTimestamp: clickTime,
        };
      }
      event.preventDefault();
      return;
    }

    if (hit.drawing.type === "anchored-vwap") {
      this.dragState = {
        type: "dragging-avwap-anchor",
        drawingId: hit.drawing.id,
      };
      event.preventDefault();
      return;
    }
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    this.pendingPointerEvent = { clientX: event.clientX, clientY: event.clientY };

    if (this.dragState.type === "idle") {
      // Hover feedback and cursor management
      this.updateHoverCursor(event);
      return;
    }

    // Schedule 60fps handle update via RAF
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(this.processPendingDrag);
    }
    event.preventDefault();
  };

  private readonly processPendingDrag = (): void => {
    this.rafId = null;
    if (!this.pendingPointerEvent) return;

    const container = this.options.getContainer();
    if (!container) return;

    const state = this.dragState;
    if (
      state.type === "idle" ||
      state.type === "creating-vp" ||
      state.type === "creating-position"
    ) {
      return;
    }

    const bounds = container.getBoundingClientRect();
    const x = this.pendingPointerEvent.clientX - bounds.left;
    const y = this.pendingPointerEvent.clientY - bounds.top;
    const chartTime = this.timeAtCoordinate(x, bounds.width);
    const snappedTime = this.snapToCandleTime(chartTime);

    const drawings = this.options.getDrawings();

    if (state.type === "dragging-vp-start") {
      if (snappedTime === null) return;
      const drawing = drawings.find((d) => d.id === state.drawingId);
      if (!drawing || drawing.type !== "volume-profile-range") return;

      const nextFrom = Math.min(snappedTime, state.initialTo);
      const nextTo = Math.max(snappedTime, state.initialTo);

      const nextDrawing: VolumeProfileRangeDrawing = {
        ...drawing,
        fromTimestamp: nextFrom,
        toTimestamp: nextTo,
        from: nextFrom,
        to: nextTo,
        isSelected: true,
      };
      this.options.onDrawingUpdate(nextDrawing, false);
      return;
    }

    if (state.type === "dragging-vp-end") {
      if (snappedTime === null) return;
      const drawing = drawings.find((d) => d.id === state.drawingId);
      if (!drawing || drawing.type !== "volume-profile-range") return;

      const nextFrom = Math.min(state.initialFrom, snappedTime);
      const nextTo = Math.max(state.initialFrom, snappedTime);

      const nextDrawing: VolumeProfileRangeDrawing = {
        ...drawing,
        fromTimestamp: nextFrom,
        toTimestamp: nextTo,
        from: nextFrom,
        to: nextTo,
        isSelected: true,
      };
      this.options.onDrawingUpdate(nextDrawing, false);
      return;
    }

    if (state.type === "dragging-vp-body") {
      if (snappedTime === null) return;
      const drawing = drawings.find((d) => d.id === state.drawingId);
      if (!drawing || drawing.type !== "volume-profile-range") return;

      const delta = snappedTime - state.clickTimestamp;
      const nextFrom = state.initialFrom + delta;
      const nextTo = state.initialTo + delta;

      const nextDrawing: VolumeProfileRangeDrawing = {
        ...drawing,
        fromTimestamp: nextFrom,
        toTimestamp: nextTo,
        from: nextFrom,
        to: nextTo,
        isSelected: true,
      };
      this.options.onDrawingUpdate(nextDrawing, false);
      return;
    }

    if (state.type === "dragging-avwap-anchor") {
      if (snappedTime === null) return;
      const drawing = drawings.find((d) => d.id === state.drawingId);
      if (!drawing || drawing.type !== "anchored-vwap") return;

      const nextDrawing: AnchoredVwapDrawing = {
        ...drawing,
        anchorTimestamp: snappedTime,
        isSelected: true,
      };
      this.options.onDrawingUpdate(nextDrawing, false);
      return;
    }

    if (state.type === "dragging-position-level") {
      const series = this.options.getSeries();
      const nextPrice = series?.coordinateToPrice(y);
      if (
        nextPrice === null ||
        nextPrice === undefined ||
        !Number.isFinite(nextPrice) ||
        nextPrice <= 0
      ) {
        return;
      }

      const drawing = drawings.find((d) => d.id === state.drawingId);
      if (!drawing || drawing.type !== "position") return;

      const nextDrawing = movePositionDrawingLevel(
        drawing,
        state.level,
        nextPrice,
      );
      this.options.onDrawingUpdate(nextDrawing, false);
      return;
    }
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    const container = this.options.getContainer();
    const bounds = container?.getBoundingClientRect();
    const x = bounds ? event.clientX - bounds.left : 0;
    const y = bounds ? event.clientY - bounds.top : 0;
    const chartTime = bounds ? this.timeAtCoordinate(x, bounds.width) : null;
    const snappedTime = this.snapToCandleTime(chartTime);

    // 1. Finalize creating Fixed Range Volume Profile
    if (this.dragState.type === "creating-vp") {
      const from = this.dragState.fromTimestamp;
      const to = snappedTime ?? from + 3_600_000;
      const newDrawing: VolumeProfileRangeDrawing = {
        id: this.dragState.id,
        type: "volume-profile-range",
        fromTimestamp: Math.min(from, to),
        toTimestamp: Math.max(from, to),
        from: Math.min(from, to),
        to: Math.max(from, to),
        rowCount: 70,
        volumeMode: "candle-direction",
        volumeUnit: "base",
        valueAreaPercent: 70,
        placement: "left",
        widthPercent: 30,
        opacityPercent: 70,
        showPOC: true,
        showVAH: true,
        showVAL: true,
        showValueAreaShading: true,
        showLabels: true,
        isSelected: true,
        createdAt: Date.now(),
      };
      this.options.onDrawingAdd(newDrawing);
      this.selectDrawing(newDrawing.id);
      this.setDrawingMode("pointer");
      this.dragState = { type: "idle" };
      this.restoreChartScroll();
      event.preventDefault();
      return;
    }

    // 2. Finalize creating Position
    if (this.dragState.type === "creating-position") {
      const series = this.options.getSeries();
      const currentPrice = series?.coordinateToPrice(y) ?? this.dragState.entry;
      const entry = this.dragState.entry;
      const direction = this.dragState.direction;

      const stopLoss =
        direction === "long"
          ? Math.min(currentPrice, entry * 0.98)
          : Math.max(currentPrice, entry * 1.02);
      const takeProfit =
        direction === "long"
          ? entry + (entry - stopLoss) * 2
          : entry - (stopLoss - entry) * 2;

      const positionDrawing = createPositionDrawing({
        id: this.dragState.id,
        direction,
        entry,
        stopLoss,
        takeProfit,
        fromTimestamp: this.dragState.fromTimestamp,
        createdAt: this.dragState.createdAt,
      });

      this.options.onDrawingAdd(positionDrawing);
      this.selectDrawing(positionDrawing.id);
      this.setDrawingMode("pointer");
      this.dragState = { type: "idle" };
      this.restoreChartScroll();
      event.preventDefault();
      return;
    }

    // 3. Finalize drag (commit to history / persistent state)
    const state = this.dragState;
    if (
      state.type === "dragging-vp-start" ||
      state.type === "dragging-vp-end" ||
      state.type === "dragging-vp-body" ||
      state.type === "dragging-avwap-anchor" ||
      state.type === "dragging-position-level"
    ) {
      const drawingId = state.drawingId;
      const drawings = this.options.getDrawings();
      const finalDrawing = drawings.find((d) => d.id === drawingId);
      if (finalDrawing) {
        this.options.onDrawingUpdate(finalDrawing, true);
      }
      this.dragState = { type: "idle" };
      this.restoreChartScroll();
      event.preventDefault();
      return;
    }

    this.dragState = { type: "idle" };
    this.restoreChartScroll();
  };

  private updateHoverCursor(event: PointerEvent): void {
    const container = this.options.getContainer();
    if (!container) return;

    if (this.drawingMode !== "pointer") {
      this.updateCursor("crosshair");
      return;
    }

    const bounds = container.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const tolerance = event.pointerType === "touch" ? 24 : 10;

    const drawings = this.options.getDrawings();

    // Check selected drawing first
    if (this.selectedDrawingId) {
      const selected = drawings.find((d) => d.id === this.selectedDrawingId);
      if (selected) {
        const hit = this.hitTestDrawing(selected, x, y, tolerance);
        if (hit) {
          if ("target" in hit) {
            if (hit.target === "start" || hit.target === "end") {
              this.updateCursor("ew-resize");
              return;
            }
            if (hit.target === "body" || hit.target === "anchor") {
              this.updateCursor("move");
              return;
            }
          }
          if ("level" in hit) {
            this.updateCursor("ns-resize");
            return;
          }
          this.updateCursor("pointer");
          return;
        }
      }
    }

    // Check other drawings
    for (const drawing of drawings) {
      const hit = this.hitTestDrawing(drawing, x, y, tolerance);
      if (hit) {
        this.updateCursor("pointer");
        return;
      }
    }

    this.updateCursor("default");
  }

  private updateCursor(cursor: string): void {
    const container = this.options.getContainer();
    if (container && container.style.cursor !== cursor) {
      container.style.cursor = cursor;
    }
  }

  private suppressChartScroll(): void {
    const chart = this.options.getChart();
    chart?.applyOptions({
      handleScroll: false,
      handleScale: false,
    });
  }

  private restoreChartScroll(): void {
    const chart = this.options.getChart();
    chart?.applyOptions({
      handleScroll: true,
      handleScale: true,
    });
  }

  private timeAtCoordinate(x: number, containerWidth: number): number | null {
    const chart = this.options.getChart();
    if (!chart) return null;
    const timeScale = chart.timeScale();
    const visibleTime = timeScale.coordinateToTime(x);
    if (typeof visibleTime === "number") {
      return visibleTime;
    }

    const logical = timeScale.coordinateToLogical(x);
    if (logical === null) return null;
    const logicalRange = timeScale.getVisibleLogicalRange();
    if (!logicalRange) return null;

    const fraction = containerWidth > 0 ? Math.max(0, Math.min(1, x / containerWidth)) : 0;
    const estimatedLogical = (logicalRange.from + (logicalRange.to - logicalRange.from) * fraction) as Logical;
    const fallbackTime = timeScale.coordinateToTime(
      timeScale.logicalToCoordinate(estimatedLogical) ?? x,
    );
    return typeof fallbackTime === "number" ? fallbackTime : null;
  }

  private snapToCandleTime(chartTime: number | null): number | null {
    if (chartTime === null) return null;
    const rawTime = chartTime > 1e11 ? chartTime : chartTime * 1_000;
    const candles = this.options.getCandles();
    if (candles.length === 0) return rawTime;

    // Binary search for nearest candle openTime
    let low = 0;
    let high = candles.length - 1;
    let closest = candles[0]!.openTime;
    let minDiff = Math.abs(rawTime - closest);

    while (low <= high) {
      const mid = (low + high) >> 1;
      const c = candles[mid]!;
      const diff = Math.abs(rawTime - c.openTime);
      if (diff < minDiff) {
        minDiff = diff;
        closest = c.openTime;
      }
      if (c.openTime === rawTime) return c.openTime;
      if (c.openTime < rawTime) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return closest;
  }
}
