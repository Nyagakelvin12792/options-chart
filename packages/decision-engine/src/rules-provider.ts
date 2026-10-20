import { assertCanonicalSafe, contentHash, deepFreeze } from "./canonical";
import {
  DECISION_ASSESSMENT_SCHEMA_VERSION,
  DecisionAssessmentV1Schema,
  type DecisionAssessmentV1,
  type DecisionCheckResultV1,
  type DecisionChoice,
  type DecisionContextV1,
  type DecisionDistributionV1,
} from "./decision-contracts";

export const DETERMINISTIC_RULES_VERSION = "rules-baseline-v1" as const;
export const RULES_PROMPT_VERSION = "rules-baseline-v1" as const;

function makeDistribution(
  primary: DecisionChoice,
  secondary?: DecisionChoice,
  secondaryWeight = 0.15,
): DecisionDistributionV1 {
  const base: Record<DecisionChoice, number> = {
    "no-trade": 0,
    "watch-long": 0,
    "watch-short": 0,
    "confirm-long": 0,
    "confirm-short": 0,
    "insufficient-data": 0,
  };
  if (secondary !== undefined && secondary !== primary) {
    base[primary] = 1 - secondaryWeight;
    base[secondary] = secondaryWeight;
  } else {
    base[primary] = 1.0;
  }
  return base;
}

