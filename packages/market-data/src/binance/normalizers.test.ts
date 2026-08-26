import { describe, expect, it } from "vitest";

import { parseBinanceKlines } from "./normalizers";

const VALID_KLINE = [
  1_725_000_000_000,
  "59000.50",
  "60250.00",
  "58800.00",
  "60100.25",
  "123.45",
  1_725_003_599_999,
  "7350000.12",
  2_480,
  "64.2",
  "3810000.50",
  "0",
] as const;

describe("parseBinanceKlines", () => {
  it("validates and normalizes a Binance REST page", () => {
    const receivedTimestamp = 1_725_003_600_000;
    const [candle] = parseBinanceKlines([VALID_KLINE], receivedTimestamp);

    expect(candle).toMatchObject({
      symbol: "BTCUSDT",
      interval: "1h",
      openTime: 1_725_000_000_000,
      closeTime: 1_725_003_599_999,
      open: 59_000.5,
      high: 60_250,
      low: 58_800,
      close: 60_100.25,
      volume: 123.45,
      quoteVolume: 7_350_000.12,
      tradeCount: 2_480,
      isClosed: true,
    });
    expect(candle?.metadata.source).toBe("binance");
  });

  it("rejects inconsistent OHLC values and unordered pages", () => {
    const invalidOhlc: unknown[] = [...VALID_KLINE];
    invalidOhlc[2] = "58000";
    expect(() => parseBinanceKlines([invalidOhlc], Date.now())).toThrow();

    const earlierKline: unknown[] = [...VALID_KLINE];
    earlierKline[0] = VALID_KLINE[0] - 3_600_000;
    expect(() =>
      parseBinanceKlines([VALID_KLINE, earlierKline], Date.now()),
    ).toThrow();
  });
});
