import type { Candle } from "@options-chart/domain";
import {
  calculateAnchoredVwap,
  calculateVolumeProfile,
  AnchoredVwapCache,
  VolumeProfileCache,
  buildAnchoredVwapCacheKey,
  buildVolumeProfileCacheKey,
} from "@options-chart/chart";
import {
  isDrawingCalculationRequest,
  DRAWING_WORKER_PROTOCOL_VERSION,
  type DrawingCalculationRequest,
  type DrawingCalculationResponse,
} from "@options-chart/worker-protocol";

const workerScope = self as unknown as {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  postMessage(message: DrawingCalculationResponse): void;
};

// In-worker storage for candles keyed by `${symbol}:${timeframe}`
const candleSeriesStore = new Map<string, readonly Candle[]>();

// In-worker LRU caches
const vwapCache = new AnchoredVwapCache(50);
const vpCache = new VolumeProfileCache(50);

workerScope.addEventListener("message", (event) => {
  if (!isDrawingCalculationRequest(event.data)) {
    return;
  }

  const message = event.data as DrawingCalculationRequest;

  // 1. Sync candles
  if (message.type === "sync-drawing-candles") {
    const key = `${message.symbol}:${message.timeframe}`;
    candleSeriesStore.set(key, message.candles);
    workerScope.postMessage({
      protocolVersion: DRAWING_WORKER_PROTOCOL_VERSION,
      type: "sync-drawing-candles-result",
      dataRevision: message.dataRevision,
      candleCount: message.candles.length,
    });
    return;
  }

  // 2. Calculate Anchored VWAP
  if (message.type === "calculate-drawing-avwap") {
    const startedAt = performance.now();
    try {
      const seriesKey = `${message.symbol}:${message.timeframe}`;
      const candles = message.candles ?? candleSeriesStore.get(seriesKey) ?? [];

      const input = {
        anchorTimestamp: message.anchorTimestamp,
        candles,
        priceSource: message.priceSource ?? "typical",
        bandMultipliers: message.bandMultipliers ?? [1, 2, 3],
        replayCutoff: message.replayCutoff,
        symbol: message.symbol,
        timeframe: message.timeframe,
      };

      const cacheKey = buildAnchoredVwapCacheKey(input);
      let result = vwapCache.get(cacheKey);

      if (!result) {
        result = calculateAnchoredVwap(input);
        vwapCache.set(cacheKey, result);
      }

      workerScope.postMessage({
        protocolVersion: DRAWING_WORKER_PROTOCOL_VERSION,
        type: "drawing-avwap-result",
        drawingId: message.drawingId,
        requestId: message.requestId,
        generation: message.generation,
        dataRevision: message.dataRevision,
        result,
        durationMs: performance.now() - startedAt,
      });
    } catch (error) {
      workerScope.postMessage({
        protocolVersion: DRAWING_WORKER_PROTOCOL_VERSION,
        type: "drawing-calculation-error",
        drawingId: message.drawingId,
        requestId: message.requestId,
        generation: message.generation,
        message: error instanceof Error ? error.message : "AVWAP calculation failed",
      });
    }
    return;
  }

  // 3. Calculate Fixed Range Volume Profile
  if (message.type === "calculate-drawing-vp") {
    const startedAt = performance.now();
    try {
      const seriesKey = `${message.symbol}:${message.timeframe}`;
      const candles = message.candles ?? candleSeriesStore.get(seriesKey) ?? [];

      const input = {
        candles,
        range: {
          from: message.fromTimestamp,
          to: message.toTimestamp,
        },
        binConfig: {
          mode: "rowCount" as const,
          rowCount: message.rowCount ?? 70,
        },
        volumeUnit: message.volumeUnit ?? "base",
        directionMode: message.directionMode ?? "candle-direction",
        valueAreaPercent: message.valueAreaPercent ?? 70,
        replayCutoff: message.replayCutoff,
        sourceMetadata: {
          exchange: "binance",
          market: "spot",
          symbol: message.symbol,
          sourceTimeframe: message.timeframe,
          displayTimeframe: message.timeframe,
          volumeUnit: message.volumeUnit ?? "base",
          calculationVersion: "1.0.0",
          sourceRevision: message.dataRevision,
        },
      };

      const cacheKey = buildVolumeProfileCacheKey(input);
      let result = vpCache.get(cacheKey);

      if (!result) {
        result = calculateVolumeProfile(input);
        vpCache.set(cacheKey, result);
      }

      workerScope.postMessage({
        protocolVersion: DRAWING_WORKER_PROTOCOL_VERSION,
        type: "drawing-vp-result",
        drawingId: message.drawingId,
        requestId: message.requestId,
        generation: message.generation,
        dataRevision: message.dataRevision,
        result,
        durationMs: performance.now() - startedAt,
      });
    } catch (error) {
      workerScope.postMessage({
        protocolVersion: DRAWING_WORKER_PROTOCOL_VERSION,
        type: "drawing-calculation-error",
        drawingId: message.drawingId,
        requestId: message.requestId,
        generation: message.generation,
        message: error instanceof Error ? error.message : "Volume Profile calculation failed",
      });
    }
    return;
  }
});

export {};
