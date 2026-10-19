import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { MarketEventV1 } from "@options-chart/market-data";
import {
  CANDLE_BUCKETS_POLICY_VERSION,
  MONDAY_1W_EPOCH_OFFSET_MS,
  computeBinanceCandleBoundary,
} from "./candle-buckets";
import { createFlowEngineConfig } from "./configuration";
import { CvdSnapshotV1Schema } from "./contracts";
import { CVD_POLICY_VERSION, CvdEngine } from "./cvd";
import {
  TRADE_FLOW_POLICY_VERSION,
  normalizeTradeEvent,
  resolveBinanceSpotTakerSide,
} from "./trade-flow";

interface GoldenFixture {
  readonly fixtureVersion: string;
  readonly anchorTimestampMs: number;
  readonly asOfFeatureTimestampMs: number;
  readonly events: readonly MarketEventV1[];
  readonly expectedNormalizedTrades: readonly unknown[];
  readonly expectedSnapshot: {
    readonly availability: string;
    readonly activeAnchor: unknown;
    readonly rolling60s: unknown;
    readonly rolling300s: unknown;
    readonly candles1m: readonly unknown[];
    readonly candles5m: readonly unknown[];
    readonly candles1w: readonly unknown[];
  };
}

function makePayload(
  price = "50000.00",
  quantity = "0.2",
  takerSide: "buy" | "sell" | null = "buy",
  ts = 1_700_438_405_000,
) {
  return {
    schemaVersion: "binance-spot-trade-payload-v1",
    tradeId: 1001,
    price,
    quantity,
    tradeTimestampMs: ts,
    takerSide,
  };
}

function makeTradeEvent(overrides: {
  readonly eventId?: string;
  readonly venue?: string;
  readonly symbol?: string;
  readonly instrumentType?: "spot" | "perpetual" | "future" | "option";
  readonly channel?: "trade" | "l2-book";
  readonly exchangeTimestampMs?: number | null;
  readonly receiptTimestampMs?: number;
  readonly sequence?: number | string | null;
  readonly payload?: unknown;
}): MarketEventV1 {
  const ts = overrides.receiptTimestampMs ?? 1_700_438_405_000;
  return {
    schemaVersion: "market-event-v1",
    eventId: overrides.eventId ?? "market-event-v1:0123456789abcdef",
    venue: overrides.venue ?? "binance",
    symbol: overrides.symbol ?? "BTC-USDT",
    instrumentType: overrides.instrumentType ?? "spot",
    channel: overrides.channel ?? "trade",
    exchangeTimestampMs:
      overrides.exchangeTimestampMs !== undefined
        ? overrides.exchangeTimestampMs
        : ts,
    receiptTimestampMs: ts,
    sequence: overrides.sequence ?? 1,
    payload: overrides.payload ?? makePayload("50000.00", "0.2", "buy", ts),
    provenance: {
      collector: "cryptofeed",
      collectorVersion: "2.4.1",
      connectionId: "conn-test",
      recordedAtMs: ts,
    },
  };
}

