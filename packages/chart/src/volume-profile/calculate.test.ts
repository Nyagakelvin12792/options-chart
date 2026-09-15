import { describe, expect, it } from "vitest";
import type { Candle } from "@options-chart/domain";
import { calculateVolumeProfile } from "./calculate";
import { calculateVolumeProfileFromTrades } from "./trade-calculate";
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

function createMockCandle(
  openTime: number,
  closeTime: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
  quoteVolume = volume * close,
  isClosed = true,
): Candle {
  return {
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
    quoteVolume,
    tradeCount: 10,
    isClosed,
  };
}

describe("calculateVolumeProfile", () => {
  it("passes the independent validation example from handoff directive", () => {
    // Expected values from specification:
    // Rows [10, 30, 40, 20] across [100,110), [110,120), [120,130), [130,140]
    // POC = 125, at 70% includes POC row (40) plus row 1 (30).
    // VAL = 110, VAH = 130, achieved = 70%.
    const candles: Candle[] = [
      createMockCandle(1000, 2000, 105, 110, 100, 105, 10),
      createMockCandle(2000, 3000, 115, 120, 110, 115, 30),
      createMockCandle(3000, 4000, 125, 130, 120, 125, 40),
      createMockCandle(4000, 5000, 135, 140, 130, 135, 20),
    ];

    const input: VolumeProfileInput = {
      candles,
      range: { from: 1000, to: 5000 },
      binConfig: { mode: "rowCount", rowCount: 4 },
      valueAreaPercent: 70,
      sourceMetadata: defaultMeta,
    };

    const result = calculateVolumeProfile(input);

    expect(result.rows).toHaveLength(4);
    expect(result.totalEligibleVolume).toBe(100);
    expect(result.pocRowIndex).toBe(2);
    expect(result.pocPrice).toBe(125);
    expect(result.val).toBe(110);
    expect(result.vah).toBe(130);
    expect(result.achievedValueAreaPercent).toBe(70);
    expect(result.rows[0]?.isValueArea).toBe(false);
    expect(result.rows[1]?.isValueArea).toBe(true);
    expect(result.rows[2]?.isValueArea).toBe(true);
    expect(result.rows[3]?.isValueArea).toBe(false);
  });

  it("allocates volume proportionally by price overlap and conserves total volume within tolerance", () => {
    // Candle spanning [100, 140] with volume 100 over 4 equal bins of width 10:
    // [100, 110): 25, [110, 120): 25, [120, 130): 25, [130, 140]: 25
    const candle = createMockCandle(1000, 2000, 105, 140, 100, 135, 100);
    const input: VolumeProfileInput = {
      candles: [candle],
      range: { from: 1000, to: 2000 },
      binConfig: { mode: "rowCount", rowCount: 4 },
      valueAreaPercent: 70,
      sourceMetadata: defaultMeta,
    };

    const result = calculateVolumeProfile(input);

    expect(result.rows).toHaveLength(4);
    expect(result.rows[0]?.totalVolume).toBeCloseTo(25, 9);
    expect(result.rows[1]?.totalVolume).toBeCloseTo(25, 9);
    expect(result.rows[2]?.totalVolume).toBeCloseTo(25, 9);
    expect(result.rows[3]?.totalVolume).toBeCloseTo(25, 9);

    const sumVol = result.rows.reduce((acc, r) => acc + r.totalVolume, 0);
    expect(Math.abs(sumVol - 100)).toBeLessThan(1e-9);
  });

  it("handles zero-range candle (H = L) by allocating wholly to containing bin", () => {
    const zeroRangeCandle = createMockCandle(1000, 2000, 115, 115, 115, 115, 50);
    const normalCandle = createMockCandle(2000, 3000, 100, 130, 100, 120, 60);

    const input: VolumeProfileInput = {
      candles: [zeroRangeCandle, normalCandle],
      range: { from: 1000, to: 3000 },
      binConfig: { mode: "rowCount", rowCount: 3 }, // [100, 110), [110, 120), [120, 130]
      valueAreaPercent: 70,
      sourceMetadata: defaultMeta,
    };

    const result = calculateVolumeProfile(input);

    expect(result.rows).toHaveLength(3);
    // Bin 1 is [110, 120) which contains price 115
    expect(result.rows[1]?.low).toBe(110);
    expect(result.rows[1]?.high).toBe(120);
    // Normal candle contributes 20 to each bin. Zero-range candle contributes 50 to bin 1.
    expect(result.rows[1]?.totalVolume).toBeCloseTo(70, 9);
    expect(result.pocRowIndex).toBe(1);
    expect(result.pocPrice).toBe(115);
  });

  it("resolves POC exact ties by selecting the lower-priced row", () => {
    // Two rows with exact same volume
    const candles: Candle[] = [
      createMockCandle(1000, 2000, 105, 110, 100, 105, 50),
      createMockCandle(2000, 3000, 115, 120, 110, 115, 50),
    ];

    const input: VolumeProfileInput = {
      candles,
      range: { from: 1000, to: 3000 },
      binConfig: { mode: "rowCount", rowCount: 2 }, // [100, 110), [110, 120]
      valueAreaPercent: 70,
      sourceMetadata: defaultMeta,
    };

    const result = calculateVolumeProfile(input);

    expect(result.pocRowIndex).toBe(0); // lower price row wins tie
    expect(result.pocPrice).toBe(105);
  });

  it("resolves value-area candidate ties with the lower-priced row", () => {
    // 3 rows: [10, 30, 30].
    // POC is row 1 (mid: 115, vol: 30, lower-priced tie with row 2).
    // From row 1, candidates are row 0 (vol 10) and row 2 (vol 30). Above (row 2) wins.
    // Let's test explicit above/below tie:
    // Rows: [20, 40, 20]
    // POC is row 1 (vol 40). Above is row 2 (vol 20), Below is row 0 (vol 20).
    // Equal volume -> below (row 0) should be picked first!
    const candles: Candle[] = [
      createMockCandle(1000, 2000, 105, 110, 100, 105, 20),
      createMockCandle(2000, 3000, 115, 120, 110, 115, 40),
      createMockCandle(3000, 4000, 125, 130, 120, 125, 20),
    ];

    const input: VolumeProfileInput = {
      candles,
      range: { from: 1000, to: 4000 },
      binConfig: { mode: "rowCount", rowCount: 3 },
      valueAreaPercent: 70, // total = 80, 70% is 56. POC is 40. Needs 16 more.
      sourceMetadata: defaultMeta,
    };

    const result = calculateVolumeProfile(input);

    expect(result.pocRowIndex).toBe(1);
    // Lower candidate (row 0) is included on tie
    expect(result.rows[0]?.isValueArea).toBe(true);
    expect(result.rows[1]?.isValueArea).toBe(true);
    expect(result.rows[2]?.isValueArea).toBe(false);
    expect(result.val).toBe(100);
    expect(result.vah).toBe(120);
    expect(result.achievedValueAreaPercent).toBe(75); // 60/80
  });

  it("returns null levels for empty or zero-volume data without inventing zero POC", () => {
    const emptyResult = calculateVolumeProfile({
      candles: [],
      range: { from: 1000, to: 5000 },
      binConfig: { mode: "rowCount", rowCount: 5 },
      sourceMetadata: defaultMeta,
    });

    expect(emptyResult.rows).toHaveLength(0);
    expect(emptyResult.pocPrice).toBeNull();
    expect(emptyResult.pocRowIndex).toBeNull();
    expect(emptyResult.vah).toBeNull();
    expect(emptyResult.val).toBeNull();
    expect(emptyResult.totalEligibleVolume).toBe(0);

    const zeroVolCandle = createMockCandle(1000, 2000, 100, 110, 90, 105, 0);
    const zeroResult = calculateVolumeProfile({
      candles: [zeroVolCandle],
      range: { from: 1000, to: 2000 },
      binConfig: { mode: "rowCount", rowCount: 5 },
      sourceMetadata: defaultMeta,
    });

    expect(zeroResult.rows).toHaveLength(0);
    expect(zeroResult.pocPrice).toBeNull();
    expect(zeroResult.totalEligibleVolume).toBe(0);
  });

  it("handles a flat overall price range with a single bounded row", () => {
    const flatCandles: Candle[] = [
      createMockCandle(1000, 2000, 100, 100, 100, 100, 25),
      createMockCandle(2000, 3000, 100, 100, 100, 100, 35),
    ];

    const result = calculateVolumeProfile({
      candles: flatCandles,
      range: { from: 1000, to: 3000 },
      binConfig: { mode: "rowCount", rowCount: 5 },
      sourceMetadata: defaultMeta,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.totalEligibleVolume).toBe(60);
    expect(result.pocPrice).toBe(100.5);
    expect(result.val).toBe(100);
    expect(result.vah).toBe(101);
  });

  it("excludes candles forming across or after replayCutoff before bin bound derivation", () => {
    const candles: Candle[] = [
      createMockCandle(1000, 2000, 100, 110, 95, 105, 50, undefined, true),
      // Forming candle closing after replay cutoff
      createMockCandle(2000, 3000, 105, 500, 100, 450, 1000, undefined, false),
      // Future candle
      createMockCandle(3000, 4000, 450, 600, 400, 550, 800, undefined, true),
    ];

    const result = calculateVolumeProfile({
      candles,
      range: { from: 1000, to: 5000 },
      replayCutoff: 2500, // candle 2 closes at 3000, candle 1 closes at 2000
      binConfig: { mode: "rowCount", rowCount: 3 },
      sourceMetadata: defaultMeta,
    });

    // High 500 and 600 must NOT inflate price bounds!
    expect(result.exclusions.replayExcludedCount).toBe(2);
    expect(result.totalEligibleVolume).toBe(50);
    expect(result.rows[0]?.low).toBe(95);
    expect(result.rows[result.rows.length - 1]?.high).toBe(110);
  });

  it("excludes out-of-range and straddling boundary candles", () => {
    const candles: Candle[] = [
      createMockCandle(500, 1500, 100, 110, 90, 105, 20), // straddles range.from (1000)
      createMockCandle(1000, 2000, 100, 110, 90, 105, 50), // valid
      createMockCandle(2000, 3000, 105, 115, 95, 110, 60), // valid
      createMockCandle(2500, 3500, 110, 120, 100, 115, 30), // straddles range.to (3000)
    ];

    const result = calculateVolumeProfile({
      candles,
      range: { from: 1000, to: 3000 },
      binConfig: { mode: "rowCount", rowCount: 2 },
      sourceMetadata: defaultMeta,
    });

    expect(result.exclusions.straddlingBoundaryCount).toBe(2);
    expect(result.totalEligibleVolume).toBe(110); // 50 + 60
  });

  it("is deterministic and independent of input array order", () => {
    const c1 = createMockCandle(1000, 2000, 100, 110, 90, 105, 50);
    const c2 = createMockCandle(2000, 3000, 105, 120, 100, 115, 80);
    const c3 = createMockCandle(3000, 4000, 115, 130, 110, 125, 40);

    const input1: VolumeProfileInput = {
      candles: [c1, c2, c3],
      range: { from: 1000, to: 4000 },
      binConfig: { mode: "rowCount", rowCount: 4 },
      sourceMetadata: defaultMeta,
    };

    const input2: VolumeProfileInput = {
      candles: [c3, c1, c2], // shuffled
      range: { from: 1000, to: 4000 },
      binConfig: { mode: "rowCount", rowCount: 4 },
      sourceMetadata: defaultMeta,
    };

    const r1 = calculateVolumeProfile(input1);
    const r2 = calculateVolumeProfile(input2);

    expect(r1.pocPrice).toBe(r2.pocPrice);
    expect(r1.val).toBe(r2.val);
    expect(r1.vah).toBe(r2.vah);
    expect(r1.achievedValueAreaPercent).toBe(r2.achievedValueAreaPercent);
    for (let i = 0; i < r1.rows.length; i++) {
      expect(r1.rows[i]?.totalVolume).toBeCloseTo(r2.rows[i]?.totalVolume ?? 0, 9);
    }
  });

  it("tracks exclusions for malformed OHLC, negative volume, nonfinite numbers, and duplicates", () => {
    const valid = createMockCandle(1000, 2000, 100, 110, 90, 105, 50);
    const duplicate = createMockCandle(1000, 2000, 100, 110, 90, 105, 50);
    const conflicting = createMockCandle(1000, 2000, 100, 110, 90, 105, 999);
    const malformed = createMockCandle(2000, 3000, 100, 80, 90, 85, 10); // high < low
    const negativeVol = createMockCandle(3000, 4000, 100, 110, 90, 105, -5);
    const reversedTime = createMockCandle(5000, 4000, 100, 110, 90, 105, 20); // close < open
    const nonFinitePrice = createMockCandle(6000, 7000, NaN, 110, 90, 105, 20);

    const result = calculateVolumeProfile({
      candles: [
        valid,
        duplicate,
        conflicting,
        malformed,
        negativeVol,
        reversedTime,
        nonFinitePrice,
      ],
      range: { from: 1000, to: 7000 },
      binConfig: { mode: "rowCount", rowCount: 3 },
      sourceMetadata: defaultMeta,
    });

    expect(result.exclusions.duplicateCandleCount).toBe(1);
    expect(result.exclusions.conflictingDuplicateCount).toBe(1);
    expect(result.exclusions.malformedOhlcCount).toBe(1);
    expect(result.exclusions.negativeOrNonFiniteVolumeCount).toBe(1);
    expect(result.exclusions.reversedTimestampCount).toBe(1);
    expect(result.exclusions.nonFinitePriceCount).toBe(1);
    expect(result.totalEligibleVolume).toBe(50);
  });

  it("supports binSize configuration and enforces row count cap <= 2048", () => {
    const candles: Candle[] = [
      createMockCandle(1000, 2000, 100, 130, 100, 120, 60),
    ];

    const result = calculateVolumeProfile({
      candles,
      range: { from: 1000, to: 2000 },
      binConfig: { mode: "binSize", binSize: 10, tickOrigin: 0 },
      sourceMetadata: defaultMeta,
    });

    expect(result.rows.length).toBe(3); // [100, 110), [110, 120), [120, 130]
    expect(result.rows[0]?.low).toBe(100);
    expect(result.rows[0]?.high).toBe(110);

    // Test exceeding 2,048 rows cap
    expect(() =>
      calculateVolumeProfile({
        candles: [createMockCandle(1000, 2000, 100, 3000, 100, 2000, 50)],
        range: { from: 1000, to: 2000 },
        binConfig: { mode: "binSize", binSize: 1 }, // 2900 bins > 2048
        sourceMetadata: defaultMeta,
      }),
    ).toThrow(/Volume profile row cap exceeded/);
  });

  it("reconciles estimated candle-direction volumes with total volume", () => {
    const candles: Candle[] = [
      createMockCandle(1000, 2000, 100, 120, 100, 115, 40), // Bullish (115 > 100)
      createMockCandle(2000, 3000, 120, 130, 110, 112, 50), // Bearish (112 < 120)
      createMockCandle(3000, 4000, 115, 125, 110, 115, 30), // Neutral (115 == 115)
    ];

    const result = calculateVolumeProfile({
      candles,
      range: { from: 1000, to: 4000 },
      binConfig: { mode: "rowCount", rowCount: 4 },
      directionMode: "candle-direction",
      sourceMetadata: defaultMeta,
    });

    for (const row of result.rows) {
      const sumDirectional =
        row.bullishVolume + row.bearishVolume + row.neutralVolume;
      expect(sumDirectional).toBeCloseTo(row.totalVolume, 9);
    }
  });

  it("calculates volume profile from genuine Binance aggregate trades", () => {
    const trades = [
      { tradeId: 1, price: 105, quantity: 10, timestamp: 1500, isBuyerMaker: true }, // taker-sell
      { tradeId: 2, price: 115, quantity: 30, timestamp: 2500, isBuyerMaker: false }, // taker-buy
      { tradeId: 3, price: 125, quantity: 40, timestamp: 3500, isBuyerMaker: false }, // taker-buy
      { tradeId: 4, price: 135, quantity: 20, timestamp: 4500, isBuyerMaker: true }, // taker-sell
    ];

    const result = calculateVolumeProfileFromTrades({
      trades,
      range: { from: 1000, to: 5000 },
      binConfig: { mode: "binSize", binSize: 10, tickOrigin: 100 },
      valueAreaPercent: 70,
      sourceMetadata: defaultMeta,
    });

    expect(result.rows).toHaveLength(4);
    expect(result.totalEligibleVolume).toBe(100);
    expect(result.pocPrice).toBe(125);
    expect(result.val).toBe(110);
    expect(result.vah).toBe(130);
    expect(result.rows[0]?.takerSellVolume).toBe(10);
    expect(result.rows[1]?.takerBuyVolume).toBe(30);
    expect(result.rows[2]?.takerBuyVolume).toBe(40);
    expect(result.rows[3]?.takerSellVolume).toBe(20);
  });
});
