import { z } from "zod";
import {
  FLOW_TIMEFRAMES,
  FlowTimeframeSchema,
  type FlowTimeframe,
} from "./contracts";

export const FLOW_ENGINE_CONFIG_VERSION = "flow-engine-config-v1" as const;

const posInt = z.number().int().positive();
const nonNegInt = z.number().int().nonnegative();
const posNum = z.number().finite().positive();
const positiveRatio = z.number().finite().gt(0).lte(1);
const nonEmptyStr = z.string().min(1);

export interface FlowEngineConfigV1 {
  readonly configVersion: string;
  readonly venue: "binance";
  readonly symbol: "BTC-USDT";
  readonly initialAnchorId: string;
  readonly rollingDurationWindowsMs: readonly number[];
  readonly rollingEventCountWindows: readonly number[];
  readonly maxRetainedPreviousAnchors: number;
  readonly candleTimeframes: readonly FlowTimeframe[];
  readonly maxRetainedCandlesPerTimeframe: number;
  readonly maxBookLevelsPerSide: number;
  readonly topNDepths: readonly number[];
  readonly bpsBands: readonly number[];
  readonly expectedBookDepthForFullCoverage: number;
  readonly liquidityWindowMs: number;
  readonly replenishmentMaxElapsedMs: number;
  readonly replenishmentPriceToleranceBps: number;
  readonly replenishmentMinRatio: number;
  readonly maxRetainedReplenishments: number;
  readonly tradeStaleThresholdMs: number;
  readonly bookStaleThresholdMs: number;
  readonly resetCvdOnGap: boolean;
  readonly levelProximityBps: number;
  readonly responseEfficiencyWindowsMs: readonly number[];
  readonly responseEfficiencyMinSamples: number;
  readonly responseEfficiencyMinQuoteVolume: number;
  readonly absorptionBaselineWindowMs: number;
  readonly absorptionCandidateWindowMs: number;
  readonly absorptionBaselineMinSamples: number;
  readonly absorptionCandidateMinTrades: number;
  readonly absorptionMinBaselineQuoteVolume: number;
  readonly elevatedFlowMultiplier: number;
  readonly maxAbsorptionProgressBps: number;
  readonly responseHorizonMs: number;
  readonly rejectionMoveAwayBps: number;
  readonly rejectionRegainToleranceBps: number;
  readonly acceptanceMoveBeyondBps: number;
  readonly acceptanceSustainedDurationMs: number;
  readonly acceptanceSustainedQuoteVolume: number;
  readonly maxRetainedClassifications: number;
  readonly minTradeSideCoverageRatio: number;
  readonly minBookCoverageRatio: number;
  readonly maxEvidenceEventIds: number;
  /**
   * Guaranteed in-memory deduplication horizon (FIFO ring buffer capacity).
   * Ingestion of duplicate event IDs within this horizon is transparently
   * deduplicated without altering state. Exact deduplication across unbounded
   * historical timelines is delegated to the M11.2 SQLite store. When internal
   * FIFO capacity is evicted, the engine records deduplication capacity exhaustion
   * and degrades health rather than silently assuming infinite memory.
   */
  readonly maxDeduplicationHistory: number;
  /**
   * Absolute bound on raw retained normalized trade history. Cumulative anchor
   * counters are strictly preserved indefinitely across eviction. When eviction
   * truncates a trade required for response-efficiency or classification duration
   * windows, affected windows are marked unavailable or degraded rather than
   * silently computing over truncated data.
   */
  readonly maxRetainedTrades: number;
}

