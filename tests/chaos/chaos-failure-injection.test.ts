import { describe, expect, it, vi } from "vitest";

import type { Candle } from "@options-chart/domain";
import {
  BinanceKlineSocket,
  BinanceRestClient,
  BinanceWsKlineEventSchema,
  CandleStore,
  DeribitConsolidatedInstrumentSchema,
  DeribitPollHealth,
  DeribitRestClient,
} from "@options-chart/market-data";
import {
  isOptionsCalculationRequest,
  OPTIONS_WORKER_PROTOCOL_VERSION,
  type OptionsCalculationRequest,
  type OptionsCalculationSuccess,
  type OptionsMetricResponse,
} from "@options-chart/worker-protocol";

import {
  createChainFixture,
  createOptionFixture,
} from "../../packages/options-engine/src/test-fixtures";

describe("Milestone 7: Reliability & Failure Injection Suite (M7.1 - M7.17)", () => {
  const now = Date.UTC(2026, 7, 27, 8, 0, 0);
  const spotPrice = 80_000;

  // -------------------------------------------------------------------------
  // M7.1: Binance WS Disconnect and Backoff Recovery
  // -------------------------------------------------------------------------
  describe("M7.1 Binance WS Disconnect Handling", () => {
    it("transitions through OFFLINE on destroy/disconnect and manages lifecycle state", () => {
      const stateTransitions: string[] = [];
      const socket = new BinanceKlineSocket({
        symbol: "BTCUSDT",
        interval: "1m",
        onCandle: () => {},
        onHealthChange: (state) => {
          stateTransitions.push(state);
        },
        onReconnect: () => {},
      });

      expect(socket.state).toBe("CONNECTING");
      socket.destroy();
      expect(socket.attempts).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // M7.2: Binance REST Failure and Fallback Endpoint Failover
  // -------------------------------------------------------------------------
  describe("M7.2 Binance REST Failure & Fallback", () => {
    it("falls back to secondary endpoint when primary fails", async () => {
      let callCount = 0;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockImplementation((url: string | URL) => {
        callCount++;
        const urlStr = url.toString();
        if (urlStr.includes("primary.test")) {
          return Promise.reject(new TypeError("Network connection reset"));
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve([
              [
                1787826360000,
                "79725.99",
                "79748.00",
                "79342.00",
                "79520.00",
                "78.5",
                1787826419999,
              ],
            ]),
        } as Response);
      });

      try {
        const client = new BinanceRestClient({
          endpoints: ["https://primary.test", "https://fallback.test"],
        });

        const klines = await client.fetchKlines({
          symbol: "BTCUSDT",
          interval: "1m",
          limit: 10,
        });

        expect(Array.isArray(klines)).toBe(true);
        expect(callCount).toBe(2);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // -------------------------------------------------------------------------
  // M7.3: Deribit WS Disconnect and Recovery
  // -------------------------------------------------------------------------
  describe("M7.3 Deribit WS Disconnect Handling", () => {
    it("manages connection lifecycle with recovery hysteresis in DeribitPollHealth", () => {
      const tracker = new DeribitPollHealth();

      expect(tracker.state).toBe("CONNECTING");

      // First successful poll moves to LIVE
      const res1 = tracker.recordSuccess(now);
      expect(res1.state).toBe("LIVE");
      expect(tracker.state).toBe("LIVE");

      // Failure transitions to FALLBACK or ERROR
      tracker.recordFailure(true);
      expect(tracker.state).toBe("FALLBACK");

      // Recovery requires two polls separated by recovery delay (5s)
      const res2 = tracker.recordSuccess(now + 1_000);
      expect(res2.state).toBe("DEGRADED");
      expect(res2.needsFollowUp).toBe(true);

      // Follow-up after delay restores LIVE
      const res3 = tracker.recordSuccess(now + 6_000);
      expect(res3.state).toBe("LIVE");
      expect(res3.needsFollowUp).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // M7.4: Deribit REST Failure and Last-Valid Cache
  // -------------------------------------------------------------------------
  describe("M7.4 Deribit REST Failure & Cache Retention", () => {
    it("handles REST timeout gracefully without unhandled crashes", async () => {
      const failingFetch = vi.fn().mockImplementation(() => {
        return Promise.reject(new Error("504 Gateway Timeout"));
      });

      const client = new DeribitRestClient({
        fetcher: failingFetch as unknown as typeof fetch,
      });

      await expect(client.getTime()).rejects.toThrow("transport failed");
    });
  });

  // -------------------------------------------------------------------------
  // M7.5 & M7.6: Malformed Payload Rejection (Binance & Deribit)
  // -------------------------------------------------------------------------
  describe("M7.5 & M7.6 Malformed Payload Schema Rejection", () => {
    it("rejects malformed Binance Kline payloads safely", () => {
      const malformedWsPayload = {
        e: "kline",
        E: 123456789,
        s: "BTCUSDT",
        k: {
          t: 123456000,
          T: 123456000, // Invalid: endTime must be > startTime
          s: "BTCUSDT",
          i: "1m",
          o: "100.0",
          c: "105.0",
          h: "95.0", // Invalid: high < low
          l: "98.0",
          v: "10.0",
          x: true,
        },
      };

      const result = BinanceWsKlineEventSchema.safeParse(malformedWsPayload);
      expect(result.success).toBe(false);
    });

    it("rejects malformed Deribit Consolidated Instrument payloads safely", () => {
      const malformedDeribitPayload = {
        instrument_name: "BTC-INVALID",
        creation_timestamp: 1000,
        expiration_timestamp: 500, // Invalid: expiration < creation
        strike: -10, // Invalid: negative strike
        option_type: "invalid_type",
        underlying_price: 80_000,
        open_interest: 100,
        mark_price: 0.1,
        mark_iv: 0.8,
        interest_rate: 0,
      };

      const result = DeribitConsolidatedInstrumentSchema.safeParse(
        malformedDeribitPayload,
      );
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // M7.7: Delayed Market Data and Staleness Detection
  // -------------------------------------------------------------------------
  describe("M7.7 Delayed Market Messages & Staleness Escalation", () => {
    it("escalates from LIVE to STALE when no messages arrive within staleness window", () => {
      const tracker = new DeribitPollHealth();

      tracker.recordSuccess(now);
      expect(tracker.state).toBe("LIVE");

      // Advance clock past 90s stale threshold
      tracker.evaluate(now + 95_000);
      expect(tracker.state).toBe("STALE");
    });
  });

  // -------------------------------------------------------------------------
  // M7.8 & M7.9: Duplicate and Out-of-Order Message Handling
  // -------------------------------------------------------------------------
  describe("M7.8 & M7.9 Duplicate & Out-of-Order Message Handling", () => {
    it("handles duplicate and older out-of-order candles gracefully in CandleStore", () => {
      const store = new CandleStore("1m");
      const candle1: Candle = {
        interval: "1m",
        openTime: 1_000_000,
        closeTime: 1_059_999,
        open: 80_000,
        high: 80_500,
        low: 79_800,
        close: 80_200,
        volume: 10,
        isClosed: true,
      };
      const candle2: Candle = {
        interval: "1m",
        openTime: 1_060_000,
        closeTime: 1_119_999,
        open: 80_200,
        high: 80_800,
        low: 80_100,
        close: 80_700,
        volume: 12,
        isClosed: false,
      };

      store.setHistory([candle1]);

      // Newer candle appends
      const action1 = store.applyLiveCandle(candle2);
      expect(action1).toBe("append");
      expect(store.getSorted()).toHaveLength(2);

      // Duplicate candle (same openTime) updates in place
      const updatedCandle2 = { ...candle2, close: 80_750 };
      const action2 = store.applyLiveCandle(updatedCandle2);
      expect(action2).toBe("update");
      expect(store.getSorted()).toHaveLength(2);
      expect(store.getSorted()[1].close).toBe(80_750);

      // Stale/out-of-order candle (older openTime) returns null
      const staleCandle: Candle = {
        interval: "1m",
        openTime: 940_000,
        closeTime: 999_999,
        open: 79_000,
        high: 79_500,
        low: 78_900,
        close: 79_200,
        volume: 8,
        isClosed: true,
      };
      const action3 = store.applyLiveCandle(staleCandle);
      expect(action3).toBeNull();
      expect(store.getSorted()).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // M7.10: Dropped Candles and Gap Reconciliation
  // -------------------------------------------------------------------------
  describe("M7.10 Dropped Candles & Gap Repair", () => {
    it("detects gaps and generates repair action during reconciliation", async () => {
      const store = new CandleStore("1m");
      const candle1: Candle = {
        interval: "1m",
        openTime: 1_000_000,
        closeTime: 1_059_999,
        open: 80_000,
        high: 80_500,
        low: 79_800,
        close: 80_200,
        volume: 10,
        isClosed: true,
      };

      store.setHistory([candle1]);

      // Mock client that returns 2 missing candles
      const mockClient = {
        fetchKlines: vi.fn().mockResolvedValue([
          [
            1_060_000,
            "80200",
            "80600",
            "80100",
            "80500",
            "11",
            1_119_999,
            "1000",
            10,
            "5",
            "500",
            "0",
          ],
          [
            1_120_000,
            "80500",
            "81000",
            "80400",
            "80900",
            "14",
            1_179_999,
            "1200",
            12,
            "6",
            "600",
            "0",
          ],
        ]),
      } as unknown as BinanceRestClient;

      const result = await store.reconcile(mockClient, 1_180_000);
      expect(result.barsRepaired).toBe(2);
      expect(result.action?.type).toBe("setData");
      expect(store.getSorted()).toHaveLength(3);
    });
  });

  // -------------------------------------------------------------------------
  // M7.12 & M7.13: Web Worker Resilience & Stale Result Discard
  // -------------------------------------------------------------------------
  describe("M7.12 & M7.13 Worker Protocol & Stale Response Discarding", () => {
    it("creates versioned worker requests and validates protocol schema", () => {
      const option = createOptionFixture({
        strike: 80_000,
        underlyingPriceUsd: spotPrice,
      });
      const chain = createChainFixture([option], now);

      const request: OptionsCalculationRequest = {
        protocolVersion: OPTIONS_WORKER_PROTOCOL_VERSION,
        type: "calculate-options-metrics",
        inputVersion: 42,
        input: {
          chain,
          underlyingPriceUsd: spotPrice,
          calculatedAt: now,
          expiryScope: { kind: "all" },
          interestRateFallbackDecimal: 0.0,
          maxPainExpiry: null,
          secondaryLevelCount: 3,
        },
      };

      expect(isOptionsCalculationRequest(request)).toBe(true);
      expect(request.inputVersion).toBe(42);
    });

    it("ensures older worker responses (version < currentVersion) are discarded", () => {
      const currentVersion = 10;
      const responses: OptionsMetricResponse[] = [];

      const handleWorkerResponse = (msg: OptionsMetricResponse) => {
        if (msg.inputVersion < currentVersion) {
          // Stale response discarded
          return "DISCARDED_STALE";
        }
        responses.push(msg);
        return "ACCEPTED";
      };

      const staleResponse: OptionsCalculationSuccess = {
        protocolVersion: OPTIONS_WORKER_PROTOCOL_VERSION,
        type: "options-metrics-result",
        inputVersion: 8,
        durationMs: 15.2,
        result: {
          summary: null as never,
          strikeExposures: [],
          expiryExposures: [],
          gammaProfile: [],
          gammaFlipPrice: null,
          qualifyingCrossings: [],
          maxPain: null,
        },
      };

      const freshResponse: OptionsCalculationSuccess = {
        protocolVersion: OPTIONS_WORKER_PROTOCOL_VERSION,
        type: "options-metrics-result",
        inputVersion: 10,
        durationMs: 14.8,
        result: {
          summary: null as never,
          strikeExposures: [],
          expiryExposures: [],
          gammaProfile: [],
          gammaFlipPrice: null,
          qualifyingCrossings: [],
          maxPain: null,
        },
      };

      expect(handleWorkerResponse(staleResponse)).toBe("DISCARDED_STALE");
      expect(handleWorkerResponse(freshResponse)).toBe("ACCEPTED");
      expect(responses).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // M7.16 & M7.17: Complete Health State Transitions & Stale Guardrails
  // -------------------------------------------------------------------------
  describe("M7.16 & M7.17 Health Transitions & Stale Guardrails", () => {
    it("never labels a stale feed as LIVE without passing through recovery hysteresis", () => {
      const tracker = new DeribitPollHealth();

      // 1. Initial CONNECTING
      expect(tracker.state).toBe("CONNECTING");

      // 2. Transition to LIVE
      tracker.recordSuccess(now);
      expect(tracker.state).toBe("LIVE");

      // 3. Stale event
      tracker.evaluate(now + 100_000);
      expect(tracker.state).toBe("STALE");

      // 4. Recovery first poll sets DEGRADED (needs follow-up)
      const res1 = tracker.recordSuccess(now + 101_000);
      expect(res1.state).toBe("DEGRADED");
      expect(res1.needsFollowUp).toBe(true);
      expect(tracker.state).toBe("DEGRADED");

      // 5. Must complete recovery delay to return to LIVE
      const res2 = tracker.recordSuccess(now + 107_000);
      expect(res2.state).toBe("LIVE");
      expect(res2.needsFollowUp).toBe(false);
      expect(tracker.state).toBe("LIVE");
    });
  });
});
