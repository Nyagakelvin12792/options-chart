import {
  type MarketEventV1,
  type MarketHealthEventV1,
  type MarketStorageRecordV1,
  MarketHealthEventV1Schema,
} from "@options-chart/market-data";
import {
  createFlowEngineConfig,
  type FlowEngineConfigV1,
} from "./configuration";
import {
  FLOW_FEATURE_SNAPSHOT_SCHEMA_VERSION,
  FlowFeatureSnapshotV1Schema,
  type CvdAnchorV1,
  type CvdResetReason,
  type FeatureHealthSnapshotV1,
  type FlowFeatureSnapshotV1,
  type RelevantLevelV1,
} from "./contracts";
import { CvdEngine } from "./cvd";
import { isReplayEligible, resolveEffectiveTime } from "./effective-time";
import { FeatureHealthTracker } from "./feature-health";
import { validateRelevantLevels } from "./level-context";
import { LiquidityEngine } from "./liquidity";
import { OrderBookEngine } from "./order-book";
import { computeResponseEfficiencySnapshot } from "./response-efficiency";
import { ClassificationsEngine } from "./classifications";

export const FLOW_ENGINE_VERSION = "flow-engine-v1" as const;

export type FlowEngineMode = "incremental" | "replay";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export class FlowEngine {
  private readonly _config: FlowEngineConfigV1;
  private readonly defaultMode: FlowEngineMode;
  private readonly seenEventIds = new Set<string>();
  private readonly seenEventIdsQueue: string[] = [];
  private readonly maxDeduplicationHistory: number;
  private readonly cvdEngine: CvdEngine;
  private readonly orderBookEngine: OrderBookEngine;
  private readonly liquidityEngine: LiquidityEngine;
  private readonly classificationsEngine: ClassificationsEngine;
  private readonly healthTracker: FeatureHealthTracker;
  private levels: readonly RelevantLevelV1[];
  private recentEvidenceEventIds: string[] = [];
  private lastAsOfReceiptTimestampMs = 0;
  private lastFeatureTimestampMs = 0;
  private lastFeatureTimeSource: "exchange" | "receipt" = "receipt";

  public constructor(
    config?: Partial<FlowEngineConfigV1>,
    initialLevels?: readonly unknown[],
    options?: {
      readonly defaultMode?: FlowEngineMode;
      readonly maxDeduplicationHistory?: number;
    },
  ) {
    this._config = createFlowEngineConfig(config);
    this.defaultMode = options?.defaultMode ?? "incremental";
    this.maxDeduplicationHistory =
      options?.maxDeduplicationHistory ??
      Math.max(2048, this._config.maxEvidenceEventIds * 16);
    this.cvdEngine = new CvdEngine(this._config);
    this.orderBookEngine = new OrderBookEngine(this._config);
    this.liquidityEngine = new LiquidityEngine(this._config);
    this.classificationsEngine = new ClassificationsEngine(this._config);
    this.healthTracker = new FeatureHealthTracker(this._config);
    this.levels = validateRelevantLevels(initialLevels ?? []);
  }

  public get config(): FlowEngineConfigV1 {
    return this._config;
  }

  public get health(): FeatureHealthTracker {
    return this.healthTracker;
  }

  public get cutoffExcludedEventCount(): number {
    return this.healthTracker.cutoffExcludedEventCount;
  }

  public get mode(): FlowEngineMode {
    return this.defaultMode;
  }

  public setLevels(newLevels: readonly unknown[]): void {
    this.levels = validateRelevantLevels(newLevels);
  }

  public getLevels(): readonly RelevantLevelV1[] {
    return this.levels;
  }

  public getRetainedTradeCount(): number {
    return this.cvdEngine.getAllRetainedTrades().length;
  }

  public getRetainedEvidenceIdCount(): number {
    return this.recentEvidenceEventIds.length;
  }

  public getDeduplicationHistoryCount(): number {
    return this.seenEventIds.size;
  }

  public ingest(
    event: MarketEventV1,
    options?: {
      readonly replayCutoffMs?: number | null;
      readonly mode?: FlowEngineMode;
      readonly deferSnapshot?: boolean;
    },
  ): FlowFeatureSnapshotV1 | null {
    if (!isReplayEligible(event.receiptTimestampMs, options?.replayCutoffMs)) {
      this.healthTracker.recordCutoffExcluded();
      return null;
    }

    if (this.seenEventIds.has(event.eventId)) {
      this.healthTracker.recordDuplicate(event.eventId);
      if (options?.deferSnapshot) {
        return null;
      }
      return this.snapshot({
        asOfReceiptTimestampMs: this.lastAsOfReceiptTimestampMs,
      });
    }
    this.seenEventIds.add(event.eventId);
    this.seenEventIdsQueue.push(event.eventId);
    if (this.seenEventIdsQueue.length > this.maxDeduplicationHistory) {
      const oldest = this.seenEventIdsQueue.shift();
      if (oldest !== undefined) {
        this.seenEventIds.delete(oldest);
      }
    }

    const mode: FlowEngineMode = options?.mode ?? this.defaultMode;
    const eff = resolveEffectiveTime(event);

    if (event.channel === "trade" && mode === "incremental") {
      if (
        this.lastFeatureTimestampMs > 0 &&
        eff.featureTimestampMs < this.lastFeatureTimestampMs
      ) {
        this.healthTracker.recordLateIgnored(event.eventId);
        if (options?.deferSnapshot) {
          return null;
        }
        return this.snapshot({
          asOfReceiptTimestampMs: this.lastAsOfReceiptTimestampMs,
        });
      }
    }

    this.pushEvidenceEventId(event.eventId);
    this.lastAsOfReceiptTimestampMs = Math.max(
      this.lastAsOfReceiptTimestampMs,
      event.receiptTimestampMs,
    );
    this.lastFeatureTimestampMs = Math.max(
      this.lastFeatureTimestampMs,
      eff.featureTimestampMs,
    );
    this.lastFeatureTimeSource = eff.featureTimeSource;

    if (event.channel === "trade") {
      this.healthTracker.recordTradeReceipt(event.receiptTimestampMs);
      const norm = this.cvdEngine.ingestTradeEvent(event);
      if (norm.ok) {
        this.liquidityEngine.recordExecutedTrade(norm.trade);
      } else {
        this.healthTracker.recordMalformed();
      }
    } else if (event.channel === "l2-book") {
      this.healthTracker.recordBookReceipt(event.receiptTimestampMs);
      const applyRes = this.orderBookEngine.applyL2BookEvent(event);
      if (applyRes.accepted) {
        if (
          isRecord(event.payload) &&
          event.payload["updateType"] === "snapshot"
        ) {
          this.healthTracker.resolveGap();
        }
        this.liquidityEngine.recordBookUpdate(event, applyRes);
      } else {
        if (applyRes.statusReason === "sequence-gap") {
          this.healthTracker.recordSequenceGap(event.eventId);
          if (this._config.resetCvdOnGap) {
            this.cvdEngine.resetAnchor(
              `gap-anchor-${String(eff.featureTimestampMs)}`,
              eff.featureTimestampMs,
              "gap-reset",
            );
          }
        } else if (applyRes.sequenceTransition.kind === "duplicate") {
          this.healthTracker.recordDuplicate(event.eventId);
        } else if (applyRes.sequenceTransition.kind === "out-of-order") {
          this.healthTracker.recordOutOfOrder();
        } else if (applyRes.statusReason === "malformed-book") {
          this.healthTracker.recordMalformed();
        }
      }
    } else {
      this.healthTracker.recordEventReceipt(event.receiptTimestampMs);
    }

    if (options?.deferSnapshot) {
      return null;
    }

    return this.snapshot({
      asOfReceiptTimestampMs: this.lastAsOfReceiptTimestampMs,
    });
  }

  public ingestHealthEvent(
    healthEvent: MarketHealthEventV1,
  ): FeatureHealthSnapshotV1 {
    MarketHealthEventV1Schema.parse(healthEvent);
    this.healthTracker.recordHealthEvent(healthEvent);
    if (healthEvent.type === "gap") {
      this.orderBookEngine.markSequenceGap();
      if (this._config.resetCvdOnGap) {
        this.cvdEngine.resetAnchor(
          `gap-anchor-${String(healthEvent.detectedAtMs)}`,
          healthEvent.detectedAtMs,
          "gap-reset",
        );
      }
    }
    const asOfMs = this.lastAsOfReceiptTimestampMs || healthEvent.detectedAtMs;
    const cvdSnap = this.cvdEngine.snapshot(
      this.lastFeatureTimestampMs || healthEvent.detectedAtMs,
    );
    const bookSnap = this.orderBookEngine.snapshot(asOfMs, {
      hasUnresolvedGap: this.healthTracker.hasUnresolvedGap,
    });
    return this.healthTracker.computeSnapshot(
      asOfMs,
      cvdSnap.activeAnchor.directionalCoverageRatio,
      bookSnap.bookCoverageRatio,
    );
  }

  public ingestStorageRecord(
    record: MarketStorageRecordV1,
    options?: {
      readonly replayCutoffMs?: number | null;
      readonly mode?: FlowEngineMode;
      readonly deferSnapshot?: boolean;
    },
  ): FlowFeatureSnapshotV1 | null {
    if (record.schemaVersion === "market-health-event-v1") {
      this.ingestHealthEvent(record);
      if (options?.deferSnapshot) {
        return null;
      }
      return this.snapshot({
        asOfReceiptTimestampMs: this.lastAsOfReceiptTimestampMs,
      });
    }
    return this.ingest(record, options);
  }

  public getRetainedTradesCount(): number {
    return this.cvdEngine.getAllRetainedTrades().length;
  }

  public snapshot(options?: {
    readonly asOfReceiptTimestampMs?: number;
  }): FlowFeatureSnapshotV1 {
    const asOfReceiptTimestampMs =
      options?.asOfReceiptTimestampMs ?? this.lastAsOfReceiptTimestampMs;
    const asOfFeatureTimestampMs = this.lastFeatureTimestampMs;

    const cvdSnapshot = this.cvdEngine.snapshot(asOfFeatureTimestampMs);
    const tradeCoverage = cvdSnapshot.activeAnchor.directionalCoverageRatio;
    const bookSnapshot = this.orderBookEngine.snapshot(asOfReceiptTimestampMs, {
      hasUnresolvedGap: this.healthTracker.hasUnresolvedGap,
    });
    const bookCoverage = bookSnapshot.bookCoverageRatio;
    const healthSnapshot = this.healthTracker.computeSnapshot(
      asOfReceiptTimestampMs,
      tradeCoverage,
      bookCoverage,
    );

    const refPrice = bookSnapshot.midPrice ?? cvdSnapshot.lastTradePrice;
    const liquiditySnapshot = this.liquidityEngine.snapshot(
      asOfFeatureTimestampMs,
      refPrice,
      { isBookAvailable: bookSnapshot.availability !== "unavailable" },
    );
    const responseSnapshot = computeResponseEfficiencySnapshot(
      this.cvdEngine.getAllRetainedTrades(),
      asOfFeatureTimestampMs,
      this._config,
      {
        isStaleOrGapped:
          healthSnapshot.isStale || healthSnapshot.hasUnresolvedGap,
      },
    );

    const classifications = this.classificationsEngine.evaluate({
      asOfReceiptTimestampMs,
      featureTimestampMs: asOfFeatureTimestampMs,
      referencePrice: refPrice,
      latestTradeEventId:
        cvdSnapshot.lastTradePrice !== null
          ? this.recentEvidenceEventIds[this.recentEvidenceEventIds.length - 1]
          : undefined,
      trades: this.cvdEngine.getAllRetainedTrades(),
      levels: this.levels,
      tradeSideCoverageRatio: tradeCoverage,
      bookCoverageRatio: bookCoverage,
      recentReplenishments: liquiditySnapshot.recentReplenishments,
      hasUnresolvedGap: healthSnapshot.hasUnresolvedGap,
      isStale: healthSnapshot.isStale,
    });

    const snapshotRaw: FlowFeatureSnapshotV1 = {
      schemaVersion: FLOW_FEATURE_SNAPSHOT_SCHEMA_VERSION,
      asOfReceiptTimestampMs,
      featureTimestampMs: asOfFeatureTimestampMs,
      featureTimeSource: this.lastFeatureTimeSource,
      venue: "binance",
      symbol: "BTC-USDT",
      configVersion: this._config.configVersion,
      cvd: cvdSnapshot,
      book: bookSnapshot,
      liquidity: liquiditySnapshot,
      response: responseSnapshot,
      classifications,
      health: healthSnapshot,
      evidenceEventIds: Object.freeze([...this.recentEvidenceEventIds]),
    };

    const parsed = FlowFeatureSnapshotV1Schema.parse(snapshotRaw);
    return Object.freeze(parsed);
  }

  public resetAnchor(
    newAnchorId: string,
    timestampMs: number,
    reason: CvdResetReason,
  ): CvdAnchorV1 {
    return this.cvdEngine.resetAnchor(newAnchorId, timestampMs, reason);
  }

  public replayEvents(
    events: readonly (MarketEventV1 | MarketStorageRecordV1)[],
    options?: {
      readonly replayCutoffMs?: number | null;
      readonly mode?: FlowEngineMode;
    },
  ): FlowFeatureSnapshotV1 {
    const mode: FlowEngineMode = options?.mode ?? "replay";
    for (const event of events) {
      if (event.schemaVersion === "market-health-event-v1") {
        this.ingestHealthEvent(event);
      } else {
        this.ingest(event, { ...options, mode, deferSnapshot: true });
      }
    }
    return this.snapshot({
      asOfReceiptTimestampMs: this.lastAsOfReceiptTimestampMs,
    });
  }

  private pushEvidenceEventId(id: string): void {
    this.recentEvidenceEventIds.push(id);
    if (this.recentEvidenceEventIds.length > this._config.maxEvidenceEventIds) {
      this.recentEvidenceEventIds = this.recentEvidenceEventIds.slice(
        -this._config.maxEvidenceEventIds,
      );
    }
  }
}
