import type { Candle, GammaLevel } from "@options-chart/domain";

export interface ChartVisibleRange {
  readonly fromTimestamp: number;
  readonly toTimestamp: number;
}

export interface ChartInitializeOptions {
  readonly symbol: string;
  readonly width: number;
  readonly height: number;
  readonly backgroundColor: string;
  readonly textColor: string;
  readonly enableConflation?: boolean;
}

export interface ChartHistoryOptions {
  readonly preserveVisibleRange?: boolean;
  readonly fitContent?: boolean;
}

export type ChartDrawingMode = "pointer" | "horizontal-line" | "vertical-line";

interface ChartDrawingBase {
  readonly id: string;
  readonly createdAt: number;
}

export interface HorizontalLineDrawing extends ChartDrawingBase {
  readonly type: "horizontal-line";
  readonly price: number;
}

export interface VerticalLineDrawing extends ChartDrawingBase {
  readonly type: "vertical-line";
  readonly timestamp: number;
}

export type ChartDrawing = HorizontalLineDrawing | VerticalLineDrawing;

export interface ChartViewportState {
  readonly visibleRange: ChartVisibleRange | null;
  readonly barsBefore: number;
  readonly barsAfter: number;
}

export interface ChartAdapterDiagnostics {
  readonly initializedAt: number;
  readonly chartCreateCount: number;
  readonly historyReplacementCount: number;
  readonly realtimeUpdateCount: number;
  readonly resizeCount: number;
  readonly dataPointCount: number;
  readonly drawingCount: number;
  readonly listenerCount: number;
  readonly conflationEnabled: boolean;
  readonly lastOperationDurationMs: number;
  readonly maxOperationDurationMs: number;
  readonly lastError: string | null;
}

export interface ChartAdapter {
  readonly name: string;
  readonly version: string;

  initialize(container: HTMLElement, options: ChartInitializeOptions): void;
  setHistory(candles: readonly Candle[], options?: ChartHistoryOptions): void;
  updateCandle(candle: Candle): void;
  setLevels(levels: readonly GammaLevel[]): void;
  removeLevel(id: string): void;
  setVisibleRange(range: ChartVisibleRange): void;
  getVisibleRange(): ChartVisibleRange | null;
  priceToCoordinate(price: number): number | null;
  subscribeViewportChange(
    listener: (state: ChartViewportState) => void,
  ): () => void;
  setDrawingMode(mode: ChartDrawingMode): void;
  addDrawing(drawing: ChartDrawing): void;
  removeDrawing(id: string): void;
  deleteSelectedDrawing(): void;
  clearDrawings(): void;
  getDrawings(): readonly ChartDrawing[];
  subscribeDrawingsChange(
    listener: (drawings: readonly ChartDrawing[]) => void,
  ): () => void;
  getDiagnostics(): ChartAdapterDiagnostics;
  resize(width: number, height: number): void;
  destroy(): void;
}
