import type { ChartDrawing } from "@options-chart/chart";

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

export interface LongRiskResult {
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
  readonly reason:
    | "ok"
    | "invalid-account"
    | "invalid-risk"
    | "invalid-entry"
    | "invalid-stop"
    | "stop-must-be-below-entry"
    | "target-must-be-above-entry";
}

export interface LongSetupDetection {
  readonly entryPriceUsd: number;
  readonly stopLossPriceUsd: number;
  readonly takeProfitPriceUsd: number;
  readonly source: "market-price" | "chart-levels";
}

const isPositiveFinite = (value: number): boolean =>
  Number.isFinite(value) && value > 0;

export const calculateLongRisk = (inputs: LongRiskInputs): LongRiskResult => {
  const riskAmountUsd = inputs.balanceUsd * (inputs.riskPercent / 100);
  const invalidResult = (reason: LongRiskResult["reason"]): LongRiskResult => ({
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
  if (inputs.stopLossPriceUsd >= inputs.entryPriceUsd) {
    return invalidResult("stop-must-be-below-entry");
  }
  if (
    inputs.takeProfitPriceUsd !== null &&
    inputs.takeProfitPriceUsd <= inputs.entryPriceUsd
  ) {
    return invalidResult("target-must-be-above-entry");
  }

  const riskPerBtcUsd = inputs.entryPriceUsd - inputs.stopLossPriceUsd;
  const positionSizeBtc = riskAmountUsd / riskPerBtcUsd;
  const notionalValueUsd = positionSizeBtc * inputs.entryPriceUsd;
  const marginRequiredUsd = notionalValueUsd / inputs.leverage;
  const rewardUsd =
    inputs.takeProfitPriceUsd === null
      ? null
      : positionSizeBtc * (inputs.takeProfitPriceUsd - inputs.entryPriceUsd);
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

export const detectLongSetupFromDrawings = (
  drawings: readonly ChartDrawing[],
  marketPriceUsd: number | null,
): LongSetupDetection | null => {
  const prices = drawings
    .filter(
      (
        drawing,
      ): drawing is Extract<ChartDrawing, { type: "horizontal-line" }> =>
        drawing.type === "horizontal-line" && isPositiveFinite(drawing.price),
    )
    .map((drawing) => drawing.price)
    .sort((left, right) => left - right);

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

  if (entryPriceUsd === null) {
    return null;
  }

  const stopLossPriceUsd = prices
    .filter((price) => price < entryPriceUsd)
    .at(-1);
  const takeProfitPriceUsd = prices.find((price) => price > entryPriceUsd);

  if (stopLossPriceUsd === undefined || takeProfitPriceUsd === undefined) {
    if (prices.length < 3) return null;
    return {
      entryPriceUsd: prices[1]!,
      stopLossPriceUsd: prices[0]!,
      takeProfitPriceUsd: prices[2]!,
      source: "chart-levels",
    };
  }

  return {
    entryPriceUsd,
    stopLossPriceUsd,
    takeProfitPriceUsd,
    source: candidateEntries.length > 0 ? "chart-levels" : "market-price",
  };
};
