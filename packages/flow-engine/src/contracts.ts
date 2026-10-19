import { z } from "zod";

export const FLOW_FEATURE_SNAPSHOT_SCHEMA_VERSION =
  "flow-feature-snapshot-v1" as const;
export const FlowSideSchema = z.enum(["buy", "sell"]);
export type FlowSide = z.infer<typeof FlowSideSchema>;
export const TakerSideSourceSchema = z.enum([
  "explicit-taker-side",
  "binance-buyer-maker",
  "unknown",
]);
export type TakerSideSource = z.infer<typeof TakerSideSourceSchema>;
export const FeatureAvailabilitySchema = z.enum([
  "available",
  "degraded",
  "unavailable",
]);
export type FeatureAvailability = z.infer<typeof FeatureAvailabilitySchema>;
export const FlowClassificationSchema = z.enum([
  "buy-absorption",
  "sell-absorption",
  "bullish-rejection",
  "bearish-rejection",
  "acceptance",
  "unresolved",
  "unavailable",
]);
export type FlowClassification = z.infer<typeof FlowClassificationSchema>;
export const CandidateLifecycleStatusSchema = z.enum(["pending", "finalized"]);
export type CandidateLifecycleStatus = z.infer<
  typeof CandidateLifecycleStatusSchema
>;

export const FLOW_TIMEFRAMES = [
  "1m",
  "5m",
  "15m",
  "1h",
  "4h",
  "1d",
  "1w",
] as const;
export const FlowTimeframeSchema = z.enum(FLOW_TIMEFRAMES);
export type FlowTimeframe = z.infer<typeof FlowTimeframeSchema>;
export const FLOW_TIMEFRAME_DURATION_MS: Readonly<
  Record<FlowTimeframe, number>
> = Object.freeze({
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
  "1w": 604_800_000,
});

export const RelevantLevelKindSchema = z.enum([
  "gamma-wall",
  "open-interest-wall",
  "volume-wall",
  "flow-wall",
  "gamma-flip",
  "max-pain",
  "avwap",
  "volume-profile-poc",
  "volume-profile-vah",
  "volume-profile-val",
  "user",
]);
export type RelevantLevelKind = z.infer<typeof RelevantLevelKindSchema>;
export const RelevantLevelRoleSchema = z.enum([
  "support",
  "resistance",
  "pivot",
]);
export type RelevantLevelRole = z.infer<typeof RelevantLevelRoleSchema>;

const timestampMs = z.number().int().nonnegative(),
  nullableTimestampMs = timestampMs.nullable();
const nonNegInt = z.number().int().nonnegative(),
  posInt = z.number().int().positive();
const finiteNum = z.number().finite(),
  nonNegNum = z.number().finite().nonnegative();
const posNum = z.number().finite().positive(),
  unitRatio = z.number().finite().min(0).max(1);
const signedImbalance = z.number().finite().min(-1).max(1),
  nonEmptyStr = z.string().min(1);
const sequenceVal = z.union([nonNegInt, nonEmptyStr]).nullable();

export interface RelevantLevelV1 {
  readonly id: string;
  readonly price: number;
  readonly kind: RelevantLevelKind;
  readonly observedAtMs: number;
  readonly validFromMs: number;
  readonly validUntilMs: number | null;
  readonly sourceVersion: string;
  readonly role?: RelevantLevelRole;
}
export const RelevantLevelV1Schema = z
  .object({
    id: nonEmptyStr,
    price: posNum,
    kind: RelevantLevelKindSchema,
    observedAtMs: timestampMs,
    validFromMs: timestampMs,
    validUntilMs: nullableTimestampMs,
    sourceVersion: nonEmptyStr,
    role: RelevantLevelRoleSchema.optional(),
  })
  .strict()
  .superRefine((level, ctx) => {
    if (level.validUntilMs !== null && level.validUntilMs < level.validFromMs) {
      ctx.addIssue({
        code: "custom",
        message: "validUntilMs must be greater than or equal to validFromMs",
        path: ["validUntilMs"],
      });
    }
  });

