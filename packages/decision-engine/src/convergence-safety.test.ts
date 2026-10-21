import { describe, expect, it } from "vitest";
import { convergeDecision } from "./convergence";
import {
  DecisionAssessmentV1Schema,
  type DecisionAssessmentV1,
  type DecisionChoice,
  type DecisionContextV1,
} from "./decision-contracts";
import { buildDecisionContext } from "./decision-context-builder";
import { buildMarketState } from "./market-state-builder";
import { evaluateDecisionRules } from "./rules-provider";
import { baseInput, FRESH_MS, makeFlowSnapshot } from "./test-support/fixtures";

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

describe("M11.5 convergence safety boundary", () => {
  it("discards assessments bound to a different decision context", () => {
    const contextA = buildDecisionContext(buildMarketState(baseInput()));
    const contextB = buildDecisionContext(
      buildMarketState(
        baseInput({
          identity: {
            ...baseInput().identity,
            generationId: "gen-2",
          },
        }),
      ),
    );
    const assessmentB = evaluateDecisionRules(contextB);

    const result = convergeDecision(contextA, assessmentB);
    expect(result.choice).toBe("insufficient-data");
    expect(result.discarded).toBe(true);
    expect(result.ruleStepTriggered).toBe(4);
    expect(result.reasonCodes).toContain(
      "CONVERGENCE_ASSESSMENT_CONTEXT_MISMATCH",
    );
  });

  it("keeps unavailable account risk and sub-minimum reward:risk as hard vetoes", () => {
    const unavailableRiskContext = buildDecisionContext(
      buildMarketState(baseInput({ accountRisk: null })),
    );
    const unavailableRiskResult = convergeDecision(
      unavailableRiskContext,
      recordedAssessment(unavailableRiskContext, "confirm-long"),
    );
    expect(unavailableRiskResult.choice).toBe("no-trade");
    expect(unavailableRiskResult.ruleStepTriggered).toBe(2);
    expect(unavailableRiskResult.reasonCodes).toContain(
      "CONVERGENCE_ACCOUNT_RISK_UNAVAILABLE",
    );

    const lowRewardRiskContext = buildDecisionContext(
      buildMarketState(
        baseInput({
          proposedTrade: {
            ...baseInput().proposedTrade!,
            rewardRiskRatio: 0.25,
          },
        }),
      ),
    );
    const lowRewardRiskResult = convergeDecision(
      lowRewardRiskContext,
      recordedAssessment(lowRewardRiskContext, "confirm-long"),
    );
    expect(lowRewardRiskResult.choice).toBe("no-trade");
    expect(lowRewardRiskResult.ruleStepTriggered).toBe(3);
    expect(lowRewardRiskResult.reasonCodes).toContain(
      "CONVERGENCE_REWARD_RISK_BELOW_MINIMUM",
    );
  });

  it("prevents providers from reversing or enlarging deterministic risk", () => {
    const confirmContext = buildDecisionContext(buildMarketState(baseInput()));
    const reversed = convergeDecision(
      confirmContext,
      recordedAssessment(confirmContext, "confirm-short"),
    );
    expect(reversed.choice).toBe("no-trade");
    expect(reversed.ruleStepTriggered).toBe(6);

    const watchContext = buildDecisionContext(
      buildMarketState(
        baseInput({
          flow: {
            staleAfterMs: FRESH_MS,
            snapshot: makeFlowSnapshot(["buy", "sell", "buy", "sell"]),
          },
        }),
      ),
    );
    expect(evaluateDecisionRules(watchContext).choice).toBe("watch-long");
    const enlarged = convergeDecision(
      watchContext,
      recordedAssessment(watchContext, "confirm-long"),
    );
    expect(enlarged.choice).toBe("watch-long");
    expect(enlarged.ruleStepTriggered).toBe(7);
  });

  it("downgrades low-confidence provider confirmations", () => {
    const context = buildDecisionContext(buildMarketState(baseInput()));
    const result = convergeDecision(
      context,
      recordedAssessment(context, "confirm-long", 0.7),
    );
    expect(result.choice).toBe("watch-long");
    expect(result.ruleStepTriggered).toBe(8);
    expect(result.reasonCodes).toContain(
      "CONVERGENCE_LOW_CONFIDENCE_DOWNGRADED_TO_WATCH",
    );
  });
});
