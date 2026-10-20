import type { MarketHealthEventV1 } from "@options-chart/market-data";
import {
  DEFAULT_FLOW_ENGINE_CONFIG_V1,
  type FlowEngineConfigV1,
} from "./configuration";
import type { FeatureAvailability, FeatureHealthSnapshotV1 } from "./contracts";
import { roundDecimal } from "./decimal";

export const FEATURE_HEALTH_POLICY_VERSION = "flow-feature-health-v1" as const;

interface ActiveHealthEventEntry {
  readonly id: string;
  readonly detectedAtMs: number;
}

export class FeatureHealthTracker {
  private readonly config: FlowEngineConfigV1;
  public lastEventReceiptTimestampMs: number | null = null;
  public lastTradeReceiptTimestampMs: number | null = null;
  public lastBookReceiptTimestampMs: number | null = null;
  public hasUnresolvedGap = false;
  public hasCollectorError = false;
  public gapCount = 0;
  public staleCount = 0;
  public reconnectCount = 0;
  public duplicateCount = 0;
  public malformedEventCount = 0;
  public outOfOrderEventCount = 0;
  public lateIgnoredEventCount = 0;
  public cutoffExcludedEventCount = 0;
  public isDeduplicationExhausted = false;
  public hasTruncatedRetention = false;
  private activeHealthEvents: ActiveHealthEventEntry[] = [];

  public get activeHealthEventIds(): readonly string[] {
    return this.activeHealthEvents.map((e) => e.id);
  }

  public constructor(
    config: FlowEngineConfigV1 = DEFAULT_FLOW_ENGINE_CONFIG_V1,
  ) {
    this.config = config;
  }

  public recordEventReceipt(timestampMs: number): void {
    this.lastEventReceiptTimestampMs = Math.max(
      this.lastEventReceiptTimestampMs ?? 0,
      timestampMs,
    );
  }

  public recordTradeReceipt(timestampMs: number): void {
    this.recordEventReceipt(timestampMs);
    this.lastTradeReceiptTimestampMs = Math.max(
      this.lastTradeReceiptTimestampMs ?? 0,
      timestampMs,
    );
  }

  public recordBookReceipt(timestampMs: number): void {
    this.recordEventReceipt(timestampMs);
    this.lastBookReceiptTimestampMs = Math.max(
      this.lastBookReceiptTimestampMs ?? 0,
      timestampMs,
    );
  }

  public recordHealthEvent(event: MarketHealthEventV1): void {
    this.recordEventReceipt(event.detectedAtMs);
    if (event.type === "gap") {
      this.gapCount += 1;
      this.hasUnresolvedGap = true;
      this.pushHealthEventId(event.healthEventId, event.detectedAtMs);
    } else if (event.type === "stale") {
      this.staleCount += 1;
      this.pushHealthEventId(event.healthEventId, event.detectedAtMs);
    } else if (event.type === "reconnect") {
      this.reconnectCount += 1;
      this.pushHealthEventId(event.healthEventId, event.detectedAtMs);
    } else if (event.type === "duplicate") {
      this.duplicateCount += 1;
      this.pushHealthEventId(event.healthEventId, event.detectedAtMs);
    } else if (event.type === "collector-error") {
      this.hasCollectorError = true;
      this.pushHealthEventId(event.healthEventId, event.detectedAtMs);
    }
  }

  public recordSequenceGap(
    relatedEventId?: string,
    detectedAtMs?: number,
  ): void {
    this.gapCount += 1;
    this.hasUnresolvedGap = true;
    if (relatedEventId !== undefined) {
      this.pushHealthEventId(relatedEventId, detectedAtMs);
    }
  }

  public resolveGap(): void {
    this.hasUnresolvedGap = false;
  }

  public recordDuplicate(relatedEventId?: string, detectedAtMs?: number): void {
    this.duplicateCount += 1;
    if (relatedEventId !== undefined) {
      this.pushHealthEventId(relatedEventId, detectedAtMs);
    }
  }

  public recordMalformed(): void {
    this.malformedEventCount += 1;
  }

  public recordOutOfOrder(): void {
    this.outOfOrderEventCount += 1;
  }

  public recordLateIgnored(
    relatedEventId?: string,
    detectedAtMs?: number,
  ): void {
    this.lateIgnoredEventCount += 1;
    if (relatedEventId !== undefined) {
      this.pushHealthEventId(relatedEventId, detectedAtMs);
    }
  }

  public recordCutoffExcluded(): void {
    this.cutoffExcludedEventCount += 1;
  }

  public recordDeduplicationEviction(): void {
    this.isDeduplicationExhausted = true;
  }

  public recordRetentionTruncation(): void {
    this.hasTruncatedRetention = true;
  }

  public pushHealthEventId(id: string, detectedAtMs?: number): void {
    if (this.activeHealthEvents.some((event) => event.id === id)) {
      return;
    }
    const ts = detectedAtMs ?? this.lastEventReceiptTimestampMs ?? 0;
    this.activeHealthEvents.push({ id, detectedAtMs: ts });
    if (this.activeHealthEvents.length > this.config.maxEvidenceEventIds) {
      this.activeHealthEvents = this.activeHealthEvents.slice(
        -this.config.maxEvidenceEventIds,
      );
    }
  }

