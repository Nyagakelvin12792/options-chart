import { describe, expect, it } from "vitest";
import type { Candle } from "@options-chart/domain";
import {
  classifyCandleVolume,
  resolveLowerTimeframe,
} from "./lower-timeframe-resolver";
import { INTERVAL_MS } from "./constants";

describe("Lower Timeframe Resolver", () => {
  it("resolves to 1m for small ranges under 5000 bars", () => {
    // 60 minutes = 60 bars of 1m
    const res = resolveLowerTimeframe({ from: 1_000_000, to: 1_000_000 + 60 * INTERVAL_MS["1m"] });
    expect(res.interval).toBe("1m");
    expect(res.estimatedBars).toBe(60);
    expect(res.isFallback).toBe(false);
  });

  it("resolves to 5m when 1m exceeds 5000 bars", () => {
    // 6,000 minutes = 6,000 bars of 1m (> 5,000) -> 5m gives 1,200 bars (<= 5,000)
    const duration = 6_000 * INTERVAL_MS["1m"];
    const res = resolveLowerTimeframe({ from: 0, to: duration }, 5_000);
    expect(res.interval).toBe("5m");
    expect(res.estimatedBars).toBe(1_200);
    expect(res.isFallback).toBe(false);
  });

  it("resolves to 15m, 1h, 4h, 1d as ranges expand", () => {
    // 30,000 minutes -> 5m gives 6,000 bars (> 5000) -> 15m gives 2,000 bars (<= 5000)
    const res15m = resolveLowerTimeframe({ from: 0, to: 30_000 * INTERVAL_MS["1m"] }, 5_000);
    expect(res15m.interval).toBe("15m");
    expect(res15m.estimatedBars).toBe(2_000);

    // 100,000 minutes -> 15m gives 6,667 bars (> 5000) -> 1h gives 1,667 bars (<= 5000)
    const res1h = resolveLowerTimeframe({ from: 0, to: 100_000 * INTERVAL_MS["1m"] }, 5_000);
    expect(res1h.interval).toBe("1h");

    // 400,000 minutes -> 1h gives 6,667 bars (> 5000) -> 4h gives 1,667 bars (<= 5000)
    const res4h = resolveLowerTimeframe({ from: 0, to: 400_000 * INTERVAL_MS["1m"] }, 5_000);
    expect(res4h.interval).toBe("4h");

    // 2,000,000 minutes -> 4h gives 8,334 bars (> 5000) -> 1d gives 1,389 bars (<= 5000)
    const res1d = resolveLowerTimeframe({ from: 0, to: 2_000_000 * INTERVAL_MS["1m"] }, 5_000);
    expect(res1d.interval).toBe("1d");
    expect(res1d.isFallback).toBe(false);
  });

  it("flags fallback when even 1d exceeds maxBars budget", () => {
    // 10,000 days (> 5,000 maxBars)
    const duration = 10_000 * INTERVAL_MS["1d"];
    const res = resolveLowerTimeframe({ from: 0, to: duration }, 5_000);
    expect(res.interval).toBe("1d");
    expect(res.isFallback).toBe(true);
    expect(res.fallbackReason).toContain("exceed maxBars budget");
  });

  it("handles empty or reversed range gracefully", () => {
    const resEmpty = resolveLowerTimeframe({ from: 100, to: 100 });
    expect(resEmpty.interval).toBe("1m");
    expect(resEmpty.estimatedBars).toBe(1);

    const resReversed = resolveLowerTimeframe({ from: 500_000, to: 100_000 });
    expect(resReversed.durationMs).toBe(400_000);
  });
});

describe("Classify Candle Volume", () => {
  const baseCandle: Candle = {
    metadata: {
      source: "binance",
      sourceTimestamp: 1_000,
      receivedTimestamp: 1_000,
      normalizedTimestamp: 1_000,
      schemaVersion: "1.0.0",
    },
    symbol: "BTCUSDT",
    interval: "1m",
    openTime: 1_000,
    closeTime: 1_059,
    open: 60_000,
    high: 60_500,
    low: 59_800,
    close: 60_200,
    volume: 10,
    quoteVolume: 601_000,
    tradeCount: 20,
    isClosed: true,
  };

  it("classifies bullish candle with C > O", () => {
    const classified = classifyCandleVolume({ ...baseCandle, open: 60_000, close: 60_200 });
    expect(classified.direction).toBe("bullish");
    expect(classified.bullishVolume).toBe(10);
    expect(classified.bearishVolume).toBe(0);
    expect(classified.neutralVolume).toBe(0);
    expect(classified.bullishQuoteVolume).toBe(601_000);
  });

  it("classifies bearish candle with C < O", () => {
    const classified = classifyCandleVolume({ ...baseCandle, open: 60_200, close: 60_000 });
    expect(classified.direction).toBe("bearish");
    expect(classified.bullishVolume).toBe(0);
    expect(classified.bearishVolume).toBe(10);
    expect(classified.neutralVolume).toBe(0);
  });

  it("classifies neutral doji candle with C === O", () => {
    const classified = classifyCandleVolume({ ...baseCandle, open: 60_000, close: 60_000 });
    expect(classified.direction).toBe("neutral");
    expect(classified.bullishVolume).toBe(0);
    expect(classified.bearishVolume).toBe(0);
    expect(classified.neutralVolume).toBe(10);
  });
});
