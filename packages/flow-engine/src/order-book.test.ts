import { describe, expect, it } from "vitest";
import type { MarketEventV1 } from "@options-chart/market-data";
import goldenFixture from "../fixtures/book-golden.json";
import { createFlowEngineConfig } from "./configuration";
import {
  LiquiditySnapshotV1Schema,
  type NormalizedTradeFlowV1,
  OrderBookSnapshotV1Schema,
} from "./contracts";
import { LIQUIDITY_POLICY_VERSION, LiquidityEngine } from "./liquidity";
import { ORDER_BOOK_POLICY_VERSION, OrderBookEngine } from "./order-book";

let nextEventCounter = 100;
type RawSide = readonly (readonly [string, string])[];

function makeBookEvent(opts: {
  readonly eventId?: string;
  readonly updateType: "snapshot" | "delta";
  readonly sequence: number | string | null;
  readonly previousSequence?: number | string | null;
  readonly bids: RawSide;
  readonly asks: RawSide;
  readonly exchangeTimestampMs?: number | null;
  readonly receiptTimestampMs?: number;
}): MarketEventV1 {
  const idx = nextEventCounter++;
  const hex = idx.toString(16).padStart(16, "0");
  const receiptTimestampMs =
    opts.receiptTimestampMs ?? 1_700_000_000_000 + idx * 100;
  const exchangeTimestampMs =
    opts.exchangeTimestampMs !== undefined
      ? opts.exchangeTimestampMs
      : receiptTimestampMs - 5;
  const payload: Record<string, unknown> = {
    schemaVersion: "binance-spot-l2-book-payload-v1",
    updateType: opts.updateType,
    sequence: opts.sequence,
    bids: opts.bids,
    asks: opts.asks,
  };
  if (opts.previousSequence !== undefined)
    payload["previousSequence"] = opts.previousSequence;
  const provenance = {
    collector: "cryptofeed" as const,
    collectorVersion: "2.4.0",
    connectionId: "conn-test",
    recordedAtMs: receiptTimestampMs,
  };
  return {
    schemaVersion: "market-event-v1",
    eventId: opts.eventId ?? `market-event-v1:${hex}`,
    venue: "binance",
    symbol: "BTC-USDT",
    instrumentType: "spot",
    channel: "l2-book",
    exchangeTimestampMs,
    receiptTimestampMs,
    sequence: opts.sequence,
    payload,
    provenance,
  };
}

function makeTrade(
  eventId: string,
  featureTimestampMs: number,
  takerSide: "buy" | "sell",
  price: number,
  baseQuantity: number,
): NormalizedTradeFlowV1 {
  const quoteVolume = price * baseQuantity;
  return {
    eventId,
    receiptTimestampMs: featureTimestampMs + 5,
    featureTimestampMs,
    featureTimeSource: "exchange",
    price,
    baseQuantity,
    quoteVolume,
    takerSide,
    takerSideSource: "explicit-taker-side",
    signedQuoteDelta: takerSide === "buy" ? quoteVolume : -quoteVolume,
  };
}

