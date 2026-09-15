import type { ChartDrawing } from "@options-chart/chart";

export type PositionSide = "long" | "short";

export interface LongRiskInputs {
  readonly balanceUsd: number;
  readonly dailyLossLimitUsd: number;
  readonly maxDrawdownUsd: number;
  readonly profitTargetUsd: number;
  readonly leverage: number;
  readonly riskPercent: number;
  readonly entryPriceUsd: number;
  readonly stopLossPriceUsd: number;
  readonly takeProfitPriceUsd: number | null;
}

export interface PositionRiskInputs extends LongRiskInputs {
  readonly side: PositionSide;
}

export type PositionRiskReason =
  | "ok"
  | "invalid-account"
  | "invalid-risk"
  | "invalid-entry"
  | "invalid-stop"
  | "stop-must-be-below-entry"
  | "stop-must-be-above-entry"
  | "target-must-be-above-entry"
  | "target-must-be-below-entry";

export interface PositionRiskResult {
  readonly valid: boolean;
  readonly riskAmountUsd: number;
  readonly riskPerBtcUsd: number;
  readonly positionSizeBtc: number;
  readonly notionalValueUsd: number;
  readonly marginRequiredUsd: number;
  readonly rewardUsd: number | null;
  readonly rewardRiskRatio: number | null;
  readonly tradesLeftToday: number | null;
  readonly dailyLossShare: number | null;
  readonly maxDrawdownShare: number | null;
  readonly profitTargetShare: number | null;
  readonly reason: PositionRiskReason;
}

export type LongRiskResult = PositionRiskResult;

interface SetupDetection {
  readonly entryPriceUsd: number;
  readonly stopLossPriceUsd: number;
  readonly takeProfitPriceUsd: number;
  readonly source: "market-price" | "chart-levels" | "position-tool";
}

export interface PositionSetupDetection extends SetupDetection {
  readonly side: PositionSide;
}

export type LongSetupDetection = SetupDetection;

const isPositiveFinite = (value: number): boolean =>
  Number.isFinite(value) && value > 0;

export const calculatePositionRisk = (
  inputs: PositionRiskInputs,
): PositionRiskResult => {
  const riskAmountUsd = inputs.balanceUsd * (inputs.riskPercent / 100);
  const invalidResult = (
    reason: PositionRiskResult["reason"],
  ): PositionRiskResult => ({
    valid: false,
    riskAmountUsd: Number.isFinite(riskAmountUsd)
      ? Math.max(0, riskAmountUsd)
      : 0,
    riskPerBtcUsd: 0,
    positionSizeBtc: 0,
    notionalValueUsd: 0,
    marginRequiredUsd: 0,
    rewardUsd: null,
    rewardRiskRatio: null,
    tradesLeftToday: null,
    dailyLossShare: null,
    maxDrawdownShare: null,
    profitTargetShare: null,
    reason,
  });

  if (
    !isPositiveFinite(inputs.balanceUsd) ||
    !isPositiveFinite(inputs.dailyLossLimitUsd) ||
    !isPositiveFinite(inputs.maxDrawdownUsd) ||
    !isPositiveFinite(inputs.leverage)
  ) {
    return invalidResult("invalid-account");
  }
  if (!isPositiveFinite(riskAmountUsd)) return invalidResult("invalid-risk");
  if (!isPositiveFinite(inputs.entryPriceUsd)) {
    return invalidResult("invalid-entry");
  }
  if (!isPositiveFinite(inputs.stopLossPriceUsd)) {
    return invalidResult("invalid-stop");
  }

  const isLong = inputs.side === "long";
  if (isLong && inputs.stopLossPriceUsd >= inputs.entryPriceUsd) {
    return invalidResult("stop-must-be-below-entry");
  }
  if (!isLong && inputs.stopLossPriceUsd <= inputs.entryPriceUsd) {
    return invalidResult("stop-must-be-above-entry");
  }
  if (
    inputs.takeProfitPriceUsd !== null &&
    isLong &&
    inputs.takeProfitPriceUsd <= inputs.entryPriceUsd
  ) {
    return invalidResult("target-must-be-above-entry");
  }
  if (
    inputs.takeProfitPriceUsd !== null &&
    !isLong &&
    inputs.takeProfitPriceUsd >= inputs.entryPriceUsd
  ) {
    return invalidResult("target-must-be-below-entry");
  }

  const riskPerBtcUsd = Math.abs(
    inputs.entryPriceUsd - inputs.stopLossPriceUsd,
  );
  const positionSizeBtc = riskAmountUsd / riskPerBtcUsd;
  const notionalValueUsd = positionSizeBtc * inputs.entryPriceUsd;
  const marginRequiredUsd = notionalValueUsd / inputs.leverage;
  const rewardPerBtcUsd =
    inputs.takeProfitPriceUsd === null
      ? null
      : isLong
        ? inputs.takeProfitPriceUsd - inputs.entryPriceUsd
        : inputs.entryPriceUsd - inputs.takeProfitPriceUsd;
  const rewardUsd =
    rewardPerBtcUsd === null ? null : positionSizeBtc * rewardPerBtcUsd;
  const rewardRiskRatio = rewardUsd === null ? null : rewardUsd / riskAmountUsd;

  return {
    valid: true,
    riskAmountUsd,
    riskPerBtcUsd,
    positionSizeBtc,
    notionalValueUsd,
    marginRequiredUsd,
    rewardUsd,
    rewardRiskRatio,
    tradesLeftToday: Math.floor(inputs.dailyLossLimitUsd / riskAmountUsd),
    dailyLossShare: riskAmountUsd / inputs.dailyLossLimitUsd,
    maxDrawdownShare: riskAmountUsd / inputs.maxDrawdownUsd,
    profitTargetShare:
      inputs.profitTargetUsd > 0 && rewardUsd !== null
        ? rewardUsd / inputs.profitTargetUsd
        : null,
    reason: "ok",
  };
};

