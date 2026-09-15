import { describe, expect, it } from "vitest";
import type { Candle } from "@options-chart/domain";
import {
  calculateAnchoredVwap,
  extractCandlePrice,
  findAnchorIndex,
} from "./calculate";
import { AnchoredVwapCache, buildAnchoredVwapCacheKey } from "./cache";
import { AnchoredVwapController } from "./controller";
import type { AnchoredVwapInput, AnchoredVwapResult } from "./types";

function makeCandle(overrides: Partial<Candle> = {}): Candle {
  return {
    metadata: {
      source: "binance",
      sourceTimestamp: 1_700_000_000_000,
      receivedTimestamp: 1_700_000_000_000,
      normalizedTimestamp: 1_700_000_000_000,
      schemaVersion: "1.0.0",
    },
    symbol: "BTCUSDT",
    interval: "1m",
    openTime: 1_700_000_000_000,
    closeTime: 1_700_000_059_999,
    open: 50_000,
    high: 50_200,
    low: 49_900,
    close: 50_100,
    volume: 10,
    quoteVolume: 501_000,
    tradeCount: 100,
    isClosed: true,
    ...overrides,
  };
}

describe("Anchored VWAP Pure Calculation", () => {
  it("computes single-candle anchor with VWAP equal to price and stddev 0", () => {
    const candle = makeCandle({
      openTime: 1_000,
      closeTime: 1_059,
      high: 105,
      low: 95,
      close: 100,
      volume: 10,
    });
    // typical = (105 + 95 + 100) / 3 = 100
    const result = calculateAnchoredVwap({
      anchorTimestamp: 1_000,
      candles: [candle],
      bandMultipliers: [1, 2],
      priceSource: "typical",
    });

    expect(result.points).toHaveLength(1);
    const p0 = result.points[0]!;
    expect(p0.vwap).toBeCloseTo(100, 6);
    expect(p0.variance).toBe(0);
    expect(p0.standardDeviation).toBe(0);
    expect(p0.cumulativeVolume).toBe(10);
    expect(p0.cumulativeTypicalPriceVolume).toBe(1_000);
    expect(p0.bands).toHaveLength(2);
    expect(p0.bands[0]!.upper).toBeCloseTo(100, 6);
    expect(p0.bands[0]!.lower).toBeCloseTo(100, 6);
    expect(p0.bands[1]!.upper).toBeCloseTo(100, 6);
    expect(p0.bands[1]!.lower).toBeCloseTo(100, 6);
    expect(result.candlesIncluded).toBe(1);
    expect(result.candlesExcluded).toBe(0);
  });

  it("calculates exact multi-candle accumulation matching mathematical definition", () => {
    // Candle 1: price 100, vol 10 -> cumPV = 1000, cumV = 10 -> VWAP = 100, std = 0
    // Candle 2: price 110, vol 10 -> cumPV = 2100, cumV = 20 -> VWAP = 105
    // Variance at candle 2: (10*(100-105)^2 + 10*(110-105)^2) / 20 = (250 + 250)/20 = 25 -> std = 5
    // Bands: +/- 1 std -> [100, 110]; +/- 2 std -> [95, 115]
    const c1 = makeCandle({
      openTime: 1_000,
      closeTime: 1_059,
      high: 100,
      low: 100,
      close: 100,
      volume: 10,
    });
    const c2 = makeCandle({
      openTime: 1_060,
      closeTime: 1_119,
      high: 110,
      low: 110,
      close: 110,
      volume: 10,
    });

    const result = calculateAnchoredVwap({
      anchorTimestamp: 1_000,
      candles: [c1, c2],
      bandMultipliers: [1, 2],
      priceSource: "close",
    });

    expect(result.points).toHaveLength(2);
    const p1 = result.points[1]!;
    expect(p1.vwap).toBeCloseTo(105, 6);
    expect(p1.variance).toBeCloseTo(25, 6);
    expect(p1.standardDeviation).toBeCloseTo(5, 6);
    expect(p1.cumulativeVolume).toBe(20);
    expect(p1.cumulativeTypicalPriceVolume).toBe(2_100);

    expect(p1.bands[0]!.multiplier).toBe(1);
    expect(p1.bands[0]!.upper).toBeCloseTo(110, 6);
    expect(p1.bands[0]!.lower).toBeCloseTo(100, 6);

    expect(p1.bands[1]!.multiplier).toBe(2);
    expect(p1.bands[1]!.upper).toBeCloseTo(115, 6);
    expect(p1.bands[1]!.lower).toBeCloseTo(95, 6);
  });

  it("handles different price sources correctly", () => {
    const c = makeCandle({
      open: 100,
      high: 120,
      low: 80,
      close: 110,
      volume: 1,
    });

    // close = 110
    expect(extractCandlePrice(c, "close")).toBe(110);
    // hl2 = (120 + 80) / 2 = 100
    expect(extractCandlePrice(c, "hl2")).toBe(100);
    // typical = (120 + 80 + 110) / 3 = 103.3333333
    expect(extractCandlePrice(c, "typical")).toBeCloseTo(103.333333, 5);
    // ohlc4 = (100 + 120 + 80 + 110) / 4 = 102.5
    expect(extractCandlePrice(c, "ohlc4")).toBe(102.5);
    // weighted = (120 + 80 + 2*110) / 4 = 105
    expect(extractCandlePrice(c, "weighted")).toBe(105);
  });

  it("filters candles before anchor timestamp", () => {
    const candles = [
      makeCandle({ openTime: 1_000, closeTime: 1_059 }),
      makeCandle({ openTime: 1_060, closeTime: 1_119 }),
      makeCandle({ openTime: 1_120, closeTime: 1_179 }),
    ];

    const result = calculateAnchoredVwap({
      anchorTimestamp: 1_060,
      candles,
    });

    expect(result.resolvedAnchorIndex).toBe(1);
    expect(result.points).toHaveLength(2);
    expect(result.points[0]!.timestamp).toBe(1_060);
    expect(result.candlesIncluded).toBe(2);
    expect(result.candlesExcluded).toBe(1);
    expect(result.exclusions[0]!.reason).toBe("before_anchor");
  });

  it("honors replayCutoff and excludes later or unclosed candles", () => {
    const candles = [
      makeCandle({ openTime: 1_000, closeTime: 1_059, isClosed: true }),
      makeCandle({ openTime: 1_060, closeTime: 1_119, isClosed: true }),
      makeCandle({ openTime: 1_120, closeTime: 1_179, isClosed: false }),
      makeCandle({ openTime: 1_180, closeTime: 1_239, isClosed: true }),
    ];

    const result = calculateAnchoredVwap({
      anchorTimestamp: 1_000,
      candles,
      replayCutoff: 1_150,
    });

    // Candle 0: included (closeTime 1059 <= 1150)
    // Candle 1: included (closeTime 1119 <= 1150)
    // Candle 2: excluded (closeTime 1179 > 1150)
    // Candle 3: excluded (closeTime 1239 > 1150)
    expect(result.points).toHaveLength(2);
    expect(result.points[1]!.timestamp).toBe(1_060);
    expect(
      result.exclusions.some((e) => e.reason === "after_replay_cutoff"),
    ).toBe(true);
  });

  it("carries forward VWAP when candle volume is zero without NaN", () => {
    const c1 = makeCandle({
      openTime: 1_000,
      closeTime: 1_059,
      close: 100,
      volume: 10,
    });
    const c2 = makeCandle({
      openTime: 1_060,
      closeTime: 1_119,
      close: 150,
      volume: 0,
    });

    const result = calculateAnchoredVwap({
      anchorTimestamp: 1_000,
      candles: [c1, c2],
      priceSource: "close",
    });

    expect(result.points).toHaveLength(2);
    expect(result.points[1]!.vwap).toBe(100);
    expect(result.points[1]!.standardDeviation).toBe(0);
    expect(result.points[1]!.cumulativeVolume).toBe(10);
    expect(Number.isFinite(result.points[1]!.vwap)).toBe(true);
  });

  it("does not invent a VWAP before positive volume exists", () => {
    const zero = makeCandle({
      openTime: 1_000,
      closeTime: 1_059,
      close: 100,
      volume: 0,
    });
    const traded = makeCandle({
      openTime: 1_060,
      closeTime: 1_119,
      close: 110,
      volume: 10,
    });

    const result = calculateAnchoredVwap({
      anchorTimestamp: 1_000,
      candles: [zero, traded],
      priceSource: "close",
    });

    expect(result.points).toHaveLength(1);
    expect(result.latestPoint?.vwap).toBe(110);
    expect(result.candlesIncluded).toBe(1);
    expect(result.candlesExcluded).toBe(1);
  });

  it("returns empty result if anchor is after latest candle", () => {
    const c1 = makeCandle({ openTime: 1_000, closeTime: 1_059 });
    const result = calculateAnchoredVwap({
      anchorTimestamp: 2_000,
      candles: [c1],
    });

    expect(result.resolvedAnchorIndex).toBeNull();
    expect(result.points).toHaveLength(0);
    expect(result.latestPoint).toBeNull();
  });

  it("automatically sorts out-of-order candles", () => {
    const c1 = makeCandle({
      openTime: 1_000,
      closeTime: 1_059,
      close: 100,
      volume: 10,
    });
    const c2 = makeCandle({
      openTime: 2_000,
      closeTime: 2_059,
      close: 120,
      volume: 10,
    });
    const result = calculateAnchoredVwap({
      anchorTimestamp: 1_000,
      candles: [c2, c1], // inverted order
      priceSource: "close",
    });

    expect(result.points).toHaveLength(2);
    expect(result.points[0]!.timestamp).toBe(1_000);
    expect(result.points[1]!.timestamp).toBe(2_000);
    expect(result.points[1]!.vwap).toBeCloseTo(110, 6);
  });

  it("findAnchorIndex finds exact or overlapping candle index", () => {
    const candles = [
      makeCandle({ openTime: 1_000, closeTime: 1_059 }),
      makeCandle({ openTime: 1_060, closeTime: 1_119 }),
      makeCandle({ openTime: 1_120, closeTime: 1_179 }),
    ];

    expect(findAnchorIndex(candles, 500)).toBe(0);
    expect(findAnchorIndex(candles, 1_000)).toBe(0);
    expect(findAnchorIndex(candles, 1_030)).toBe(0);
    expect(findAnchorIndex(candles, 1_060)).toBe(1);
    expect(findAnchorIndex(candles, 1_150)).toBe(2);
    expect(findAnchorIndex(candles, 2_000)).toBeNull();
  });
});

