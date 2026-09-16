import type { Candle } from "@options-chart/domain";
import {
  calculateAnchoredVwap,
  calculateVolumeProfile,
  type AnchoredVwapResult,
  type VolumeProfileResult,
} from "@options-chart/chart";
import {
  DRAWING_WORKER_PROTOCOL_VERSION,
  isDrawingCalculationResponse,
  type DrawingCalculationResponse,
} from "@options-chart/worker-protocol";

export interface DrawingCalculationCallbacks {
  readonly onVwapResult: (drawingId: string, result: AnchoredVwapResult) => void;
  readonly onVpResult: (drawingId: string, result: VolumeProfileResult) => void;
  readonly onError?: (drawingId: string, message: string) => void;
}

export class DrawingCalculationManager {
  private worker: Worker | null = null;
  private readonly generations = new Map<string, number>();
  private requestCounter = 0;
  private isDestroyed = false;

  constructor(private readonly callbacks: DrawingCalculationCallbacks) {
    this.initWorker();
  }

  private initWorker(): void {
    if (typeof window === "undefined" || typeof Worker === "undefined") {
      return;
    }

    try {
      this.worker = new Worker(
        new URL("../workers/drawing-calculation.worker.ts", import.meta.url),
      );
      this.worker.addEventListener("message", this.handleWorkerMessage);
    } catch {
      // Worker creation might fail in certain environments; fallback to synchronous execution
      this.worker = null;
    }
  }

  private readonly handleWorkerMessage = (event: MessageEvent<unknown>): void => {
    if (this.isDestroyed || !isDrawingCalculationResponse(event.data)) {
      return;
    }

    const response = event.data as DrawingCalculationResponse;

    if (response.type === "sync-drawing-candles-result") {
      return;
    }

    const currentGen = this.generations.get(response.drawingId) ?? 0;
    // Discard stale responses superseded by newer user interactions
    if (response.generation < currentGen) {
      return;
    }

    if (response.type === "drawing-avwap-result") {
      this.callbacks.onVwapResult(response.drawingId, response.result);
      return;
    }

    if (response.type === "drawing-vp-result") {
      this.callbacks.onVpResult(response.drawingId, response.result);
      return;
    }

    if (response.type === "drawing-calculation-error") {
      this.callbacks.onError?.(response.drawingId, response.message);
      return;
    }
  };

  syncCandles(
    symbol: string,
    timeframe: string,
    candles: readonly Candle[],
    dataRevision: string,
  ): void {
    if (this.worker) {
      this.worker.postMessage({
        protocolVersion: DRAWING_WORKER_PROTOCOL_VERSION,
        type: "sync-drawing-candles",
        dataRevision,
        symbol,
        timeframe,
        candles,
      });
    }
  }

  requestVwap(params: {
    readonly drawingId: string;
    readonly anchorTimestamp: number;
    readonly candles: readonly Candle[];
    readonly symbol: string;
    readonly timeframe: string;
    readonly priceSource?: string | undefined;
    readonly bandMultipliers?: readonly number[] | undefined;
    readonly replayCutoff?: number | undefined;
    readonly dataRevision?: string | undefined;
  }): void {
    const nextGen = (this.generations.get(params.drawingId) ?? 0) + 1;
    this.generations.set(params.drawingId, nextGen);
    const requestId = ++this.requestCounter;
    const revision = params.dataRevision ?? `${Date.now()}`;

    if (this.worker) {
      this.worker.postMessage({
        protocolVersion: DRAWING_WORKER_PROTOCOL_VERSION,
        type: "calculate-drawing-avwap",
        drawingId: params.drawingId,
        requestId,
        generation: nextGen,
        dataRevision: revision,
        symbol: params.symbol,
        timeframe: params.timeframe,
        anchorTimestamp: params.anchorTimestamp,
        priceSource: params.priceSource as any,
        bandMultipliers: params.bandMultipliers,
        replayCutoff: params.replayCutoff,
        candles: params.candles,
      });
    } else {
      // Synchronous fallback
      try {
        const result = calculateAnchoredVwap({
          anchorTimestamp: params.anchorTimestamp,
          candles: params.candles,
          priceSource: params.priceSource as any,
          bandMultipliers: params.bandMultipliers,
          replayCutoff: params.replayCutoff,
          symbol: params.symbol,
          timeframe: params.timeframe,
        });
        this.callbacks.onVwapResult(params.drawingId, result);
      } catch (err) {
        this.callbacks.onError?.(
          params.drawingId,
          err instanceof Error ? err.message : "AVWAP calculation failed",
        );
      }
    }
  }

  requestVolumeProfile(params: {
    readonly drawingId: string;
    readonly fromTimestamp: number;
    readonly toTimestamp: number;
    readonly candles: readonly Candle[];
    readonly symbol: string;
    readonly timeframe: string;
    readonly rowCount?: number | undefined;
    readonly volumeMode?: "total" | "candle-direction" | "up-down" | undefined;
    readonly volumeUnit?: "base" | "quote" | undefined;
    readonly valueAreaPercent?: number | undefined;
    readonly replayCutoff?: number | undefined;
    readonly dataRevision?: string | undefined;
  }): void {
    const nextGen = (this.generations.get(params.drawingId) ?? 0) + 1;
    this.generations.set(params.drawingId, nextGen);
    const requestId = ++this.requestCounter;
    const revision = params.dataRevision ?? `${Date.now()}`;

    if (this.worker) {
      this.worker.postMessage({
        protocolVersion: DRAWING_WORKER_PROTOCOL_VERSION,
        type: "calculate-drawing-vp",
        drawingId: params.drawingId,
        requestId,
        generation: nextGen,
        dataRevision: revision,
        symbol: params.symbol,
        timeframe: params.timeframe,
        fromTimestamp: params.fromTimestamp,
        toTimestamp: params.toTimestamp,
        rowCount: params.rowCount ?? 70,
        directionMode: params.volumeMode === "total" ? "total" : "candle-direction",
        volumeUnit: params.volumeUnit ?? "base",
        valueAreaPercent: params.valueAreaPercent ?? 70,
        replayCutoff: params.replayCutoff,
        candles: params.candles,
      });
    } else {
      // Synchronous fallback
      try {
        const result = calculateVolumeProfile({
          candles: params.candles,
          range: {
            from: params.fromTimestamp,
            to: params.toTimestamp,
          },
          binConfig: {
            mode: "rowCount",
            rowCount: params.rowCount ?? 70,
          },
          volumeUnit: params.volumeUnit ?? "base",
          directionMode: params.volumeMode === "total" ? "total" : "candle-direction",
          valueAreaPercent: params.valueAreaPercent ?? 70,
          replayCutoff: params.replayCutoff,
          sourceMetadata: {
            exchange: "binance",
            market: "spot",
            symbol: params.symbol,
            sourceTimeframe: params.timeframe,
            displayTimeframe: params.timeframe,
            volumeUnit: params.volumeUnit ?? "base",
            calculationVersion: "1.0.0",
            sourceRevision: revision,
          },
        });
        this.callbacks.onVpResult(params.drawingId, result);
      } catch (err) {
        this.callbacks.onError?.(
          params.drawingId,
          err instanceof Error ? err.message : "Volume Profile calculation failed",
        );
      }
    }
  }

  destroy(): void {
    this.isDestroyed = true;
    if (this.worker) {
      this.worker.removeEventListener("message", this.handleWorkerMessage);
      this.worker.terminate();
      this.worker = null;
    }
    this.generations.clear();
  }
}
