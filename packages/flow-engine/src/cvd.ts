import type { MarketEventV1 } from "@options-chart/market-data";
import { CandleBucketAccumulator } from "./candle-buckets";
import {
  DEFAULT_FLOW_ENGINE_CONFIG_V1,
  type FlowEngineConfigV1,
} from "./configuration";
import type {
  CvdAnchorV1,
  CvdResetReason,
  CvdSnapshotV1,
  FeatureAvailability,
  NormalizedTradeFlowV1,
  RollingCvdWindowSnapshotV1,
} from "./contracts";
import {
  addTradeToSums,
  applyTradeToAnchorState,
  buildCvdAnchorSnapshot,
  buildRollingWindowSnapshot,
  createZeroAnchorState,
  createZeroTradeSums,
  normalizeTradeEvent,
  removeTradeFromSums,
  type MutableCvdAnchorState,
  type TradeNormalizationResult,
  type TradeRunningSums,
} from "./trade-flow";

export const CVD_POLICY_VERSION = "flow-cvd-v1" as const;

export interface CvdSnapshotOptions {
  readonly forceDegraded?: boolean;
  readonly forceUnavailable?: boolean;
}

interface RollingWindowTracker extends TradeRunningSums {
  readonly windowId: string;
  readonly windowDurationMs: number;
  readonly windowMaxEvents: number;
  headIndex: number;
  lastEvictedAsOfMs: number;
}

function searchTs(
  trades: readonly NormalizedTradeFlowV1[],
  low: number,
  targetMs: number,
  upper: boolean,
): number {
  let l = low;
  let h = trades.length;
  while (l < h) {
    const mid = (l + h) >>> 1;
    const ts = trades[mid]?.featureTimestampMs ?? 0;
    if (upper ? ts <= targetMs : ts < targetMs) l = mid + 1;
    else h = mid;
  }
  return l;
}

export class CvdEngine {
  private readonly config: FlowEngineConfigV1;
  private activeAnchor: MutableCvdAnchorState;
  private readonly previousAnchors: CvdAnchorV1[] = [];
  private readonly trades: NormalizedTradeFlowV1[] = [];
  private headIndex = 0;
  private retentionHeadIndex = 0;
  private readonly maxRetentionDurationMs: number;
  private readonly durationTrackers: readonly RollingWindowTracker[];
  private readonly eventCountTrackers: readonly RollingWindowTracker[];
  private readonly candleBuckets: CandleBucketAccumulator;
  private lastTradePrice: number | null = null;
  private lastTradeTimestampMs: number | null = null;
  private isMonotonic = true;

  public constructor(
    config: FlowEngineConfigV1 = DEFAULT_FLOW_ENGINE_CONFIG_V1,
    initialAnchorTimestampMs = 0,
  ) {
    this.config = config;
    this.activeAnchor = createZeroAnchorState(
      config.initialAnchorId,
      initialAnchorTimestampMs,
      "initial",
    );
    this.maxRetentionDurationMs = Math.max(
      0,
      ...config.rollingDurationWindowsMs,
      ...config.responseEfficiencyWindowsMs,
      config.absorptionBaselineWindowMs,
      config.absorptionCandidateWindowMs,
      config.liquidityWindowMs,
      config.responseHorizonMs * 2,
    );
    this.durationTrackers = config.rollingDurationWindowsMs.map((w) => ({
      ...createZeroTradeSums(),
      windowId: `duration-${String(w)}ms`,
      windowDurationMs: w,
      windowMaxEvents: 0,
      headIndex: 0,
      lastEvictedAsOfMs: Number.NEGATIVE_INFINITY,
    }));
    this.eventCountTrackers = config.rollingEventCountWindows.map((n) => ({
      ...createZeroTradeSums(),
      windowId: `events-${String(n)}`,
      windowDurationMs: 0,
      windowMaxEvents: n,
      headIndex: 0,
      lastEvictedAsOfMs: 0,
    }));
    this.candleBuckets = new CandleBucketAccumulator(config);
  }

