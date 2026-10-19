import { describe, expect, it } from "vitest";
import type { MarketEventV1 } from "@options-chart/market-data";
import { FlowFeatureSnapshotV1Schema } from "./contracts";
import { FlowEngine } from "./engine";

function generateSyntheticEvents(count: number): readonly MarketEventV1[] {
  const events: MarketEventV1[] = new Array<MarketEventV1>(count);
  let price = 65_000;
  const startTs = 1_700_000_000_000;
  let l2Seq = 1000;

  // Initial L2 snapshot
  events[0] = {
    schemaVersion: "market-event-v1",
    eventId: "market-event-v1:0000000000000000",
    venue: "binance",
    symbol: "BTC-USDT",
    instrumentType: "spot",
    channel: "l2-book",
    exchangeTimestampMs: startTs - 10,
    receiptTimestampMs: startTs,
    sequence: l2Seq,
    payload: {
      schemaVersion: "binance-spot-l2-book-payload-v1",
      updateType: "snapshot",
      sequence: l2Seq,
      bids: [
        ["64999.00", "2.00"],
        ["64995.00", "3.00"],
        ["64990.00", "5.00"],
      ],
      asks: [
        ["65001.00", "2.00"],
        ["65005.00", "3.00"],
        ["65010.00", "5.00"],
      ],
    },
    provenance: {
      collector: "cryptofeed",
      collectorVersion: "1.0.0",
      connectionId: "conn-bench-0",
      recordedAtMs: startTs,
    },
  };

  const provenance = {
    collector: "cryptofeed" as const,
    collectorVersion: "1.0.0",
    connectionId: "conn-bench-0",
    recordedAtMs: startTs,
  };

  for (let i = 1; i < count; i += 1) {
    const ts = startTs + i * 5;
    const isL2 = i % 10 < 3; // 30% L2 deltas, 70% trades
    const hexId = i.toString(16).padStart(16, "0");
    const eventId = `market-event-v1:${hexId}`;

    // Deterministic pseudo-random walk
    const walkStep = ((i * 17) % 7) - 3;
    price = Math.max(50_000, Math.min(80_000, price + walkStep * 0.1));
    const roundedPrice = Math.round(price * 100) / 100;
    const priceStr = roundedPrice.toFixed(2);

    if (isL2) {
      const prevSeq = l2Seq;
      l2Seq += 1;
      const bidStr = (roundedPrice - 0.5).toFixed(2);
      const askStr = (roundedPrice + 0.5).toFixed(2);
      events[i] = {
        schemaVersion: "market-event-v1",
        eventId,
        venue: "binance",
        symbol: "BTC-USDT",
        instrumentType: "spot",
        channel: "l2-book",
        exchangeTimestampMs: ts - 5,
        receiptTimestampMs: ts,
        sequence: l2Seq,
        payload: {
          schemaVersion: "binance-spot-l2-book-payload-v1",
          updateType: "delta",
          sequence: l2Seq,
          previousSequence: prevSeq,
          bids: [[bidStr, "1.50"]],
          asks: [[askStr, "1.50"]],
        },
        provenance,
      };
    } else {
      const side = i % 2 === 0 ? "buy" : "sell";
      events[i] = {
        schemaVersion: "market-event-v1",
        eventId,
        venue: "binance",
        symbol: "BTC-USDT",
        instrumentType: "spot",
        channel: "trade",
        exchangeTimestampMs: ts - 5,
        receiptTimestampMs: ts,
        sequence: i,
        payload: {
          schemaVersion: "binance-spot-trade-payload-v1",
          tradeId: i,
          price: priceStr,
          quantity: "0.0250",
          tradeTimestampMs: ts - 5,
          takerSide: side,
          isBuyerMaker: side === "sell",
        },
        provenance,
      };
    }
  }

  return events;
}

describe("FlowEngine Performance Benchmark", () => {
  it("ingests 100,000 synthetic market events in under 15 seconds (> 15,000 events/sec)", () => {
    const eventCount = 100_000;
    const events = generateSyntheticEvents(eventCount);

    const memBefore = process.memoryUsage().heapUsed;
    const startTime = performance.now();

    const engine = new FlowEngine();
    const finalSnapshot = engine.replayEvents(events);

    const elapsedMs = performance.now() - startTime;
    const memAfter = process.memoryUsage().heapUsed;
    const throughput = Math.round((eventCount / elapsedMs) * 1000);
    const heapDeltaMb = Math.round((memAfter - memBefore) / 1024 / 1024);

    expect(elapsedMs).toBeLessThan(15_000);
    expect(throughput).toBeGreaterThan(15_000);

    const parseResult = FlowFeatureSnapshotV1Schema.safeParse(finalSnapshot);
    expect(parseResult.success).toBe(true);

    // Verify that engine internal retention remained bounded
    expect(finalSnapshot.evidenceEventIds.length).toBeLessThanOrEqual(
      engine.config.maxEvidenceEventIds,
    );
    expect(finalSnapshot.cvd.activeAnchor.includedTradeCount).toBe(70_000);
    expect(finalSnapshot.book.availability).toBe("available");

    // Verify memory growth remained reasonable
    expect(heapDeltaMb).toBeLessThan(250);
  }, 30_000);
});