export const FlowEngineConfigV1Schema = z
  .object({
    configVersion: nonEmptyStr,
    venue: z.literal("binance"),
    symbol: z.literal("BTC-USDT"),
    initialAnchorId: nonEmptyStr,
    rollingDurationWindowsMs: z.array(posInt).min(1),
    rollingEventCountWindows: z.array(posInt).min(1),
    maxRetainedPreviousAnchors: nonNegInt,
    candleTimeframes: z.array(FlowTimeframeSchema).min(1),
    maxRetainedCandlesPerTimeframe: posInt,
    maxBookLevelsPerSide: posInt,
    topNDepths: z.array(posInt).min(1),
    bpsBands: z.array(posNum).min(1),
    expectedBookDepthForFullCoverage: posInt,
    liquidityWindowMs: posInt,
    replenishmentMaxElapsedMs: posInt,
    replenishmentPriceToleranceBps: posNum,
    replenishmentMinRatio: positiveRatio,
    maxRetainedReplenishments: posInt,
    tradeStaleThresholdMs: posInt,
    bookStaleThresholdMs: posInt,
    resetCvdOnGap: z.boolean(),
    levelProximityBps: posNum,
    responseEfficiencyWindowsMs: z.array(posInt).min(1),
    responseEfficiencyMinSamples: posInt,
    responseEfficiencyMinQuoteVolume: posNum,
    absorptionBaselineWindowMs: posInt,
    absorptionCandidateWindowMs: posInt,
    absorptionBaselineMinSamples: posInt,
    absorptionCandidateMinTrades: posInt,
    absorptionMinBaselineQuoteVolume: posNum,
    elevatedFlowMultiplier: posNum,
    maxAbsorptionProgressBps: posNum,
    responseHorizonMs: posInt,
    rejectionMoveAwayBps: posNum,
    rejectionRegainToleranceBps: posNum,
    acceptanceMoveBeyondBps: posNum,
    acceptanceSustainedDurationMs: posInt,
    acceptanceSustainedQuoteVolume: posNum,
    maxRetainedClassifications: posInt,
    minTradeSideCoverageRatio: positiveRatio,
    minBookCoverageRatio: positiveRatio,
    maxEvidenceEventIds: posInt,
    maxDeduplicationHistory: posInt,
    maxRetainedTrades: posInt,
  })
  .strict()
  .superRefine((config, ctx) => {
    if (
      config.absorptionBaselineWindowMs <= config.absorptionCandidateWindowMs
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "absorptionBaselineWindowMs must be strictly greater than absorptionCandidateWindowMs",
        path: ["absorptionBaselineWindowMs"],
      });
    }
  });

function freezeFlowEngineConfig(
  config: FlowEngineConfigV1,
): FlowEngineConfigV1 {
  return Object.freeze({
    ...config,
    rollingDurationWindowsMs: Object.freeze([
      ...config.rollingDurationWindowsMs,
    ]),
    rollingEventCountWindows: Object.freeze([
      ...config.rollingEventCountWindows,
    ]),
    candleTimeframes: Object.freeze([...config.candleTimeframes]),
    topNDepths: Object.freeze([...config.topNDepths]),
    bpsBands: Object.freeze([...config.bpsBands]),
    responseEfficiencyWindowsMs: Object.freeze([
      ...config.responseEfficiencyWindowsMs,
    ]),
  });
}

export const DEFAULT_FLOW_ENGINE_CONFIG_V1: FlowEngineConfigV1 =
  freezeFlowEngineConfig({
    configVersion: FLOW_ENGINE_CONFIG_VERSION,
    venue: "binance",
    symbol: "BTC-USDT",
    initialAnchorId: "session-anchor-0",
    rollingDurationWindowsMs: [60_000, 300_000, 900_000],
    rollingEventCountWindows: [50, 200],
    maxRetainedPreviousAnchors: 8,
    candleTimeframes: [...FLOW_TIMEFRAMES],
    maxRetainedCandlesPerTimeframe: 120,
    maxBookLevelsPerSide: 50,
    topNDepths: [1, 5, 10, 20],
    bpsBands: [5, 10, 25, 50],
    expectedBookDepthForFullCoverage: 10,
    liquidityWindowMs: 60_000,
    replenishmentMaxElapsedMs: 15_000,
    replenishmentPriceToleranceBps: 2,
    replenishmentMinRatio: 0.5,
    maxRetainedReplenishments: 32,
    tradeStaleThresholdMs: 15_000,
    bookStaleThresholdMs: 10_000,
    resetCvdOnGap: false,
    levelProximityBps: 10,
    responseEfficiencyWindowsMs: [30_000, 60_000, 300_000],
    responseEfficiencyMinSamples: 3,
    responseEfficiencyMinQuoteVolume: 1_000,
    absorptionBaselineWindowMs: 300_000,
    absorptionCandidateWindowMs: 30_000,
    absorptionBaselineMinSamples: 5,
    absorptionCandidateMinTrades: 3,
    absorptionMinBaselineQuoteVolume: 5_000,
    elevatedFlowMultiplier: 1.5,
    maxAbsorptionProgressBps: 4,
    responseHorizonMs: 60_000,
    rejectionMoveAwayBps: 8,
    rejectionRegainToleranceBps: 2,
    acceptanceMoveBeyondBps: 6,
    acceptanceSustainedDurationMs: 15_000,
    acceptanceSustainedQuoteVolume: 25_000,
    maxRetainedClassifications: 64,
    minTradeSideCoverageRatio: 0.8,
    minBookCoverageRatio: 0.5,
    maxEvidenceEventIds: 128,
    maxDeduplicationHistory: 10_000,
    maxRetainedTrades: 20_000,
  });

export function createFlowEngineConfig(
  overrides?: Partial<FlowEngineConfigV1>,
): FlowEngineConfigV1 {
  const merged = {
    ...DEFAULT_FLOW_ENGINE_CONFIG_V1,
    ...(overrides ?? {}),
  };
  const parsed = FlowEngineConfigV1Schema.parse(merged);
  return freezeFlowEngineConfig(parsed);
}
