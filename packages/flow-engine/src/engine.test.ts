import { describe, expect, it } from "vitest";
import type { MarketEventV1 } from "@options-chart/market-data";
import {
  computeSnapshotAuditDigest,
  deserializeFlowFeatureSnapshotAudit,
  serializeFlowFeatureSnapshotForAudit,
} from "./audit";
import { DEFAULT_FLOW_ENGINE_CONFIG_V1 } from "./configuration";
import { FlowEngine } from "./engine";
import fixtureData from "../fixtures/replay-session.json";

function makeL2SnapshotEvent(params: {
  readonly eventId: string;
  readonly receiptTimestampMs: number;
  readonly sequence: number;
  readonly bestBid?: number;
  readonly bestAsk?: number;
}): MarketEventV1 {
  const baseBid = params.bestBid ?? 67990;
  const baseAsk = params.bestAsk ?? 68010;
  const bids: [string, string][] = Array.from({ length: 10 }, (_, i) => [
    (baseBid - i * 10).toFixed(2),
    "1.00",
  ]);
  const asks: [string, string][] = Array.from({ length: 10 }, (_, i) => [
    (baseAsk + i * 10).toFixed(2),
    "1.00",
  ]);
  return {
    schemaVersion: "market-event-v1",
    eventId: params.eventId,
    venue: "binance",
    symbol: "BTC-USDT",
    instrumentType: "spot",
    channel: "l2-book",
    exchangeTimestampMs: params.receiptTimestampMs - 10,
    receiptTimestampMs: params.receiptTimestampMs,
    sequence: params.sequence,
    payload: {
      schemaVersion: "binance-spot-l2-book-payload-v1",
      updateType: "snapshot",
      sequence: params.sequence,
      bids,
      asks,
    },
    provenance: {
      collector: "cryptofeed",
      collectorVersion: "1.0.0",
      connectionId: "conn-binance-0",
      recordedAtMs: params.receiptTimestampMs,
    },
  };
}

function makeTradeEvent(params: {
  readonly eventId: string;
  readonly receiptTimestampMs: number;
  readonly price: number;
  readonly quantity: number;
  readonly takerSide: "buy" | "sell" | null;
  readonly isBuyerMaker?: boolean;
}): MarketEventV1 {
  const payload: Record<string, unknown> = {
    schemaVersion: "binance-spot-trade-payload-v1",
    tradeId: 1,
    price: params.price.toFixed(2),
    quantity: params.quantity.toFixed(4),
    tradeTimestampMs: params.receiptTimestampMs - 10,
    takerSide: params.takerSide,
  };
  if (params.isBuyerMaker !== undefined) {
    payload["isBuyerMaker"] = params.isBuyerMaker;
  }
  return {
    schemaVersion: "market-event-v1",
    eventId: params.eventId,
    venue: "binance",
    symbol: "BTC-USDT",
    instrumentType: "spot",
    channel: "trade",
    exchangeTimestampMs: params.receiptTimestampMs - 10,
    receiptTimestampMs: params.receiptTimestampMs,
    sequence: 1,
    payload,
    provenance: {
      collector: "cryptofeed",
      collectorVersion: "1.0.0",
      connectionId: "conn-binance-0",
      recordedAtMs: params.receiptTimestampMs,
    },
  };
}

function makeHealthGapEvent(params: {
  readonly eventId: string;
  readonly receiptTimestampMs: number;
}): MarketEventV1 {
  return {
    schemaVersion: "market-event-v1",
    eventId: params.eventId,
    venue: "binance",
    symbol: "BTC-USDT",
    instrumentType: "spot",
    channel: "health" as unknown as MarketEventV1["channel"],
    exchangeTimestampMs: params.receiptTimestampMs - 10,
    receiptTimestampMs: params.receiptTimestampMs,
    sequence: 999,
    payload: {
      healthStatus: "gap",
    },
    provenance: {
      collector: "cryptofeed",
      collectorVersion: "1.0.0",
      connectionId: "conn-binance-0",
      recordedAtMs: params.receiptTimestampMs,
    },
  };
}

