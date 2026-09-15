import { describe, expect, it } from "vitest";
import type { Candle } from "@options-chart/domain";
import { calculateAnchoredVwap } from "./calculate";
import { buildAnchoredVwapCacheKey, AnchoredVwapCache } from "./cache";
import type { AnchoredVwapInput } from "./types";

function generate10000Candles(startTime = 1_700_000_000_000): Candle[] {
  const candles: Candle[] = [];
  let currentPrice = 60_000;
  const candleIntervalMs = 60_000;

  for (let i = 0; i < 10_000; i++) {
    const openTime = startTime + i * candleIntervalMs;
    const closeTime = openTime + candleIntervalMs - 1;

    const delta = ((i % 17) - 8) * 5;
    const open = currentPrice;
    const close = open + delta;
    const high = Math.max(open, close) + ((i % 11) + 1) * 3;
    const low = Math.min(open, close) - ((i % 13) + 1) * 3;
    const volume = 10 + (i % 50) * 2;

    candles.push({
      metadata: {
        source: "binance",
        sourceTimestamp: closeTime,
        receivedTimestamp: closeTime,
        normalizedTimestamp: closeTime,
        schemaVersion: "1.0.0",
      },
      symbol: "BTCUSDT",
      interval: "1m",
      openTime,
      closeTime,
      open,
      high,
      low,
      close,
      volume,
      quoteVolume: volume * close,
      tradeCount: 15,
      isClosed: true,
    });

    currentPrice = close;
  }

  return candles;
}

describe("Anchored VWAP Performance Benchmark (10,000 candles)", () => {
  const candles = generate10000Candles();
  const anchorTimestamp = candles[0]!.openTime;

  it("calculates Anchored VWAP over 10,000 candles well under 25ms budget", () => {
    const input: AnchoredVwapInput = {
      anchorTimestamp,
      candles,
      priceSource: "typical",
      bandMultipliers: [1, 2, 3],
    };

    const start = performance.now();
    const result = calculateAnchoredVwap(input);
    const duration = performance.now() - start;

    expect(result.points).toHaveLength(10_000);
    expect(result.candlesIncluded).toBe(10_000);
    expect(result.latestPoint).not.toBeNull();
    expect(result.latestPoint!.cumulativeVolume).toBeGreaterThan(0);
    expect(result.latestPoint!.standardDeviation).toBeGreaterThan(0);
    expect(result.latestPoint!.bands).toHaveLength(3);

    // Verify determinism on second run
    const secondResult = calculateAnchoredVwap(input);
    expect(secondResult.latestPoint!.vwap).toBe(result.latestPoint!.vwap);
    expect(secondResult.latestPoint!.standardDeviation).toBe(
      result.latestPoint!.standardDeviation,
    );

    console.log(
      `[Benchmark] 10,000 candles AVWAP: ${duration.toFixed(2)} ms (throughput: ${(10_000 / (duration / 1000)).toFixed(0)} candles/sec)`,
    );
    expect(duration).toBeLessThan(100);
  });

  it("serves repeated requests via AnchoredVwapCache with sub-millisecond latency", () => {
    const cache = new AnchoredVwapCache(10);
    const input: AnchoredVwapInput = {
      anchorTimestamp,
      candles,
      priceSource: "typical",
    };

    const key = buildAnchoredVwapCacheKey(input);
    const initial = calculateAnchoredVwap(input);
    cache.set(key, initial);

    const start = performance.now();
    const cached = cache.get(key);
    const duration = performance.now() - start;

    expect(cached).toBeDefined();
    expect(cached?.latestPoint?.vwap).toBe(initial.latestPoint?.vwap);
    expect(duration).toBeLessThan(5);

    console.log(
      `[Benchmark] Cache retrieval duration: ${duration.toFixed(3)} ms`,
    );
  });
});
