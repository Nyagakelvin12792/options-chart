import os from "node:os";
import { describe, expect, it } from "vitest";
import type {
  MarketEventV1,
  MarketHealthEventV1,
} from "@options-chart/market-data";
import { MarketHealthEventV1Schema } from "@options-chart/market-data";
import { computeSnapshotAuditDigest } from "./audit";
import { FlowFeatureSnapshotV1Schema } from "./contracts";
import { FlowEngine } from "./engine";

function generateSyntheticEvents(
  count: number,
): readonly (MarketEventV1 | MarketHealthEventV1)[] {
  const events: (MarketEventV1 | MarketHealthEventV1)[] = new Array(count);
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
    if (i === 10_000) {
      // Health reconnect event
      const ts = startTs + i * 5;
      events[i] = MarketHealthEventV1Schema.parse({
        schemaVersion: "market-health-event-v1",
        healthEventId: "market-health-event-v1:0000000000002710",
        venue: "binance",
        symbol: "BTC-USDT",
        channel: "trade",
        detectedAtMs: ts,
        connectionId: "conn-bench-0",
        severity: "info",
        type: "reconnect",
        details: {
          reason: "routine-resync",
          attempt: 1,
          backoffMs: 50,
        },
      });
      continue;
    }
    if (i === 10_001) {
      // Duplicate of health event at 10,000
      events[i] = events[10_000]!;
      continue;
    }

    // Dense same-timestamp traffic between 20,000 and 24,999 (5,000 trades at exact same ms)
    const isDense = i >= 20_000 && i < 25_000;
    const ts = isDense ? startTs + 20_000 * 5 : startTs + i * 5;
    const isL2 = !isDense && i % 10 < 3; // 30% L2 deltas when not dense
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

    const cpus = os.cpus();
    const envInfo = {
      nodeVersion: process.version,
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpuModel: cpus[0]?.model ?? "unknown",
      cpuCores: cpus.length,
    };

    const initialHeapUsed = process.memoryUsage().heapUsed;
    let peakHeapUsed = initialHeapUsed;
    let peakRetainedTrades = 0;

    const startTime = performance.now();
    const engine = new FlowEngine();

    for (let i = 0; i < events.length; i += 1) {
      engine.ingestStorageRecord(events[i]!, {
        deferSnapshot: true,
        mode: "replay",
      });
      if (i % 10_000 === 0 || i === events.length - 1) {
        const currentHeap = process.memoryUsage().heapUsed;
        if (currentHeap > peakHeapUsed) {
          peakHeapUsed = currentHeap;
        }
        const currentRetained = engine.getRetainedTradeCount();
        if (currentRetained > peakRetainedTrades) {
          peakRetainedTrades = currentRetained;
        }
      }
    }

    const finalSnapshot = engine.snapshot();
    const elapsedMs = performance.now() - startTime;
    const finalHeapUsed = process.memoryUsage().heapUsed;
    if (finalHeapUsed > peakHeapUsed) {
      peakHeapUsed = finalHeapUsed;
    }

    const throughput = Math.round((eventCount / elapsedMs) * 1000);
    const initialHeapMb = Math.round(initialHeapUsed / 1024 / 1024);
    const peakHeapMb = Math.round(peakHeapUsed / 1024 / 1024);
    const finalHeapMb = Math.round(finalHeapUsed / 1024 / 1024);
    const netHeapDeltaMb = finalHeapMb - initialHeapMb;

    console.log("=== FlowEngine 100k Benchmark Metrics ===");
    console.log(
      `Environment: Node ${envInfo.nodeVersion}, OS ${envInfo.platform} ${envInfo.release} (${envInfo.arch}), CPU: ${envInfo.cpuModel} (${envInfo.cpuCores} cores)`,
    );
    console.log(
      `Elapsed Time: ${elapsedMs.toFixed(2)} ms (${(elapsedMs / 1000).toFixed(3)} s)`,
    );
    console.log(`Throughput: ${throughput.toLocaleString()} events/sec`);
    console.log(
      `Peak Retained Internal State: ${peakRetainedTrades} trades (max configured: ${engine.config.maxRetainedTrades}), ${engine.getRetainedEvidenceIdCount()} evidence IDs, ${engine.getDeduplicationHistoryCount()} dedup IDs, book bids=${finalSnapshot.book.retainedBidLevels}, book asks=${finalSnapshot.book.retainedAskLevels}`,
    );
    console.log(
      `Heap Evidence: initial=${initialHeapMb} MB, peak=${peakHeapMb} MB, final=${finalHeapMb} MB (net heap delta: ${netHeapDeltaMb >= 0 ? "+" : ""}${netHeapDeltaMb} MB)`,
    );

    expect(elapsedMs).toBeLessThan(15_000);
    expect(throughput).toBeGreaterThan(15_000);

    const parseResult = FlowFeatureSnapshotV1Schema.safeParse(finalSnapshot);
    expect(parseResult.success).toBe(true);

    // Verify bounded internal state
    expect(peakRetainedTrades).toBeLessThanOrEqual(
      engine.config.maxRetainedTrades,
    );
    expect(engine.getRetainedTradeCount()).toBeLessThanOrEqual(
      engine.config.maxRetainedTrades,
    );
    expect(finalSnapshot.evidenceEventIds.length).toBeLessThanOrEqual(
      engine.config.maxEvidenceEventIds,
    );
    expect(engine.getRetainedEvidenceIdCount()).toBeLessThanOrEqual(
      engine.config.maxEvidenceEventIds,
    );
    expect(engine.getDeduplicationHistoryCount()).toBeLessThanOrEqual(
      engine.config.maxDeduplicationHistory,
    );

    // Health and deduplication verification
    expect(finalSnapshot.health.reconnectCount).toBe(1);
    expect(finalSnapshot.health.duplicateCount).toBe(1);
    expect(finalSnapshot.book.availability).toBe("available");

    // Cumulative counters preserved despite trade truncation
    expect(finalSnapshot.cvd.activeAnchor.includedTradeCount).toBeGreaterThan(
      60_000,
    );
    expect(finalSnapshot.health.degradationReasons).toContain(
      "truncated-retention-window",
    );

    // Verify peak heap during benchmark remained reasonable (< 500 MB)
    expect(peakHeapMb).toBeLessThan(500);
  }, 30_000);

  it("proves mixed-record cutoff replay with post-cutoff health event matches eligible live-prefix snapshot and digest", () => {
    const count = 5_000;
    const records = generateSyntheticEvents(count) as (
      MarketEventV1 | MarketHealthEventV1
    )[];
    const cutoffMs = 1_700_000_000_000 + 3_000 * 5;

    // Add a post-cutoff health event at the end
    const postCutoffHealth = MarketHealthEventV1Schema.parse({
      schemaVersion: "market-health-event-v1",
      healthEventId: "market-health-event-v1:0000000000009999",
      venue: "binance",
      symbol: "BTC-USDT",
      channel: "trade",
      detectedAtMs: cutoffMs + 10_000,
      connectionId: "conn-bench-0",
      severity: "warning",
      type: "reconnect",
      details: {
        reason: "post-cutoff-resync",
        attempt: 2,
        backoffMs: 200,
      },
    });
    records.push(postCutoffHealth);

    const eligibleRecords = records.filter((r) => {
      const ts =
        r.schemaVersion === "market-health-event-v1"
          ? r.detectedAtMs
          : r.receiptTimestampMs;
      return ts <= cutoffMs;
    });

    const liveEngine = new FlowEngine();
    for (const rec of eligibleRecords) {
      liveEngine.ingestStorageRecord(rec, {
        deferSnapshot: true,
        mode: "incremental",
      });
    }
    const snapLive = liveEngine.snapshot();
    const digestLive = computeSnapshotAuditDigest(snapLive);

    const replayEngine = new FlowEngine();
    for (const rec of records) {
      replayEngine.ingestStorageRecord(rec, {
        replayCutoffMs: cutoffMs,
        deferSnapshot: true,
        mode: "replay",
      });
    }
    const snapReplay = replayEngine.snapshot();
    const digestReplay = computeSnapshotAuditDigest(snapReplay);

    expect(snapReplay).toEqual(snapLive);
    expect(digestReplay).toBe(digestLive);
    expect(replayEngine.cutoffExcludedEventCount).toBe(
      records.length - eligibleRecords.length,
    );
  });
});
