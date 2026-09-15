import { describe, expect, it } from "vitest";

import {
  calculateLongRisk,
  calculatePositionRisk,
  detectLongSetupFromDrawings,
  detectPositionSetupFromDrawings,
} from "./risk-calculator";

describe("risk calculator", () => {
  it("prefers the latest matching position tool over loose chart levels", () => {
    const detection = detectPositionSetupFromDrawings(
      [
        { id: "low", type: "horizontal-line", price: 59_000, createdAt: 1 },
        { id: "high", type: "horizontal-line", price: 61_000, createdAt: 2 },
        {
          id: "position",
          type: "position",
          direction: "long",
          entry: 60_100,
          stopLoss: 59_800,
          takeProfit: 60_700,
          createdAt: 3,
        },
      ],
      60_000,
      "long",
    );

    expect(detection).toEqual({
      side: "long",
      entryPriceUsd: 60_100,
      stopLossPriceUsd: 59_800,
      takeProfitPriceUsd: 60_700,
      source: "position-tool",
    });
  });
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

  it("sizes a short BTC position with direction-neutral risk metrics", () => {
    const result = calculatePositionRisk({
      side: "short",
      balanceUsd: 10_000,
      dailyLossLimitUsd: 300,
      maxDrawdownUsd: 500,
      profitTargetUsd: 1_200,
      leverage: 10,
      riskPercent: 0.5,
      entryPriceUsd: 68_300,
      stopLossPriceUsd: 68_800,
      takeProfitPriceUsd: 67_300,
    });

    expect(result.valid).toBe(true);
    expect(result.riskAmountUsd).toBe(50);
    expect(result.riskPerBtcUsd).toBe(500);
    expect(result.positionSizeBtc).toBeCloseTo(0.1, 6);
    expect(result.notionalValueUsd).toBeCloseTo(6_830, 2);
    expect(result.marginRequiredUsd).toBeCloseTo(683, 2);
    expect(result.rewardUsd).toBeCloseTo(100, 2);
    expect(result.rewardRiskRatio).toBeCloseTo(2, 6);
    expect(result.tradesLeftToday).toBe(6);
    expect(result.dailyLossShare).toBeCloseTo(1 / 6, 6);
    expect(result.maxDrawdownShare).toBeCloseTo(0.1, 6);
    expect(result.profitTargetShare).toBeCloseTo(1 / 12, 6);
  });

  it.each([
    {
      stopLossPriceUsd: 67_900,
      takeProfitPriceUsd: 67_000,
      reason: "stop-must-be-above-entry",
    },
    {
      stopLossPriceUsd: 68_500,
      takeProfitPriceUsd: 68_200,
      reason: "target-must-be-below-entry",
    },
  ] as const)("rejects an invalid short setup: $reason", (invalidSetup) => {
    const result = calculatePositionRisk({
      side: "short",
      balanceUsd: 10_000,
      dailyLossLimitUsd: 300,
      maxDrawdownUsd: 500,
      profitTargetUsd: 1_200,
      leverage: 10,
      riskPercent: 0.5,
      entryPriceUsd: 68_000,
      stopLossPriceUsd: invalidSetup.stopLossPriceUsd,
      takeProfitPriceUsd: invalidSetup.takeProfitPriceUsd,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe(invalidSetup.reason);
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

  it("detects a short stop, entry, and target from three chart levels", () => {
    const detected = detectPositionSetupFromDrawings(
      [
        { id: "stop", type: "horizontal-line", price: 69_000, createdAt: 1 },
        { id: "entry", type: "horizontal-line", price: 68_300, createdAt: 2 },
        {
          id: "target",
          type: "horizontal-line",
          price: 67_300,
          createdAt: 3,
        },
      ],
      68_296,
      "short",
    );

    expect(detected).toEqual({
      side: "short",
      entryPriceUsd: 68_300,
      stopLossPriceUsd: 69_000,
      takeProfitPriceUsd: 67_300,
      source: "chart-levels",
    });
  });

  it("uses market price as short entry between target and stop lines", () => {
    const detected = detectPositionSetupFromDrawings(
      [
        { id: "target", type: "horizontal-line", price: 67_300, createdAt: 1 },
        { id: "stop", type: "horizontal-line", price: 69_000, createdAt: 2 },
      ],
      68_300,
      "short",
    );

    expect(detected).toEqual({
      side: "short",
      entryPriceUsd: 68_300,
      stopLossPriceUsd: 69_000,
      takeProfitPriceUsd: 67_300,
      source: "market-price",
    });
  });

  it("requires distinct levels around the detected entry", () => {
    const detected = detectPositionSetupFromDrawings(
      [
        { id: "one", type: "horizontal-line", price: 68_000, createdAt: 1 },
        {
          id: "duplicate",
          type: "horizontal-line",
          price: 68_000,
          createdAt: 2,
        },
      ],
      68_000,
      "long",
    );

    expect(detected).toBeNull();
  });
});