export const calculateLongRisk = (inputs: LongRiskInputs): LongRiskResult =>
  calculatePositionRisk({ ...inputs, side: "long" });

export const detectPositionSetupFromDrawings = (
  drawings: readonly ChartDrawing[],
  marketPriceUsd: number | null,
  side: PositionSide,
): PositionSetupDetection | null => {
  const position = drawings
    .filter(
      (drawing): drawing is Extract<ChartDrawing, { type: "position" }> =>
        drawing.type === "position" &&
        drawing.direction === side &&
        isPositiveFinite(drawing.entry) &&
        isPositiveFinite(drawing.stopLoss) &&
        isPositiveFinite(drawing.takeProfit),
    )
    .sort((left, right) => right.createdAt - left.createdAt)[0];
  if (position) {
    return {
      side,
      entryPriceUsd: position.entry,
      stopLossPriceUsd: position.stopLoss,
      takeProfitPriceUsd: position.takeProfit,
      source: "position-tool",
    };
  }

  const prices = [
    ...new Set(
      drawings
        .filter(
          (
            drawing,
          ): drawing is Extract<ChartDrawing, { type: "horizontal-line" }> =>
            drawing.type === "horizontal-line" &&
            isPositiveFinite(drawing.price),
        )
        .map((drawing) => drawing.price),
    ),
  ].sort((left, right) => left - right);

  if (prices.length < 2) return null;

  const candidateEntries = prices.filter(
    (price) =>
      prices.some((candidate) => candidate < price) &&
      prices.some((candidate) => candidate > price),
  );
  const entryPriceUsd =
    candidateEntries.length > 0
      ? marketPriceUsd !== null && isPositiveFinite(marketPriceUsd)
        ? candidateEntries.reduce((closest, candidate) =>
            Math.abs(candidate - marketPriceUsd) <
            Math.abs(closest - marketPriceUsd)
              ? candidate
              : closest,
          )
        : (candidateEntries[Math.floor(candidateEntries.length / 2)] ?? null)
      : marketPriceUsd !== null && isPositiveFinite(marketPriceUsd)
        ? marketPriceUsd
        : null;

  if (entryPriceUsd === null) return null;

  const lowerPrice = prices.filter((price) => price < entryPriceUsd).at(-1);
  const upperPrice = prices.find((price) => price > entryPriceUsd);
  if (lowerPrice === undefined || upperPrice === undefined) return null;

  return {
    side,
    entryPriceUsd,
    stopLossPriceUsd: side === "long" ? lowerPrice : upperPrice,
    takeProfitPriceUsd: side === "long" ? upperPrice : lowerPrice,
    source: candidateEntries.length > 0 ? "chart-levels" : "market-price",
  };
};

export const detectLongSetupFromDrawings = (
  drawings: readonly ChartDrawing[],
  marketPriceUsd: number | null,
): LongSetupDetection | null => {
  const detected = detectPositionSetupFromDrawings(
    drawings,
    marketPriceUsd,
    "long",
  );
  if (!detected) return null;

  return {
    entryPriceUsd: detected.entryPriceUsd,
    stopLossPriceUsd: detected.stopLossPriceUsd,
    takeProfitPriceUsd: detected.takeProfitPriceUsd,
    source: detected.source,
  };
};