  public computeSnapshot(
    asOfReceiptTimestampMs: number,
    tradeSideCoverageRatio: number | null,
    bookCoverageRatio: number,
  ): FeatureHealthSnapshotV1 {
    const tradeFreshnessAgeMs =
      this.lastTradeReceiptTimestampMs !== null
        ? Math.max(0, asOfReceiptTimestampMs - this.lastTradeReceiptTimestampMs)
        : null;
    const bookFreshnessAgeMs =
      this.lastBookReceiptTimestampMs !== null
        ? Math.max(0, asOfReceiptTimestampMs - this.lastBookReceiptTimestampMs)
        : null;
    const isTradeStale =
      tradeFreshnessAgeMs !== null &&
      tradeFreshnessAgeMs > this.config.tradeStaleThresholdMs;
    const isBookStale =
      bookFreshnessAgeMs !== null &&
      bookFreshnessAgeMs > this.config.bookStaleThresholdMs;
    const isStale = isTradeStale || isBookStale;

    const degradationReasons: string[] = [];
    if (this.hasUnresolvedGap) {
      degradationReasons.push("unresolved-sequence-gap");
    }
    if (this.hasCollectorError) {
      degradationReasons.push("collector-error");
    }
    if (isStale) {
      degradationReasons.push("stale-market-inputs");
    }
    if (
      tradeSideCoverageRatio !== null &&
      tradeSideCoverageRatio < this.config.minTradeSideCoverageRatio
    ) {
      degradationReasons.push("low-trade-side-coverage");
    }
    if (bookCoverageRatio < this.config.minBookCoverageRatio) {
      degradationReasons.push("low-book-coverage");
    }
    if (this.malformedEventCount > 0) {
      degradationReasons.push("malformed-events-detected");
    }
    if (this.outOfOrderEventCount > 0) {
      degradationReasons.push("out-of-order-events-detected");
    }
    if (this.isDeduplicationExhausted) {
      degradationReasons.push("deduplication-capacity-exhausted");
    }
    if (this.hasTruncatedRetention) {
      degradationReasons.push("truncated-retention-window");
    }

    let score = 1.0;
    if (this.hasUnresolvedGap) {
      score -= 0.5;
    }
    if (this.hasCollectorError) {
      score -= 0.3;
    }
    if (isStale) {
      score -= 0.3;
    }
    if (tradeSideCoverageRatio !== null) {
      score -= (1 - tradeSideCoverageRatio) * 0.2;
    }
    if (bookCoverageRatio < 1) {
      score -= (1 - bookCoverageRatio) * 0.2;
    }
    if (this.malformedEventCount > 0) {
      score -= 0.1;
    }
    if (this.isDeduplicationExhausted) {
      score -= 0.15;
    }
    if (this.hasTruncatedRetention) {
      score -= 0.1;
    }

    let confidenceScore = roundDecimal(Math.max(0, Math.min(1, score)), 4);
    if (
      this.lastTradeReceiptTimestampMs === null &&
      this.lastBookReceiptTimestampMs === null
    ) {
      confidenceScore = 0;
    }

    let availability: FeatureAvailability;
    if (
      this.hasUnresolvedGap ||
      (this.lastTradeReceiptTimestampMs === null &&
        this.lastBookReceiptTimestampMs === null) ||
      confidenceScore < 0.2
    ) {
      availability = "unavailable";
    } else if (degradationReasons.length > 0 || confidenceScore < 0.8) {
      availability = "degraded";
    } else {
      availability = "available";
    }

    const coherentHealthIds = this.activeHealthEvents
      .filter((e) => e.detectedAtMs <= asOfReceiptTimestampMs)
      .map((e) => e.id);

    return Object.freeze({
      availability,
      isStale,
      hasUnresolvedGap: this.hasUnresolvedGap,
      hasCollectorError: this.hasCollectorError,
      lastEventReceiptTimestampMs: this.lastEventReceiptTimestampMs,
      lastTradeReceiptTimestampMs: this.lastTradeReceiptTimestampMs,
      lastBookReceiptTimestampMs: this.lastBookReceiptTimestampMs,
      tradeFreshnessAgeMs,
      bookFreshnessAgeMs,
      tradeSideCoverageRatio,
      bookCoverageRatio,
      gapCount: this.gapCount,
      staleCount: this.staleCount,
      reconnectCount: this.reconnectCount,
      duplicateCount: this.duplicateCount,
      malformedEventCount: this.malformedEventCount,
      outOfOrderEventCount: this.outOfOrderEventCount,
      lateIgnoredEventCount: this.lateIgnoredEventCount,
      confidenceScore,
      degradationReasons: Object.freeze(degradationReasons),
      activeHealthEventIds: Object.freeze(coherentHealthIds),
    });
  }
}
