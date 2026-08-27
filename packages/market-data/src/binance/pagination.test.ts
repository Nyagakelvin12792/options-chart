import { describe, expect, it, vi } from "vitest";
import { bootstrapHistory, fetchOlderHistory } from "./pagination";
import type { BinanceRestClient } from "./client";
import { INTERVAL_MS } from "./constants";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HOUR = INTERVAL_MS["1h"];
const T0 = 1700000000000;

/**
 * Build a REST kline array of N candles starting at startTime.
 */
function makeKlinePage(
  startTime: number,
  count: number,
  interval: number = HOUR,
): unknown[] {
  return Array.from({ length: count }, (_, i) => {
    const open = startTime + i * interval;
    const close = open + interval - 1;
    return [
      open,
      "36000.00",
      "36150.00",
      "35950.00",
      "36100.00",
      "12.345",
      close,
      "445000.12",
      100 + i,
      "6.789",
      "244000.56",
      "0",
    ];
  });
}

describe("bootstrapHistory", () => {
  it("paginates 2,000 bars across 2 REST requests of ≤1,000", async () => {
    const mockClient: Pick<BinanceRestClient, "fetchKlines"> = {
      fetchKlines: vi.fn(async (params) => {
        const start = params.startTime ?? T0;
        return makeKlinePage(start, 1000);
      }),
    };

    const result = await bootstrapHistory(mockClient as BinanceRestClient, {
      interval: "1h",
      targetBars: 2000,
      endTime: T0 + 2100 * HOUR,
    });

    expect(result.pagesFetched).toBe(2);
    expect(result.candles.length).toBe(2000);
    expect(result.completeness).toBe("COMPLETE");
    expect(result.duplicatesRemoved).toBe(0);
    expect(result.contiguityGaps).toHaveLength(0);

    // Verify strictly ascending openTime.
    for (let i = 1; i < result.candles.length; i++) {
      expect(result.candles[i]!.openTime).toBeGreaterThan(
        result.candles[i - 1]!.openTime,
      );
    }
  });

  it("deduplicates overlapping candles at page boundaries", async () => {
    let callCount = 0;
    const mockClient: Pick<BinanceRestClient, "fetchKlines"> = {
      fetchKlines: vi.fn(async (params) => {
        callCount++;
        const start = params.startTime ?? T0;
        if (callCount === 1) {
          // First page: 1000 candles
          return makeKlinePage(start, 1000);
        }
        // Second page overlaps by 1 candle
        return makeKlinePage(start - HOUR, 500);
      }),
    };

    const result = await bootstrapHistory(mockClient as BinanceRestClient, {
      interval: "1h",
      targetBars: 2000,
      endTime: T0 + 2100 * HOUR,
    });

    // Should have removed 1 duplicate
    expect(result.duplicatesRemoved).toBe(1);
    // Total unique candles: 1000 + 500 - 1 = 1499
    expect(result.candles.length).toBe(1499);
    expect(result.completeness).toBe("DEGRADED"); // < 2000 target
  });

  it("reports DEGRADED when a page fails after retries", async () => {
    let callCount = 0;
    const mockClient: Pick<BinanceRestClient, "fetchKlines"> = {
      fetchKlines: vi.fn(async () => {
        callCount++;
        if (callCount <= 3) {
          // First page succeeds
          if (callCount === 1) return makeKlinePage(T0, 1000);
          // Page 2 retries all fail
          throw new Error("Network failure");
        }
        return [];
      }),
    };

    const result = await bootstrapHistory(mockClient as BinanceRestClient, {
      interval: "1h",
      targetBars: 2000,
      endTime: T0 + 2100 * HOUR,
      maxPageRetries: 1,
    });

    expect(result.pagesFetched).toBe(1);
    expect(result.candles.length).toBe(1000);
    expect(result.completeness).toBe("DEGRADED");
  });

  it("detects contiguity gaps", async () => {
    const mockClient: Pick<BinanceRestClient, "fetchKlines"> = {
      fetchKlines: vi.fn(async () => {
        // Return candles with a gap: T0, T0+1h, T0+3h (missing T0+2h)
        const page = makeKlinePage(T0, 3);
        // Modify 3rd candle to have openTime at T0+3h instead of T0+2h
        (page[2] as unknown[])[0] = T0 + 3 * HOUR;
        (page[2] as unknown[])[6] = T0 + 4 * HOUR - 1;
        return page;
      }),
    };

    const result = await bootstrapHistory(mockClient as BinanceRestClient, {
      interval: "1h",
      targetBars: 3,
      endTime: T0 + 5 * HOUR,
    });

    expect(result.contiguityGaps.length).toBeGreaterThan(0);
    expect(result.completeness).toBe("DEGRADED");
  });

  it("handles empty response gracefully", async () => {
    const mockClient: Pick<BinanceRestClient, "fetchKlines"> = {
      fetchKlines: vi.fn(async () => []),
    };

    const result = await bootstrapHistory(mockClient as BinanceRestClient, {
      interval: "1h",
      targetBars: 100,
      endTime: T0 + 200 * HOUR,
    });

    expect(result.candles.length).toBe(0);
    expect(result.completeness).toBe("DEGRADED");
  });
});

describe("fetchOlderHistory", () => {
  it("loads a bounded page before the earliest candle", async () => {
    const mockClient: Pick<BinanceRestClient, "fetchKlines"> = {
      fetchKlines: vi.fn(async () => makeKlinePage(T0, 250)),
    };

    const result = await fetchOlderHistory(mockClient as BinanceRestClient, {
      interval: "1h",
      beforeOpenTime: T0 + 300 * HOUR,
      limit: 250,
    });

    expect(result.candles).toHaveLength(250);
    expect(result.reachedBeginning).toBe(false);
    expect(mockClient.fetchKlines).toHaveBeenCalledWith({
      symbol: "BTCUSDT",
      interval: "1h",
      endTime: T0 + 300 * HOUR - 1,
      limit: 250,
    });
  });

  it("requests Binance weekly klines directly", async () => {
    const week = INTERVAL_MS["1w"];
    const mockClient: Pick<BinanceRestClient, "fetchKlines"> = {
      fetchKlines: vi.fn(async () => makeKlinePage(T0, 2, week)),
    };

    const result = await fetchOlderHistory(mockClient as BinanceRestClient, {
      interval: "1w",
      beforeOpenTime: T0 + 3 * week,
      limit: 2,
    });

    expect(mockClient.fetchKlines).toHaveBeenCalledWith(
      expect.objectContaining({ interval: "1w" }),
    );
    expect(result.candles.every((candle) => candle.interval === "1w")).toBe(
      true,
    );
  });
});