export interface NormalizedTradeFlowV1 {
  readonly eventId: string;
  readonly receiptTimestampMs: number;
  readonly featureTimestampMs: number;
  readonly featureTimeSource: "exchange" | "receipt";
  readonly price: number;
  readonly baseQuantity: number;
  readonly quoteVolume: number;
  readonly takerSide: FlowSide | null;
  readonly takerSideSource: TakerSideSource;
  readonly signedQuoteDelta: number | null;
}
export const NormalizedTradeFlowV1Schema = z
  .object({
    eventId: nonEmptyStr,
    receiptTimestampMs: timestampMs,
    featureTimestampMs: timestampMs,
    featureTimeSource: z.enum(["exchange", "receipt"]),
    price: posNum,
    baseQuantity: posNum,
    quoteVolume: posNum,
    takerSide: FlowSideSchema.nullable(),
    takerSideSource: TakerSideSourceSchema,
    signedQuoteDelta: finiteNum.nullable(),
  })
  .strict();

export const CvdResetReasonSchema = z.enum([
  "initial",
  "explicit-reset",
  "gap-reset",
]);
export type CvdResetReason = z.infer<typeof CvdResetReasonSchema>;

export interface CvdAnchorV1 {
  readonly anchorId: string;
  readonly anchorTimestampMs: number;
  readonly resetReason: CvdResetReason;
  readonly buyQuoteVolume: number;
  readonly sellQuoteVolume: number;
  readonly unknownSideQuoteVolume: number;
  readonly totalQuoteVolume: number;
  readonly buyBaseQuantity: number;
  readonly sellBaseQuantity: number;
  readonly unknownSideBaseQuantity: number;
  readonly totalBaseQuantity: number;
  readonly rawCvdQuote: number;
  readonly includedTradeCount: number;
  readonly unknownSideTradeCount: number;
  readonly malformedTradeCount: number;
  readonly directionalCoverageRatio: number | null;
  readonly availability: FeatureAvailability;
}
export const CvdAnchorV1Schema = z
  .object({
    anchorId: nonEmptyStr,
    anchorTimestampMs: timestampMs,
    resetReason: CvdResetReasonSchema,
    buyQuoteVolume: nonNegNum,
    sellQuoteVolume: nonNegNum,
    unknownSideQuoteVolume: nonNegNum,
    totalQuoteVolume: nonNegNum,
    buyBaseQuantity: nonNegNum,
    sellBaseQuantity: nonNegNum,
    unknownSideBaseQuantity: nonNegNum,
    totalBaseQuantity: nonNegNum,
    rawCvdQuote: finiteNum,
    includedTradeCount: nonNegInt,
    unknownSideTradeCount: nonNegInt,
    malformedTradeCount: nonNegInt,
    directionalCoverageRatio: unitRatio.nullable(),
    availability: FeatureAvailabilitySchema,
  })
  .strict();

export interface RollingCvdWindowSnapshotV1 {
  readonly windowId: string;
  readonly windowKind: "duration" | "event-count";
  readonly windowDurationMs: number | null;
  readonly windowMaxEvents: number | null;
  readonly buyQuoteVolume: number;
  readonly sellQuoteVolume: number;
  readonly unknownSideQuoteVolume: number;
  readonly totalQuoteVolume: number;
  readonly rawCvdQuote: number;
  readonly tradeCount: number;
  readonly unknownSideTradeCount: number;
  readonly directionalCoverageRatio: number | null;
  readonly availability: FeatureAvailability;
}
export const RollingCvdWindowSnapshotV1Schema = z
  .object({
    windowId: nonEmptyStr,
    windowKind: z.enum(["duration", "event-count"]),
    windowDurationMs: posInt.nullable(),
    windowMaxEvents: posInt.nullable(),
    buyQuoteVolume: nonNegNum,
    sellQuoteVolume: nonNegNum,
    unknownSideQuoteVolume: nonNegNum,
    totalQuoteVolume: nonNegNum,
    rawCvdQuote: finiteNum,
    tradeCount: nonNegInt,
    unknownSideTradeCount: nonNegInt,
    directionalCoverageRatio: unitRatio.nullable(),
    availability: FeatureAvailabilitySchema,
  })
  .strict();

