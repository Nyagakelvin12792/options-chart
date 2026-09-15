import { describe, expect, it, vi } from "vitest";
import type { Candle } from "@options-chart/domain";
import type { BinanceRestClient } from "@options-chart/market-data";

import { TimeframeManager } from "./timeframe-manager";

function createMockCandle(openTime: number): Candle {
  return {
    metadata: {
      source: "binance",
      sourceTimestamp: openTime + 59_999,
      receivedTimestamp: Date.now(),
      normalizedTimestamp: Date.now(),
      schemaVersion: "test-v1",
    },
    symbol: "BTCUSDT",
    interval: "1m",
    openTime,
    closeTime: openTime + 59_999,
    open: 60000,
    high: 60100,
    low: 59900,
    close: 60050,
    volume: 10,
    quoteVolume: 600500,
    tradeCount: 50,
    isClosed: true,
  };
}

describe("TimeframeManager", () => {
  it("immediately returns cached candles on subsequent switches to the same interval", async () => {
    const manager = new TimeframeManager();
    const cachedCandles = [createMockCandle(1000), createMockCandle(2000)];
    manager.setCachedCandles("1m", cachedCandles);

    const onReady = vi.fn();
    const mockClient = { fetchKlines: vi.fn() } as unknown as BinanceRestClient;

    await manager.switchTimeframe({
      interval: "1m",
      client: mockClient,
      onInitialReady: onReady,
    });

    expect(onReady).toHaveBeenCalledWith(cachedCandles, {
      fromCache: true,
      interval: "1m",
    });
    expect(mockClient.fetchKlines).not.toHaveBeenCalled();
  });

  it("preserves and returns cached viewports per interval", () => {
    const manager = new TimeframeManager();
    manager.setCachedViewport("15m", { fromTimestamp: 1000, toTimestamp: 5000 });
    expect(manager.getCachedViewport("15m")).toEqual({
      fromTimestamp: 1000,
      toTimestamp: 5000,
    });
    expect(manager.getCachedViewport("1h")).toBeUndefined();
  });

  it("cancels prior in-flight switches when a new interval is selected", async () => {
    const manager = new TimeframeManager();
    const onReadyFirst = vi.fn();
    const onReadySecond = vi.fn();

    let resolveFirstFetch: ((val: unknown) => void) | undefined;
    const firstFetchPromise = new Promise((resolve) => {
      resolveFirstFetch = resolve;
    });

    const mockClient = {
      fetchKlines: vi.fn((params) => {
        if (params.interval === "1m") {
          return firstFetchPromise;
        }
        return Promise.resolve([
          [
            3000,
            "60000",
            "60100",
            "59900",
            "60050",
            "10",
            3059999,
            "600500",
            50,
            "5",
            "300250",
            "0",
          ],
        ]);
      }),
    } as unknown as BinanceRestClient;

    // Start 1m switch
    const switch1 = manager.switchTimeframe({
      interval: "1m",
      client: mockClient,
      onInitialReady: onReadyFirst,
    });

    // Quickly switch to 5m before 1m completes
    const switch2 = manager.switchTimeframe({
      interval: "5m",
      client: mockClient,
      onInitialReady: onReadySecond,
    });

    // Complete 5m switch
    await switch2;
    expect(onReadySecond).toHaveBeenCalled();

    // Now resolve 1m
    resolveFirstFetch?.([]);
    await switch1;

    // 1m should have been cancelled and not invoked onReadyFirst
    expect(onReadyFirst).not.toHaveBeenCalled();
  });
});
