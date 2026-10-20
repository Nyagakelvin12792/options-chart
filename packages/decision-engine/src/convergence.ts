import type {
  DecisionAssessmentV1,
  DecisionChoice,
  DecisionContextV1,
} from "./decision-contracts";
import { parseDecisionContext } from "./decision-context-builder";
import {
  evaluateDecisionRules,
  parseDecisionAssessment,
} from "./rules-provider";

export const CONVERGENCE_RULES_VERSION = "convergence-rules-v1" as const;
export const MIN_CONFIRM_CONFIDENCE = 0.8;
export const MIN_WATCH_CONFIDENCE = 0.6;

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

function reasons(
  assessment: DecisionAssessmentV1,
  ...additional: readonly string[]
): string[] {
  return [...new Set([...assessment.reasonCodes, ...additional])].sort();
}

function direction(choice: DecisionChoice): "long" | "short" | null {
  if (choice === "watch-long" || choice === "confirm-long") return "long";
  if (choice === "watch-short" || choice === "confirm-short") return "short";
  return null;
}

function riskRank(choice: DecisionChoice): number {
  if (choice === "confirm-long" || choice === "confirm-short") return 2;
  if (choice === "watch-long" || choice === "watch-short") return 1;
  return 0;
}

function watchChoice(choice: DecisionChoice): DecisionChoice {
  return choice === "confirm-long" ? "watch-long" : "watch-short";
}

/**
 * Ordered deterministic convergence. Provider output may reduce or veto the
 * baseline, but can never override deterministic safety gates, change trade
 * direction, or enlarge the deterministic baseline's risk.
 */