export interface CandleCvdBucketV1 {
  readonly timeframe: FlowTimeframe;
  readonly openTimeMs: number;
  readonly closeTimeMs: number;
  readonly buyQuoteVolume: number;
  readonly sellQuoteVolume: number;
  readonly unknownSideQuoteVolume: number;
  readonly totalQuoteVolume: number;
  readonly buyBaseQuantity: number;
  readonly sellBaseQuantity: number;
  readonly rawCvdQuote: number;
  readonly cumulativeCvdFromAnchorQuote: number;
  readonly anchorId: string;
  readonly tradeCount: number;
  readonly unknownSideTradeCount: number;
  readonly directionalCoverageRatio: number | null;
  readonly isClosed: boolean;
  readonly availability: FeatureAvailability;
}
export const CandleCvdBucketV1Schema = z
  .object({
    timeframe: FlowTimeframeSchema,
    openTimeMs: timestampMs,
    closeTimeMs: timestampMs,
    buyQuoteVolume: nonNegNum,
    sellQuoteVolume: nonNegNum,
    unknownSideQuoteVolume: nonNegNum,
    totalQuoteVolume: nonNegNum,
    buyBaseQuantity: nonNegNum,
    sellBaseQuantity: nonNegNum,
    rawCvdQuote: finiteNum,
    cumulativeCvdFromAnchorQuote: finiteNum,
    anchorId: nonEmptyStr,
    tradeCount: nonNegInt,
    unknownSideTradeCount: nonNegInt,
    directionalCoverageRatio: unitRatio.nullable(),
    isClosed: z.boolean(),
    availability: FeatureAvailabilitySchema,
  })
  .strict();

export interface CvdSnapshotV1 {
  readonly availability: FeatureAvailability;
  readonly activeAnchor: CvdAnchorV1;
  readonly previousAnchors: readonly CvdAnchorV1[];
  readonly rollingByDuration: readonly RollingCvdWindowSnapshotV1[];
  readonly rollingByEventCount: readonly RollingCvdWindowSnapshotV1[];
  readonly candleBuckets: Readonly<
    Record<FlowTimeframe, readonly CandleCvdBucketV1[]>
  >;
  readonly lastTradePrice: number | null;
  readonly lastTradeTimestampMs: number | null;
}
const candleBucketList = z.array(CandleCvdBucketV1Schema);
export const CvdSnapshotV1Schema = z
  .object({
    availability: FeatureAvailabilitySchema,
    activeAnchor: CvdAnchorV1Schema,
    previousAnchors: z.array(CvdAnchorV1Schema),
    rollingByDuration: z.array(RollingCvdWindowSnapshotV1Schema),
    rollingByEventCount: z.array(RollingCvdWindowSnapshotV1Schema),
    candleBuckets: z
      .object({
        "1m": candleBucketList,
        "5m": candleBucketList,
        "15m": candleBucketList,
        "1h": candleBucketList,
        "4h": candleBucketList,
        "1d": candleBucketList,
        "1w": candleBucketList,
      })
      .strict(),
    lastTradePrice: posNum.nullable(),
    lastTradeTimestampMs: nullableTimestampMs,
  })
  .strict();

export const BookStatusReasonSchema = z.enum([
  "ok",
  "awaiting-snapshot",
  "empty-book",
  "crossed-book",
  "sequence-gap",
  "stale-book",
  "malformed-book",
  "truncated-depth",
]);
export type BookStatusReason = z.infer<typeof BookStatusReasonSchema>;

export interface BookLevelV1 {
  readonly price: number;
  readonly quantity: number;
  readonly quoteNotional: number;
}
export const BookLevelV1Schema = z
  .object({ price: posNum, quantity: posNum, quoteNotional: posNum })
  .strict();

export interface TopNImbalanceV1 {
  readonly depthN: number;
  readonly bidQuantity: number;
  readonly askQuantity: number;
  readonly bidNotional: number;
  readonly askNotional: number;
  readonly quantityImbalance: number | null;
  readonly notionalImbalance: number | null;
  readonly availableBidLevels: number;
  readonly availableAskLevels: number;
  readonly coverageRatio: number;
}
export const TopNImbalanceV1Schema = z
  .object({
    depthN: posInt,
    bidQuantity: nonNegNum,
    askQuantity: nonNegNum,
    bidNotional: nonNegNum,
    askNotional: nonNegNum,
    quantityImbalance: signedImbalance.nullable(),
    notionalImbalance: signedImbalance.nullable(),
    availableBidLevels: nonNegInt,
    availableAskLevels: nonNegInt,
    coverageRatio: unitRatio,
  })
  .strict();

