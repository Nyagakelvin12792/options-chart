import { describe, expect, it, vi } from "vitest";

import type { BinanceRestClient } from "./client";
import {
  fetchInitialHistoryPage,
  streamOlderHistoryPages,
} from "./staged-pagination";

function createMockClient(options?: {
  totalBarsAvailable?: number;
  barDurationMs?: number;
}): BinanceRestClient {
  const barDurationMs = options?.barDurationMs ?? 60_000;
  const totalBarsAvailable = options?.totalBarsAvailable ?? 5_000;
  const now = 1_700_000_000_000;

  return {
    fetchKlines: vi.fn(async (params) => {
      const limit = params.limit ?? 1_000;
      const endTime = params.endTime ?? now;

      // Generate mock raw kline bars backwards from endTime
      const bars = [];
      for (let i = 0; i < limit; i += 1) {
        const openTime = endTime - (limit - i) * barDurationMs;
        if (openTime < now - totalBarsAvailable * barDurationMs) {
          continue;
        }
        bars.push([
          openTime,
          "60000.00",
          "60100.00",
          "59900.00",
          "60050.00",
          "10.5",
          openTime + barDurationMs - 1,
          "630000.00",
          100,
          "5.2",
          "312000.00",
          "0",
        ]);
      }
      return bars;
    }),
  } as unknown as BinanceRestClient;
}

describe("staged-pagination", () => {
  describe("fetchInitialHistoryPage", () => {
    it("fetches only one page of candles and completes immediately", async () => {
      const client = createMockClient({ totalBarsAvailable: 10_000 });
      const result = await fetchInitialHistoryPage(client, {
        symbol: "BTCUSDT",
        interval: "1m",
        limit: 1_000,
      });

      expect(client.fetchKlines).toHaveBeenCalledTimes(1);
      expect(result.candles).toHaveLength(1_000);
      expect(result.reachedBeginning).toBe(false);
    });
  });

  describe("streamOlderHistoryPages", () => {
    it("streams multiple pages backwards until targetBars is reached", async () => {
      const client = createMockClient({ totalBarsAvailable: 5_000 });
      const onPageMock = vi.fn();

      const result = await streamOlderHistoryPages(client, {
        symbol: "BTCUSDT",
        interval: "1m",
        beforeOpenTime: 1_700_000_000_000,
        targetBars: 2_500,
        pageSize: 1_000,
        onPage: onPageMock,
      });

      expect(client.fetchKlines).toHaveBeenCalledTimes(3);
      expect(onPageMock).toHaveBeenCalledTimes(3);
      expect(result.candles.length).toBeGreaterThan(0);
      expect(result.cancelled).toBe(false);
    });

    it("respects isCancelled and stops further network requests immediately", async () => {
      const client = createMockClient({ totalBarsAvailable: 10_000 });
      let callCount = 0;
      let shouldCancel = false;

      const result = await streamOlderHistoryPages(client, {
        symbol: "BTCUSDT",
        interval: "1m",
        beforeOpenTime: 1_700_000_000_000,
        targetBars: 5_000,
        pageSize: 1_000,
        onPage: () => {
          callCount += 1;
          if (callCount === 1) {
            shouldCancel = true; // Cancel after first page
          }
        },
        isCancelled: () => shouldCancel,
      });

      expect(result.cancelled).toBe(true);
      expect(client.fetchKlines).toHaveBeenCalledTimes(1);
    });
  });
});