describe("OrderBookEngine and LiquidityEngine", () => {
  it("exposes policy versions and matches book-golden.json exactly", () => {
    expect(ORDER_BOOK_POLICY_VERSION).toBe("flow-order-book-v1");
    expect(LIQUIDITY_POLICY_VERSION).toBe("flow-liquidity-v1");

    const config = createFlowEngineConfig(goldenFixture.configOverrides);
    const book = new OrderBookEngine(config);
    const liquidity = new LiquidityEngine(config);

    for (const rawEvent of goldenFixture.events) {
      const event = rawEvent as unknown as MarketEventV1;
      const res = book.applyL2BookEvent(event);
      expect(res.accepted).toBe(true);
      liquidity.recordBookUpdate(event, res);
    }
    for (const rawTrade of goldenFixture.executedTrades) {
      liquidity.recordExecutedTrade(
        rawTrade as unknown as NormalizedTradeFlowV1,
      );
    }

    const bookSnap = book.snapshot(1_700_000_003_010);
    const liqSnap = liquidity.snapshot(1_700_000_003_000, book.getMidPrice());

    expect(OrderBookSnapshotV1Schema.parse(bookSnap)).toEqual(
      goldenFixture.expectedBookSnapshot,
    );
    expect(LiquiditySnapshotV1Schema.parse(liqSnap)).toEqual(
      goldenFixture.expectedLiquiditySnapshot,
    );
  });

  it("sorts snapshot sides, deduplicates prices, deletes zero-qty levels, and bounds depth", () => {
    const config = createFlowEngineConfig({
      maxBookLevelsPerSide: 2,
      topNDepths: [1, 2],
      expectedBookDepthForFullCoverage: 2,
    });
    const book = new OrderBookEngine(config);

    const bids: RawSide = [
      ["99980", "1.0"],
      ["100000", "1.0"],
      ["99990", "2.0"],
      ["100000", "3.0"],
    ];
    const asks: RawSide = [
      ["100030", "1.0"],
      ["100010", "4.0"],
      ["100020", "2.0"],
    ];
    const snapRes = book.applyL2BookEvent(
      makeBookEvent({ updateType: "snapshot", sequence: 10, bids, asks }),
    );
    expect(snapRes.accepted).toBe(true);

    const snap1 = book.snapshot(1_700_000_100_000);
    expect(snap1.retainedBidLevels).toBe(2);
    expect(snap1.retainedAskLevels).toBe(2);
    expect(snap1.bestBid).toEqual({
      price: 100000,
      quantity: 3,
      quoteNotional: 300000,
    });
    expect(snap1.bestAsk).toEqual({
      price: 100010,
      quantity: 4,
      quoteNotional: 400040,
    });

    const dBids: RawSide = [
      ["100000", "0"],
      ["99985", "1.5"],
      ["99970", "5.0"],
    ];
    const dAsks: RawSide = [["100010", "0"]];
    const deltaRes = book.applyL2BookEvent(
      makeBookEvent({
        updateType: "delta",
        sequence: 11,
        bids: dBids,
        asks: dAsks,
      }),
    );
    expect(deltaRes.accepted).toBe(true);

    const snap2 = book.snapshot(1_700_000_100_100);
    expect(snap2.bestBid?.price).toBe(99990);
    expect(snap2.bestAsk?.price).toBe(100020);
    expect(snap2.retainedBidLevels).toBe(2);
    expect(snap2.retainedAskLevels).toBe(1);
  });

  it("rejects deltas before an initial snapshot with statusReason awaiting-snapshot", () => {
    const book = new OrderBookEngine();
    const ev = makeBookEvent({
      updateType: "delta",
      sequence: 1,
      bids: [["100000", "1.0"]],
      asks: [],
    });
    const res = book.applyL2BookEvent(ev);
    expect(res.accepted).toBe(false);
    expect(res.statusReason).toBe("awaiting-snapshot");
    const snap = book.snapshot(1_700_000_000_000);
    expect(snap.availability).toBe("unavailable");
    expect(snap.statusReason).toBe("awaiting-snapshot");
  });

  it("degrades crossed book, empty book, and malformed decimal levels to unavailable", () => {
    const book = new OrderBookEngine(
      createFlowEngineConfig({ expectedBookDepthForFullCoverage: 1 }),
    );

    const emptyEv = makeBookEvent({
      updateType: "snapshot",
      sequence: 1,
      bids: [["100000", "0"]],
      asks: [["100010", "1.0"]],
    });
    const emptyRes = book.applyL2BookEvent(emptyEv);
    expect(emptyRes.accepted).toBe(false);
    expect(emptyRes.statusReason).toBe("empty-book");
    expect(book.snapshot(emptyEv.receiptTimestampMs).statusReason).toBe(
      "empty-book",
    );

    const crossedEv = makeBookEvent({
      updateType: "snapshot",
      sequence: 2,
      bids: [["100010", "1.0"]],
      asks: [["100010", "1.0"]],
    });
    const crossedRes = book.applyL2BookEvent(crossedEv);
    expect(crossedRes.accepted).toBe(false);
    expect(crossedRes.statusReason).toBe("crossed-book");
    expect(book.snapshot(crossedEv.receiptTimestampMs).statusReason).toBe(
      "crossed-book",
    );

    const validEv = makeBookEvent({
      updateType: "snapshot",
      sequence: 3,
      bids: [["100000", "1.0"]],
      asks: [["100010", "1.0"]],
    });
    book.applyL2BookEvent(validEv);
    expect(book.snapshot(validEv.receiptTimestampMs).availability).toBe(
      "available",
    );

    const badEv = makeBookEvent({
      updateType: "delta",
      sequence: 4,
      bids: [["-100000", "1.0"]],
      asks: [],
    });
    const malformedRes = book.applyL2BookEvent(badEv);
    expect(malformedRes.accepted).toBe(false);
    expect(malformedRes.statusReason).toBe("malformed-book");
    const malformedSnap = book.snapshot(badEv.receiptTimestampMs);
    expect(malformedSnap.availability).toBe("unavailable");
    expect(malformedSnap.statusReason).toBe("malformed-book");
  });

  it("handles opaque string sequences, un-linked numeric jumps, explicit gaps, duplicates, and out-of-order deltas", () => {
    const book = new OrderBookEngine();

    book.applyL2BookEvent(
      makeBookEvent({
        updateType: "snapshot",
        sequence: "opaque-seq-a",
        bids: [["100000", "1.0"]],
        asks: [["100010", "1.0"]],
      }),
    );
    const opaqueDelta = book.applyL2BookEvent(
      makeBookEvent({
        updateType: "delta",
        sequence: "opaque-seq-b",
        bids: [["100000", "2.0"]],
        asks: [],
      }),
    );
    expect(opaqueDelta.accepted).toBe(true);
    expect(opaqueDelta.sequenceTransition.kind).toBe("opaque-unorderable");

    const dupOpaque = book.applyL2BookEvent(
      makeBookEvent({
        updateType: "delta",
        sequence: "opaque-seq-b",
        bids: [["100000", "9.0"]],
        asks: [],
      }),
    );
    expect(dupOpaque.accepted).toBe(false);
    expect(dupOpaque.sequenceTransition.kind).toBe("duplicate");
    expect(book.snapshot(1_700_000_005_000).bestBid?.quantity).toBe(2);

    book.applyL2BookEvent(
      makeBookEvent({
        updateType: "snapshot",
        sequence: 100,
        bids: [["100000", "1.0"]],
        asks: [["100010", "1.0"]],
      }),
    );
    const jumpWithoutPrev = book.applyL2BookEvent(
      makeBookEvent({
        updateType: "delta",
        sequence: 125,
        bids: [["100000", "2.5"]],
        asks: [],
      }),
    );
    expect(jumpWithoutPrev.accepted).toBe(true);
    expect(jumpWithoutPrev.sequenceTransition.kind).toBe("contiguous");

    const outOfOrder = book.applyL2BookEvent(
      makeBookEvent({
        updateType: "delta",
        sequence: 120,
        bids: [["100000", "9.0"]],
        asks: [],
      }),
    );
    expect(outOfOrder.accepted).toBe(false);
    expect(outOfOrder.sequenceTransition.kind).toBe("out-of-order");
    expect(book.snapshot(1_700_000_005_500).bestBid?.quantity).toBe(2.5);

    const explicitGap = book.applyL2BookEvent(
      makeBookEvent({
        updateType: "delta",
        previousSequence: 126,
        sequence: 127,
        bids: [["100000", "3.0"]],
        asks: [],
      }),
    );
    expect(explicitGap.accepted).toBe(false);
    expect(explicitGap.statusReason).toBe("sequence-gap");
    expect(explicitGap.sequenceTransition.kind).toBe("gap");
    expect(book.snapshot(1_700_000_005_600).availability).toBe("unavailable");
    expect(book.snapshot(1_700_000_005_600).statusReason).toBe("sequence-gap");
  });

  it("degrades stale book and truncated depth to degraded availability", () => {
    const config = createFlowEngineConfig({
      expectedBookDepthForFullCoverage: 4,
      minBookCoverageRatio: 0.5,
      bookStaleThresholdMs: 5_000,
    });
    const book = new OrderBookEngine(config);

    book.applyL2BookEvent(
      makeBookEvent({
        updateType: "snapshot",
        sequence: 1,
        receiptTimestampMs: 1_700_000_010_000,
        bids: [["100000", "1.0"]],
        asks: [["100010", "1.0"]],
      }),
    );
    const truncSnap = book.snapshot(1_700_000_011_000);
    expect(truncSnap.availability).toBe("degraded");
    expect(truncSnap.statusReason).toBe("truncated-depth");
    expect(truncSnap.bookCoverageRatio).toBe(0.25);

    book.applyL2BookEvent(
      makeBookEvent({
        updateType: "snapshot",
        sequence: 2,
        receiptTimestampMs: 1_700_000_012_000,
        bids: [
          ["100000", "1.0"],
          ["99990", "1.0"],
        ],
        asks: [
          ["100010", "1.0"],
          ["100020", "1.0"],
        ],
      }),
    );
    expect(book.snapshot(1_700_000_015_000).availability).toBe("available");

    const staleSnap = book.snapshot(1_700_000_018_000);
    expect(staleSnap.availability).toBe("degraded");
    expect(staleSnap.statusReason).toBe("stale-book");
  });

  it("detects replenishment within tolerance/horizon and separates cancellation from executed volume", () => {
    const config = createFlowEngineConfig({
      bpsBands: [5, 10],
      replenishmentMaxElapsedMs: 5_000,
      replenishmentPriceToleranceBps: 2,
      replenishmentMinRatio: 0.5,
      liquidityWindowMs: 60_000,
    });
    const book = new OrderBookEngine(config);
    const liquidity = new LiquidityEngine(config);

    const s0 = makeBookEvent({
      eventId: "market-event-v1:1000000000000001",
      updateType: "snapshot",
      sequence: 1,
      exchangeTimestampMs: 1_700_000_100_000,
      receiptTimestampMs: 1_700_000_100_005,
      bids: [
        ["100000", "4.0"],
        ["99980", "2.0"],
      ],
      asks: [
        ["100010", "4.0"],
        ["100030", "2.0"],
      ],
    });
    liquidity.recordBookUpdate(s0, book.applyL2BookEvent(s0));

    const d1 = makeBookEvent({
      eventId: "market-event-v1:1000000000000002",
      updateType: "delta",
      sequence: 2,
      exchangeTimestampMs: 1_700_000_101_000,
      receiptTimestampMs: 1_700_000_101_005,
      bids: [
        ["100000", "1.0"],
        ["99980", "0.5"],
      ],
      asks: [["100010", "2.0"]],
    });
    liquidity.recordBookUpdate(d1, book.applyL2BookEvent(d1));

    const dTooFarPrice = makeBookEvent({
      eventId: "market-event-v1:1000000000000003",
      updateType: "delta",
      sequence: 3,
      exchangeTimestampMs: 1_700_000_102_000,
      receiptTimestampMs: 1_700_000_102_005,
      bids: [["99960", "2.0"]],
      asks: [],
    });
    liquidity.recordBookUpdate(
      dTooFarPrice,
      book.applyL2BookEvent(dTooFarPrice),
    );
    expect(
      liquidity.snapshot(1_700_000_102_000, book.getMidPrice())
        .recentReplenishments,
    ).toHaveLength(0);

    const dValidReplenish = makeBookEvent({
      eventId: "market-event-v1:1000000000000004",
      updateType: "delta",
      sequence: 4,
      exchangeTimestampMs: 1_700_000_104_000,
      receiptTimestampMs: 1_700_000_104_005,
      bids: [["99999", "2.0"]],
      asks: [],
    });
    liquidity.recordBookUpdate(
      dValidReplenish,
      book.applyL2BookEvent(dValidReplenish),
    );

    const dTooLate = makeBookEvent({
      eventId: "market-event-v1:1000000000000005",
      updateType: "delta",
      sequence: 5,
      exchangeTimestampMs: 1_700_000_108_000,
      receiptTimestampMs: 1_700_000_108_005,
      bids: [["99980", "2.5"]],
      asks: [],
    });
    liquidity.recordBookUpdate(dTooLate, book.applyL2BookEvent(dTooLate));

    liquidity.recordExecutedTrade(
      makeTrade(
        "market-event-v1:1000000000000099",
        1_700_000_101_000,
        "sell",
        100000,
        1.2,
      ),
    );
    liquidity.recordExecutedTrade(
      makeTrade(
        "market-event-v1:1000000000000100",
        1_700_000_101_000,
        "buy",
        100010,
        0.5,
      ),
    );

    const snap = liquidity.snapshot(1_700_000_108_000, book.getMidPrice());
    expect(snap.recentReplenishments).toHaveLength(1);
    expect(snap.recentReplenishments[0]?.classificationLabel).toBe(
      "observed-displayed-liquidity-replenishment",
    );
    expect(snap.recentReplenishments[0]?.removedPrice).toBe(100000);
    expect(snap.recentReplenishments[0]?.replenishedPrice).toBe(99999);
    expect(snap.cancellationOrRemovalBidQuantity).toBe(3.3);
    expect(snap.cancellationOrRemovalAskQuantity).toBe(1.5);
  });
});
