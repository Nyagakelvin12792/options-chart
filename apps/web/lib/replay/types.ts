import type { Candle, OptionsChainSnapshot } from "@options-chart/domain";

export const REPLAY_SPEEDS = [1, 2, 5, 10] as const;

export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];

/** JSON-safe envelope for one options chain captured at a real point in time. */
export interface SerializableOptionsSnapshot {
  readonly schemaVersion: "options-replay-snapshot-v1";
  readonly snapshotId: string;
  readonly capturedAt: number;
  readonly chain: OptionsChainSnapshot;
}

export interface ReplayTimeline {
  readonly candles: readonly Candle[];
  readonly optionsSnapshots: readonly SerializableOptionsSnapshot[];
  readonly frameDurationMs: number;
}

export type ReplayOptionsState =
  | {
      readonly status: "available";
      readonly snapshot: SerializableOptionsSnapshot;
      readonly ageMs: number;
    }
  | {
      readonly status: "unavailable";
      readonly reason: "no-historical-options-snapshot";
      readonly replayTime: number;
    };

export interface ReplayFrame {
  readonly index: number;
  /** A candle becomes visible at its authoritative close timestamp. */
  readonly replayTime: number;
  readonly candle: Candle;
  readonly options: ReplayOptionsState;
}

export interface ReplayState {
  readonly timeline: ReplayTimeline;
  readonly currentIndex: number;
  readonly playback: "paused" | "playing";
  readonly speed: ReplaySpeed;
  readonly accumulatedPlaybackMs: number;
}

export type ReplayCommand =
  | { readonly type: "play" }
  | { readonly type: "pause" }
  | { readonly type: "step" }
  | { readonly type: "reset" }
  | { readonly type: "set-speed"; readonly speed: ReplaySpeed }
  | { readonly type: "tick"; readonly elapsedMs: number };

export interface ReplaySnapshotRange {
  readonly fromInclusive?: number;
  readonly toInclusive?: number;
  /** Implementations must reject limits above their declared capacity. */
  readonly limit: number;
}

export interface ReplaySnapshotWriteResult {
  readonly stored: SerializableOptionsSnapshot;
  readonly evictedSnapshotIds: readonly string[];
  readonly size: number;
}

export interface BoundedReplaySnapshotReader {
  readonly capacity: number;
  count(): Promise<number>;
  readAtOrBefore(
    replayTime: number,
  ): Promise<SerializableOptionsSnapshot | null>;
  readRange(
    range: ReplaySnapshotRange,
  ): Promise<readonly SerializableOptionsSnapshot[]>;
}

export interface BoundedReplaySnapshotWriter {
  write(
    snapshot: SerializableOptionsSnapshot,
  ): Promise<ReplaySnapshotWriteResult>;
  clear(): Promise<void>;
}

/**
 * Persistence boundary for a future IndexedDB or server-backed implementation.
 * A writer must evict and report old snapshots before exceeding `capacity`.
 */
export interface BoundedReplaySnapshotStorage
  extends BoundedReplaySnapshotReader, BoundedReplaySnapshotWriter {}
