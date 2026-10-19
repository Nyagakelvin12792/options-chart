import type { MarketEventV1 } from "@options-chart/market-data";
import {
  createFlowEngineConfig,
  type FlowEngineConfigV1,
} from "./configuration";
import {
  FLOW_FEATURE_SNAPSHOT_SCHEMA_VERSION,
  FlowFeatureSnapshotV1Schema,
  type CvdAnchorV1,
  type CvdResetReason,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export class FlowEngine {
  private readonly _config: FlowEngineConfigV1;
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
  ) {
    this._config = createFlowEngineConfig(config);
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

  public setLevels(newLevels: readonly unknown[]): void {
    this.levels = validateRelevantLevels(newLevels);
  }

  public getLevels(): readonly RelevantLevelV1[] {
    return this.levels;
  }

  public ingest(
    event: MarketEventV1,
    options?: {
      readonly replayCutoffMs?: number | null;
      readonly deferSnapshot?: boolean;
    },
  ): FlowFeatureSnapshotV1 | null {
    if (!isReplayEligible(event.receiptTimestampMs, options?.replayCutoffMs)) {
      this.healthTracker.recordCutoffExcluded();
      return null;
    }

    this.pushEvidenceEventId(event.eventId);
    this.lastAsOfReceiptTimestampMs = Math.max(
      this.lastAsOfReceiptTimestampMs,
      event.receiptTimestampMs,
    );

    const eff = resolveEffectiveTime(event);
    this.lastFeatureTimestampMs = Math.max(
      this.lastFeatureTimestampMs,
      eff.featureTimestampMs,
    );
    this.lastFeatureTimeSource = eff.featureTimeSource;

    const channel = event.channel as string;
    if (channel === "health") {
      this.healthTracker.recordHealthEvent(event);
      if (isRecord(event.payload) && event.payload["healthStatus"] === "gap") {
        this.orderBookEngine.markSequenceGap();
        if (this._config.resetCvdOnGap) {
          this.cvdEngine.resetAnchor(
            `gap-anchor-${String(eff.featureTimestampMs)}`,
            eff.featureTimestampMs,
            "gap-reset",
          );
        }
      }
    } else if (channel === "trade") {
      this.healthTracker.recordTradeReceipt(event.receiptTimestampMs);
      const norm = this.cvdEngine.ingestTradeEvent(event);
      if (norm.ok) {
        this.liquidityEngine.recordExecutedTrade(norm.trade);
      } else {
        this.healthTracker.recordMalformed();
      }
    } else if (channel === "l2-book") {
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
          this.healthTracker.recordHealthEvent({
            schemaVersion: "market-event-v1",
            eventId: `gap-${event.eventId}`,
            venue: event.venue,
            symbol: event.symbol,
            instrumentType: event.instrumentType,
            channel: "health" as unknown as MarketEventV1["channel"],
            exchangeTimestampMs: event.exchangeTimestampMs,
            receiptTimestampMs: event.receiptTimestampMs,
            sequence: event.sequence,
            payload: { healthStatus: "gap" },
            provenance: event.provenance,
          });
          if (this._config.resetCvdOnGap) {
            this.cvdEngine.resetAnchor(
              `gap-anchor-${String(eff.featureTimestampMs)}`,
              eff.featureTimestampMs,
              "gap-reset",
            );
          }
        } else if (applyRes.sequenceTransition.kind === "duplicate") {
          this.healthTracker.recordDuplicate();
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
    events: readonly MarketEventV1[],
    options?: { readonly replayCutoffMs?: number | null },
  ): FlowFeatureSnapshotV1 {
    for (const event of events) {
      this.ingest(event, { ...options, deferSnapshot: true });
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
