import type { Candle } from "@options-chart/domain";
import type {
  AnchoredVwapPriceSource,
  AnchoredVwapResult,
} from "@options-chart/chart";
import type {
  VolumeProfileDirectionMode,
  VolumeProfileResult,
  VolumeProfileVolumeUnit,
} from "@options-chart/chart";

import { DRAWING_WORKER_PROTOCOL_VERSION } from "./versions";

export interface DrawingCandleSyncRequest {
  readonly protocolVersion: typeof DRAWING_WORKER_PROTOCOL_VERSION;
  readonly type: "sync-drawing-candles";
  readonly dataRevision: string;
  readonly symbol: string;
  readonly timeframe: string;
  readonly candles: readonly Candle[];
}

export interface DrawingCandleSyncSuccess {
  readonly protocolVersion: typeof DRAWING_WORKER_PROTOCOL_VERSION;
  readonly type: "sync-drawing-candles-result";
  readonly dataRevision: string;
  readonly candleCount: number;
}

export interface VwapDrawingCalculationRequest {
  readonly protocolVersion: typeof DRAWING_WORKER_PROTOCOL_VERSION;
  readonly type: "calculate-drawing-avwap";
  readonly drawingId: string;
  readonly requestId: number;
  readonly generation: number;
  readonly dataRevision: string;
  readonly symbol: string;
  readonly timeframe: string;
  readonly anchorTimestamp: number;
  readonly priceSource?: AnchoredVwapPriceSource;
  readonly bandMultipliers?: readonly number[];
  readonly replayCutoff?: number;
  readonly candles?: readonly Candle[];
}

export interface VwapDrawingCalculationSuccess {
  readonly protocolVersion: typeof DRAWING_WORKER_PROTOCOL_VERSION;
  readonly type: "drawing-avwap-result";
  readonly drawingId: string;
  readonly requestId: number;
  readonly generation: number;
  readonly dataRevision: string;
  readonly result: AnchoredVwapResult;
  readonly durationMs: number;
}

export interface VpDrawingCalculationRequest {
  readonly protocolVersion: typeof DRAWING_WORKER_PROTOCOL_VERSION;
  readonly type: "calculate-drawing-vp";
  readonly drawingId: string;
  readonly requestId: number;
  readonly generation: number;
  readonly dataRevision: string;
  readonly symbol: string;
  readonly timeframe: string;
  readonly fromTimestamp: number;
  readonly toTimestamp: number;
  readonly rowCount?: number;
  readonly directionMode?: VolumeProfileDirectionMode;
  readonly volumeUnit?: VolumeProfileVolumeUnit;
  readonly valueAreaPercent?: number;
  readonly replayCutoff?: number;
  readonly sourceTimeframe?: string;
  readonly candles?: readonly Candle[];
}

export interface VpDrawingCalculationSuccess {
  readonly protocolVersion: typeof DRAWING_WORKER_PROTOCOL_VERSION;
  readonly type: "drawing-vp-result";
  readonly drawingId: string;
  readonly requestId: number;
  readonly generation: number;
  readonly dataRevision: string;
  readonly result: VolumeProfileResult;
  readonly durationMs: number;
}

export interface DrawingCalculationFailure {
  readonly protocolVersion: typeof DRAWING_WORKER_PROTOCOL_VERSION;
  readonly type: "drawing-calculation-error";
  readonly drawingId: string;
  readonly requestId: number;
  readonly generation: number;
  readonly message: string;
}

export type DrawingCalculationRequest =
  | DrawingCandleSyncRequest
  | VwapDrawingCalculationRequest
  | VpDrawingCalculationRequest;

export type DrawingCalculationResponse =
  | DrawingCandleSyncSuccess
  | VwapDrawingCalculationSuccess
  | VpDrawingCalculationSuccess
  | DrawingCalculationFailure;

export function isDrawingCalculationRequest(
  value: unknown,
): value is DrawingCalculationRequest {
  if (!value || typeof value !== "object") return false;
  const req = value as Record<string, unknown>;
  return (
    req.protocolVersion === DRAWING_WORKER_PROTOCOL_VERSION &&
    typeof req.type === "string" &&
    (req.type === "calculate-drawing-avwap" ||
      req.type === "calculate-drawing-vp" ||
      req.type === "sync-drawing-candles")
  );
}

export function isDrawingCalculationResponse(
  value: unknown,
): value is DrawingCalculationResponse {
  if (!value || typeof value !== "object") return false;
  const res = value as Record<string, unknown>;
  return (
    res.protocolVersion === DRAWING_WORKER_PROTOCOL_VERSION &&
    typeof res.type === "string" &&
    (res.type === "drawing-avwap-result" ||
      res.type === "drawing-vp-result" ||
      res.type === "drawing-calculation-error" ||
      res.type === "sync-drawing-candles-result")
  );
}
