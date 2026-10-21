import { describe, expect, it } from "vitest";
import {
  BASIS_POINTS_SCALE,
  DECIMAL_POLICY_VERSION,
  DECIMAL_SCALE_DECIMALS,
  MAX_SAFE_DECIMAL_MAGNITUDE,
  QUOTE_MILLION_UNIT,
  computeAbsoluteBpsDistance,
  computeQuoteVolume,
  computeSignedBpsChange,
  parseNonNegativeDecimal,
  parsePositiveDecimal,
  roundDecimal,
  safeDivide,
  validatePositiveFiniteNumber,
} from "./decimal";
import {
  EFFECTIVE_TIME_POLICY_VERSION,
  areSequencesEqual,
  evaluateSequenceTransition,
  isReplayEligible,
  isValidTimestampMs,
  resolveEffectiveTime,
} from "./effective-time";
import {
  DEFAULT_FLOW_ENGINE_CONFIG_V1,
  FLOW_ENGINE_CONFIG_VERSION,
  FlowEngineConfigV1Schema,
  createFlowEngineConfig,
} from "./configuration";
import {
  FLOW_FEATURE_SNAPSHOT_SCHEMA_VERSION,
  FLOW_TIMEFRAMES,
  FLOW_TIMEFRAME_DURATION_MS,
  FlowFeatureSnapshotV1Schema,
  RelevantLevelV1Schema,
  ResponseUnavailableReasonSchema,
  type FlowFeatureSnapshotV1,
} from "./contracts";

describe("decimal policy", () => {
  it("exports policy version and numeric scale constants", () => {
    expect(DECIMAL_POLICY_VERSION).toBe("flow-decimal-policy-v1");
    expect(MAX_SAFE_DECIMAL_MAGNITUDE).toBe(1e15);
    expect(DECIMAL_SCALE_DECIMALS).toBe(8);
    expect(BASIS_POINTS_SCALE).toBe(10_000);
    expect(QUOTE_MILLION_UNIT).toBe(1_000_000);
  });

  it("parses positive and non-negative decimals with strict formatting and bounds", () => {
    expect(parsePositiveDecimal("68000.125")).toEqual({
      ok: true,
      value: 68000.125,
    });
    expect(parsePositiveDecimal("1e-8")).toEqual({ ok: true, value: 1e-8 });
    expect(parsePositiveDecimal("1000000000000000")).toEqual({
      ok: true,
      value: 1e15,
    });
    expect(parsePositiveDecimal("0")).toEqual({
      ok: false,
      reason: "non-positive",
    });
    expect(parsePositiveDecimal("-0")).toEqual({
      ok: false,
      reason: "non-positive",
    });
    expect(parsePositiveDecimal("-1.5")).toEqual({
      ok: false,
      reason: "non-positive",
    });
    expect(parsePositiveDecimal("1e16")).toEqual({
      ok: false,
      reason: "magnitude-overflow",
    });
    expect(parsePositiveDecimal("1e309")).toEqual({
      ok: false,
      reason: "non-finite",
    });
    expect(parsePositiveDecimal(" 10.5")).toEqual({
      ok: false,
      reason: "invalid-format",
    });
    expect(parsePositiveDecimal("10.5 ")).toEqual({
      ok: false,
      reason: "invalid-format",
    });
    expect(parsePositiveDecimal("NaN")).toEqual({
      ok: false,
      reason: "invalid-format",
    });
    expect(parsePositiveDecimal(100)).toEqual({
      ok: false,
      reason: "invalid-format",
    });

    expect(parseNonNegativeDecimal("0")).toEqual({ ok: true, value: 0 });
    const negZero = parseNonNegativeDecimal("-0");
    expect(negZero).toEqual({ ok: true, value: 0 });
    expect(Object.is(negZero.ok ? negZero.value : -1, -0)).toBe(false);
    expect(parseNonNegativeDecimal("0.00000000")).toEqual({
      ok: true,
      value: 0,
    });
    expect(parseNonNegativeDecimal("42.5")).toEqual({ ok: true, value: 42.5 });
    expect(parseNonNegativeDecimal("-0.0001")).toEqual({
      ok: false,
      reason: "negative",
    });
    expect(parseNonNegativeDecimal("1e16")).toEqual({
      ok: false,
      reason: "magnitude-overflow",
    });
  });

  it("validates finite numbers, rounds decimals, and computes quote volumes and bps safely", () => {
    expect(Object.is(roundDecimal(-0), -0)).toBe(false);
    expect(roundDecimal(0.1 + 0.2, 8)).toBe(0.3);
    expect(roundDecimal(-1.234567891, 8)).toBe(-1.23456789);

    expect(validatePositiveFiniteNumber(100)).toEqual({ ok: true, value: 100 });
    expect(validatePositiveFiniteNumber(0)).toEqual({
      ok: false,
      reason: "non-positive",
    });
    expect(validatePositiveFiniteNumber(Number.NaN)).toEqual({
      ok: false,
      reason: "non-finite",
    });
    expect(validatePositiveFiniteNumber(1e16)).toEqual({
      ok: false,
      reason: "magnitude-overflow",
    });

    expect(computeQuoteVolume(68_000, 0.25)).toEqual({
      ok: true,
      value: 17_000,
    });
    expect(computeQuoteVolume(1e10, 1e6)).toEqual({
      ok: false,
      reason: "magnitude-overflow",
    });
    expect(computeQuoteVolume(0, 1)).toEqual({
      ok: false,
      reason: "non-positive",
    });

    expect(safeDivide(10, 2)).toBe(5);
    expect(safeDivide(0, -5)).toBe(0);
    expect(Object.is(safeDivide(0, -5), -0)).toBe(false);
    expect(safeDivide(10, 0)).toBeNull();
    expect(safeDivide(10, 1e-15)).toBeNull();
    expect(safeDivide(Number.POSITIVE_INFINITY, 2)).toBeNull();

    expect(computeSignedBpsChange(10_000, 10_015)).toBe(15);
    expect(computeSignedBpsChange(10_000, 9_985)).toBe(-15);
    expect(computeSignedBpsChange(0, 100)).toBeNull();

    expect(computeAbsoluteBpsDistance(10_010, 10_000)).toBe(10);
    expect(computeAbsoluteBpsDistance(9_990, 10_000, 10_000)).toBe(10);
    expect(computeAbsoluteBpsDistance(-1, 10_000)).toBeNull();
  });
});