export function evaluateDecisionRules(
  context: DecisionContextV1,
): DecisionAssessmentV1 {
  const checks: DecisionCheckResultV1[] = [];
  const reasonCodes: string[] = [];
  const warnings: string[] = [...context.warnings];

  // 1. Data health check
  const criticalUnavailable =
    context.dataHealth.candles === "unavailable" ||
    context.marketStructure.h4 === "unavailable" ||
    context.marketStructure.h1 === "unavailable";

  if (criticalUnavailable) {
    checks.push({
      checkId: "data-health",
      status: "fail",
      reasonCode: "CRITICAL_DATA_UNAVAILABLE",
      message: "Authoritative candle or structure data is unavailable",
    });
    reasonCodes.push("INSUFFICIENT_DATA_UNAVAILABLE");
  } else if (context.dataHealth.isStale) {
    checks.push({
      checkId: "data-health",
      status: "warn",
      reasonCode: "DATA_INPUTS_STALE",
      message: "One or more input sources are stale",
    });
    reasonCodes.push("DATA_INPUTS_STALE");
  } else {
    checks.push({
      checkId: "data-health",
      status: "pass",
      reasonCode: "DATA_HEALTH_OK",
      message: "Required inputs are fresh and available",
    });
  }

  // 2. Account risk check
  const accountProhibited = context.accountRisk.state === "prohibited";
  if (accountProhibited) {
    checks.push({
      checkId: "account-permission",
      status: "fail",
      reasonCode: "ACCOUNT_RISK_PROHIBITED",
      message: `Account risk state is prohibited: ${context.accountRisk.reasonCodes.join(", ")}`,
    });
    reasonCodes.push("ACCOUNT_RISK_PROHIBITED");
  } else if (context.accountRisk.state === "unavailable") {
    checks.push({
      checkId: "account-permission",
      status: "warn",
      reasonCode: "ACCOUNT_RISK_UNAVAILABLE",
      message: "Account risk state is unavailable",
    });
    reasonCodes.push("ACCOUNT_RISK_UNAVAILABLE");
  } else {
    checks.push({
      checkId: "account-permission",
      status: "pass",
      reasonCode: "ACCOUNT_RISK_PERMITTED",
      message: "Account risk allows trading",
    });
  }

  // 3. Trade geometry check
  const trade = context.proposedTrade;
  if (trade !== null) {
    if (trade.geometry === "invalid") {
      checks.push({
        checkId: "trade-geometry",
        status: "fail",
        reasonCode: "GEOMETRY_INVALID",
        message: "Trade geometry violates ordering constraints",
      });
      reasonCodes.push("GEOMETRY_INVALID");
    } else if (trade.rewardRiskBand === "below-minimum") {
      checks.push({
        checkId: "trade-geometry",
        status: "fail",
        reasonCode: "REWARD_RISK_BELOW_MINIMUM",
        message: "Reward-to-risk ratio is below minimum acceptable threshold",
      });
      reasonCodes.push("REWARD_RISK_BELOW_MINIMUM");
    } else {
      checks.push({
        checkId: "trade-geometry",
        status: "pass",
        reasonCode: "GEOMETRY_VALID",
        message: "Trade geometry and reward:risk are valid",
      });
    }
  } else {
    checks.push({
      checkId: "trade-geometry",
      status: "pass",
      reasonCode: "NO_PROPOSED_TRADE",
      message: "No trade proposal specified",
    });
  }

  // 4. Contradictions check
  if (context.contradictions.length > 0) {
    checks.push({
      checkId: "contradictions",
      status: "fail",
      reasonCode: "CONTRADICTION_PRESENT",
      message: `Layer contradictions detected: ${context.contradictions.join(", ")}`,
    });
    reasonCodes.push(
      ...context.contradictions.map((c) => `CONTRADICTION:${c}`),
    );
  } else {
    checks.push({
      checkId: "contradictions",
      status: "pass",
      reasonCode: "NO_CONTRADICTIONS",
      message: "No contradictory cross-layer states detected",
    });
  }

  // 5. Structure & Flow evaluation
  const struct = context.marketStructure;
  const flow = context.orderFlow;
  const loc = context.location;

  const isBullishStructure =
    struct.agreement === "aligned-up" ||
    (struct.h4 === "uptrend" && struct.h1 === "uptrend");
  const isBearishStructure =
    struct.agreement === "aligned-down" ||
    (struct.h4 === "downtrend" && struct.h1 === "downtrend");

  const isBullishFlow =
    flow.cvd === "buy" ||
    flow.cvd === "strong-buy" ||
    flow.responseDirection === "bullish";
  const isBearishFlow =
    flow.cvd === "sell" ||
    flow.cvd === "strong-sell" ||
    flow.responseDirection === "bearish";

  // Decision determination logic
  let choice: DecisionChoice;
  let secondary: DecisionChoice | undefined;
  let confidence: number | null = 0.85;

  if (criticalUnavailable || context.dataHealth.isStale) {
    choice = "insufficient-data";
    confidence = null;
  } else if (accountProhibited || context.prohibitionReasonCodes.length > 0) {
    choice = "no-trade";
    reasonCodes.push("PROHIBITED_BY_RULES");
    confidence = 0.95;
  } else if (trade !== null && trade.geometry === "invalid") {
    choice = "no-trade";
    confidence = 0.95;
  } else if (trade !== null && trade.rewardRiskBand === "below-minimum") {
    choice = "no-trade";
    confidence = 0.9;
  } else if (context.contradictions.length > 0) {
    choice = "no-trade";
    secondary =
      trade?.side === "long"
        ? "watch-long"
        : trade?.side === "short"
          ? "watch-short"
          : undefined;
    confidence = 0.8;
  } else if (trade !== null) {
    if (trade.side === "long") {
      const confirmEligible =
        isBullishStructure &&
        isBullishFlow &&
        (loc.hasNearSupport ||
          loc.avwap === "above" ||
          flow.responseState === "rejection");

      if (confirmEligible) {
        choice = "confirm-long";
        secondary = "watch-long";
        reasonCodes.push("STRUCTURE_FLOW_LOCATION_CONFIRMED");
        confidence = 0.9;
      } else if (isBullishStructure || loc.hasNearSupport) {
        choice = "watch-long";
        secondary = "no-trade";
        reasonCodes.push("WATCHING_LONG_SETUP");
        confidence = 0.75;
      } else {
        choice = "no-trade";
        reasonCodes.push("LONG_SETUP_UNFAVORABLE");
        confidence = 0.8;
      }
    } else {
      // short trade
      const confirmEligible =
        isBearishStructure &&
        isBearishFlow &&
        (loc.hasNearResistance ||
          loc.avwap === "below" ||
          flow.responseState === "rejection");

      if (confirmEligible) {
        choice = "confirm-short";
        secondary = "watch-short";
        reasonCodes.push("STRUCTURE_FLOW_LOCATION_CONFIRMED");
        confidence = 0.9;
      } else if (isBearishStructure || loc.hasNearResistance) {
        choice = "watch-short";
        secondary = "no-trade";
        reasonCodes.push("WATCHING_SHORT_SETUP");
        confidence = 0.75;
      } else {
        choice = "no-trade";
        reasonCodes.push("SHORT_SETUP_UNFAVORABLE");
        confidence = 0.8;
      }
    }
  } else {
    // No proposed trade: scanning/watching mode
    if (isBullishStructure && (loc.hasNearSupport || loc.avwap === "above")) {
      choice = "watch-long";
      secondary = "no-trade";
      reasonCodes.push("SCAN_BULLISH_BIAS_NEAR_SUPPORT");
      confidence = 0.7;
    } else if (
      isBearishStructure &&
      (loc.hasNearResistance || loc.avwap === "below")
    ) {
      choice = "watch-short";
      secondary = "no-trade";
      reasonCodes.push("SCAN_BEARISH_BIAS_NEAR_RESISTANCE");
      confidence = 0.7;
    } else {
      choice = "no-trade";
      reasonCodes.push("NO_ACTIONABLE_BIAS");
      confidence = 0.75;
    }
  }

  const distribution = makeDistribution(choice, secondary);
  const sortedReasonCodes = [...new Set(reasonCodes)].sort();

  const summary = `Baseline evaluation: ${choice.toUpperCase()} based on ${sortedReasonCodes.join(", ")}`;

  const content = {
    schemaVersion: DECISION_ASSESSMENT_SCHEMA_VERSION,
    contextId: context.contextId,
    provider: "deterministic-rules-v1" as const,
    providerVersion: DETERMINISTIC_RULES_VERSION,
    promptVersion: RULES_PROMPT_VERSION,
    startedAtMs: context.effectiveAtMs,
    completedAtMs: context.effectiveAtMs + 1,
    isStale: context.dataHealth.isStale,
    checks,
    choice,
    distribution,
    confidence,
    reasonCodes: sortedReasonCodes,
    summary,
    warnings: [...new Set(warnings)].sort(),
    latencyMs: 1,
  };

  assertCanonicalSafe(content);
  const assessmentId = `assess-${contentHash(content)}`;

  const validated = DecisionAssessmentV1Schema.parse({
    ...content,
    assessmentId,
  });

  return deepFreeze(validated);
}