describe("FlowEngine Integration, Replay, and Audit", () => {
  it("1. enforces replay cutoff on receiptTimestampMs", () => {
    const engine = new FlowEngine();
    const cutoffMs = 1_700_000_005_000;

    const ev1 = makeTradeEvent({
      eventId: "market-event-v1:0000000000000001",
      receiptTimestampMs: 1_700_000_004_000,
      price: 68000,
      quantity: 0.1,
      takerSide: "buy",
    });
    const res1 = engine.ingest(ev1, { replayCutoffMs: cutoffMs });
    expect(res1).not.toBeNull();

    const ev2 = makeTradeEvent({
      eventId: "market-event-v1:0000000000000002",
      receiptTimestampMs: 1_700_000_006_000,
      price: 68000,
      quantity: 0.1,
      takerSide: "buy",
    });
    const res2 = engine.ingest(ev2, { replayCutoffMs: cutoffMs });
    expect(res2).toBeNull();

    const snap = engine.snapshot();
    expect(snap.health.cutoffExcludedEventCount).toBe(1);
    expect(snap.cvd.activeAnchor.includedTradeCount).toBe(1);
  });

  it("2. produces bit-for-bit equivalence between 1-by-1 streaming and replayEvents", () => {
    const events = fixtureData.events as unknown as readonly MarketEventV1[];
    const levels = fixtureData.levels;

    const liveEngine = new FlowEngine(undefined, levels);
    for (const ev of events) {
      liveEngine.ingest(ev);
    }
    const liveSnapshot = liveEngine.snapshot();

    const replayEngine = new FlowEngine(undefined, levels);
    const replaySnapshot = replayEngine.replayEvents(events);

    expect(replaySnapshot).toEqual(liveSnapshot);
    const liveDigest = computeSnapshotAuditDigest(liveSnapshot);
    const replayDigest = computeSnapshotAuditDigest(replaySnapshot);
    expect(replayDigest).toBe(liveDigest);
  });

  it("3. handles gap health event degrading book and health availability", () => {
    const engine = new FlowEngine();
    const snap1 = engine.ingest(
      makeL2SnapshotEvent({
        eventId: "market-event-v1:0000000000000001",
        receiptTimestampMs: 1_700_000_000_000,
        sequence: 100,
      }),
    );
    expect(snap1).not.toBeNull();
    expect(snap1?.book.availability).toBe("available");

    const gapEvent = makeHealthGapEvent({
      eventId: "market-event-v1:0000000000000002",
      receiptTimestampMs: 1_700_000_001_000,
    });
    const snap2 = engine.ingest(gapEvent);
    expect(snap2).not.toBeNull();
    expect(snap2?.health.hasUnresolvedGap).toBe(true);
    expect(snap2?.book.availability).toBe("unavailable");
    expect(snap2?.book.statusReason).toBe("sequence-gap");
    expect(snap2?.health.availability).toBe("unavailable");
    expect(snap2?.health.degradationReasons).toContain(
      "unresolved-sequence-gap",
    );
  });

  it("4. recovers from sequence gap when a snapshot arrives", () => {
    const engine = new FlowEngine();
    engine.ingest(
      makeHealthGapEvent({
        eventId: "market-event-v1:0000000000000001",
        receiptTimestampMs: 1_700_000_000_000,
      }),
    );
    expect(engine.snapshot().health.hasUnresolvedGap).toBe(true);
    expect(engine.snapshot().book.availability).toBe("unavailable");

    const recoverySnapshot = makeL2SnapshotEvent({
      eventId: "market-event-v1:0000000000000002",
      receiptTimestampMs: 1_700_000_002_000,
      sequence: 200,
    });
    const snap = engine.ingest(recoverySnapshot);
    expect(snap).not.toBeNull();
    expect(snap?.health.hasUnresolvedGap).toBe(false);
    expect(snap?.book.availability).toBe("available");
    expect(snap?.book.statusReason).toBe("ok");
  });

  it("5. degrades book and health when asOfReceiptTimestampMs exceeds bookStaleThresholdMs", () => {
    const engine = new FlowEngine();
    const t0 = 1_700_000_000_000;
    engine.ingest(
      makeL2SnapshotEvent({
        eventId: "market-event-v1:0000000000000001",
        receiptTimestampMs: t0,
        sequence: 100,
      }),
    );
    engine.ingest(
      makeTradeEvent({
        eventId: "market-event-v1:0000000000000002",
        receiptTimestampMs: t0,
        price: 68000,
        quantity: 0.1,
        takerSide: "buy",
      }),
    );

    const freshSnap = engine.snapshot({ asOfReceiptTimestampMs: t0 });
    expect(freshSnap.health.isStale).toBe(false);
    expect(freshSnap.book.availability).toBe("available");

    const staleMs =
      t0 + DEFAULT_FLOW_ENGINE_CONFIG_V1.bookStaleThresholdMs + 5_000;
    const staleSnap = engine.snapshot({ asOfReceiptTimestampMs: staleMs });
    expect(staleSnap.health.isStale).toBe(true);
    expect(staleSnap.book.availability).toBe("degraded");
    expect(staleSnap.book.statusReason).toBe("stale-book");
    expect(staleSnap.health.availability).toBe("degraded");
    expect(staleSnap.health.degradationReasons).toContain(
      "stale-market-inputs",
    );
  });

  it("6. degrades CVD availability when unknown trade side lowers directionalCoverageRatio", () => {
    const engine = new FlowEngine({
      minTradeSideCoverageRatio: 0.8,
    });

    engine.ingest(
      makeTradeEvent({
        eventId: "market-event-v1:0000000000000001",
        receiptTimestampMs: 1_700_000_000_000,
        price: 68000,
        quantity: 0.01,
        takerSide: "buy",
      }),
    );
    const snap1 = engine.snapshot();
    expect(snap1.cvd.activeAnchor.directionalCoverageRatio).toBe(1);
    expect(snap1.cvd.availability).toBe("available");

    engine.ingest(
      makeTradeEvent({
        eventId: "market-event-v1:0000000000000002",
        receiptTimestampMs: 1_700_000_001_000,
        price: 68000,
        quantity: 0.1,
        takerSide: null,
      }),
    );
    const snap2 = engine.snapshot();
    expect(snap2.cvd.activeAnchor.unknownSideTradeCount).toBe(1);
    expect(snap2.cvd.activeAnchor.directionalCoverageRatio).toBeLessThan(0.8);
    expect(snap2.cvd.availability).toBe("degraded");
    expect(snap2.health.degradationReasons).toContain(
      "low-trade-side-coverage",
    );
  });

  it("7. validates deterministic audit serialization and deserialization round-trip", () => {
    const events = fixtureData.events as unknown as readonly MarketEventV1[];
    const engine = new FlowEngine(undefined, fixtureData.levels);
    const snapshot = engine.replayEvents(events);

    const serialized = serializeFlowFeatureSnapshotForAudit(snapshot);
    const deserialized = deserializeFlowFeatureSnapshotAudit(serialized);

    expect(deserialized).toEqual(snapshot);
    expect(computeSnapshotAuditDigest(deserialized)).toBe(
      computeSnapshotAuditDigest(snapshot),
    );
  });

  it("8. dynamically updates level context and proximity matching with setLevels", () => {
    const engine = new FlowEngine();
    const t0 = 1_700_000_000_000;
    engine.ingest(
      makeL2SnapshotEvent({
        eventId: "market-event-v1:0000000000000001",
        receiptTimestampMs: t0,
        sequence: 100,
        bestBid: 68000,
        bestAsk: 68002,
      }),
    );
    expect(engine.getLevels()).toHaveLength(0);

    const newLevels = [
      {
        id: "res-68001",
        price: 68001,
        kind: "volume-wall",
        observedAtMs: t0,
        validFromMs: t0,
        validUntilMs: null,
        sourceVersion: "v1",
        role: "resistance",
      },
    ] as const;
    engine.setLevels(newLevels);
    expect(engine.getLevels()).toHaveLength(1);
    expect(engine.getLevels()[0]?.id).toBe("res-68001");
  });
});
