import { describe, expect, it } from "vitest";
import { convergeDecision } from "./convergence";
import {
  DecisionAssessmentV1Schema,
  DecisionContextV1Schema,
  type DecisionAssessmentV1,
  type DecisionChoice,
  type DecisionContextV1,
} from "./decision-contracts";
import { buildDecisionContext } from "./decision-context-builder";
import { buildMarketState } from "./market-state-builder";
import { evaluateDecisionRules } from "./rules-provider";
import {
  buildShadowDecisionRecord,
  InMemoryDecisionStore,
} from "./shadow-record";
import {
  baseInput,
  downtrend,
  FRESH_MS,
  makeFlowSnapshot,
  NOW,
  uptrend,
} from "./test-support/fixtures";

function recordedAssessment(
  context: DecisionContextV1,
  choice: DecisionChoice,
  confidence = 0.95,
): DecisionAssessmentV1 {
  const base = evaluateDecisionRules(context);
  const distribution: Record<DecisionChoice, number> = {
    "no-trade": 0,
    "watch-long": 0,
    "watch-short": 0,
    "confirm-long": 0,
    "confirm-short": 0,
    "insufficient-data": 0,
  };
  distribution[choice] = 1;
  return DecisionAssessmentV1Schema.parse({
    ...base,
    assessmentId: `recorded-${context.contextId}-${choice}`,
    provider: "recorded-v1",
    providerVersion: "recorded-test-v1",
    promptVersion: "recorded-test-v1",
    choice,
    distribution,
    confidence,
    isStale: false,
  });
}