export interface BpsBandImbalanceV1 {
  readonly bandBps: number;
  readonly bidQuantity: number;
  readonly askQuantity: number;
  readonly bidNotional: number;
  readonly askNotional: number;
  readonly quantityImbalance: number | null;
  readonly notionalImbalance: number | null;
  readonly includedBidLevels: number;
  readonly includedAskLevels: number;
}
export const BpsBandImbalanceV1Schema = z
  .object({
    bandBps: posNum,
    bidQuantity: nonNegNum,
    askQuantity: nonNegNum,
    bidNotional: nonNegNum,
    askNotional: nonNegNum,
    quantityImbalance: signedImbalance.nullable(),
    notionalImbalance: signedImbalance.nullable(),
    includedBidLevels: nonNegInt,
    includedAskLevels: nonNegInt,
  })
  .strict();

export interface OrderBookSnapshotV1 {
  readonly availability: FeatureAvailability;
  readonly statusReason: BookStatusReason;
  readonly lastUpdateTimestampMs: number | null;
  readonly lastReceiptTimestampMs: number | null;
  readonly lastSequence: number | string | null;
  readonly bestBid: BookLevelV1 | null;
  readonly bestAsk: BookLevelV1 | null;
  readonly midPrice: number | null;
  readonly spreadAmount: number | null;
  readonly spreadBps: number | null;
  readonly microprice: number | null;
  readonly retainedBidLevels: number;
  readonly retainedAskLevels: number;
  readonly bookCoverageRatio: number;
  readonly topNImbalances: readonly TopNImbalanceV1[];
  readonly bpsBandImbalances: readonly BpsBandImbalanceV1[];
}
export const OrderBookSnapshotV1Schema = z
  .object({
    availability: FeatureAvailabilitySchema,
    statusReason: BookStatusReasonSchema,
    lastUpdateTimestampMs: nullableTimestampMs,
    lastReceiptTimestampMs: nullableTimestampMs,
    lastSequence: sequenceVal,
    bestBid: BookLevelV1Schema.nullable(),
    bestAsk: BookLevelV1Schema.nullable(),
    midPrice: posNum.nullable(),
    spreadAmount: nonNegNum.nullable(),
    spreadBps: nonNegNum.nullable(),
    microprice: posNum.nullable(),
    retainedBidLevels: nonNegInt,
    retainedAskLevels: nonNegInt,
    bookCoverageRatio: unitRatio,
    topNImbalances: z.array(TopNImbalanceV1Schema),
    bpsBandImbalances: z.array(BpsBandImbalanceV1Schema),
  })
  .strict();

export interface LiquidityBandChangeV1 {
  readonly bandBps: number;
  readonly bidAddedQuantity: number;
  readonly bidRemovedQuantity: number;
  readonly bidNetQuantity: number;
  readonly askAddedQuantity: number;
  readonly askRemovedQuantity: number;
  readonly askNetQuantity: number;
  readonly bidAddedNotional: number;
  readonly bidRemovedNotional: number;
  readonly askAddedNotional: number;
  readonly askRemovedNotional: number;
}
export const LiquidityBandChangeV1Schema = z
  .object({
    bandBps: posNum,
    bidAddedQuantity: nonNegNum,
    bidRemovedQuantity: nonNegNum,
    bidNetQuantity: finiteNum,
    askAddedQuantity: nonNegNum,
    askRemovedQuantity: nonNegNum,
    askNetQuantity: finiteNum,
    bidAddedNotional: nonNegNum,
    bidRemovedNotional: nonNegNum,
    askAddedNotional: nonNegNum,
    askRemovedNotional: nonNegNum,
  })
  .strict();

