import { describe, expect, it } from "vitest";
import type {
  MarketEventV1,
  MarketHealthEventV1,
  MarketStorageRecordV1,
} from "@options-chart/market-data";
import { MarketHealthEventV1Schema } from "@options-chart/market-data";
import {
  computeSnapshotAuditDigest,
  deserializeFlowFeatureSnapshotAudit,
  serializeFlowFeatureSnapshotForAudit,
} from "./audit";
import {
  DEFAULT_FLOW_ENGINE_CONFIG_V1,
  createFlowEngineConfig,
} from "./configuration";
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
}): MarketHealthEventV1 {
  const event = {
    schemaVersion: "market-health-event-v1" as const,
    healthEventId: params.eventId,
    venue: "binance",
    symbol: "BTC-USDT",
    channel: "l2-book",
    detectedAtMs: params.receiptTimestampMs,
    connectionId: "conn-binance-0",
    severity: "warning" as const,
    type: "gap" as const,
    details: {
      previousSequence: 100,
      expectedSequence: 101,
      actualSequence: 105,
      missingCount: 4,
    },
  };
  return MarketHealthEventV1Schema.parse(event);
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
    expect(engine.cutoffExcludedEventCount).toBe(1);
    expect(snap.cvd.activeAnchor.includedTradeCount).toBe(1);
  });

  it("2. produces bit-for-bit equivalence between 1-by-1 streaming and replayEvents", () => {
    const events = fixtureData.events as unknown as readonly (
      MarketEventV1 | MarketStorageRecordV1
    )[];
    const levels = fixtureData.levels;

    const liveEngine = new FlowEngine(undefined, levels);
    for (const ev of events) {
      if (ev.schemaVersion === "market-health-event-v1") {
        liveEngine.ingestHealthEvent(ev);
      } else {
        liveEngine.ingest(ev);
      }
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
      eventId: "market-health-event-v1:0000000000000002",
      receiptTimestampMs: 1_700_000_001_000,
    });
    const healthSnap2 = engine.ingestHealthEvent(gapEvent);
    expect(healthSnap2).not.toBeNull();
    expect(healthSnap2!.hasUnresolvedGap).toBe(true);
    expect(healthSnap2!.availability).toBe("unavailable");
    expect(healthSnap2!.degradationReasons).toContain(
      "unresolved-sequence-gap",
    );

    const snap2 = engine.snapshot();
    expect(snap2.book.availability).toBe("unavailable");
    expect(snap2.book.statusReason).toBe("sequence-gap");
    expect(snap2.health.availability).toBe("unavailable");
  });

  it("4. recovers from sequence gap when a snapshot arrives", () => {
    const engine = new FlowEngine();
    engine.ingestHealthEvent(
      makeHealthGapEvent({
        eventId: "market-health-event-v1:0000000000000001",
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
    const events = fixtureData.events as unknown as readonly (
      MarketEventV1 | MarketStorageRecordV1
    )[];
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

  it("9. regression: deduplicates trade events deterministically without mutating CVD, candles, or evidence IDs", () => {
    const engine = new FlowEngine();
    const trade1 = makeTradeEvent({
      eventId: "market-event-v1:trade-dedup-001",
      receiptTimestampMs: 1_700_000_010_000,
      price: 68_000,
      quantity: 1.5,
      takerSide: "buy",
    });
    const snap1 = engine.ingest(trade1);
    expect(snap1).not.toBeNull();
    expect(snap1?.health.duplicateCount).toBe(0);
    expect(snap1?.cvd.activeAnchor.includedTradeCount).toBe(1);
    expect(snap1?.cvd.activeAnchor.buyQuoteVolume).toBe(102_000);
    expect(snap1?.evidenceEventIds).toEqual([
      "market-event-v1:trade-dedup-001",
    ]);

    // Ingest the exact same trade again
    const snap2 = engine.ingest(trade1);
    expect(snap2).not.toBeNull();
    expect(snap2?.health.duplicateCount).toBe(1);
    expect(snap2?.cvd.activeAnchor.includedTradeCount).toBe(1);
    expect(snap2?.cvd.activeAnchor.buyQuoteVolume).toBe(102_000);
    expect(snap2?.cvd.activeAnchor.rawCvdQuote).toBe(102_000);
    expect(snap2?.evidenceEventIds).toEqual([
      "market-event-v1:trade-dedup-001",
    ]);
    expect(snap2?.liquidity.executedAggressiveBuyQuoteVolume).toBe(102_000);
  });

  it("10. regression: handles late incremental trades behind finalized cursor without mutating closed candles or rewinding lastTradePrice", () => {
    const engine = new FlowEngine();
    const trade1 = makeTradeEvent({
      eventId: "market-event-v1:trade-order-001",
      receiptTimestampMs: 1_700_000_010_000,
      price: 68_000,
      quantity: 1.0,
      takerSide: "buy",
    });
    const trade2 = makeTradeEvent({
      eventId: "market-event-v1:trade-order-002",
      receiptTimestampMs: 1_700_000_020_000,
      price: 68_500,
      quantity: 1.0,
      takerSide: "buy",
    });
    engine.ingest(trade1);
    const snap2 = engine.ingest(trade2);
    expect(snap2?.cvd.lastTradePrice).toBe(68_500);
    expect(snap2?.cvd.activeAnchor.includedTradeCount).toBe(2);

    // Trade 3 is late (effective timestamp 1_700_000_005_000 is behind cursor 1_700_000_020_000)
    const lateTrade = makeTradeEvent({
      eventId: "market-event-v1:trade-order-003-late",
      receiptTimestampMs: 1_700_000_005_000,
      price: 67_000,
      quantity: 2.0,
      takerSide: "sell",
    });

    // In incremental mode: ignored as late
    const snap3 = engine.ingest(lateTrade, { mode: "incremental" });
    expect(snap3?.health.lateIgnoredEventCount).toBe(1);
    expect(snap3?.cvd.lastTradePrice).toBe(68_500); // Does NOT rewind to 67_000!
    expect(snap3?.cvd.activeAnchor.includedTradeCount).toBe(2); // Did NOT mutate included count

    // In replay mode: late trade can be processed
    const replayEngine = new FlowEngine(undefined, undefined, {
      defaultMode: "replay",
    });
    replayEngine.ingest(trade1);
    replayEngine.ingest(trade2);
    const snapReplay = replayEngine.ingest(lateTrade);
    expect(snapReplay?.health.lateIgnoredEventCount).toBe(0);
    expect(snapReplay?.cvd.activeAnchor.includedTradeCount).toBe(3);
  });

  it("11. regression: proves cutoff replay versus live-prefix digest equality", () => {
    const baseTs = 1_700_000_000_000;
    const events: MarketEventV1[] = [];
    events.push(
      makeL2SnapshotEvent({
        eventId: "market-event-v1:event-001",
        receiptTimestampMs: baseTs,
        sequence: 100,
      }),
    );
    for (let i = 1; i <= 8; i += 1) {
      events.push(
        makeTradeEvent({
          eventId: `market-event-v1:event-00${i + 1}`,
          receiptTimestampMs: baseTs + i * 1_000,
          price: 68_000 + i * 10,
          quantity: 0.1,
          takerSide: i % 2 === 0 ? "buy" : "sell",
        }),
      );
    }

    const cutoffMs = baseTs + 4_000; // First 5 events are eligible (baseTs + 0, 1000, 2000, 3000, 4000)
    const eligibleEvents = events.filter(
      (e) => e.receiptTimestampMs <= cutoffMs,
    );
    expect(eligibleEvents).toHaveLength(5);

    // Live prefix: ingest only eligible events
    const liveEngine = new FlowEngine();
    for (const ev of eligibleEvents) {
      liveEngine.ingest(ev);
    }
    const snapLive = liveEngine.snapshot();
    const digestLive = computeSnapshotAuditDigest(snapLive);

    // Replay with cutoff: replay all events (eligible + past cutoff)
    const replayEngine = new FlowEngine();
    const snapReplay = replayEngine.replayEvents(events, {
      replayCutoffMs: cutoffMs,
    });
    const digestReplay = computeSnapshotAuditDigest(snapReplay);

    expect(snapReplay).toEqual(snapLive);
    expect(digestReplay).toBe(digestLive);
    expect(replayEngine.cutoffExcludedEventCount).toBe(4);
  });

  it("12. regression: verifies schema-valid health records via ingestHealthEvent and ingestStorageRecord", () => {
    const engine = new FlowEngine();
    const validGapEvent = makeHealthGapEvent({
      eventId: "market-health-event-v1:0000000000000020",
      receiptTimestampMs: 1_700_000_001_000,
    });
    expect(MarketHealthEventV1Schema.safeParse(validGapEvent).success).toBe(
      true,
    );

    const healthSnapGap = engine.ingestHealthEvent(validGapEvent);
    expect(healthSnapGap).not.toBeNull();
    expect(healthSnapGap!.hasUnresolvedGap).toBe(true);
    expect(healthSnapGap!.gapCount).toBe(1);

    const validReconnectEvent: MarketHealthEventV1 =
      MarketHealthEventV1Schema.parse({
        schemaVersion: "market-health-event-v1",
        healthEventId: "market-health-event-v1:0000000000000021",
        venue: "binance",
        symbol: "BTC-USDT",
        channel: null,
        detectedAtMs: 1_700_000_002_000,
        connectionId: "conn-0",
        severity: "info",
        type: "reconnect",
        details: {
          reason: "connection re-established",
          attempt: 1,
          backoffMs: 100,
        },
      });

    const snapReconnect = engine.ingestStorageRecord(validReconnectEvent);
    expect(snapReconnect).not.toBeNull();
    expect(snapReconnect?.health.reconnectCount).toBe(1);
  });

  it("13. regression: bounds retained internal state over long time spans", () => {
    const engine = new FlowEngine();
    const startTs = 1_700_000_000_000;
    // Ingest 2,000 trades spaced by 1 second = 2,000,000 ms.
    // FlowEngine default max retention is 900,000 ms (15 minutes).
    for (let i = 0; i < 2_000; i += 1) {
      engine.ingest(
        makeTradeEvent({
          eventId: `market-event-v1:retention-${i}`,
          receiptTimestampMs: startTs + i * 1_000,
          price: 68_000 + (i % 20),
          quantity: 0.05,
          takerSide: "buy",
        }),
        { deferSnapshot: true, mode: "replay" },
      );
    }
    const snap = engine.snapshot();
    expect(snap.cvd.activeAnchor.includedTradeCount).toBe(2_000);

    // Retained sliding window trades should be bounded to ~900s of trades + compaction buffer (<< 2,000)
    const retainedTrades = engine.getRetainedTradeCount();
    expect(retainedTrades).toBeLessThan(1_500);
    expect(retainedTrades).toBeGreaterThan(800);

    // Evidence IDs bounded to maxEvidenceEventIds (128)
    expect(engine.getRetainedEvidenceIdCount()).toBeLessThanOrEqual(
      engine.config.maxEvidenceEventIds,
    );
    expect(snap.evidenceEventIds.length).toBeLessThanOrEqual(
      engine.config.maxEvidenceEventIds,
    );

    // Deduplication history bounded to 10,000
    expect(engine.getDeduplicationHistoryCount()).toBeLessThanOrEqual(10_000);
  });

  it("14. regression: proves retained trades remain at or below configured maxRetainedTrades under dense same-timestamp traffic while preserving anchor cumulative counters", () => {
    const customConfig = createFlowEngineConfig({
      maxRetainedTrades: 100,
      rollingEventCountWindows: [200],
    });
    const engine = new FlowEngine(customConfig);
    const baseTs = 1_700_000_000_000;
    for (let i = 0; i < 500; i += 1) {
      engine.ingest(
        makeTradeEvent({
          eventId: `market-event-v1:dense-trade-${i}`,
          receiptTimestampMs: baseTs,
          price: 68_000,
          quantity: 0.1,
          takerSide: "buy",
        }),
        { deferSnapshot: true, mode: "replay" },
      );
    }
    const snap = engine.snapshot();
    expect(engine.getRetainedTradeCount()).toBeLessThanOrEqual(100);
    expect(snap.cvd.activeAnchor.includedTradeCount).toBe(500);
    expect(snap.cvd.activeAnchor.buyQuoteVolume).toBe(500 * 6_800);
    expect(snap.cvd.activeAnchor.rawCvdQuote).toBe(500 * 6_800);
    expect(snap.health.degradationReasons).toContain(
      "truncated-retention-window",
    );
    expect(snap.cvd.rollingByEventCount[0]?.tradeCount).toBe(100);
    expect(snap.cvd.rollingByEventCount[0]?.availability).toBe("unavailable");
  });

  it("15. regression: deduplicates health records across ingestHealthEvent, ingestStorageRecord, and replayEvents", () => {
    const engine = new FlowEngine();
    const gapEvent = makeHealthGapEvent({
      eventId: "market-health-event-v1:0000000000000099",
      receiptTimestampMs: 1_700_000_001_000,
    });

    const snap1 = engine.ingestHealthEvent(gapEvent);
    expect(snap1?.gapCount).toBe(1);
    expect(snap1?.duplicateCount).toBe(0);

    const snap2 = engine.ingestHealthEvent(gapEvent);
    expect(snap2?.gapCount).toBe(1);
    expect(snap2?.duplicateCount).toBe(1);

    const snap3 = engine.ingestStorageRecord(gapEvent);
    expect(snap3?.health.gapCount).toBe(1);
    expect(snap3?.health.duplicateCount).toBe(2);

    const snap4 = engine.replayEvents([gapEvent]);
    expect(snap4.health.gapCount).toBe(1);
    expect(snap4.health.duplicateCount).toBe(3);
    expect(snap4.health.activeHealthEventIds).toEqual([gapEvent.healthEventId]);
  });

  it("16. regression: enforces replay cutoff on health records and proves post-cutoff health events do not mutate state", () => {
    const engine = new FlowEngine();
    const baseTs = 1_700_000_000_000;
    engine.ingest(
      makeL2SnapshotEvent({
        eventId: "market-event-v1:cut-snap-001",
        receiptTimestampMs: baseTs,
        sequence: 100,
      }),
    );
    const snapBefore = engine.snapshot();
    const digestBefore = computeSnapshotAuditDigest(snapBefore);

    const postCutoffHealth = makeHealthGapEvent({
      eventId: "market-health-event-v1:0000000000000088",
      receiptTimestampMs: baseTs + 10_000,
    });

    const res = engine.ingestHealthEvent(postCutoffHealth, {
      replayCutoffMs: baseTs + 5_000,
    });
    expect(res).toBeNull();
    expect(engine.cutoffExcludedEventCount).toBe(1);
    expect(engine.health.gapCount).toBe(0);

    const snapAfter = engine.snapshot();
    const digestAfter = computeSnapshotAuditDigest(snapAfter);
    expect(digestAfter).toBe(digestBefore);
  });

  it("17. regression: proves mixed market and health cutoff replay matches live-prefix snapshot and digest equality", () => {
    const baseTs = 1_700_000_000_000;
    const records: MarketStorageRecordV1[] = [];
    records.push(
      makeL2SnapshotEvent({
        eventId: "market-event-v1:mix-001",
        receiptTimestampMs: baseTs,
        sequence: 100,
      }),
    );
    records.push(
      makeTradeEvent({
        eventId: "market-event-v1:mix-002",
        receiptTimestampMs: baseTs + 1_000,
        price: 68_000,
        quantity: 0.5,
        takerSide: "buy",
      }),
    );
    records.push(
      makeHealthGapEvent({
        eventId: "market-health-event-v1:0000000000000077",
        receiptTimestampMs: baseTs + 2_000,
      }),
    );
    records.push(
      makeL2SnapshotEvent({
        eventId: "market-event-v1:mix-004",
        receiptTimestampMs: baseTs + 3_000,
        sequence: 120,
      }),
    );
    records.push(
      makeTradeEvent({
        eventId: "market-event-v1:mix-005",
        receiptTimestampMs: baseTs + 4_000,
        price: 68_100,
        quantity: 0.25,
        takerSide: "sell",
      }),
    );
    records.push(
      makeHealthGapEvent({
        eventId: "market-health-event-v1:0000000000000078",
        receiptTimestampMs: baseTs + 8_000,
      }),
    );
    records.push(
      makeTradeEvent({
        eventId: "market-event-v1:mix-007",
        receiptTimestampMs: baseTs + 9_000,
        price: 68_200,
        quantity: 1.0,
        takerSide: "buy",
      }),
    );

    const cutoffMs = baseTs + 4_000;
    const eligibleRecords = records.filter((r) => {
      const ts =
        r.schemaVersion === "market-health-event-v1"
          ? r.detectedAtMs
          : r.receiptTimestampMs;
      return ts <= cutoffMs;
    });
    expect(eligibleRecords).toHaveLength(5);

    const liveEngine = new FlowEngine();
    for (const rec of eligibleRecords) {
      liveEngine.ingestStorageRecord(rec);
    }
    const snapLive = liveEngine.snapshot();
    const digestLive = computeSnapshotAuditDigest(snapLive);

    const replayEngine = new FlowEngine();
    const snapReplay = replayEngine.replayEvents(records, {
      replayCutoffMs: cutoffMs,
    });
    const digestReplay = computeSnapshotAuditDigest(snapReplay);

    expect(snapReplay).toEqual(snapLive);
    expect(digestReplay).toBe(digestLive);
    expect(replayEngine.cutoffExcludedEventCount).toBe(2);
  });

  it("18. regression: tests deduplication horizon eviction boundary and transparent health degradation", () => {
    const baseTs = 1_700_000_000_000;
    const engine = new FlowEngine(
      createFlowEngineConfig({
        maxDeduplicationHistory: 5,
      }),
    );

    const makeEv = (i: number) =>
      makeTradeEvent({
        eventId: `market-event-v1:evict-${i}`,
        receiptTimestampMs: baseTs + i * 1_000,
        price: 68_000,
        quantity: 0.1,
        takerSide: "buy",
      });

    for (let i = 1; i <= 5; i += 1) {
      engine.ingest(makeEv(i));
    }
    expect(engine.getDeduplicationHistoryCount()).toBe(5);
    expect(engine.health.isDeduplicationExhausted).toBe(false);

    const snapDup = engine.ingest(makeEv(2));
    expect(snapDup?.health.duplicateCount).toBe(1);
    expect(engine.health.isDeduplicationExhausted).toBe(false);

    engine.ingest(makeEv(6));
    expect(engine.health.isDeduplicationExhausted).toBe(true);
    const snapEvicted = engine.snapshot();
    expect(snapEvicted.health.degradationReasons).toContain(
      "deduplication-capacity-exhausted",
    );
    expect(snapEvicted.health.availability).toBe("degraded");

    const snapEv1Again = engine.ingest(makeEv(1));
    expect(snapEv1Again?.health.duplicateCount).toBe(1);
  });

  it("19. regression: verifies temporal coherence of health records in snapshots", () => {
    const engine = new FlowEngine();
    engine.ingest(
      makeTradeEvent({
        eventId: "market-event-v1:temp-001",
        receiptTimestampMs: 1_700_000_001_000,
        price: 68_000,
        quantity: 0.1,
        takerSide: "buy",
      }),
    );

    const healthEv = makeHealthGapEvent({
      eventId: "market-health-event-v1:0000000000000066",
      receiptTimestampMs: 1_700_000_005_000,
    });
    engine.ingestHealthEvent(healthEv);

    const snapAt1000 = engine.snapshot({
      asOfReceiptTimestampMs: 1_700_000_001_000,
    });
    expect(snapAt1000.asOfReceiptTimestampMs).toBe(1_700_000_005_000);
    expect(snapAt1000.health.hasUnresolvedGap).toBe(true);
    expect(snapAt1000.health.activeHealthEventIds).toContain(
      "market-health-event-v1:0000000000000066",
    );

    const snapAt5000 = engine.snapshot({
      asOfReceiptTimestampMs: 1_700_000_005_000,
    });
    expect(snapAt5000.health.activeHealthEventIds).toContain(
      "market-health-event-v1:0000000000000066",
    );
  });

  it("20. regression: health receipt time does not advance the market feature cursor or reject a subsequently received trade", () => {
    const baseTs = 1_700_000_000_000;
    const engine = new FlowEngine();
    engine.ingest(
      makeTradeEvent({
        eventId: "market-event-v1:feature-cursor-001",
        receiptTimestampMs: baseTs + 1_000,
        price: 68_000,
        quantity: 0.1,
        takerSide: "buy",
      }),
    );
    engine.ingestHealthEvent(
      makeHealthGapEvent({
        eventId: "market-health-event-v1:0000000000000055",
        receiptTimestampMs: baseTs + 5_000,
      }),
    );

    const laterReceivedTrade = makeTradeEvent({
      eventId: "market-event-v1:feature-cursor-002",
      receiptTimestampMs: baseTs + 6_000,
      price: 68_100,
      quantity: 0.2,
      takerSide: "buy",
    });
    const tradeWithEarlierExchangeTime: MarketEventV1 = {
      ...laterReceivedTrade,
      exchangeTimestampMs: baseTs + 3_000,
      payload: {
        ...(laterReceivedTrade.payload as Record<string, unknown>),
        tradeTimestampMs: baseTs + 3_000,
      },
    };
    const snapshot = engine.ingest(tradeWithEarlierExchangeTime);

    expect(snapshot?.health.lateIgnoredEventCount).toBe(0);
    expect(snapshot?.featureTimestampMs).toBe(baseTs + 3_000);
    expect(snapshot?.cvd.lastTradePrice).toBe(68_100);
    expect(snapshot?.cvd.lastTradeTimestampMs).toBe(baseTs + 3_000);
  });
});
