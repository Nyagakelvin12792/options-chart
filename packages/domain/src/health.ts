import type { DataSource, DomainEventMetadata } from "./event";

export type FeedHealthState =
  "CONNECTING" | "LIVE" | "STALE" | "RECONNECTING" | "DEGRADED" | "ERROR";

export interface DataFreshness {
  readonly source: DataSource;
  readonly asOfTimestamp: number;
  readonly ageMs: number;
  readonly staleAfterMs: number;
  readonly isStale: boolean;
}

export interface FeedHealth {
  readonly metadata: DomainEventMetadata;
  readonly state: FeedHealthState;
  readonly freshness: DataFreshness;
  readonly reconnectAttempt: number;
  readonly lastValidMessageTimestamp: number | null;
  readonly lastReconciliationTimestamp: number | null;
  readonly detail: string | null;
}