describe("trade-flow, candle-buckets, and cvd engine", () => {
  it("matches hand-calculated cvd-golden.json fixture exactly", () => {
    expect(TRADE_FLOW_POLICY_VERSION).toBe("flow-trade-normalization-v1");
    expect(CANDLE_BUCKETS_POLICY_VERSION).toBe("flow-candle-buckets-v1");
    expect(CVD_POLICY_VERSION).toBe("flow-cvd-v1");

    const raw = readFileSync(
      new URL("../fixtures/cvd-golden.json", import.meta.url),
      "utf8",
    );
    const fixture = JSON.parse(raw) as GoldenFixture;
    const engine = new CvdEngine(undefined, fixture.anchorTimestampMs);

    const normalized = fixture.events.map((event) => {
      const res = engine.ingestTradeEvent(event);
      expect(res.ok).toBe(true);
      if (!res.ok) throw new Error(res.reason);
      return res.trade;
    });

    expect(normalized).toEqual(fixture.expectedNormalizedTrades);

    const snapshot = engine.snapshot(fixture.asOfFeatureTimestampMs);
    expect(CvdSnapshotV1Schema.safeParse(snapshot).success).toBe(true);
    expect(snapshot.availability).toBe(fixture.expectedSnapshot.availability);
    expect(snapshot.activeAnchor).toEqual(
      fixture.expectedSnapshot.activeAnchor,
    );
    expect(snapshot.rollingByDuration[0]).toEqual(
      fixture.expectedSnapshot.rolling60s,
    );
    expect(snapshot.rollingByDuration[1]).toEqual(
      fixture.expectedSnapshot.rolling300s,
    );
    expect(snapshot.candleBuckets["1m"]).toEqual(
      fixture.expectedSnapshot.candles1m,
    );
    expect(snapshot.candleBuckets["5m"]).toEqual(
      fixture.expectedSnapshot.candles5m,
    );
    expect(snapshot.candleBuckets["1w"]).toEqual(
      fixture.expectedSnapshot.candles1w,
    );
  });

  it("derives taker side with explicit-first precedence and degrades on unknown side", () => {
    expect(
      resolveBinanceSpotTakerSide({ takerSide: "buy", isBuyerMaker: true }),
    ).toEqual({ takerSide: "buy", takerSideSource: "explicit-taker-side" });
    expect(
      resolveBinanceSpotTakerSide({ takerSide: "sell", isBuyerMaker: false }),
    ).toEqual({ takerSide: "sell", takerSideSource: "explicit-taker-side" });
    expect(
      resolveBinanceSpotTakerSide({ takerSide: null, isBuyerMaker: true }),
    ).toEqual({ takerSide: "sell", takerSideSource: "binance-buyer-maker" });
    expect(
      resolveBinanceSpotTakerSide({ takerSide: null, isBuyerMaker: false }),
    ).toEqual({ takerSide: "buy", takerSideSource: "binance-buyer-maker" });
    expect(resolveBinanceSpotTakerSide({ takerSide: null })).toEqual({
      takerSide: null,
      takerSideSource: "unknown",
    });

    const config = createFlowEngineConfig({ minTradeSideCoverageRatio: 0.8 });
    const engine = new CvdEngine(config, 1_700_438_400_000);
    engine.ingestTradeEvent(
      makeTradeEvent({
        eventId: "market-event-v1:0000000000000010",
        receiptTimestampMs: 1_700_438_401_000,
        payload: makePayload("10000", "0.5", "buy", 1_700_438_401_000),
      }),
    );
    const snapAvailable = engine.snapshot(1_700_438_401_000);
    expect(snapAvailable.availability).toBe("available");
    expect(snapAvailable.activeAnchor.directionalCoverageRatio).toBe(1);

    engine.ingestTradeEvent(
      makeTradeEvent({
        eventId: "market-event-v1:0000000000000011",
        receiptTimestampMs: 1_700_438_402_000,
        payload: makePayload("10000", "0.5", null, 1_700_438_402_000),
      }),
    );
    const snapDegraded = engine.snapshot(1_700_438_402_000);
    expect(snapDegraded.activeAnchor.rawCvdQuote).toBe(5000);
    expect(snapDegraded.activeAnchor.unknownSideQuoteVolume).toBe(5000);
    expect(snapDegraded.activeAnchor.totalQuoteVolume).toBe(10000);
    expect(snapDegraded.activeAnchor.directionalCoverageRatio).toBe(0.5);
    expect(snapDegraded.activeAnchor.availability).toBe("degraded");
    expect(snapDegraded.availability).toBe("degraded");
  });

  it("rejects malformed trades and degrades anchor availability", () => {
    const engine = new CvdEngine(undefined, 1_700_438_400_000);
    engine.ingestTradeEvent(
      makeTradeEvent({ receiptTimestampMs: 1_700_438_401_000 }),
    );
    expect(engine.snapshot(1_700_438_401_000).availability).toBe("available");

    expect(normalizeTradeEvent(makeTradeEvent({ channel: "l2-book" }))).toEqual(
      {
        ok: false,
        reason: "wrong-channel",
        eventId: "market-event-v1:0123456789abcdef",
      },
    );

    const badVenue = engine.ingestTradeEvent(
      makeTradeEvent({ venue: "deribit" }),
    );
    expect(badVenue).toEqual({
      ok: false,
      reason: "unsupported-venue-or-instrument",
      eventId: "market-event-v1:0123456789abcdef",
    });

    const zeroPrice = engine.ingestTradeEvent(
      makeTradeEvent({ payload: makePayload("0", "1", "buy") }),
    );
    expect(zeroPrice.ok).toBe(false);
    if (!zeroPrice.ok) expect(zeroPrice.reason).toBe("invalid-price");

    const nanQty = engine.ingestTradeEvent(
      makeTradeEvent({ payload: makePayload("50000", "NaN", "buy") }),
    );
    expect(nanQty.ok).toBe(false);
    if (!nanQty.ok) expect(nanQty.reason).toBe("invalid-quantity");

    const overflowQuote = engine.ingestTradeEvent(
      makeTradeEvent({
        payload: makePayload("10000000000", "1000000", "buy"),
      }),
    );
    expect(overflowQuote.ok).toBe(false);
    if (!overflowQuote.ok) {
      expect(overflowQuote.reason).toBe("invalid-quote-volume");
    }

    const snap = engine.snapshot(1_700_438_403_000);
    expect(snap.activeAnchor.malformedTradeCount).toBe(4);
    expect(snap.activeAnchor.availability).toBe("degraded");
    expect(snap.availability).toBe("degraded");
  });

  it("resets anchor explicitly while preserving previousAnchors without rewriting history", () => {
    const config = createFlowEngineConfig({ maxRetainedPreviousAnchors: 2 });
    const engine = new CvdEngine(config, 1_700_438_400_000);

    engine.ingestTradeEvent(
      makeTradeEvent({
        eventId: "market-event-v1:0000000000000101",
        receiptTimestampMs: 1_700_438_405_000,
      }),
    );
    const beforeReset = engine.snapshot(1_700_438_405_000).activeAnchor;
    expect(beforeReset.rawCvdQuote).toBe(10_000);

    const newAnchor = engine.resetAnchor(
      "anchor-1",
      1_700_438_410_000,
      "explicit-reset",
    );
    expect(newAnchor.anchorId).toBe("anchor-1");
    expect(newAnchor.resetReason).toBe("explicit-reset");
    expect(newAnchor.rawCvdQuote).toBe(0);
    expect(newAnchor.availability).toBe("unavailable");

    engine.ingestTradeEvent(
      makeTradeEvent({
        eventId: "market-event-v1:0000000000000102",
        receiptTimestampMs: 1_700_438_415_000,
        payload: makePayload("50000", "0.1", "sell", 1_700_438_415_000),
      }),
    );

    const afterReset = engine.snapshot(1_700_438_415_000);
    expect(afterReset.activeAnchor.anchorId).toBe("anchor-1");
    expect(afterReset.activeAnchor.rawCvdQuote).toBe(-5_000);
    expect(afterReset.previousAnchors).toEqual([beforeReset]);
    expect(
      afterReset.candleBuckets["1m"][0]?.cumulativeCvdFromAnchorQuote,
    ).toBe(-5_000);
  });

  it("evicts expired trades accurately from rolling duration and event-count windows", () => {
    const config = createFlowEngineConfig({
      rollingDurationWindowsMs: [10_000],
      rollingEventCountWindows: [2],
    });
    const engine = new CvdEngine(config, 1_700_438_400_000);

    engine.ingestTradeEvent(
      makeTradeEvent({
        eventId: "market-event-v1:0000000000000201",
        receiptTimestampMs: 1_700_438_401_000,
      }),
    );
    engine.ingestTradeEvent(
      makeTradeEvent({
        eventId: "market-event-v1:0000000000000202",
        receiptTimestampMs: 1_700_438_405_000,
      }),
    );
    engine.ingestTradeEvent(
      makeTradeEvent({
        eventId: "market-event-v1:0000000000000203",
        receiptTimestampMs: 1_700_438_412_000,
        payload: makePayload("50000", "0.1", "sell", 1_700_438_412_000),
      }),
    );

    const snap = engine.snapshot(1_700_438_412_000);
    expect(snap.rollingByDuration[0]?.tradeCount).toBe(2);
    expect(snap.rollingByDuration[0]?.rawCvdQuote).toBe(5_000);
    expect(snap.rollingByEventCount[0]?.tradeCount).toBe(2);
    expect(snap.rollingByEventCount[0]?.rawCvdQuote).toBe(5_000);

    const laterSnap = engine.snapshot(1_700_438_425_000);
    expect(laterSnap.rollingByDuration[0]?.tradeCount).toBe(0);
    expect(laterSnap.rollingByDuration[0]?.availability).toBe("unavailable");
  });

  it("computes exact Binance candle boundaries including Monday-aligned 1w and isClosed", () => {
    expect(MONDAY_1W_EPOCH_OFFSET_MS).toBe(345_600_000);
    const ts = 1_700_438_465_000;
    expect(computeBinanceCandleBoundary(ts, "1m")).toEqual({
      openTimeMs: 1_700_438_460_000,
      closeTimeMs: 1_700_438_519_999,
    });
    expect(computeBinanceCandleBoundary(ts, "5m")).toEqual({
      openTimeMs: 1_700_438_400_000,
      closeTimeMs: 1_700_438_699_999,
    });
    expect(computeBinanceCandleBoundary(ts, "15m")).toEqual({
      openTimeMs: 1_700_438_400_000,
      closeTimeMs: 1_700_439_299_999,
    });
    expect(computeBinanceCandleBoundary(ts, "1h")).toEqual({
      openTimeMs: 1_700_438_400_000,
      closeTimeMs: 1_700_441_999_999,
    });
    expect(computeBinanceCandleBoundary(ts, "4h")).toEqual({
      openTimeMs: 1_700_438_400_000,
      closeTimeMs: 1_700_452_799_999,
    });
    expect(computeBinanceCandleBoundary(ts, "1d")).toEqual({
      openTimeMs: 1_700_438_400_000,
      closeTimeMs: 1_700_524_799_999,
    });
    expect(computeBinanceCandleBoundary(ts, "1w")).toEqual({
      openTimeMs: 1_700_438_400_000,
      closeTimeMs: 1_701_043_199_999,
    });
    expect(computeBinanceCandleBoundary(1_700_438_399_999, "1w")).toEqual({
      openTimeMs: 1_699_833_600_000,
      closeTimeMs: 1_700_438_399_999,
    });
  });

  it("maintains prefix equivalence between live ingestion and prefix replay", () => {
    const events = [0, 1, 2, 3, 4].map((idx) =>
      makeTradeEvent({
        eventId: `market-event-v1:000000000000030${String(idx)}`,
        receiptTimestampMs: 1_700_438_400_000 + idx * 15_000,
        payload: makePayload(
          String(50_000 + idx * 10),
          "0.25",
          idx % 2 === 0 ? "buy" : "sell",
          1_700_438_400_000 + idx * 15_000,
        ),
      }),
    );

    const liveEngine = new CvdEngine(undefined, 1_700_438_400_000);
    for (let k = 0; k < events.length; k += 1) {
      const event = events[k];
      if (event === undefined) continue;
      liveEngine.ingestTradeEvent(event);
      const liveSnap = liveEngine.snapshot(event.receiptTimestampMs);

      const replayEngine = new CvdEngine(undefined, 1_700_438_400_000);
      for (let j = 0; j <= k; j += 1) {
        const prefixEvent = events[j];
        if (prefixEvent !== undefined) {
          replayEngine.ingestTradeEvent(prefixEvent);
        }
      }
      const replaySnap = replayEngine.snapshot(event.receiptTimestampMs);
      expect(liveSnap).toEqual(replaySnap);
    }
  });
});
