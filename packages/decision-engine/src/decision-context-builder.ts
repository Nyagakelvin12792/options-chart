import { assertCanonicalSafe, contentHash, deepFreeze } from "./canonical";
import {
  DECISION_CONTEXT_SCHEMA_VERSION,
  DecisionContextV1Schema,
  type DecisionContextV1,
} from "./decision-contracts";
import type { MarketStateV1 } from "./market-state-contracts";

type ContextContent = Omit<DecisionContextV1, "contextId">;

export function computeContextId(content: ContextContent): string {
  assertCanonicalSafe(content);
  return `context-${contentHash(content)}`;
}

/** Validates both the context schema and its content-addressed identity. */
export function parseDecisionContext(raw: unknown): DecisionContextV1 {
  const context = DecisionContextV1Schema.parse(raw);
  const { contextId, ...content } = context;
  if (contextId !== computeContextId(content)) {
    throw new Error("contextId does not match decision context content");
  }
  return deepFreeze(context);
}

export function buildDecisionContext(state: MarketStateV1): DecisionContextV1 {
  const {
    identity,
    health,
    marketStructure,
    location,
    orderFlow,
    optionsRegime,
    tradeQuality,
    evidence,
  } = state;

  const isStale =
    health.candles.state === "stale" ||
    health.options.state === "stale" ||
    health.flow.state === "stale" ||
    health.geometry.state === "stale" ||
    health.accountRisk.state === "stale";

  const hasWarnings =
    health.warnings.length > 0 || evidence.auditWarnings.length > 0;

  const hasNearSupport =
    location.strongestSupport !== null &&
    location.strongestSupport.distanceBps <= 30;
  const hasNearResistance =
    location.strongestResistance !== null &&
    location.strongestResistance.distanceBps <= 30;

  const proposedTrade =
    tradeQuality.proposedSide !== null &&
    tradeQuality.entrySource !== null &&
    tradeQuality.stopSource !== null
      ? {
          side: tradeQuality.proposedSide,
          geometry: tradeQuality.geometry,
          rewardRiskBand: tradeQuality.rewardRiskBand,
          entrySource: tradeQuality.entrySource,
          stopSource: tradeQuality.stopSource,
          targetSource: tradeQuality.targetSource,
        }
      : null;

  const content: ContextContent = {
    schemaVersion: DECISION_CONTEXT_SCHEMA_VERSION,
    stateId: identity.stateId,
    createdAtMs: identity.createdAtMs,
    effectiveAtMs: identity.effectiveAtMs,
    symbol: identity.symbol,
    activeTimeframe: identity.activeTimeframe,
    expiryScope: identity.expiryScope,
    mode: identity.mode,
    dataHealth: {
      candles: health.candles.state,
      options: health.options.state,
      flow: health.flow.state,
      geometry: health.geometry.state,
      accountRisk: health.accountRisk.state,
      isStale,
      hasWarnings,
    },
    marketStructure: {
      h4: marketStructure.h4.state,
      h1: marketStructure.h1.state,
      m15: marketStructure.m15.state,
      agreement: marketStructure.agreement,
    },
    optionsRegime: {
      gamma: optionsRegime.gamma.state,
      volatility: optionsRegime.volatility.state,
      expiryPressure: optionsRegime.expiryPressure.state,
    },
    location: {
      avwap: location.avwap.state,
      volumeProfile: location.volumeProfile.state,
      supportStrength: location.supportStrength,
      resistanceStrength: location.resistanceStrength,
      wallInteraction: location.wallInteraction.state,
      hasNearSupport,
      hasNearResistance,
    },
    orderFlow: {
      cvd: orderFlow.cvd.state,
      aggressiveFlow: orderFlow.aggressiveFlow.state,
      imbalance: orderFlow.imbalance.state,
      responseState: orderFlow.response.state,
      responseDirection: orderFlow.response.direction,
    },
    proposedTrade,
    accountRisk: {
      state: tradeQuality.accountRisk.state,
      reasonCodes: [...tradeQuality.accountRisk.reasonCodes].sort(),
    },
    contradictions: tradeQuality.contradictions.map((c) => c.code).sort(),
    prohibitionReasonCodes: [...tradeQuality.prohibitionReasonCodes].sort(),
    formulaVersions: { ...evidence.formulaVersions },
    featureVersions: { ...evidence.featureVersions },
    includedVenues: [...evidence.includedVenues].sort(),
    warnings: [
      ...new Set([...health.warnings, ...evidence.auditWarnings]),
    ].sort(),
  };

  const contextId = computeContextId(content);
  return parseDecisionContext({
    ...content,
    contextId,
  });
}
