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
}

export interface ChartAdapter {
  readonly name: string;
  readonly version: string;

  initialize(container: HTMLElement, options: ChartInitializeOptions): void;
  setHistory(candles: readonly Candle[]): void;
  updateCandle(candle: Candle): void;
  setLevels(levels: readonly GammaLevel[]): void;
  removeLevel(id: string): void;
  setVisibleRange(range: ChartVisibleRange): void;
  getVisibleRange(): ChartVisibleRange | null;
  resize(width: number, height: number): void;
  destroy(): void;
}