  public ingestTrade(trade: NormalizedTradeFlowV1): void {
    if (
      this.lastTradeTimestampMs !== null &&
      trade.featureTimestampMs < this.lastTradeTimestampMs
    ) {
      this.isMonotonic = false;
    }
    this.trades.push(trade);
    if (
      this.lastTradeTimestampMs === null ||
      trade.featureTimestampMs >= this.lastTradeTimestampMs
    ) {
      this.lastTradePrice = trade.price;
      this.lastTradeTimestampMs = trade.featureTimestampMs;
    }

    applyTradeToAnchorState(this.activeAnchor, trade);

    for (const tr of this.durationTrackers) {
      addTradeToSums(tr, trade);
      if (this.isMonotonic) {
        this.evictExpiredDurationTrades(tr, trade.featureTimestampMs);
      }
    }
    for (const tr of this.eventCountTrackers) {
      addTradeToSums(tr, trade);
      while (
        tr.tradeCount > tr.windowMaxEvents &&
        tr.headIndex < this.trades.length
      ) {
        const evicted = this.trades[tr.headIndex];
        tr.headIndex += 1;
        if (evicted !== undefined) removeTradeFromSums(tr, evicted);
      }
    }

    this.candleBuckets.ingestTrade(
      trade,
      this.activeAnchor.anchorId,
      this.activeAnchor.rawCvdQuote,
    );

    if (this.isMonotonic) {
      const minTs = trade.featureTimestampMs - this.maxRetentionDurationMs;
      while (this.retentionHeadIndex < this.trades.length) {
        const c = this.trades[this.retentionHeadIndex];
        if (c === undefined || c.featureTimestampMs >= minTs) break;
        this.retentionHeadIndex += 1;
      }
      this.updateHeadAndCompactIfNeeded();
    }
  }

  public ingestTradeEvent(event: MarketEventV1): TradeNormalizationResult {
    const result = normalizeTradeEvent(event);
    if (result.ok) {
      this.ingestTrade(result.trade);
      return result;
    }
    if (event.channel === "trade") {
      this.recordMalformedTrade(event.receiptTimestampMs);
    }
    return result;
  }

  public recordMalformedTrade(timestampMs?: number): void {
    void timestampMs;
    this.activeAnchor.malformedTradeCount += 1;
  }

  public resetAnchor(
    newAnchorId: string,
    anchorTimestampMs: number,
    reason: CvdResetReason,
  ): CvdAnchorV1 {
    this.previousAnchors.push(
      buildCvdAnchorSnapshot(
        this.activeAnchor,
        this.config.minTradeSideCoverageRatio,
      ),
    );
    while (
      this.previousAnchors.length > this.config.maxRetainedPreviousAnchors
    ) {
      this.previousAnchors.shift();
    }
    this.activeAnchor = createZeroAnchorState(
      newAnchorId,
      anchorTimestampMs,
      reason,
    );
    return buildCvdAnchorSnapshot(
      this.activeAnchor,
      this.config.minTradeSideCoverageRatio,
    );
  }

  public getTradesInWindow(
    windowDurationMs: number,
    asOfFeatureTimestampMs: number,
  ): readonly NormalizedTradeFlowV1[] {
    const minTs = asOfFeatureTimestampMs - windowDurationMs;
    if (!this.isMonotonic) {
      return Object.freeze(
        this.trades
          .slice(this.headIndex)
          .filter(
            (t) =>
              t.featureTimestampMs >= minTs &&
              t.featureTimestampMs <= asOfFeatureTimestampMs,
          ),
      );
    }
    const start = searchTs(this.trades, this.headIndex, minTs, false);
    const end = searchTs(this.trades, start, asOfFeatureTimestampMs, true);
    return Object.freeze(this.trades.slice(start, end));
  }

  public getAllRetainedTrades(): readonly NormalizedTradeFlowV1[] {
    return Object.freeze(this.trades.slice(this.headIndex));
  }

