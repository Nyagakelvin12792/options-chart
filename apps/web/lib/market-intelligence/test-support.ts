import {
  computeContextId,
  parseDecisionContext,
  type DecisionContextV1,
} from "@options-chart/decision-engine";

export function testDecisionContext(
  contextId = "decision-context-test-1",
): DecisionContextV1 {
  const content: Omit<DecisionContextV1, "contextId"> = {
    schemaVersion: "decision-context-v1",
    stateId: `market-state-${contextId}`,
    createdAtMs: 1_700_000_000_010,
    effectiveAtMs: 1_700_000_000_000,
    symbol: "BTCUSDT",
    activeTimeframe: "1h",
    expiryScope: "next-expiry",
    mode: "live-shadow",
    dataHealth: {
      candles: "live",
      options: "live",
      flow: "live",
      geometry: "live",
      accountRisk: "live",
      isStale: false,
      hasWarnings: false,
    },
    marketStructure: {
      h4: "uptrend",
      h1: "uptrend",
      m15: "uptrend",
      agreement: "aligned-up",
    },
    optionsRegime: {
      gamma: "positive",
      volatility: "normal",
      expiryPressure: "none",
    },
    location: {
      avwap: "above",
      volumeProfile: "inside-value",
      supportStrength: "strong",
      resistanceStrength: "weak",
      wallInteraction: "testing",
      hasNearSupport: true,
      hasNearResistance: false,
    },
    orderFlow: {
      cvd: "buy",
      aggressiveFlow: "buy",
      imbalance: "bid-heavy",
      responseState: "rejection",
      responseDirection: "bullish",
    },
    proposedTrade: {
      side: "long",
      geometry: "valid",
      rewardRiskBand: "acceptable",
      entrySource: "support-zone",
      stopSource: "structure-invalidation",
      targetSource: "resistance-zone",
    },
    accountRisk: { state: "available", reasonCodes: [] },
    contradictions: [],
    prohibitionReasonCodes: [],
    formulaVersions: { candles: "binance-spot-candle-v1" },
    featureVersions: { flow: "flow-feature-v1" },
    includedVenues: ["binance", "deribit"],
    warnings: [],
  };
  return parseDecisionContext({
    ...content,
    contextId: computeContextId(content),
  });
}