export interface ReplenishmentEventV1 {
  readonly replenishmentId: string;
  readonly side: "bid" | "ask";
  readonly removalEventId: string;
  readonly replenishEventId: string;
  readonly removalTimestampMs: number;
  readonly replenishTimestampMs: number;
  readonly elapsedMs: number;
  readonly referencePriceAtRemoval: number;
  readonly removedPrice: number;
  readonly replenishedPrice: number;
  readonly priceDistanceBps: number;
  readonly removedQuantity: number;
  readonly replenishedQuantity: number;
  readonly replenishmentRatio: number;
  readonly classificationLabel: "observed-displayed-liquidity-replenishment";
}
export const ReplenishmentEventV1Schema = z
  .object({
    replenishmentId: nonEmptyStr,
    side: z.enum(["bid", "ask"]),
    removalEventId: nonEmptyStr,
    replenishEventId: nonEmptyStr,
    removalTimestampMs: timestampMs,
    replenishTimestampMs: timestampMs,
    elapsedMs: nonNegInt,
    referencePriceAtRemoval: posNum,
    removedPrice: posNum,
    replenishedPrice: posNum,
    priceDistanceBps: nonNegNum,
    removedQuantity: posNum,
    replenishedQuantity: posNum,
    replenishmentRatio: posNum,
    classificationLabel: z.literal(
      "observed-displayed-liquidity-replenishment",
    ),
  })
  .strict();

export interface LiquiditySnapshotV1 {
  readonly availability: FeatureAvailability;
  readonly referencePrice: number | null;
  readonly windowDurationMs: number;
  readonly bands: readonly LiquidityBandChangeV1[];
  readonly recentReplenishments: readonly ReplenishmentEventV1[];
  readonly executedAggressiveBuyQuoteVolume: number;
  readonly executedAggressiveSellQuoteVolume: number;
  readonly cancellationOrRemovalBidQuantity: number;
  readonly cancellationOrRemovalAskQuantity: number;
}
export const LiquiditySnapshotV1Schema = z
  .object({
    availability: FeatureAvailabilitySchema,
    referencePrice: posNum.nullable(),
    windowDurationMs: posInt,
    bands: z.array(LiquidityBandChangeV1Schema),
    recentReplenishments: z.array(ReplenishmentEventV1Schema),
    executedAggressiveBuyQuoteVolume: nonNegNum,
    executedAggressiveSellQuoteVolume: nonNegNum,
    cancellationOrRemovalBidQuantity: nonNegNum,
    cancellationOrRemovalAskQuantity: nonNegNum,
  })
  .strict();

export const ResponseUnavailableReasonSchema = z.enum([
  "none",
  "insufficient-samples",
  "zero-or-small-denominator",
  "low-directional-coverage",
  "stale-or-gapped",
  "truncated-window",
]);
export type ResponseUnavailableReason = z.infer<
  typeof ResponseUnavailableReasonSchema
>;

export interface ResponseEfficiencyWindowV1 {
  readonly windowId: string;
  readonly windowDurationMs: number;
  readonly availability: FeatureAvailability;
  readonly unavailableReason: ResponseUnavailableReason;
  readonly startPrice: number | null;
  readonly endPrice: number | null;
  readonly signedPriceChangeBps: number | null;
  readonly signedAggressiveQuoteVolume: number;
  readonly totalAggressiveQuoteVolume: number;
  readonly unknownSideQuoteVolume: number;
  readonly netEfficiencyBpsPerMillionQuote: number | null;
  readonly directionalImpactBpsPerMillionQuote: number | null;
  readonly absorptionDragScore: number | null;
  readonly sampleCount: number;
  readonly excludedTradeCount: number;
  readonly directionalCoverageRatio: number | null;
}
export const ResponseEfficiencyWindowV1Schema = z
  .object({
    windowId: nonEmptyStr,
    windowDurationMs: posInt,
    availability: FeatureAvailabilitySchema,
    unavailableReason: ResponseUnavailableReasonSchema,
    startPrice: posNum.nullable(),
    endPrice: posNum.nullable(),
    signedPriceChangeBps: finiteNum.nullable(),
    signedAggressiveQuoteVolume: finiteNum,
    totalAggressiveQuoteVolume: nonNegNum,
    unknownSideQuoteVolume: nonNegNum,
    netEfficiencyBpsPerMillionQuote: finiteNum.nullable(),
    directionalImpactBpsPerMillionQuote: finiteNum.nullable(),
    absorptionDragScore: unitRatio.nullable(),
    sampleCount: nonNegInt,
    excludedTradeCount: nonNegInt,
    directionalCoverageRatio: unitRatio.nullable(),
  })
  .strict();

export interface ResponseEfficiencySnapshotV1 {
  readonly availability: FeatureAvailability;
  readonly windows: readonly ResponseEfficiencyWindowV1[];
}
export const ResponseEfficiencySnapshotV1Schema = z
  .object({
    availability: FeatureAvailabilitySchema,
    windows: z.array(ResponseEfficiencyWindowV1Schema),
  })
  .strict();