  public snapshot(asOfMs: number, opts?: CvdSnapshotOptions): CvdSnapshotV1 {
    const activeAnchor = buildCvdAnchorSnapshot(
      this.activeAnchor,
      this.config.minTradeSideCoverageRatio,
      opts,
    );
    const rollingByDuration = Object.freeze(
      this.durationTrackers.map((tr) =>
        this.buildDurationWindowSnapshot(tr, asOfMs, opts),
      ),
    );
    const rollingByEventCount = Object.freeze(
      this.eventCountTrackers.map((tr) =>
        buildRollingWindowSnapshot(
          tr.windowId,
          "event-count",
          null,
          tr.windowMaxEvents,
          tr,
          this.activeAnchor.malformedTradeCount,
          this.config.minTradeSideCoverageRatio,
          opts,
        ),
      ),
    );
    const candleBuckets = this.candleBuckets.snapshot(asOfMs, opts);
    const availability: FeatureAvailability =
      opts?.forceUnavailable === true ||
      this.activeAnchor.includedTradeCount === 0
        ? "unavailable"
        : activeAnchor.availability === "degraded" ||
            opts?.forceDegraded === true
          ? "degraded"
          : "available";
    return Object.freeze({
      availability,
      activeAnchor,
      previousAnchors: Object.freeze([...this.previousAnchors]),
      rollingByDuration,
      rollingByEventCount,
      candleBuckets,
      lastTradePrice: this.lastTradePrice,
      lastTradeTimestampMs: this.lastTradeTimestampMs,
    });
  }

  private evictExpiredDurationTrades(
    tr: RollingWindowTracker,
    asOfMs: number,
  ): void {
    const minTs = asOfMs - tr.windowDurationMs;
    while (tr.headIndex < this.trades.length) {
      const oldest = this.trades[tr.headIndex];
      if (oldest === undefined || oldest.featureTimestampMs >= minTs) break;
      tr.headIndex += 1;
      removeTradeFromSums(tr, oldest);
    }
    tr.lastEvictedAsOfMs = asOfMs;
  }

  private updateHeadAndCompactIfNeeded(): void {
    let minIdx = this.retentionHeadIndex;
    for (const tr of this.durationTrackers) {
      if (tr.headIndex < minIdx) minIdx = tr.headIndex;
    }
    for (const tr of this.eventCountTrackers) {
      if (tr.headIndex < minIdx) minIdx = tr.headIndex;
    }
    this.headIndex = minIdx;
    if (this.headIndex > 1024 && this.headIndex * 2 > this.trades.length) {
      const drop = this.headIndex;
      this.trades.splice(0, drop);
      this.headIndex = 0;
      this.retentionHeadIndex -= drop;
      for (const tr of this.durationTrackers) tr.headIndex -= drop;
      for (const tr of this.eventCountTrackers) tr.headIndex -= drop;
    }
  }

  private buildDurationWindowSnapshot(
    tr: RollingWindowTracker,
    asOfMs: number,
    opts?: CvdSnapshotOptions,
  ): RollingCvdWindowSnapshotV1 {
    if (
      this.isMonotonic &&
      asOfMs >= tr.lastEvictedAsOfMs &&
      (this.lastTradeTimestampMs === null ||
        asOfMs >= this.lastTradeTimestampMs)
    ) {
      this.evictExpiredDurationTrades(tr, asOfMs);
      this.updateHeadAndCompactIfNeeded();
      return buildRollingWindowSnapshot(
        tr.windowId,
        "duration",
        tr.windowDurationMs,
        null,
        tr,
        this.activeAnchor.malformedTradeCount,
        this.config.minTradeSideCoverageRatio,
        opts,
      );
    }
    const adHoc = createZeroTradeSums();
    for (const t of this.getTradesInWindow(tr.windowDurationMs, asOfMs)) {
      addTradeToSums(adHoc, t);
    }
    return buildRollingWindowSnapshot(
      tr.windowId,
      "duration",
      tr.windowDurationMs,
      null,
      adHoc,
      this.activeAnchor.malformedTradeCount,
      this.config.minTradeSideCoverageRatio,
      opts,
    );
  }
}
