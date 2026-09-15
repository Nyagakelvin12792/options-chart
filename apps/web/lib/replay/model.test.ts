import { describe, expect, it } from "vitest";
import type {
  Candle,
  DomainEventMetadata,
  OptionsChainSnapshot,
} from "@options-chart/domain";

import {
  createReplayState,
  createReplayTimeline,
  isReplayComplete,
  reduceReplay,
  selectReplayFrame,
  type ReplaySpeed,
  type SerializableOptionsSnapshot,
} from ".";

const metadata = (
  source: DomainEventMetadata["source"],
  timestamp: number,
): DomainEventMetadata => ({
  source,
  sourceTimestamp: timestamp,
  receivedTimestamp: timestamp,
  normalizedTimestamp: timestamp,
  schemaVersion: "test-v1",
});

const candle = (openTime: number): Candle => ({
  metadata: metadata("binance", openTime),
  symbol: "BTCUSDT",
  interval: "1m",
  openTime,
  closeTime: openTime + 59_999,
  open: 100,
  high: 102,
  low: 99,
  close: 101,
  volume: 10,
  quoteVolume: 1_010,
  tradeCount: 20,
  isClosed: true,
});

const chain = (timestamp: number): OptionsChainSnapshot => ({
  metadata: metadata("deribit", timestamp),
  currency: "BTC",
  instruments: [],
});

const optionsSnapshot = (
  snapshotId: string,
  capturedAt: number,
): SerializableOptionsSnapshot => ({
  schemaVersion: "options-replay-snapshot-v1",
  snapshotId,
  capturedAt,
  chain: chain(capturedAt),
});

const timeline = () =>
  createReplayTimeline({
    candles: [candle(120_000), candle(0), candle(60_000), candle(180_000)],
    optionsSnapshots: [
      optionsSnapshot("later", 170_000),
      optionsSnapshot("first", 50_000),
      optionsSnapshot("middle", 115_000),
    ],
    frameDurationMs: 1_000,
  });

const speedCases: readonly [ReplaySpeed, number, number][] = [
  [1, 1_000, 1],
  [2, 500, 1],
  [5, 200, 1],
  [10, 100, 1],
  [5, 1_000, 3],
];

describe("replay model", () => {
  it("aligns each candle with the nearest real snapshot at or before close", () => {
    let state = createReplayState(timeline());

    expect(selectReplayFrame(state)?.options).toMatchObject({
      status: "available",
      snapshot: { snapshotId: "first" },
      ageMs: 9_999,
    });

    state = reduceReplay(state, { type: "step" });
    expect(selectReplayFrame(state)?.options).toMatchObject({
      status: "available",
      snapshot: { snapshotId: "middle" },
      ageMs: 4_999,
    });

    state = reduceReplay(state, { type: "step" });
    expect(selectReplayFrame(state)?.options).toMatchObject({
      status: "available",
      snapshot: { snapshotId: "later" },
      ageMs: 9_999,
    });
  });

  it("does not use a future snapshot or fabricate missing options history", () => {
    const state = createReplayState(
      createReplayTimeline({
        candles: [candle(0)],
        optionsSnapshots: [optionsSnapshot("future", 60_000)],
      }),
    );

    expect(selectReplayFrame(state)).toMatchObject({
      replayTime: 59_999,
      options: {
        status: "unavailable",
        reason: "no-historical-options-snapshot",
        replayTime: 59_999,
      },
    });
  });

  it("returns the same explicit unavailable state when no snapshots exist", () => {
    const state = createReplayState(
      createReplayTimeline({ candles: [candle(0)] }),
    );

    expect(selectReplayFrame(state)?.options).toEqual({
      status: "unavailable",
      reason: "no-historical-options-snapshot",
      replayTime: 59_999,
    });
  });

  it.each(speedCases)(
    "advances deterministically at %ix speed",
    (speed, elapsedMs, expectedIndex) => {
      let state = createReplayState(timeline(), speed);
      state = reduceReplay(state, { type: "play" });
      state = reduceReplay(state, { type: "tick", elapsedMs });

      expect(state.currentIndex).toBe(expectedIndex);
    },
  );

  it("carries partial playback time across ticks and ignores ticks while paused", () => {
    let state = createReplayState(timeline(), 2);
    const pausedState = reduceReplay(state, { type: "tick", elapsedMs: 500 });
    expect(pausedState).toBe(state);

    state = reduceReplay(state, { type: "play" });
    state = reduceReplay(state, { type: "tick", elapsedMs: 200 });
    expect(state.currentIndex).toBe(0);
    expect(state.accumulatedPlaybackMs).toBe(400);

    state = reduceReplay(state, { type: "tick", elapsedMs: 300 });
    expect(state.currentIndex).toBe(1);
    expect(state.accumulatedPlaybackMs).toBe(0);
  });

  it("supports pause, manual step, speed changes, completion, and reset", () => {
    let state = createReplayState(timeline());
    state = reduceReplay(state, { type: "set-speed", speed: 10 });
    state = reduceReplay(state, { type: "play" });
    state = reduceReplay(state, { type: "pause" });
    state = reduceReplay(state, { type: "tick", elapsedMs: 1_000 });
    expect(state.currentIndex).toBe(0);

    state = reduceReplay(state, { type: "step" });
    expect(state.currentIndex).toBe(1);
    expect(state.playback).toBe("paused");

    state = reduceReplay(state, { type: "play" });
    state = reduceReplay(state, { type: "tick", elapsedMs: 1_000 });
    expect(state.currentIndex).toBe(3);
    expect(state.playback).toBe("paused");
    expect(isReplayComplete(state)).toBe(true);

    state = reduceReplay(state, { type: "reset" });
    expect(state).toMatchObject({
      currentIndex: 0,
      playback: "paused",
      speed: 10,
      accumulatedPlaybackMs: 0,
    });
  });

  it("handles an empty candle timeline without inventing a frame", () => {
    let state = createReplayState(createReplayTimeline({ candles: [] }));

    expect(selectReplayFrame(state)).toBeNull();
    state = reduceReplay(state, { type: "play" });
    expect(state).toMatchObject({ currentIndex: -1, playback: "paused" });
  });

  it("copies and orders inputs without mutating the caller's arrays", () => {
    const candles = [candle(60_000), candle(0)];
    const snapshots = [
      optionsSnapshot("second", 80_000),
      optionsSnapshot("first", 50_000),
    ];
    const replayTimeline = createReplayTimeline({
      candles,
      optionsSnapshots: snapshots,
    });

    expect(candles.map((item) => item.openTime)).toEqual([60_000, 0]);
    expect(snapshots.map((item) => item.snapshotId)).toEqual([
      "second",
      "first",
    ]);
    expect(replayTimeline.candles.map((item) => item.openTime)).toEqual([
      0, 60_000,
    ]);
    expect(
      replayTimeline.optionsSnapshots.map((item) => item.snapshotId),
    ).toEqual(["first", "second"]);
  });

  it("keeps snapshot envelopes JSON serializable", () => {
    const snapshot = optionsSnapshot("snapshot-1", 50_000);
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it("rejects ambiguous duplicate IDs and invalid clock input", () => {
    expect(() =>
      createReplayTimeline({
        candles: [candle(0)],
        optionsSnapshots: [
          optionsSnapshot("duplicate", 10),
          optionsSnapshot("duplicate", 20),
        ],
      }),
    ).toThrow(/Duplicate snapshotId/);

    const state = reduceReplay(createReplayState(timeline()), { type: "play" });
    expect(() =>
      reduceReplay(state, { type: "tick", elapsedMs: Number.NaN }),
    ).toThrow(/elapsedMs/);
  });
});