describe("effective-time and sequence transition policy", () => {
  it("enforces receipt-time replay cutoff and exchange-first feature timestamps", () => {
    expect(EFFECTIVE_TIME_POLICY_VERSION).toBe("flow-effective-time-v1");
    expect(isValidTimestampMs(0)).toBe(true);
    expect(isValidTimestampMs(1_700_000_000_000)).toBe(true);
    expect(isValidTimestampMs(-1)).toBe(false);
    expect(isValidTimestampMs(1.5)).toBe(false);

    expect(isReplayEligible(1_000)).toBe(true);
    expect(isReplayEligible(1_000, null)).toBe(true);
    expect(isReplayEligible(1_000, 1_000)).toBe(true);
    expect(isReplayEligible(1_001, 1_000)).toBe(false);
    expect(isReplayEligible(-1, 1_000)).toBe(false);

    expect(
      resolveEffectiveTime({
        exchangeTimestampMs: 1_700_000_000_100,
        receiptTimestampMs: 1_700_000_000_150,
      }),
    ).toEqual({
      receiptTimestampMs: 1_700_000_000_150,
      exchangeTimestampMs: 1_700_000_000_100,
      featureTimestampMs: 1_700_000_000_100,
      featureTimeSource: "exchange",
    });

    expect(
      resolveEffectiveTime({
        exchangeTimestampMs: null,
        receiptTimestampMs: 1_700_000_000_150,
      }),
    ).toEqual({
      receiptTimestampMs: 1_700_000_000_150,
      exchangeTimestampMs: null,
      featureTimestampMs: 1_700_000_000_150,
      featureTimeSource: "receipt",
    });
  });

  it("evaluates numeric and opaque string sequence transitions without ordering strings", () => {
    expect(areSequencesEqual(10, 10)).toBe(true);
    expect(areSequencesEqual("seq-10", "seq-10")).toBe(true);
    expect(areSequencesEqual("10", 10)).toBe(false);
    expect(areSequencesEqual(null, null)).toBe(false);

    expect(evaluateSequenceTransition(null, 100)).toEqual({
      kind: "initial",
      previousSequence: null,
      currentSequence: 100,
      missingCount: null,
    });
    expect(evaluateSequenceTransition(100, 101)).toEqual({
      kind: "contiguous",
      previousSequence: 100,
      currentSequence: 101,
      missingCount: null,
    });
    expect(evaluateSequenceTransition(100, 100)).toEqual({
      kind: "duplicate",
      previousSequence: 100,
      currentSequence: 100,
      missingCount: null,
    });
    expect(evaluateSequenceTransition(100, 105)).toEqual({
      kind: "gap",
      previousSequence: 100,
      currentSequence: 105,
      missingCount: 4,
    });
    expect(evaluateSequenceTransition(100, 99)).toEqual({
      kind: "out-of-order",
      previousSequence: 100,
      currentSequence: 99,
      missingCount: null,
    });
    expect(evaluateSequenceTransition(100, 105, 100)).toEqual({
      kind: "contiguous",
      previousSequence: 100,
      currentSequence: 105,
      missingCount: null,
    });
    expect(evaluateSequenceTransition(100, 108, 103)).toEqual({
      kind: "gap",
      previousSequence: 100,
      currentSequence: 108,
      missingCount: 3,
    });

    expect(evaluateSequenceTransition("seq-b", "seq-a")).toEqual({
      kind: "opaque-unorderable",
      previousSequence: "seq-b",
      currentSequence: "seq-a",
      missingCount: null,
    });
    expect(evaluateSequenceTransition("seq-a", "seq-a")).toEqual({
      kind: "duplicate",
      previousSequence: "seq-a",
      currentSequence: "seq-a",
      missingCount: null,
    });
    expect(evaluateSequenceTransition("seq-a", "seq-b", "seq-a")).toEqual({
      kind: "contiguous",
      previousSequence: "seq-a",
      currentSequence: "seq-b",
      missingCount: null,
    });
    expect(evaluateSequenceTransition("seq-a", "seq-c", "seq-b")).toEqual({
      kind: "gap",
      previousSequence: "seq-a",
      currentSequence: "seq-c",
      missingCount: null,
    });
    expect(evaluateSequenceTransition(100, "seq-101")).toEqual({
      kind: "opaque-unorderable",
      previousSequence: 100,
      currentSequence: "seq-101",
      missingCount: null,
    });
  });
});

