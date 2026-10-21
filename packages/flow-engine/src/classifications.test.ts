import { describe, expect, it } from "vitest";
import goldenFixture from "../fixtures/classifications-golden.json";
import {
  CLASSIFICATIONS_POLICY_VERSION,
  ClassificationsEngine,
  type ClassificationEvaluationInputV1,
} from "./classifications";
import { DEFAULT_FLOW_ENGINE_CONFIG_V1 } from "./configuration";
import {
  LevelClassificationRecordV1Schema,
  ResponseEfficiencySnapshotV1Schema,
  type FlowSide,
  type NormalizedTradeFlowV1,
  type RelevantLevelV1,
  type ReplenishmentEventV1,
} from "./contracts";
import {
  LEVEL_CONTEXT_POLICY_VERSION,
  doesLevelSupportAbsorptionSide,
  findActiveLevelsNearPrice,
  isLevelActiveAt,
  validateRelevantLevels,
} from "./level-context";
import {
  RESPONSE_EFFICIENCY_POLICY_VERSION,
  computeResponseEfficiencySnapshot,
  computeResponseEfficiencyWindow,
} from "./response-efficiency";

function makeTrade(
  id: string,
  ts: number,
  price: number,
  quoteVolume: number,
  takerSide: FlowSide | null = "buy",
): NormalizedTradeFlowV1 {
  const signed =
    takerSide === null
      ? null
      : takerSide === "buy"
        ? quoteVolume
        : -quoteVolume;
  return {
    eventId: id,
    receiptTimestampMs: ts,
    featureTimestampMs: ts,
    featureTimeSource: "exchange",
    price,
    baseQuantity: Number((quoteVolume / price).toFixed(8)),
    quoteVolume,
    takerSide,
    takerSideSource: takerSide === null ? "unknown" : "binance-buyer-maker",
    signedQuoteDelta: signed,
  };
}

function makeBaselineTrades(baseTs: number): NormalizedTradeFlowV1[] {
  return [0, 1, 2, 3, 4].map((i) =>
    makeTrade(
      `b-${String(i + 1)}`,
      baseTs + (i * 50 + 20) * 1_000,
      100_000,
      9_000,
      i % 2 === 0 ? "buy" : "sell",
    ),
  );
}

function makeAskReplenishment(ts: number, price: number): ReplenishmentEventV1 {
  return {
    replenishmentId: `rep-${String(ts)}`,
    side: "ask",
    removalEventId: `rem-${String(ts)}`,
    replenishEventId: `add-${String(ts)}`,
    removalTimestampMs: ts - 1_000,
    replenishTimestampMs: ts,
    elapsedMs: 1_000,
    referencePriceAtRemoval: price,
    removedPrice: price,
    replenishedPrice: price,
    priceDistanceBps: 0,
    removedQuantity: 1,
    replenishedQuantity: 1.2,
    replenishmentRatio: 1.2,
    classificationLabel: "observed-displayed-liquidity-replenishment",
  };
}

const FORBIDDEN_CLAIMS_PATTERN =
  /hidden\s+buyer|hidden\s+seller|iceberg|spoof/i;

