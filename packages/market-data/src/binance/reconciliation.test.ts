import { describe, expect, it, vi } from "vitest";
import { CandleStore } from "./reconciliation";
import type { Candle } from "@options-chart/domain";
import type { BinanceRestClient } from "./client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCandle(openTime: number, overrides: Partial<Candle> = {}): Candle {
  return {
    metadata: {
      source: "binance",
      sourceTimestamp: openTime + 3_599_999,
      receivedTimestamp: Date.now(),
      normalizedTimestamp: Date.now(),
      schemaVersion: "test-v1",
    },
    symbol: "BTCUSDT",
    interval: "1h",
    openTime,
    closeTime: openTime + 3_599_999,
    open: 36000,
    high: 36150,
    low: 35950,
    close: 36100,
    volume: 12.5,
    quoteVolume: 450000,
    tradeCount: 100,
    isClosed: true,
    ...overrides,
  };
}

const HOUR = 3_600_000;
const T0 = 1700000000000;

describe("CandleStore", () => {
  describe("setHistory", () => {
    it("replaces all data and orders by openTime", () => {
      const store = new CandleStore("1h");
      const candles = [
        makeCandle(T0 + 2 * HOUR),
        makeCandle(T0),
        makeCandle(T0 + HOUR),
      ];
      store.setHistory(candles);

      expect(store.size).toBe(3);
      const sorted = store.getSorted();
      expect(sorted[0]!.openTime).toBe(T0);
      expect(sorted[1]!.openTime).toBe(T0 + HOUR);
      expect(sorted[2]!.openTime).toBe(T0 + 2 * HOUR);
    });

    it("merges lazy history without overwriting the live end", () => {
      const store = new CandleStore("1h");
      store.setHistory([makeCandle(T0), makeCandle(T0 + HOUR)]);

      const added = store.mergeHistory([
        makeCandle(T0 - 2 * HOUR),
        makeCandle(T0 - HOUR),
        makeCandle(T0),
      ]);

      expect(added).toBe(2);
      expect(store.getEarliest()?.openTime).toBe(T0 - 2 * HOUR);
      expect(store.getLatest()?.openTime).toBe(T0 + HOUR);
      expect(store.size).toBe(4);
    });
  });

  describe("applyLiveCandle", () => {
    it("appends a new candle with a later openTime", () => {
      const store = new CandleStore("1h");
      store.setHistory([makeCandle(T0)]);

      const result = store.applyLiveCandle(
        makeCandle(T0 + HOUR, { isClosed: false }),
      );
      expect(result).toBe("append");
      expect(store.size).toBe(2);
    });

    it("updates in place when openTime matches latest", () => {
      const store = new CandleStore("1h");
      store.setHistory([makeCandle(T0)]);

      const updated = makeCandle(T0, { close: 37000 });
      const result = store.applyLiveCandle(updated);
      expect(result).toBe("update");
      expect(store.size).toBe(1);
      expect(store.getLatest()!.close).toBe(37000);
    });

    it("rejects out-of-order older candles", () => {
      const store = new CandleStore("1h");
      store.setHistory([makeCandle(T0), makeCandle(T0 + HOUR)]);

      const oldCandle = makeCandle(T0 - HOUR);
      const result = store.applyLiveCandle(oldCandle);
      expect(result).toBeNull();
      expect(store.size).toBe(2);
    });

    it("never creates two bars with the same openTime", () => {
      const store = new CandleStore("1h");
      store.applyLiveCandle(makeCandle(T0));
      store.applyLiveCandle(makeCandle(T0, { close: 99999 }));
      expect(store.size).toBe(1);
      expect(store.getLatest()!.close).toBe(99999);
    });
  });

  describe("getLastClosed", () => {
    it("returns the last closed candle", () => {
      const store = new CandleStore("1h");
      store.setHistory([
        makeCandle(T0),
        makeCandle(T0 + HOUR),
        makeCandle(T0 + 2 * HOUR, { isClosed: false }),
      ]);
      const last = store.getLastClosed();
      expect(last).not.toBeNull();
      expect(last!.openTime).toBe(T0 + HOUR);
    });

    it("returns null when no closed candles exist", () => {
      const store = new CandleStore("1h");
      store.setHistory([makeCandle(T0, { isClosed: false })]);
      expect(store.getLastClosed()).toBeNull();
    });
  });

  describe("clear", () => {
    it("empties the store", () => {
      const store = new CandleStore("1h");
      store.setHistory([makeCandle(T0), makeCandle(T0 + HOUR)]);
      expect(store.size).toBe(2);

      store.clear();
      expect(store.size).toBe(0);
      expect(store.getLatest()).toBeNull();
    });
  });

  describe("reconcile", () => {
    it("inserts missing bars from REST and returns setData action", async () => {
      const store = new CandleStore("1h");
      // Store has candle at T0. Missing T0+1h and T0+2h.
      store.setHistory([makeCandle(T0)]);

      const gapCandles = [makeCandle(T0 + HOUR), makeCandle(T0 + 2 * HOUR)];

      // Build a minimal kline array matching BinanceKlinePageSchema format.
      const klinePayload = gapCandles.map((c) => [
        c.openTime,
        String(c.open),
        String(c.high),
        String(c.low),
        String(c.close),
        String(c.volume),
        c.closeTime,
        String(c.quoteVolume),
        c.tradeCount,
        "6.0",
        "216000",
        "0",
      ]);

      const mockClient: Pick<BinanceRestClient, "fetchKlines"> = {
        fetchKlines: vi.fn(async () => klinePayload),
      };

      const result = await store.reconcile(
        mockClient as BinanceRestClient,
        T0 + 3 * HOUR,
      );

      expect(result.gapsFound).toBe(2);
      expect(result.barsRepaired).toBe(2);
      expect(result.action).not.toBeNull();
      expect(result.action!.type).toBe("setData");
      expect(store.size).toBe(3);
    });

    it("returns null action when no gaps exist", async () => {
      const store = new CandleStore("1h");
      store.setHistory([makeCandle(T0), makeCandle(T0 + HOUR)]);

      // REST returns same candles (no gaps).
      const mockClient: Pick<BinanceRestClient, "fetchKlines"> = {
        fetchKlines: vi.fn(async () => []),
      };

      const result = await store.reconcile(
        mockClient as BinanceRestClient,
        T0 + HOUR + 1000,
      );

      expect(result.gapsFound).toBe(0);
      expect(result.barsRepaired).toBe(0);
      expect(result.action).toBeNull();
    });
  });
});