describe("flow-engine configuration and contracts", () => {
  it("validates and freezes default and overridden configurations", () => {
    expect(FLOW_ENGINE_CONFIG_VERSION).toBe("flow-engine-config-v1");
    expect(Object.isFrozen(DEFAULT_FLOW_ENGINE_CONFIG_V1)).toBe(true);
    expect(
      Object.isFrozen(DEFAULT_FLOW_ENGINE_CONFIG_V1.rollingDurationWindowsMs),
    ).toBe(true);
    expect(
      FlowEngineConfigV1Schema.safeParse(DEFAULT_FLOW_ENGINE_CONFIG_V1).success,
    ).toBe(true);

    const custom = createFlowEngineConfig({
      levelProximityBps: 12,
      resetCvdOnGap: true,
    });
    expect(custom.levelProximityBps).toBe(12);
    expect(custom.resetCvdOnGap).toBe(true);
    expect(Object.isFrozen(custom)).toBe(true);

    expect(() =>
      createFlowEngineConfig({ minTradeSideCoverageRatio: 0 }),
    ).toThrow();
    expect(() =>
      createFlowEngineConfig({ minBookCoverageRatio: 1.2 }),
    ).toThrow();
    expect(DEFAULT_FLOW_ENGINE_CONFIG_V1.maxDeduplicationHistory).toBe(10_000);
    expect(DEFAULT_FLOW_ENGINE_CONFIG_V1.maxRetainedTrades).toBe(20_000);
    expect(() =>
      createFlowEngineConfig({ maxDeduplicationHistory: -1 }),
    ).toThrow();
    expect(() => createFlowEngineConfig({ maxRetainedTrades: 0 })).toThrow();
    expect(ResponseUnavailableReasonSchema.parse("truncated-window")).toBe(
      "truncated-window",
    );
  });

  it("validates RelevantLevelV1Schema and FlowFeatureSnapshotV1Schema", () => {
    expect(FLOW_TIMEFRAMES).toHaveLength(7);
    expect(FLOW_TIMEFRAME_DURATION_MS["1m"]).toBe(60_000);
    expect(FLOW_TIMEFRAME_DURATION_MS["1w"]).toBe(604_800_000);

    const validLevel = {
      id: "gamma-wall-68000",
      price: 68_000,
      kind: "gamma-wall" as const,
      observedAtMs: 1_700_000_000_000,
      validFromMs: 1_700_000_000_000,
      validUntilMs: 1_700_003_600_000,
      sourceVersion: "gex-v1",
      role: "resistance" as const,
    };
    expect(RelevantLevelV1Schema.safeParse(validLevel).success).toBe(true);
    expect(
      RelevantLevelV1Schema.safeParse({
        ...validLevel,
        validUntilMs: 1_699_999_999_999,
      }).success,
    ).toBe(false);

    const sampleSnapshot: FlowFeatureSnapshotV1 = {
      schemaVersion: FLOW_FEATURE_SNAPSHOT_SCHEMA_VERSION,
      asOfReceiptTimestampMs: 1_700_000_060_000,
      featureTimestampMs: 1_700_000_059_900,
      featureTimeSource: "exchange",
      venue: "binance",
      symbol: "BTC-USDT",
      configVersion: FLOW_ENGINE_CONFIG_VERSION,
      cvd: {
        availability: "available",
        activeAnchor: {
          anchorId: "session-anchor-0",
          anchorTimestampMs: 1_700_000_000_000,
          resetReason: "initial",
          buyQuoteVolume: 100_000,
          sellQuoteVolume: 40_000,
          unknownSideQuoteVolume: 0,
          totalQuoteVolume: 140_000,
          buyBaseQuantity: 1.5,
          sellBaseQuantity: 0.6,
          unknownSideBaseQuantity: 0,
          totalBaseQuantity: 2.1,
          rawCvdQuote: 60_000,
          includedTradeCount: 10,
          unknownSideTradeCount: 0,
          malformedTradeCount: 0,
          directionalCoverageRatio: 1,
          availability: "available",
        },
        previousAnchors: [],
        rollingByDuration: [],
        rollingByEventCount: [],
        candleBuckets: {
          "1m": [],
          "5m": [],
          "15m": [],
          "1h": [],
          "4h": [],
          "1d": [],
          "1w": [],
        },
        lastTradePrice: 68_000,
        lastTradeTimestampMs: 1_700_000_059_900,
      },
      book: {
        availability: "available",
        statusReason: "ok",
        lastUpdateTimestampMs: 1_700_000_059_900,
        lastReceiptTimestampMs: 1_700_000_060_000,
        lastSequence: 1001,
        bestBid: { price: 67_999, quantity: 2, quoteNotional: 135_998 },
        bestAsk: { price: 68_001, quantity: 1.5, quoteNotional: 102_001.5 },
        midPrice: 68_000,
        spreadAmount: 2,
        spreadBps: 0.294118,
        microprice: 68_000.14285714,
        retainedBidLevels: 10,
        retainedAskLevels: 10,
        bookCoverageRatio: 1,
        topNImbalances: [],
        bpsBandImbalances: [],
      },
      liquidity: {
        availability: "available",
        referencePrice: 68_000,
        windowDurationMs: 60_000,
        bands: [],
        recentReplenishments: [],
        executedAggressiveBuyQuoteVolume: 100_000,
        executedAggressiveSellQuoteVolume: 40_000,
        cancellationOrRemovalBidQuantity: 0,
        cancellationOrRemovalAskQuantity: 0,
      },
      response: {
        availability: "available",
        windows: [],
      },
      classifications: [],
      health: {
        availability: "available",
        isStale: false,
        hasUnresolvedGap: false,
        hasCollectorError: false,
        lastEventReceiptTimestampMs: 1_700_000_060_000,
        lastTradeReceiptTimestampMs: 1_700_000_060_000,
        lastBookReceiptTimestampMs: 1_700_000_060_000,
        tradeFreshnessAgeMs: 0,
        bookFreshnessAgeMs: 0,
        tradeSideCoverageRatio: 1,
        bookCoverageRatio: 1,
        gapCount: 0,
        staleCount: 0,
        reconnectCount: 0,
        duplicateCount: 0,
        malformedEventCount: 0,
        outOfOrderEventCount: 0,
        lateIgnoredEventCount: 0,
        confidenceScore: 1,
        degradationReasons: [],
        activeHealthEventIds: [],
      },
      evidenceEventIds: ["market-event-v1:0123456789abcdef"],
    };

    expect(FlowFeatureSnapshotV1Schema.safeParse(sampleSnapshot).success).toBe(
      true,
    );
    expect(
      FlowFeatureSnapshotV1Schema.safeParse({
        ...sampleSnapshot,
        venue: "deribit",
      }).success,
    ).toBe(false);
  });
});
