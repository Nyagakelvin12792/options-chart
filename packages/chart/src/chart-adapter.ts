import type { Candle, GammaLevel } from "@options-chart/domain";
import type {
  AnchoredVwapPriceSource,
  AnchoredVwapRenderInput,
  AnchoredVwapResult,
} from "./anchored-vwap/types";
import type {
  VolumeProfileDirectionMode,
  VolumeProfilePlacement,
  VolumeProfileQualityMetadata,
  VolumeProfileRenderInput,
  VolumeProfileResult,
  VolumeProfileVolumeUnit,
} from "./volume-profile/types";

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
  readonly showVolumePane?: boolean;
}

export interface ChartHistoryOptions {
  readonly preserveVisibleRange?: boolean;
  readonly fitContent?: boolean;
}

export type ChartDrawingMode =
  | "pointer"
  | "horizontal-line"
  | "vertical-line"
  | "anchored-vwap"
  | "fixed-range-volume-profile"
  | "long-position"
  | "short-position";

export type PositionDirection = "long" | "short";

interface ChartDrawingBase {
  readonly id: string;
  readonly createdAt: number;
  readonly isSelected?: boolean;
  readonly isHovered?: boolean;
}

export interface HorizontalLineDrawing extends ChartDrawingBase {
  readonly type: "horizontal-line";
  readonly price: number;
}

export interface VerticalLineDrawing extends ChartDrawingBase {
  readonly type: "vertical-line";
  readonly timestamp: number;
}

export interface PositionDrawing extends ChartDrawingBase {
  readonly type: "position";
  readonly direction: PositionDirection;
  readonly entry: number;
  readonly stopLoss: number;
  readonly takeProfit: number;
  readonly fromTimestamp?: number;
  readonly toTimestamp?: number;
}

export interface VolumeProfileRangeDrawing extends ChartDrawingBase {
  readonly type: "volume-profile-range";
  readonly symbol?: string;
  readonly fromTimestamp: number;
  readonly toTimestamp: number;
  readonly from?: number;
  readonly to?: number;
  readonly updatedAt?: number;
  readonly extendRight?: boolean;
  readonly rowCount?: number;
  readonly volumeMode?: VolumeProfileDirectionMode;
  readonly volumeUnit?: VolumeProfileVolumeUnit;
  readonly valueAreaPercent?: number;
  readonly placement?: VolumeProfilePlacement;
  readonly widthPercent?: number;
  readonly opacityPercent?: number;
  readonly showPOC?: boolean;
  readonly showVAH?: boolean;
  readonly showVAL?: boolean;
  readonly showValueAreaShading?: boolean;
  readonly showLabels?: boolean;
  readonly calculationSourceTimeframe?: string;
  readonly qualityMetadata?: VolumeProfileQualityMetadata;
}

export interface AnchoredVwapDrawing extends ChartDrawingBase {
  readonly type: "anchored-vwap";
  readonly symbol?: string;
  readonly anchorTimestamp: number;
  readonly updatedAt?: number;
  readonly priceSource?: AnchoredVwapPriceSource;
  readonly bandMultipliers?: readonly number[];
  readonly lineColor?: string;
  readonly lineWidth?: number;
  readonly lineStyle?: number;
  readonly bandColors?: readonly string[];
  readonly bandLineWidth?: number;
  readonly showBands?: boolean;
  readonly bandFillColor?: string;
  readonly showFill?: boolean;
  readonly fillOpacityPercent?: number;
  readonly showPriceAxisLabel?: boolean;
  readonly showAnchorLine?: boolean;
  readonly showLabels?: boolean;
}

export type ChartDrawing =
  | HorizontalLineDrawing
  | VerticalLineDrawing
  | PositionDrawing
  | VolumeProfileRangeDrawing
  | AnchoredVwapDrawing;

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
  selectDrawing?(id: string | null): void;
  getSelectedDrawingId?(): string | null;
  updateDrawing?(
    idOrDrawing: string | ChartDrawing,
    updates?: Partial<ChartDrawing>,
  ): void;
  clearDrawings(): void;
  getDrawings(): readonly ChartDrawing[];
  subscribeDrawingsChange(
    listener: (drawings: readonly ChartDrawing[]) => void,
  ): () => void;
  subscribeLiveDrawingUpdate?(
    listener: (drawing: ChartDrawing) => void,
  ): () => void;
  subscribeDrawingModeChange?(
    listener: (mode: ChartDrawingMode) => void,
  ): () => void;
  subscribeTimeSelection(listener: (timestamp: number) => void): () => void;
  setVolumeProfile?(id: string, renderInput: VolumeProfileRenderInput): void;
  removeVolumeProfile?(id: string): void;
  setVolumeProfileDrawingResult?(id: string, result: VolumeProfileResult): void;
  setAnchoredVwap?(id: string, renderInput: AnchoredVwapRenderInput): void;
  removeAnchoredVwap?(id: string): void;
  setAnchoredVwapDrawingResult?(id: string, result: AnchoredVwapResult): void;
  getDiagnostics(): ChartAdapterDiagnostics;
  resize(width: number, height: number): void;
  destroy(): void;
}