export interface ClassificationComponentScoresV1 {
  readonly aggressiveFlowRatio: number | null;
  readonly priceProgressBps: number | null;
  readonly levelDistanceBps: number | null;
  readonly tradeSideCoverageRatio: number | null;
  readonly bookCoverageRatio: number | null;
  readonly replenishmentSupportRatio: number | null;
  readonly followThroughBps: number | null;
  readonly sustainedFarSideDurationMs: number | null;
  readonly sustainedFarSideQuoteVolume: number | null;
  readonly relativeRankingStrength: number | null;
}
export const ClassificationComponentScoresV1Schema = z
  .object({
    aggressiveFlowRatio: nonNegNum.nullable(),
    priceProgressBps: nonNegNum.nullable(),
    levelDistanceBps: nonNegNum.nullable(),
    tradeSideCoverageRatio: unitRatio.nullable(),
    bookCoverageRatio: unitRatio.nullable(),
    replenishmentSupportRatio: nonNegNum.nullable(),
    followThroughBps: finiteNum.nullable(),
    sustainedFarSideDurationMs: nonNegInt.nullable(),
    sustainedFarSideQuoteVolume: nonNegNum.nullable(),
    relativeRankingStrength: unitRatio.nullable(),
  })
  .strict();

export interface ClassificationThresholdsSnapshotV1 {
  readonly levelProximityBps: number;
  readonly elevatedFlowMultiplier: number;
  readonly maxAbsorptionProgressBps: number;
  readonly responseHorizonMs: number;
  readonly rejectionMoveAwayBps: number;
  readonly rejectionRegainToleranceBps: number;
  readonly acceptanceMoveBeyondBps: number;
  readonly acceptanceSustainedDurationMs: number;
  readonly acceptanceSustainedQuoteVolume: number;
  readonly minTradeSideCoverageRatio: number;
  readonly minBookCoverageRatio: number;
}
export const ClassificationThresholdsSnapshotV1Schema = z
  .object({
    levelProximityBps: posNum,
    elevatedFlowMultiplier: posNum,
    maxAbsorptionProgressBps: posNum,
    responseHorizonMs: posInt,
    rejectionMoveAwayBps: posNum,
    rejectionRegainToleranceBps: posNum,
    acceptanceMoveBeyondBps: posNum,
    acceptanceSustainedDurationMs: posInt,
    acceptanceSustainedQuoteVolume: posNum,
    minTradeSideCoverageRatio: unitRatio,
    minBookCoverageRatio: unitRatio,
  })
  .strict();

export interface LevelClassificationRecordV1 {
  readonly recordId: string;
  readonly lifecycle: CandidateLifecycleStatus;
  readonly candidateClassification: "buy-absorption" | "sell-absorption";
  readonly outcome: FlowClassification;
  readonly levelId: string;
  readonly levelPrice: number;
  readonly levelKind: RelevantLevelKind;
  readonly levelSourceVersion: string;
  readonly candidateTimestampMs: number;
  readonly responseHorizonTimestampMs: number;
  readonly finalizedTimestampMs: number | null;
  readonly dominantAggressiveSide: FlowSide;
  readonly referencePriceAtCandidate: number;
  readonly finalReferencePrice: number | null;
  readonly componentScores: ClassificationComponentScoresV1;
  readonly thresholds: ClassificationThresholdsSnapshotV1;
  readonly evidenceEventIds: readonly string[];
  readonly unavailableReason: string | null;
  readonly auditNote: string;
}
export const LevelClassificationRecordV1Schema = z
  .object({
    recordId: nonEmptyStr,
    lifecycle: CandidateLifecycleStatusSchema,
    candidateClassification: z.enum(["buy-absorption", "sell-absorption"]),
    outcome: FlowClassificationSchema,
    levelId: nonEmptyStr,
    levelPrice: posNum,
    levelKind: RelevantLevelKindSchema,
    levelSourceVersion: nonEmptyStr,
    candidateTimestampMs: timestampMs,
    responseHorizonTimestampMs: timestampMs,
    finalizedTimestampMs: nullableTimestampMs,
    dominantAggressiveSide: FlowSideSchema,
    referencePriceAtCandidate: posNum,
    finalReferencePrice: posNum.nullable(),
    componentScores: ClassificationComponentScoresV1Schema,
    thresholds: ClassificationThresholdsSnapshotV1Schema,
    evidenceEventIds: z.array(nonEmptyStr),
    unavailableReason: nonEmptyStr.nullable(),
    auditNote: nonEmptyStr,
  })
  .strict();

