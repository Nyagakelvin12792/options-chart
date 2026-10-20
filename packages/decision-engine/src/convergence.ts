import type {
  DecisionAssessmentV1,
  DecisionChoice,
  DecisionContextV1,
} from "./decision-contracts";

export interface ConvergenceOptions {
  readonly maxAssessmentAgeMs?: number;
  readonly currentEffectiveAtMs?: number;
  readonly isSuperseded?: boolean;
}

export interface ConvergedDecisionResult {
  readonly choice: DecisionChoice;
  readonly ruleStepTriggered: number;
  readonly reasonCodes: readonly string[];
  readonly discarded: boolean;
  readonly assessment: DecisionAssessmentV1;
}

/**
 * Deterministic convergence engine enforcing the strict 10-step priority ladder.
 * Future AI providers may only reduce or veto a decision, never enlarge risk or override vetoes.
 */
export function convergeDecision(
  context: DecisionContextV1,
  assessment: DecisionAssessmentV1,
  options: ConvergenceOptions = {},
): ConvergedDecisionResult {
  const reasonCodes = [...assessment.reasonCodes];

  // 1. Missing or stale required market data produces insufficient-data.
  const isDataMissingOrStale =
    context.dataHealth.candles === "unavailable" ||
    context.marketStructure.h4 === "unavailable" ||
    context.marketStructure.h1 === "unavailable" ||
    context.dataHealth.isStale ||
    assessment.isStale;

  if (isDataMissingOrStale) {
    return {
      choice: "insufficient-data",
      ruleStepTriggered: 1,
      reasonCodes: [
        ...new Set([...reasonCodes, "CONVERGENCE_DATA_UNAVAILABLE_OR_STALE"]),
      ].sort(),
      discarded: false,
      assessment,
    };
  }

  // 2. Prohibited account risk produces no-trade unconditionally.
  const isAccountProhibited =
    context.accountRisk.state === "prohibited" ||
    context.prohibitionReasonCodes.includes("ACCOUNT_RISK_PROHIBITED");

  if (isAccountProhibited) {
    return {
      choice: "no-trade",
      ruleStepTriggered: 2,
      reasonCodes: [
        ...new Set([...reasonCodes, "CONVERGENCE_ACCOUNT_PROHIBITED"]),
      ].sort(),
      discarded: false,
      assessment,
    };
  }

  // 3. Invalid Entry/SL/TP geometry produces no-trade.
  const isGeometryInvalid =
    (context.proposedTrade !== null &&
      context.proposedTrade.geometry === "invalid") ||
    context.prohibitionReasonCodes.includes("GEOMETRY_INVALID");

  if (isGeometryInvalid) {
    return {
      choice: "no-trade",
      ruleStepTriggered: 3,
      reasonCodes: [
        ...new Set([...reasonCodes, "CONVERGENCE_GEOMETRY_INVALID"]),
      ].sort(),
      discarded: false,
      assessment,
    };
  }

  // 4. Stale or superseded assessment is discarded.
  const maxAge = options.maxAssessmentAgeMs ?? 60_000;
  const isStaleByClock =
    options.currentEffectiveAtMs !== undefined &&
    options.currentEffectiveAtMs - assessment.completedAtMs > maxAge;

  if (options.isSuperseded || isStaleByClock) {
    return {
      choice: "insufficient-data",
      ruleStepTriggered: 4,
      reasonCodes: [
        ...new Set([
          ...reasonCodes,
          "CONVERGENCE_ASSESSMENT_SUPERSEDED_OR_STALE",
        ]),
      ].sort(),
      discarded: true,
      assessment,
    };
  }

  // 5. Low-quality or contradictory evidence cannot confirm a trade.
  const isConfirmChoice =
    assessment.choice === "confirm-long" ||
    assessment.choice === "confirm-short";

  if (isConfirmChoice) {
    if (context.contradictions.length > 0) {
      return {
        choice: "no-trade",
        ruleStepTriggered: 5,
        reasonCodes: [
          ...new Set([
            ...reasonCodes,
            "CONVERGENCE_CONTRADICTIONS_PROHIBIT_CONFIRM",
          ]),
        ].sort(),
        discarded: false,
        assessment,
      };
    }

    if (context.dataHealth.flow === "unavailable") {
      // Degrade confirm to watch
      const downgraded: DecisionChoice =
        assessment.choice === "confirm-long" ? "watch-long" : "watch-short";
      return {
        choice: downgraded,
        ruleStepTriggered: 5,
        reasonCodes: [
          ...new Set([
            ...reasonCodes,
            "CONVERGENCE_FLOW_UNAVAILABLE_DOWNGRADED_TO_WATCH",
          ]),
        ].sort(),
        discarded: false,
        assessment,
      };
    }
  }

  // Baseline passes through with its verified choice
  return {
    choice: assessment.choice,
    ruleStepTriggered: 10,
    reasonCodes: [...new Set(reasonCodes)].sort(),
    discarded: false,
    assessment,
  };
}
