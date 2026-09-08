import { describe, expect, it } from "vitest";

import {
  calculateLongRisk,
  detectLongSetupFromDrawings,
} from "./risk-calculator";

describe("risk calculator", () => {
  it("sizes a long BTC position from account risk and stop distance", () => {
    const result = calculateLongRisk({
      balanceUsd: 10_000,
      dailyLossLimitUsd: 300,
      maxDrawdownUsd: 500,
      profitTargetUsd: 1_200,
      leverage: 10,
      riskPercent: 0.5,
      entryPriceUsd: 68_296.8,
      stopLossPriceUsd: 67_800,
      takeProfitPriceUsd: 69_300,
    });

    expect(result.valid).toBe(true);
    expect(result.positionSizeBtc).toBeCloseTo(0.1006, 4);
    expect(result.notionalValueUsd).toBeCloseTo(6_873.67, 2);
    expect(result.marginRequiredUsd).toBeCloseTo(687.37, 2);
    expect(result.rewardRiskRatio).toBeCloseTo(2.02, 2);
    expect(result.tradesLeftToday).toBe(6);
    expect(result.dailyLossShare).toBeCloseTo(1 / 6, 4);
  });

  it("rejects a long setup when stop-loss is not below entry", () => {
    const result = calculateLongRisk({
      balanceUsd: 10_000,
      dailyLossLimitUsd: 300,
      maxDrawdownUsd: 500,
      profitTargetUsd: 1_200,
      leverage: 10,
      riskPercent: 0.5,
      entryPriceUsd: 68_000,
      stopLossPriceUsd: 68_200,
      takeProfitPriceUsd: 69_300,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("stop-must-be-below-entry");
  });

  it("detects stop, entry, and target from three horizontal chart levels", () => {
    const detected = detectLongSetupFromDrawings(
      [
        {
          id: "target",
          type: "horizontal-line",
          price: 69_300,
          createdAt: 1,
        },
        { id: "entry", type: "horizontal-line", price: 68_300, createdAt: 2 },
        { id: "stop", type: "horizontal-line", price: 67_800, createdAt: 3 },
      ],
      68_296,
    );

    expect(detected).toEqual({
      entryPriceUsd: 68_300,
      stopLossPriceUsd: 67_800,
      takeProfitPriceUsd: 69_300,
      source: "chart-levels",
    });
  });

  it("uses market price as entry when only stop and target lines exist", () => {
    const detected = detectLongSetupFromDrawings(
      [
        { id: "stop", type: "horizontal-line", price: 67_800, createdAt: 1 },
        {
          id: "target",
          type: "horizontal-line",
          price: 69_300,
          createdAt: 2,
        },
      ],
      68_296.8,
    );

    expect(detected).toEqual({
      entryPriceUsd: 68_296.8,
      stopLossPriceUsd: 67_800,
      takeProfitPriceUsd: 69_300,
      source: "market-price",
    });
  });

  it("detects a three-line long setup before live market price is ready", () => {
    const detected = detectLongSetupFromDrawings(
      [
        { id: "stop", type: "horizontal-line", price: 67_800, createdAt: 1 },
        { id: "entry", type: "horizontal-line", price: 68_300, createdAt: 2 },
        {
          id: "target",
          type: "horizontal-line",
          price: 69_300,
          createdAt: 3,
        },
      ],
      null,
    );

    expect(detected).toEqual({
      entryPriceUsd: 68_300,
      stopLossPriceUsd: 67_800,
      takeProfitPriceUsd: 69_300,
      source: "chart-levels",
    });
  });
});
