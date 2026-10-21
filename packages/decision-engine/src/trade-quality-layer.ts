import { recordEvidence, type LayerContext } from "./layer-context";
import type {
  AccountRiskState,
  ContradictionV1,
  GeometryState,
  MarketStructureLayerV1,
  OrderFlowLayerV1,
  RewardRiskBand,
  SourceHealthV1,
  TradeQualityLayerV1,
  TradeSide,
} from "./market-state-contracts";
import type {
  AccountRiskInput,
  ProposedTradeInput,
} from "./market-state-input";
import { resolveSourceHealth } from "./source-health";
import { MARKET_STATE_THRESHOLDS_V1 } from "./thresholds";

const T = MARKET_STATE_THRESHOLDS_V1;
const GEOMETRY_VERSION = "trade-geometry-v1";

export interface TradeQualityResult {
  readonly layer: TradeQualityLayerV1;
  readonly geometryHealth: SourceHealthV1;
  readonly accountHealth: SourceHealthV1;
}

/** Reason codes intentionally mirror the Risk Terminal's geometry reasons. */
function geometryReasons(trade: ProposedTradeInput): string[] {
  const reasons: string[] = [];
  if (trade.side === "long") {
    if (trade.stopPrice >= trade.entryPrice)
      reasons.push("stop-must-be-below-entry");
    if (trade.targetPrice !== null && trade.targetPrice <= trade.entryPrice)
      reasons.push("target-must-be-above-entry");
  } else {
    if (trade.stopPrice <= trade.entryPrice)
      reasons.push("stop-must-be-above-entry");
    if (trade.targetPrice !== null && trade.targetPrice >= trade.entryPrice)
      reasons.push("target-must-be-below-entry");
  }
  return reasons;
}

function rewardRiskBand(ratio: number | null): RewardRiskBand {
  if (ratio === null) return "unavailable";
  if (ratio < T.rewardRiskAcceptable) return "below-minimum";
  return ratio >= T.rewardRiskStrong ? "strong" : "acceptable";
}

const BEARISH_FLOW = new Set(["sell", "strong-sell"]);
const BULLISH_FLOW = new Set(["buy", "strong-buy"]);

/** Disagreement between layers is listed explicitly, never netted into a score. */
function findContradictions(
  side: TradeSide | null,
  structure: MarketStructureLayerV1,
  flow: OrderFlowLayerV1,
): ContradictionV1[] {
  const found: ContradictionV1[] = [];
  const frames = [structure.h4, structure.h1, structure.m15];
  const up = frames.find((f) => f.state === "uptrend");
  const down = frames.find((f) => f.state === "downtrend");
  if (up !== undefined && down !== undefined) {
    found.push({
      code: "STRUCTURE_TIMEFRAME_CONFLICT",
      layers: [
        `marketStructure.${up.timeframe}`,
        `marketStructure.${down.timeframe}`,
      ],
    });
  }
  const bearishFlow =
    BEARISH_FLOW.has(flow.cvd.state) || flow.response.direction === "bearish";
  const bullishFlow =
    BULLISH_FLOW.has(flow.cvd.state) || flow.response.direction === "bullish";
  const h4 = structure.h4.state;
  if (h4 === "uptrend" && bearishFlow) {
    found.push({
      code: "FLOW_VS_STRUCTURE",
      layers: ["orderFlow", "marketStructure.4h"],
    });
  } else if (h4 === "downtrend" && bullishFlow) {
    found.push({
      code: "FLOW_VS_STRUCTURE",
      layers: ["orderFlow", "marketStructure.4h"],
    });
  }
  if (side === "long") {
    if (h4 === "downtrend")
      found.push({
        code: "SIDE_VS_STRUCTURE",
        layers: ["tradeQuality", "marketStructure.4h"],
      });
    if (bearishFlow)
      found.push({
        code: "SIDE_VS_FLOW",
        layers: ["tradeQuality", "orderFlow"],
      });
  } else if (side === "short") {
    if (h4 === "uptrend")
      found.push({
        code: "SIDE_VS_STRUCTURE",
        layers: ["tradeQuality", "marketStructure.4h"],
      });
    if (bullishFlow)
      found.push({
        code: "SIDE_VS_FLOW",
        layers: ["tradeQuality", "orderFlow"],
      });
  }
  return found.sort(
    (a, b) =>
      a.code.localeCompare(b.code) ||
      a.layers.join().localeCompare(b.layers.join()),
  );
}

