import type { Candle } from "@options-chart/domain";
import { describe, expect, it } from "vitest";

import {
  buildStructureTimeframeInput,
  CONFIRMED_PIVOT_FORMULA_VERSION,
} from "./dashboard-decision";

const candle = (
  index: number,
  high: number,
  low: number,
  close: number,
): Candle => ({
  metadata: {
    source: "binance",
    sourceTimestamp: index * 60_000 + 59_999,
    receivedTimestamp: index * 60_000 + 59_999,
    normalizedTimestamp: index * 60_000 + 59_999,
    schemaVersion: "test-v1",
  },
  symbol: "BTCUSDT",
  interval: "1h",
  openTime: index * 60_000,
  closeTime: index * 60_000 + 59_999,
  open: close,
  high,
  low,
  close,
  volume: 1,
  quoteVolume: close,
  tradeCount: 1,
  isClosed: true,
});

describe("dashboard decision adapter", () => {
  it("uses only confirmed radius-two pivots for structure evidence", () => {
    const highs = [10, 12, 16, 12, 11, 12, 13, 19, 14, 13, 14, 15, 14];
    const lows = [8, 7, 8, 5, 7, 8, 9, 10, 9, 6, 8, 9, 8];
    const candles = highs.map((high, index) =>
      candle(index, high, lows[index]!, (high + lows[index]!) / 2),
    );
    const result = buildStructureTimeframeInput(candles, "1h");

    expect(result).toEqual(
      expect.objectContaining({
        formulaVersion: CONFIRMED_PIVOT_FORMULA_VERSION,
        prevSwingHigh: 16,
        lastSwingHigh: 19,
        prevSwingLow: 5,
        lastSwingLow: 6,
      }),
    );
  });

  it("does not publish structure when two confirmed highs and lows are absent", () => {
    const candles = Array.from({ length: 8 }, (_, index) =>
      candle(index, 10 + index, 8 + index, 9 + index),
    );
    expect(buildStructureTimeframeInput(candles, "1h")).toBeNull();
  });
});