export interface FeatureHealthSnapshotV1 {
  readonly availability: FeatureAvailability;
  readonly isStale: boolean;
  readonly hasUnresolvedGap: boolean;
  readonly hasCollectorError: boolean;
  readonly lastEventReceiptTimestampMs: number | null;
  readonly lastTradeReceiptTimestampMs: number | null;
  readonly lastBookReceiptTimestampMs: number | null;
  readonly tradeFreshnessAgeMs: number | null;
  readonly bookFreshnessAgeMs: number | null;
  readonly tradeSideCoverageRatio: number | null;
  readonly bookCoverageRatio: number;
  readonly gapCount: number;
  readonly staleCount: number;
  readonly reconnectCount: number;
  readonly duplicateCount: number;
  readonly malformedEventCount: number;
  readonly outOfOrderEventCount: number;
  readonly lateIgnoredEventCount: number;
  readonly confidenceScore: number;
  readonly degradationReasons: readonly string[];
  readonly activeHealthEventIds: readonly string[];
}
export const FeatureHealthSnapshotV1Schema = z
  .object({
    availability: FeatureAvailabilitySchema,
    isStale: z.boolean(),
    hasUnresolvedGap: z.boolean(),
    hasCollectorError: z.boolean(),
    lastEventReceiptTimestampMs: nullableTimestampMs,
    lastTradeReceiptTimestampMs: nullableTimestampMs,
    lastBookReceiptTimestampMs: nullableTimestampMs,
    tradeFreshnessAgeMs: nonNegInt.nullable(),
    bookFreshnessAgeMs: nonNegInt.nullable(),
    tradeSideCoverageRatio: unitRatio.nullable(),
    bookCoverageRatio: unitRatio,
    gapCount: nonNegInt,
    staleCount: nonNegInt,
    reconnectCount: nonNegInt,
    duplicateCount: nonNegInt,
    malformedEventCount: nonNegInt,
    outOfOrderEventCount: nonNegInt,
    lateIgnoredEventCount: nonNegInt,
    confidenceScore: unitRatio,
    degradationReasons: z.array(nonEmptyStr),
    activeHealthEventIds: z.array(nonEmptyStr),
  })
  .strict();

export interface FlowFeatureSnapshotV1 {
  readonly schemaVersion: "flow-feature-snapshot-v1";
  readonly asOfReceiptTimestampMs: number;
  readonly featureTimestampMs: number;
  readonly featureTimeSource: "exchange" | "receipt";
  readonly venue: "binance";
  readonly symbol: "BTC-USDT";
  readonly configVersion: string;
  readonly cvd: CvdSnapshotV1;
  readonly book: OrderBookSnapshotV1;
  readonly liquidity: LiquiditySnapshotV1;
  readonly response: ResponseEfficiencySnapshotV1;
  readonly classifications: readonly LevelClassificationRecordV1[];
  readonly health: FeatureHealthSnapshotV1;
  readonly evidenceEventIds: readonly string[];
}
export const FlowFeatureSnapshotV1Schema = z
  .object({
    schemaVersion: z.literal(FLOW_FEATURE_SNAPSHOT_SCHEMA_VERSION),
    asOfReceiptTimestampMs: timestampMs,
    featureTimestampMs: timestampMs,
    featureTimeSource: z.enum(["exchange", "receipt"]),
    venue: z.literal("binance"),
    symbol: z.literal("BTC-USDT"),
    configVersion: nonEmptyStr,
    cvd: CvdSnapshotV1Schema,
    book: OrderBookSnapshotV1Schema,
    liquidity: LiquiditySnapshotV1Schema,
    response: ResponseEfficiencySnapshotV1Schema,
    classifications: z.array(LevelClassificationRecordV1Schema),
    health: FeatureHealthSnapshotV1Schema,
    evidenceEventIds: z.array(nonEmptyStr),
  })
  .strict();