/**
 * Trade-quality layer. Geometry is an ordering check only; reward:risk is the
 * Risk Terminal's value. No position size or risk amount exists here.
 */
export function buildTradeQualityLayer(
  trade: ProposedTradeInput | null,
  account: AccountRiskInput | null,
  structure: MarketStructureLayerV1,
  flow: OrderFlowLayerV1,
  ctx: LayerContext,
): TradeQualityResult {
  const tradeHealth = resolveSourceHealth(ctx.effectiveAtMs, trade);
  if (tradeHealth.future) ctx.collector.markFuture("proposedTrade");
  const accountHealth = resolveSourceHealth(ctx.effectiveAtMs, account);
  if (accountHealth.future) ctx.collector.markFuture("accountRisk");
  if (account !== null && !accountHealth.future && !accountHealth.usable) {
    ctx.collector.warn("ACCOUNT_RISK_STALE");
  }

  let geometry: GeometryState = "none";
  let band: RewardRiskBand = "none";
  let reasons: string[] = [];
  const evidenceRefs: string[] = [];
  if (trade !== null) {
    if (!tradeHealth.usable) {
      geometry = "unavailable";
      band = "unavailable";
      if (!tradeHealth.future) ctx.collector.warn("PROPOSED_TRADE_STALE");
    } else {
      const point = (name: string, value: number): void => {
        evidenceRefs.push(
          recordEvidence(ctx, {
            evidenceId: `trade:${name}`,
            name: `trade.${name}`,
            value,
            unit: "usd",
            formulaVersion: GEOMETRY_VERSION,
            source: "user-drawing",
            asOfMs: trade.asOfMs,
          }),
        );
      };
      point("entry", trade.entryPrice);
      point("stop", trade.stopPrice);
      if (trade.targetPrice !== null) point("target", trade.targetPrice);
      reasons = geometryReasons(trade);
      geometry = reasons.length === 0 ? "valid" : "invalid";
      band =
        geometry === "valid"
          ? rewardRiskBand(trade.rewardRiskRatio)
          : "unavailable";
      if (trade.rewardRiskRatio !== null && geometry === "valid") {
        evidenceRefs.push(
          recordEvidence(ctx, {
            evidenceId: "trade:rewardRiskRatio",
            name: "trade.rewardRiskRatio",
            value: trade.rewardRiskRatio,
            unit: "ratio",
            formulaVersion: trade.rewardRiskFormulaVersion,
            source: "risk-terminal",
            asOfMs: trade.asOfMs,
          }),
        );
      }
    }
  }

  const accountState: AccountRiskState =
    account !== null && accountHealth.usable ? account.state : "unavailable";
  const accountCodes =
    account !== null && accountHealth.usable
      ? [...new Set(account.reasonCodes)].sort()
      : [];

  const contradictions = findContradictions(
    trade?.side ?? null,
    structure,
    flow,
  );
  const prohibitions = new Set<string>();
  if (accountState === "prohibited")
    prohibitions.add("ACCOUNT_RISK_PROHIBITED");
  if (trade !== null && accountState === "unavailable")
    prohibitions.add("ACCOUNT_RISK_UNAVAILABLE");
  if (geometry === "invalid") prohibitions.add("GEOMETRY_INVALID");
  if (geometry === "unavailable") prohibitions.add("GEOMETRY_UNAVAILABLE");
  if (band === "below-minimum") prohibitions.add("REWARD_RISK_BELOW_MINIMUM");

  return {
    layer: {
      proposedSide: trade?.side ?? null,
      entrySource: trade?.entrySource ?? null,
      stopSource: trade?.stopSource ?? null,
      targetSource: trade?.targetSource ?? null,
      geometry,
      geometryReasonCodes: reasons,
      rewardRiskBand: band,
      accountRisk: { state: accountState, reasonCodes: accountCodes },
      contradictionState: contradictions.length === 0 ? "none" : "present",
      contradictions,
      prohibitionReasonCodes: [...prohibitions].sort(),
      evidenceRefs,
    },
    geometryHealth: tradeHealth.health,
    accountHealth: accountHealth.health,
  };
}