describe("response-efficiency", () => {
  it("computes positive/negative response efficiency and handles degraded unknown trades", () => {
    expect(RESPONSE_EFFICIENCY_POLICY_VERSION).toBe(
      "flow-response-efficiency-v1",
    );
    const t0 = 1_700_000_000_000;
    const trades = [
      makeTrade("t1", t0 - 20_000, 100_000, 200_000, "buy"),
      makeTrade("t2", t0 - 10_000, 100_020, 200_000, "buy"),
      makeTrade("t3", t0, 100_050, 100_000, "buy"),
    ];
    const snap = computeResponseEfficiencySnapshot(trades, t0);
    expect(() => ResponseEfficiencySnapshotV1Schema.parse(snap)).not.toThrow();
    expect(snap.availability).toBe("available");
    const win30s = snap.windows[0];
    expect(win30s?.availability).toBe("available");
    expect(win30s?.signedPriceChangeBps).toBe(5);
    expect(win30s?.netEfficiencyBpsPerMillionQuote).toBe(10);
    expect(win30s?.directionalImpactBpsPerMillionQuote).toBe(10);
    expect(win30s?.absorptionDragScore).toBe(0.375);

    const degTrades = [...trades, makeTrade("t4", t0, 100_050, 50_000, null)];
    const degSnap = computeResponseEfficiencySnapshot(degTrades, t0);
    expect(degSnap.availability).toBe("degraded");
    expect(degSnap.windows[0]?.availability).toBe("degraded");
  });

  it("enforces explicit unavailability reasons on small denominator, few samples, low coverage, and stale/gap", () => {
    const t0 = 1_700_000_000_000;
    const balanced = [
      makeTrade("z1", t0 - 10_000, 100_000, 5_000, "buy"),
      makeTrade("z2", t0 - 5_000, 100_010, 5_000, "sell"),
      makeTrade("z3", t0, 100_010, 100, "buy"),
    ];
    const zeroDenom = computeResponseEfficiencyWindow(balanced, t0, 30_000);
    expect(zeroDenom.availability).toBe("unavailable");
    expect(zeroDenom.unavailableReason).toBe("zero-or-small-denominator");
    expect(zeroDenom.netEfficiencyBpsPerMillionQuote).toBeNull();

    const few = computeResponseEfficiencyWindow(
      balanced.slice(0, 2),
      t0,
      30_000,
    );
    expect(few.availability).toBe("unavailable");
    expect(few.unavailableReason).toBe("insufficient-samples");

    const lowCovTrades = [
      makeTrade("c1", t0 - 15_000, 100_000, 2_000, "buy"),
      makeTrade("c2", t0 - 10_000, 100_010, 2_000, "buy"),
      makeTrade("c3", t0 - 5_000, 100_020, 2_000, "buy"),
      makeTrade("c4", t0, 100_020, 10_000, null),
    ];
    const lowCov = computeResponseEfficiencyWindow(lowCovTrades, t0, 30_000);
    expect(lowCov.availability).toBe("unavailable");
    expect(lowCov.unavailableReason).toBe("low-directional-coverage");

    const cfg = DEFAULT_FLOW_ENGINE_CONFIG_V1;
    const gapped = computeResponseEfficiencyWindow(
      lowCovTrades.slice(0, 3),
      t0,
      30_000,
      cfg,
      { isStaleOrGapped: true },
    );
    expect(gapped.availability).toBe("unavailable");
    expect(gapped.unavailableReason).toBe("stale-or-gapped");
  });
});

describe("level-context", () => {
  it("validates levels, enforces no-look-ahead and active windows, checks role support, and sorts by proximity", () => {
    expect(LEVEL_CONTEXT_POLICY_VERSION).toBe("flow-level-context-v1");
    const validated = validateRelevantLevels([
      goldenFixture.levels.resistance100k,
      goldenFixture.levels.support100k,
      {
        id: "lvl-future-obs",
        price: 100_010,
        kind: "gamma-wall",
        observedAtMs: 1_700_000_500_000,
        validFromMs: 1_700_000_000_000,
        validUntilMs: null,
        sourceVersion: "v1",
      },
      {
        id: "lvl-expired",
        price: 100_005,
        kind: "max-pain",
        observedAtMs: 1_700_000_000_000,
        validFromMs: 1_700_000_000_000,
        validUntilMs: 1_700_000_200_000,
        sourceVersion: "v1",
      },
    ]);
    expect(validated).toHaveLength(4);
    const [resLvl, supLvl, futureObsLvl, expiredLvl] = validated as [
      RelevantLevelV1,
      RelevantLevelV1,
      RelevantLevelV1,
      RelevantLevelV1,
    ];

    expect(isLevelActiveAt(resLvl, 1_700_000_300_000)).toBe(true);
    expect(isLevelActiveAt(futureObsLvl, 1_700_000_300_000)).toBe(false);
    expect(isLevelActiveAt(expiredLvl, 1_700_000_300_000)).toBe(false);

    expect(doesLevelSupportAbsorptionSide(resLvl, "buy")).toBe(true);
    expect(doesLevelSupportAbsorptionSide(resLvl, "sell")).toBe(false);
    expect(doesLevelSupportAbsorptionSide(supLvl, "sell")).toBe(true);
    expect(doesLevelSupportAbsorptionSide(supLvl, "buy")).toBe(false);

    const near = findActiveLevelsNearPrice(
      validated,
      99_995,
      1_700_000_300_000,
      10,
    );
    expect(near.map((m) => m.level.id)).toEqual([
      "lvl-res-100k",
      "lvl-sup-100k",
    ]);
    expect(near[0]?.distanceBps).toBe(0.5);
  });
});