export function convergeDecision(
  rawContext: DecisionContextV1,
  rawAssessment: DecisionAssessmentV1,
  options: ConvergenceOptions = {},
): ConvergedDecisionResult {
  const context = parseDecisionContext(rawContext);
  const assessment = parseDecisionAssessment(rawAssessment);

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
      reasonCodes: reasons(assessment, "CONVERGENCE_DATA_UNAVAILABLE_OR_STALE"),
      discarded: false,
      assessment,
    };
  }

  // 2. Account prohibitions, including unavailable risk for a proposed trade.
  const isAccountProhibited =
    context.accountRisk.state === "prohibited" ||
    context.prohibitionReasonCodes.includes("ACCOUNT_RISK_PROHIBITED");
  const isAccountUnavailable =
    context.proposedTrade !== null &&
    (context.accountRisk.state === "unavailable" ||
      context.prohibitionReasonCodes.includes("ACCOUNT_RISK_UNAVAILABLE"));

  if (isAccountProhibited || isAccountUnavailable) {
    return {
      choice: "no-trade",
      ruleStepTriggered: 2,
      reasonCodes: reasons(
        assessment,
        isAccountProhibited
          ? "CONVERGENCE_ACCOUNT_PROHIBITED"
          : "CONVERGENCE_ACCOUNT_RISK_UNAVAILABLE",
      ),
      discarded: false,
      assessment,
    };
  }

  // 3. Invalid/unavailable geometry and sub-minimum reward:risk are hard vetoes.
  const trade = context.proposedTrade;
  const isGeometryInvalid =
    (trade !== null && trade.geometry === "invalid") ||
    context.prohibitionReasonCodes.includes("GEOMETRY_INVALID");
  const isGeometryUnavailable =
    trade !== null &&
    (trade.geometry === "unavailable" ||
      context.prohibitionReasonCodes.includes("GEOMETRY_UNAVAILABLE"));
  const isRewardRiskBelowMinimum =
    trade !== null &&
    (trade.rewardRiskBand === "below-minimum" ||
      context.prohibitionReasonCodes.includes("REWARD_RISK_BELOW_MINIMUM"));

  if (isGeometryInvalid || isGeometryUnavailable || isRewardRiskBelowMinimum) {
    const code = isGeometryInvalid
      ? "CONVERGENCE_GEOMETRY_INVALID"
      : isGeometryUnavailable
        ? "CONVERGENCE_GEOMETRY_UNAVAILABLE"
        : "CONVERGENCE_REWARD_RISK_BELOW_MINIMUM";
    return {
      choice: "no-trade",
      ruleStepTriggered: 3,
      reasonCodes: reasons(assessment, code),
      discarded: false,
      assessment,
    };
  }

  // 4. Wrong-context, stale, future, or superseded assessments are discarded.
  const maxAge = options.maxAssessmentAgeMs ?? 60_000;
  if (!Number.isInteger(maxAge) || maxAge < 0) {
    throw new RangeError("maxAssessmentAgeMs must be a nonnegative integer");
  }
  const currentEffectiveAtMs = options.currentEffectiveAtMs;
  const isStaleByClock =
    currentEffectiveAtMs !== undefined &&
    currentEffectiveAtMs - assessment.completedAtMs > maxAge;
  const isFutureByClock =
    currentEffectiveAtMs !== undefined &&
    assessment.completedAtMs > currentEffectiveAtMs;
  const isWrongContext = assessment.contextId !== context.contextId;

  if (
    options.isSuperseded ||
    isStaleByClock ||
    isFutureByClock ||
    isWrongContext
  ) {
    return {
      choice: "insufficient-data",
      ruleStepTriggered: 4,
      reasonCodes: reasons(
        assessment,
        isWrongContext
          ? "CONVERGENCE_ASSESSMENT_CONTEXT_MISMATCH"
          : isFutureByClock
            ? "CONVERGENCE_ASSESSMENT_FROM_FUTURE"
            : "CONVERGENCE_ASSESSMENT_SUPERSEDED_OR_STALE",
      ),
      discarded: true,
      assessment,
    };
  }

  // 5. Contradictory or incomplete evidence cannot confirm a trade.
  const isConfirmChoice =
    assessment.choice === "confirm-long" ||
    assessment.choice === "confirm-short";
  if (isConfirmChoice && context.contradictions.length > 0) {
    return {
      choice: "no-trade",
      ruleStepTriggered: 5,
      reasonCodes: reasons(
        assessment,
        "CONVERGENCE_CONTRADICTIONS_PROHIBIT_CONFIRM",
      ),
      discarded: false,
      assessment,
    };
  }
  if (isConfirmChoice && context.dataHealth.flow === "unavailable") {
    return {
      choice: watchChoice(assessment.choice),
      ruleStepTriggered: 5,
      reasonCodes: reasons(
        assessment,
        "CONVERGENCE_FLOW_UNAVAILABLE_DOWNGRADED_TO_WATCH",
      ),
      discarded: false,
      assessment,
    };
  }

  const baselineChoice = evaluateDecisionRules(context).choice;
  const providerDirection = direction(assessment.choice);
  const baselineDirection = direction(baselineChoice);

  // 6. A provider cannot reverse the deterministic baseline's direction.
  if (
    providerDirection !== null &&
    baselineDirection !== null &&
    providerDirection !== baselineDirection
  ) {
    return {
      choice: "no-trade",
      ruleStepTriggered: 6,
      reasonCodes: reasons(
        assessment,
        "CONVERGENCE_PROVIDER_DIRECTION_CONFLICT",
      ),
      discarded: false,
      assessment,
    };
  }

  // 7. A provider can only reduce, never enlarge, deterministic baseline risk.
  if (riskRank(assessment.choice) > riskRank(baselineChoice)) {
    return {
      choice: baselineChoice,
      ruleStepTriggered: 7,
      reasonCodes: reasons(
        assessment,
        "CONVERGENCE_CAPPED_TO_DETERMINISTIC_BASELINE",
      ),
      discarded: false,
      assessment,
    };
  }

  // 8. Low-confidence actionable outputs are deterministically downgraded.
  const effectiveConfidence = Math.min(
    assessment.confidence ?? 0,
    assessment.distribution[assessment.choice],
  );
  if (isConfirmChoice && effectiveConfidence < MIN_CONFIRM_CONFIDENCE) {
    return {
      choice: watchChoice(assessment.choice),
      ruleStepTriggered: 8,
      reasonCodes: reasons(
        assessment,
        "CONVERGENCE_LOW_CONFIDENCE_DOWNGRADED_TO_WATCH",
      ),
      discarded: false,
      assessment,
    };
  }
  if (
    (assessment.choice === "watch-long" ||
      assessment.choice === "watch-short") &&
    effectiveConfidence < MIN_WATCH_CONFIDENCE
  ) {
    return {
      choice: "no-trade",
      ruleStepTriggered: 8,
      reasonCodes: reasons(
        assessment,
        "CONVERGENCE_LOW_CONFIDENCE_DOWNGRADED_TO_NO_TRADE",
      ),
      discarded: false,
      assessment,
    };
  }

  // 9. Audited context warnings prevent a full confirmation.
  if (isConfirmChoice && context.dataHealth.hasWarnings) {
    return {
      choice: watchChoice(assessment.choice),
      ruleStepTriggered: 9,
      reasonCodes: reasons(
        assessment,
        "CONVERGENCE_CONTEXT_WARNINGS_DOWNGRADED_TO_WATCH",
      ),
      discarded: false,
      assessment,
    };
  }

  // 10. Verified provider choice passes through.
  return {
    choice: assessment.choice,
    ruleStepTriggered: 10,
    reasonCodes: reasons(assessment),
    discarded: false,
    assessment,
  };
}
