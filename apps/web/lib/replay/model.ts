import type { Candle } from "@options-chart/domain";

import {
  REPLAY_SPEEDS,
  type ReplayCommand,
  type ReplayFrame,
  type ReplaySpeed,
  type ReplayState,
  type ReplayTimeline,
  type SerializableOptionsSnapshot,
} from "./types";

export interface CreateReplayTimelineInput {
  readonly candles: readonly Candle[];
  readonly optionsSnapshots?: readonly SerializableOptionsSnapshot[];
  readonly frameDurationMs?: number;
}

const DEFAULT_FRAME_DURATION_MS = 1_000;

const assertTimestamp = (value: number, field: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative safe integer`);
  }
};

const assertReplaySpeed = (speed: ReplaySpeed): void => {
  if (!(REPLAY_SPEEDS as readonly number[]).includes(speed)) {
    throw new RangeError(`Unsupported replay speed: ${String(speed)}`);
  }
};

const prepareCandles = (candles: readonly Candle[]): readonly Candle[] => {
  const ordered = [...candles].sort(
    (left, right) =>
      left.closeTime - right.closeTime || left.openTime - right.openTime,
  );
  const openTimes = new Set<number>();

  for (const candle of ordered) {
    assertTimestamp(candle.openTime, "candle.openTime");
    assertTimestamp(candle.closeTime, "candle.closeTime");
    if (candle.closeTime < candle.openTime) {
      throw new RangeError("candle.closeTime must not precede candle.openTime");
    }
    if (openTimes.has(candle.openTime)) {
      throw new RangeError(`Duplicate candle openTime: ${candle.openTime}`);
    }
    openTimes.add(candle.openTime);
  }

  return ordered;
};

const prepareOptionsSnapshots = (
  snapshots: readonly SerializableOptionsSnapshot[],
): readonly SerializableOptionsSnapshot[] => {
  const ordered = [...snapshots].sort(
    (left, right) =>
      left.capturedAt - right.capturedAt ||
      left.snapshotId.localeCompare(right.snapshotId),
  );
  const ids = new Set<string>();

  for (const snapshot of ordered) {
    assertTimestamp(snapshot.capturedAt, "snapshot.capturedAt");
    if (snapshot.snapshotId.length === 0) {
      throw new RangeError("snapshot.snapshotId must not be empty");
    }
    if (ids.has(snapshot.snapshotId)) {
      throw new RangeError(`Duplicate snapshotId: ${snapshot.snapshotId}`);
    }
    ids.add(snapshot.snapshotId);
  }

  return ordered;
};

export const createReplayTimeline = (
  input: CreateReplayTimelineInput,
): ReplayTimeline => {
  const frameDurationMs = input.frameDurationMs ?? DEFAULT_FRAME_DURATION_MS;
  if (!Number.isFinite(frameDurationMs) || frameDurationMs <= 0) {
    throw new RangeError("frameDurationMs must be positive and finite");
  }

  return {
    candles: prepareCandles(input.candles),
    optionsSnapshots: prepareOptionsSnapshots(input.optionsSnapshots ?? []),
    frameDurationMs,
  };
};

export const createReplayState = (
  timeline: ReplayTimeline,
  speed: ReplaySpeed = 1,
): ReplayState => {
  assertReplaySpeed(speed);
  return {
    timeline,
    currentIndex: timeline.candles.length === 0 ? -1 : 0,
    playback: "paused",
    speed,
    accumulatedPlaybackMs: 0,
  };
};

export const isReplayComplete = (state: ReplayState): boolean =>
  state.currentIndex >= state.timeline.candles.length - 1;

const findOptionsSnapshot = (
  snapshots: readonly SerializableOptionsSnapshot[],
  replayTime: number,
): SerializableOptionsSnapshot | null => {
  let low = 0;
  let high = snapshots.length - 1;
  let match: SerializableOptionsSnapshot | null = null;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = snapshots[middle]!;
    if (candidate.capturedAt <= replayTime) {
      match = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return match;
};

export const selectReplayFrame = (state: ReplayState): ReplayFrame | null => {
  if (state.currentIndex < 0) return null;

  const candle = state.timeline.candles[state.currentIndex];
  if (candle === undefined) return null;

  const replayTime = candle.closeTime;
  const snapshot = findOptionsSnapshot(
    state.timeline.optionsSnapshots,
    replayTime,
  );

  return {
    index: state.currentIndex,
    replayTime,
    candle,
    options:
      snapshot === null
        ? {
            status: "unavailable",
            reason: "no-historical-options-snapshot",
            replayTime,
          }
        : {
            status: "available",
            snapshot,
            ageMs: replayTime - snapshot.capturedAt,
          },
  };
};

const advanceBy = (state: ReplayState, frameCount: number): ReplayState => {
  if (frameCount <= 0 || state.currentIndex < 0) return state;

  const finalIndex = state.timeline.candles.length - 1;
  const currentIndex = Math.min(finalIndex, state.currentIndex + frameCount);
  return {
    ...state,
    currentIndex,
    playback: currentIndex === finalIndex ? "paused" : state.playback,
    accumulatedPlaybackMs:
      currentIndex === finalIndex ? 0 : state.accumulatedPlaybackMs,
  };
};

export const reduceReplay = (
  state: ReplayState,
  command: ReplayCommand,
): ReplayState => {
  switch (command.type) {
    case "play":
      if (state.currentIndex < 0 || isReplayComplete(state)) return state;
      return { ...state, playback: "playing" };
    case "pause":
      return { ...state, playback: "paused" };
    case "step":
      return advanceBy(
        { ...state, playback: "paused", accumulatedPlaybackMs: 0 },
        1,
      );
    case "reset":
      return {
        ...state,
        currentIndex: state.timeline.candles.length === 0 ? -1 : 0,
        playback: "paused",
        accumulatedPlaybackMs: 0,
      };
    case "set-speed":
      assertReplaySpeed(command.speed);
      return { ...state, speed: command.speed };
    case "tick": {
      if (!Number.isFinite(command.elapsedMs) || command.elapsedMs < 0) {
        throw new RangeError("elapsedMs must be non-negative and finite");
      }
      if (state.playback !== "playing" || state.currentIndex < 0) {
        return state;
      }

      const accumulatedPlaybackMs =
        state.accumulatedPlaybackMs + command.elapsedMs * state.speed;
      const frameCount = Math.floor(
        accumulatedPlaybackMs / state.timeline.frameDurationMs,
      );
      const remainder =
        accumulatedPlaybackMs - frameCount * state.timeline.frameDurationMs;
      return advanceBy(
        { ...state, accumulatedPlaybackMs: remainder },
        frameCount,
      );
    }
  }
};