describe("classifications engine", () => {
  const baseTs = goldenFixture.baseTimestampMs;
  const candTs = goldenFixture.candidateTimestampMs;
  const [resLevel, supLevel] = validateRelevantLevels([
    goldenFixture.levels.resistance100k,
    goldenFixture.levels.support100k,
  ]) as [RelevantLevelV1, RelevantLevelV1];

  function buildInput(
    overrides: Partial<ClassificationEvaluationInputV1>,
  ): ClassificationEvaluationInputV1 {
    const cTrades = [
      makeTrade("c1", candTs - 20_000, 99_980, 5_000, "buy"),
      makeTrade("c2", candTs - 10_000, 99_990, 5_000, "buy"),
      makeTrade("c3", candTs, 99_995, 5_000, "buy"),
    ];
    return {
      asOfReceiptTimestampMs: candTs,
      featureTimestampMs: candTs,
      referencePrice: 99_995,
      latestTradeEventId: "c3",
      trades: [...makeBaselineTrades(baseTs), ...cTrades],
      levels: [resLevel],
      tradeSideCoverageRatio: 1,
      bookCoverageRatio: 1,
      recentReplenishments: [makeAskReplenishment(candTs - 5_000, 100_000)],
      hasUnresolvedGap: false,
      isStale: false,
      ...overrides,
    };
  }

  it("prevents false-positive absorption candidates when any required condition is missing", () => {
    expect(CLASSIFICATIONS_POLICY_VERSION).toBe("flow-classifications-v1");
    const engine = new ClassificationsEngine();
    const baseTrades = makeBaselineTrades(baseTs);

    // 1. Flow below elevatedFlowMultiplier
    const lowFlow = [
      ...baseTrades,
      makeTrade("l1", candTs - 20_000, 99_980, 2_000, "buy"),
      makeTrade("l2", candTs - 10_000, 99_990, 2_000, "buy"),
      makeTrade("l3", candTs, 99_995, 2_000, "buy"),
    ];
    expect(engine.evaluate(buildInput({ trades: lowFlow }))).toHaveLength(0);

    // 2. Price progress exceeds maxAbsorptionProgressBps
    const fastProg = [
      ...baseTrades,
      makeTrade("p1", candTs - 20_000, 99_920, 5_000, "buy"),
      makeTrade("p2", candTs - 10_000, 99_960, 5_000, "buy"),
      makeTrade("p3", candTs, 99_995, 5_000, "buy"),
    ];
    expect(engine.evaluate(buildInput({ trades: fastProg }))).toHaveLength(0);

    // 3. Distance exceeds levelProximityBps
    expect(
      engine.evaluate(buildInput({ referencePrice: 99_850 })),
    ).toHaveLength(0);

    // 4. Insufficient baseline samples
    const shortBase = [
      ...baseTrades.slice(0, 3),
      makeTrade("c1", candTs - 20_000, 99_980, 5_000, "buy"),
      makeTrade("c2", candTs - 10_000, 99_990, 5_000, "buy"),
      makeTrade("c3", candTs, 99_995, 5_000, "buy"),
    ];
    expect(engine.evaluate(buildInput({ trades: shortBase }))).toHaveLength(0);
  });

  it("replays golden scenarios with strict response horizon and verifies audit notes and schema", () => {
    for (const scenario of goldenFixture.scenarios) {
      const engine = new ClassificationsEngine();
      const level =
        scenario.levelKey === "resistance100k" ? resLevel : supLevel;
      const side = scenario.candidateSide as FlowSide;
      const candTrades = scenario.candidatePrices.map((px, idx) =>
        makeTrade(
          `${scenario.name}-c-${String(idx)}`,
          candTs - (2 - idx) * 10_000,
          px,
          scenario.candidateQuoteEach,
          side,
        ),
      );
      const baseTrades = makeBaselineTrades(baseTs);
      const step1 = engine.evaluate(
        buildInput({
          referencePrice: scenario.candidatePrices[2] ?? 100_000,
          trades: [...baseTrades, ...candTrades],
          levels: [level],
        }),
      );
      expect(step1).toHaveLength(1);
      expect(step1[0]?.lifecycle).toBe("pending");
      expect(step1[0]?.outcome).toBe(scenario.expectedPendingClassification);

      const mid = scenario.midHorizonTrade;
      const midTrade = makeTrade(
        `${scenario.name}-mid`,
        mid.timestampMs,
        mid.price,
        mid.quoteVolume,
        mid.side as FlowSide,
      );
      const step2 = engine.evaluate(
        buildInput({
          asOfReceiptTimestampMs: mid.timestampMs,
          featureTimestampMs: mid.timestampMs,
          referencePrice: mid.price,
          trades: [...baseTrades, ...candTrades, midTrade],
          levels: [level],
        }),
      );
      expect(step2[0]?.lifecycle).toBe("pending");
      expect(step2[0]?.finalizedTimestampMs).toBeNull();

      const hTrades = scenario.horizonTrades.map((ht, idx) =>
        makeTrade(
          `${scenario.name}-h-${String(idx)}`,
          ht.timestampMs,
          ht.price,
          ht.quoteVolume,
          ht.side as FlowSide,
        ),
      );
      const lastH = scenario.horizonTrades[scenario.horizonTrades.length - 1]!;
      const step3 = engine.evaluate(
        buildInput({
          asOfReceiptTimestampMs: goldenFixture.horizonTimestampMs,
          featureTimestampMs: goldenFixture.horizonTimestampMs,
          referencePrice: lastH.price,
          trades: [...baseTrades, ...candTrades, ...hTrades],
          levels: [level],
        }),
      );
      const finalRec = step3[0]!;
      expect(() =>
        LevelClassificationRecordV1Schema.parse(finalRec),
      ).not.toThrow();
      expect(finalRec.lifecycle).toBe("finalized");
      expect(finalRec.outcome).toBe(scenario.expectedFinalOutcome);
      expect(finalRec.finalizedTimestampMs).toBe(
        goldenFixture.horizonTimestampMs,
      );
      expect(finalRec.evidenceEventIds.length).toBeGreaterThan(0);
      expect(finalRec.componentScores.relativeRankingStrength).toBeGreaterThan(
        0,
      );
      expect(finalRec.auditNote).not.toMatch(FORBIDDEN_CLAIMS_PATTERN);
    }
  });

  it("finalizes as unavailable on gap/low-coverage or level version change during horizon", () => {
    const engine = new ClassificationsEngine();
    const gapRes = engine.evaluate(buildInput({ hasUnresolvedGap: true }));
    expect(gapRes).toHaveLength(1);
    expect(gapRes[0]?.lifecycle).toBe("finalized");
    expect(gapRes[0]?.outcome).toBe("unavailable");
    expect(gapRes[0]?.unavailableReason).toBe("unresolved-gap");

    engine.reset();
    const pending = engine.evaluate(buildInput({}));
    expect(pending[0]?.lifecycle).toBe("pending");

    const updatedLevel: RelevantLevelV1 = {
      ...resLevel,
      sourceVersion: "gex-v2",
    };
    const afterVer = engine.evaluate(
      buildInput({
        asOfReceiptTimestampMs: candTs + 15_000,
        featureTimestampMs: candTs + 15_000,
        levels: [updatedLevel],
      }),
    );
    expect(afterVer[0]?.lifecycle).toBe("finalized");
    expect(afterVer[0]?.outcome).toBe("unavailable");
    expect(afterVer[0]?.unavailableReason).toBe(
      "level-expired-or-version-changed",
    );
  });
});
