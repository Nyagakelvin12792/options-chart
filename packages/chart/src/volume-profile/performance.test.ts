import { describe, expect, it } from "vitest";
import type { Candle } from "@options-chart/domain";
import { calculateVolumeProfile } from "./calculate";
import { buildVolumeProfileCacheKey, VolumeProfileCache } from "./cache";
import type { VolumeProfileInput, VolumeProfileSourceMetadata } from "./types";

const defaultMeta: VolumeProfileSourceMetadata = {
  exchange: "binance",
  market: "spot",
  symbol: "BTCUSDT",
  sourceTimeframe: "1m",
  displayTimeframe: "15m",
  volumeUnit: "base",
  calculationVersion: "1.0.0",
};

function generate10000Candles(startTime = 1_700_000_000_000): Candle[] {
  const candles: Candle[] = [];
  let currentPrice = 60_000;
  const candleIntervalMs = 60_000;

  for (let i = 0; i < 10_000; i++) {
    const openTime = startTime + i * candleIntervalMs;
    const closeTime = openTime + candleIntervalMs - 1;

    // Pseudo-random deterministic walk
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

describe("Volume Profile Performance Benchmark (10,000 candles)", () => {
  const candles = generate10000Candles();
  const range = {
    from: candles[0]!.openTime,
    to: candles[candles.length - 1]!.closeTime,
  };

  it("calculates volume profile over 10,000 candles with typical row count (70 rows)", () => {
    const input: VolumeProfileInput = {
      candles,
      range,
      binConfig: { mode: "rowCount", rowCount: 70 },
      valueAreaPercent: 70,
      sourceMetadata: defaultMeta,
    };

    const start = performance.now();
    const result = calculateVolumeProfile(input);
    const duration = performance.now() - start;

    expect(result.rows).toHaveLength(70);
    expect(result.qualityMetadata.eligibleCandleCount).toBe(10_000);
    expect(result.totalEligibleVolume).toBeGreaterThan(0);
    expect(result.pocPrice).not.toBeNull();
    expect(result.vah).not.toBeNull();
    expect(result.val).not.toBeNull();
    expect(result.achievedValueAreaPercent).toBeGreaterThanOrEqual(70);

    // Sum volume conservation check
    const sumVolume = result.rows.reduce((acc, r) => acc + r.totalVolume, 0);
    expect(Math.abs(sumVolume - result.totalEligibleVolume)).toBeLessThan(1e-6);

    // Verify repeated run produces exact same numbers
    const secondResult = calculateVolumeProfile(input);
    expect(secondResult.pocPrice).toBe(result.pocPrice);
    expect(secondResult.val).toBe(result.val);
    expect(secondResult.vah).toBe(result.vah);
    expect(secondResult.totalEligibleVolume).toBe(result.totalEligibleVolume);

    console.log(
      `[Benchmark] 10,000 candles, 70 rows: ${duration.toFixed(2)} ms (throughput: ${(10_000 / (duration / 1000)).toFixed(0)} candles/sec)`,
    );
  });

  it("calculates volume profile over 10,000 candles with worst-case cap (2,048 rows)", () => {
    const input: VolumeProfileInput = {
      candles,
      range,
      binConfig: { mode: "rowCount", rowCount: 2048 },
      valueAreaPercent: 70,
      sourceMetadata: defaultMeta,
    };

    const start = performance.now();
    const result = calculateVolumeProfile(input);
    const duration = performance.now() - start;

    expect(result.rows).toHaveLength(2048);
    expect(result.totalEligibleVolume).toBeGreaterThan(0);
    expect(result.pocPrice).not.toBeNull();

    console.log(
      `[Benchmark] 10,000 candles, 2,048 rows: ${duration.toFixed(2)} ms`,
    );
  });

  it("serves repeated requests via VolumeProfileCache with near-zero latency", () => {
    const cache = new VolumeProfileCache(10);
    const input: VolumeProfileInput = {
      candles,
      range,
      binConfig: { mode: "rowCount", rowCount: 100 },
      valueAreaPercent: 70,
      sourceMetadata: defaultMeta,
    };

    const key = buildVolumeProfileCacheKey(input);
    const initial = calculateVolumeProfile(input);
    cache.set(key, initial);

    const start = performance.now();
    const cached = cache.get(key);
    const duration = performance.now() - start;

    expect(cached).toBeDefined();
    expect(cached?.pocPrice).toBe(initial.pocPrice);
    expect(duration).toBeLessThan(5); // Cache retrieval is sub-millisecond

    console.log(`[Benchmark] Cache retrieval duration: ${duration.toFixed(3)} ms`);
  });
});