describe("Anchored VWAP LRU Cache", () => {
  it("stores, retrieves, and evicts entries adhering to capacity", () => {
    const cache = new AnchoredVwapCache(2);
    const c = makeCandle();

    const input1: AnchoredVwapInput = { anchorTimestamp: 100, candles: [c] };
    const input2: AnchoredVwapInput = { anchorTimestamp: 200, candles: [c] };
    const input3: AnchoredVwapInput = { anchorTimestamp: 300, candles: [c] };

    const key1 = buildAnchoredVwapCacheKey(input1);
    const key2 = buildAnchoredVwapCacheKey(input2);
    const key3 = buildAnchoredVwapCacheKey(input3);

    const res1 = calculateAnchoredVwap(input1);
    const res2 = calculateAnchoredVwap(input2);
    const res3 = calculateAnchoredVwap(input3);

    cache.set(key1, res1);
    cache.set(key2, res2);
    expect(cache.size()).toBe(2);
    expect(cache.has(key1)).toBe(true);

    // Access key1 to refresh LRU order
    expect(cache.get(key1)).toBe(res1);

    // Insert key3 -> should evict oldest (key2)
    cache.set(key3, res3);
    expect(cache.size()).toBe(2);
    expect(cache.has(key2)).toBe(false);
    expect(cache.has(key1)).toBe(true);
    expect(cache.has(key3)).toBe(true);

    cache.clear();
    expect(cache.size()).toBe(0);
  });
});

describe("Anchored VWAP Controller", () => {
  it("dispatches immediate calculations and cancels timers upon dispose", () => {
    let renderedResult: AnchoredVwapResult | null = null;
    const controller = new AnchoredVwapController({
      vwapId: "test-vwap",
      onRender: (renderInput) => {
        renderedResult = renderInput.result;
      },
    });

    const c1 = makeCandle({
      openTime: 1_000,
      closeTime: 1_059,
      close: 100,
      volume: 10,
    });
    controller.setInput(
      {
        anchorTimestamp: 1_000,
        candles: [c1],
        priceSource: "close",
      },
      true, // immediate
    );

    expect(renderedResult).not.toBeNull();
    expect(renderedResult!.points).toHaveLength(1);
    expect(renderedResult!.latestPoint!.vwap).toBe(100);
    expect(controller.getCurrentResult()).toBe(renderedResult);

    controller.dispose();
    expect(controller.getCurrentResult()).toBeNull();
  });
});
