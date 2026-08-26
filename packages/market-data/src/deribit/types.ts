import type {
  DomainEventMetadata,
  FeedHealthState,
  MarketPrice,
  OptionsChainSnapshot,
} from "@options-chart/domain";

export interface DeribitMarkUpdate {
  readonly metadata: DomainEventMetadata;
  readonly instrumentName: string;
  readonly markPriceBtc: number;
  readonly markIvDecimal: number;
}

export interface DeribitSnapshotBuildResult {
  readonly snapshot: OptionsChainSnapshot;
  readonly missingSummaryInstrumentNames: readonly string[];
  readonly unknownSummaryInstrumentNames: readonly string[];
}

export interface DeribitClockSyncResult {
  readonly offsetMs: number;
  readonly bestRttMs: number;
  readonly sampleCount: number;
  readonly syncedAt: number;
  readonly state: Extract<FeedHealthState, "LIVE" | "DEGRADED">;
}

export interface DeribitStreamFreshness {
  readonly state: FeedHealthState;
  readonly lastMarkMessageAt: number | null;
  readonly lastIndexMessageAt: number | null;
  readonly consecutiveValidMessages: number;
  readonly subscriptionsConfirmed: boolean;
}

export interface DeribitEngineSnapshot {
  readonly chain: OptionsChainSnapshot | null;
  readonly index: MarketPrice | null;
  readonly optionsState: FeedHealthState;
  readonly streamState: FeedHealthState;
  readonly clock: DeribitClockSyncResult | null;
}