describe("M11.5 Deterministic Decision Baseline", () => {
  it("produces identical context identity and assessment for identical state inputs", () => {
    const stateA = buildMarketState(baseInput());
    const stateB = buildMarketState(baseInput());

    const contextA = buildDecisionContext(stateA);
    const contextB = buildDecisionContext(stateB);

    expect(DecisionContextV1Schema.parse(contextA)).toEqual(contextA);
    expect(contextA.contextId).toBe(contextB.contextId);
    expect(contextA).toEqual(contextB);
    expect(Object.isFrozen(contextA)).toBe(true);

    const assessA = evaluateDecisionRules(contextA);
    const assessB = evaluateDecisionRules(contextB);

    expect(assessA.assessmentId).toBe(assessB.assessmentId);
    expect(assessA.choice).toBe(assessB.choice);
    expect(assessA.reasonCodes).toEqual(assessB.reasonCodes);
    expect(assessA).toEqual(assessB);
    expect(Object.isFrozen(assessA)).toBe(true);
  });

  it("rejects unknown decision choices and malformed probabilities", () => {
    const validAssessment = evaluateDecisionRules(
      buildDecisionContext(buildMarketState(baseInput())),
    );

    // Unknown choice
    expect(() =>
      DecisionAssessmentV1Schema.parse({
        ...validAssessment,
        choice: "buy-now" as unknown as DecisionChoice,
      }),
    ).toThrow();

    expect(() =>
      DecisionAssessmentV1Schema.parse({
        ...validAssessment,
        completedAtMs: validAssessment.startedAtMs - 1,
      }),
    ).toThrow(/completedAtMs/);

    expect(() =>
      DecisionAssessmentV1Schema.parse({
        ...validAssessment,
        latencyMs: 99,
      }),
    ).toThrow(/latencyMs/);

    expect(() =>
      DecisionAssessmentV1Schema.parse({
        ...validAssessment,
        choice: "watch-long",
      }),
    ).toThrow(/maximum-probability/);

    // Probabilities not summing to 1.0
    expect(() =>
      DecisionAssessmentV1Schema.parse({
        ...validAssessment,
        distribution: {
          ...validAssessment.distribution,
          "no-trade": 0.9, // sum is now 1.8
        },
      }),
    ).toThrow();

    // Negative probability
    expect(() =>
      DecisionAssessmentV1Schema.parse({
        ...validAssessment,
        distribution: {
          ...validAssessment.distribution,
          "no-trade": -0.1,
        },
      }),
    ).toThrow();
  });

  it("yields insufficient-data when required data is missing or stale", () => {
    // Missing candle input
    const missingCandlesState = buildMarketState(baseInput({ candles: null }));
    const missingContext = buildDecisionContext(missingCandlesState);
    const assessMissing = evaluateDecisionRules(missingContext);
    expect(assessMissing.choice).toBe("insufficient-data");
    expect(assessMissing.confidence).toBeNull();
    expect(assessMissing.reasonCodes).toContain(
      "INSUFFICIENT_DATA_UNAVAILABLE",
    );

    // Stale flow input
    const staleFlowState = buildMarketState(
      baseInput({
        flow: {
          staleAfterMs: 1_000,
          snapshot: makeFlowSnapshot(Array(10).fill("buy"), NOW - 10_000),
        },
      }),
    );
    const staleContext = buildDecisionContext(staleFlowState);
    const assessStale = evaluateDecisionRules(staleContext);
    expect(assessStale.choice).toBe("insufficient-data");
    expect(assessStale.reasonCodes).toContain("DATA_INPUTS_STALE");
  });

  it("enforces account-risk prohibitions unconditionally to no-trade", () => {
    const prohibitedState = buildMarketState(
      baseInput({
        accountRisk: {
          asOfMs: NOW - 1000,
          staleAfterMs: FRESH_MS,
          state: "prohibited",
          reasonCodes: ["MAX_DAILY_LOSS_EXCEEDED"],
        },
      }),
    );

    const context = buildDecisionContext(prohibitedState);
    const assessment = evaluateDecisionRules(context);
    expect(assessment.choice).toBe("no-trade");
    expect(assessment.reasonCodes).toContain("ACCOUNT_RISK_PROHIBITED");

    const converged = convergeDecision(context, assessment);
    expect(converged.choice).toBe("no-trade");
    expect(converged.ruleStepTriggered).toBe(2);
    expect(converged.reasonCodes).toContain("CONVERGENCE_ACCOUNT_PROHIBITED");
  });

  it("enforces invalid trade geometry vetoes unconditionally to no-trade", () => {
    const invalidLongState = buildMarketState(
      baseInput({
        proposedTrade: {
          asOfMs: NOW - 1000,
          staleAfterMs: FRESH_MS,
          side: "long",
          entryPrice: 67_000,
          stopPrice: 67_200, // Invalid: stop >= entry
          targetPrice: 68_000,
          entrySource: "market-price",
          stopSource: "swing-low",
          targetSource: "resistance-zone",
          rewardRiskRatio: 2,
          rewardRiskFormulaVersion: "risk-terminal-v1",
        },
      }),
    );

    const context = buildDecisionContext(invalidLongState);
    const assessment = evaluateDecisionRules(context);
    expect(assessment.choice).toBe("no-trade");
    expect(assessment.reasonCodes).toContain("GEOMETRY_INVALID");

    const converged = convergeDecision(context, assessment);
    expect(converged.choice).toBe("no-trade");
    expect(converged.ruleStepTriggered).toBe(3);
  });

  it("prevents confirmation when contradictory evidence is present", () => {
    // Bullish 4h but bearish 15m and conflicting flow
    const conflictState = buildMarketState(
      baseInput({
        structure: {
          h4: uptrend("4h"),
          h1: uptrend("1h"),
          m15: downtrend("15m"),
        },
        flow: {
          staleAfterMs: FRESH_MS,
          snapshot: makeFlowSnapshot(Array(10).fill("sell")), // selling flow
        },
      }),
    );

    const context = buildDecisionContext(conflictState);
    expect(context.contradictions.length).toBeGreaterThan(0);

    const assessment = evaluateDecisionRules(context);
    expect(assessment.choice).not.toBe("confirm-long");
    expect(assessment.choice).toBe("no-trade");

    // Even if an assessment had confirm-long, convergence step 5 strictly vetoes it
    const spoofedConfirm = recordedAssessment(context, "confirm-long");
    const converged = convergeDecision(context, spoofedConfirm);
    expect(converged.choice).toBe("no-trade");
    expect(converged.ruleStepTriggered).toBe(5);
    expect(converged.reasonCodes).toContain(
      "CONVERGENCE_CONTRADICTIONS_PROHIBIT_CONFIRM",
    );
  });

  it("evaluates valid long-watch conditions to watch-long and valid confirm to confirm-long", () => {
    // 1. Long watch setup: bullish structure near support, but mixed/neutral flow
    const watchLongInput = baseInput({
      flow: {
        staleAfterMs: FRESH_MS,
        snapshot: makeFlowSnapshot(["buy", "sell", "buy", "sell"]), // balanced flow
      },
    });
    const watchState = buildMarketState(watchLongInput);
    const watchContext = buildDecisionContext(watchState);
    const watchAssessment = evaluateDecisionRules(watchContext);

    expect(watchAssessment.choice).toBe("watch-long");
    expect(watchAssessment.reasonCodes).toContain("WATCHING_LONG_SETUP");

    // 2. Full confirm setup: bullish structure, strong buy flow, support at AVWAP
    const confirmLongInput = baseInput({
      flow: {
        staleAfterMs: FRESH_MS,
        snapshot: makeFlowSnapshot(Array(10).fill("buy")), // strong buy flow
      },
    });
    const confirmState = buildMarketState(confirmLongInput);
    const confirmContext = buildDecisionContext(confirmState);
    const confirmAssessment = evaluateDecisionRules(confirmContext);

    expect(confirmAssessment.choice).toBe("confirm-long");
    expect(confirmAssessment.reasonCodes).toContain(
      "STRUCTURE_FLOW_LOCATION_CONFIRMED",
    );
    expect(confirmAssessment.confidence).toBeGreaterThan(
      watchAssessment.confidence ?? 0,
    );
  });

  it("evaluates valid short-watch conditions to watch-short and confirm to confirm-short", () => {
    const shortInput = baseInput({
      structure: {
        h4: downtrend("4h"),
        h1: downtrend("1h"),
        m15: downtrend("15m"),
      },
      candles: {
        asOfMs: NOW - 1000,
        staleAfterMs: FRESH_MS,
        sourceVersion: "binance-spot-candle-v1",
        lastPrice: 66_000,
        previousPrice: 66_050,
      },
      avwap: {
        asOfMs: NOW - 1000,
        staleAfterMs: FRESH_MS,
        formulaVersion: "avwap-v1",
        anchorId: "anchor-1",
        value: 66_500, // price is below AVWAP
      },
      proposedTrade: {
        asOfMs: NOW - 1000,
        staleAfterMs: FRESH_MS,
        side: "short",
        entryPrice: 66_000,
        stopPrice: 66_500,
        targetPrice: 65_000,
        entrySource: "market-price",
        stopSource: "swing-high",
        targetSource: "support-zone",
        rewardRiskRatio: 2,
        rewardRiskFormulaVersion: "risk-terminal-v1",
      },
      flow: {
        staleAfterMs: FRESH_MS,
        snapshot: makeFlowSnapshot(Array(10).fill("sell")), // strong sell flow
      },
    });

    const shortState = buildMarketState(shortInput);
    const shortContext = buildDecisionContext(shortState);
    const shortAssessment = evaluateDecisionRules(shortContext);

    expect(shortAssessment.choice).toBe("confirm-short");
    expect(shortAssessment.reasonCodes).toContain(
      "STRUCTURE_FLOW_LOCATION_CONFIRMED",
    );
  });

  it("discards superseded or stale assessments in convergence", () => {
    const state = buildMarketState(baseInput());
    const context = buildDecisionContext(state);
    const assessment = evaluateDecisionRules(context);

    // Explicitly superseded
    const supersededResult = convergeDecision(context, assessment, {
      isSuperseded: true,
    });
    expect(supersededResult.choice).toBe("insufficient-data");
    expect(supersededResult.discarded).toBe(true);
    expect(supersededResult.ruleStepTriggered).toBe(4);

    // Stale by clock comparison (> 60s)
    const staleResult = convergeDecision(context, assessment, {
      currentEffectiveAtMs: assessment.completedAtMs + 120_000,
    });
    expect(staleResult.choice).toBe("insufficient-data");
    expect(staleResult.discarded).toBe(true);
    expect(staleResult.ruleStepTriggered).toBe(4);
  });

  it("creates immutable shadow-decision records and enforces idempotency in store", () => {
    const state = buildMarketState(baseInput());
    const context = buildDecisionContext(state);
    const assessment = evaluateDecisionRules(context);

    const converged = convergeDecision(context, assessment);
    const record = buildShadowDecisionRecord(state, context, converged);
    expect(Object.isFrozen(record)).toBe(true);
    expect(record.schemaVersion).toBe("shadow-decision-record-v1");
    expect(record.stateId).toBe(state.identity.stateId);
    expect(record.contextId).toBe(context.contextId);
    expect(record.assessmentId).toBe(assessment.assessmentId);
    expect(record.convergedChoice).toBe(converged.choice);
    expect(record.convergenceRuleStep).toBe(converged.ruleStepTriggered);

    const store = new InMemoryDecisionStore();
    store.append(record);

    // Retrievals
    expect(store.getById(record.recordId)).toEqual(record);
    expect(store.getByStateId(state.identity.stateId)).toHaveLength(1);
    expect(store.getRecent(10)).toHaveLength(1);
    expect(store.getRecent(0)).toEqual([]);
    expect(() => store.getRecent(-1)).toThrow(/nonnegative integer/);

    // Idempotent duplicate append succeeds without error
    expect(() => store.append(record)).not.toThrow();
    expect(store.getByStateId(state.identity.stateId)).toHaveLength(1);

    // Differing record with same ID throws
    const mutatedHashRecord = { ...record, recordHash: "corrupted-hash" };
    expect(() => store.append(mutatedHashRecord)).toThrow(
      /recordHash does not match record content/,
    );

    const otherState = buildMarketState(
      baseInput({
        identity: { ...baseInput().identity, generationId: "gen-other" },
      }),
    );
    expect(() =>
      buildShadowDecisionRecord(otherState, context, converged),
    ).toThrow(/context does not belong to market state/);
  });
});
