import { describe, expect, it } from "vitest";

import type { DecisionDistributionV1 } from "./decision-contracts";
import { evaluateShadowObservations } from "./evaluation";
import { simulateConservativePaperOrder } from "./paper-ledger";

const distribution: DecisionDistributionV1 = {
  "no-trade": 0.1,
  "watch-long": 0.1,
  "watch-short": 0.1,
  "confirm-long": 0.6,
  "confirm-short": 0.05,
  "insufficient-data": 0.05,
};

describe("shadow evaluation", () => {
  it("reports rules-versus-provider coverage, calibration, and ablations", () => {
    const report = evaluateShadowObservations([
      {
        observationId: "one",
        effectiveAtMs: 1_000,
        horizonEndMs: 2_000,
        baselineChoice: "watch-long",
        providerChoice: "confirm-long",
        convergedChoice: "watch-long",
        providerDistribution: distribution,
        providerStatus: "success",
        staleDecision: false,
        referencePrice: 100,
        horizonEndPrice: 102,
        mfeBps: 250,
        maeBps: -40,
        structure: "aligned-up",
        flow: "buy",
        optionsRegime: "positive",
        timeframe: "1h",
        expiryScope: "next-expiry",
      },
      {
        observationId: "two",
        effectiveAtMs: 2_000,
        horizonEndMs: 3_000,
        baselineChoice: "no-trade",
        providerChoice: null,
        convergedChoice: "no-trade",
        providerDistribution: null,
        providerStatus: "timeout",
        staleDecision: true,
        referencePrice: 102,
        horizonEndPrice: 101,
        mfeBps: 20,
        maeBps: -120,
        structure: "mixed",
        flow: "unavailable",
        optionsRegime: "transition",
        timeframe: "1h",
        expiryScope: "next-expiry",
      },
    ]);

    expect(report.sampleSize).toBe(2);
    expect(report.providerCoverageRatio).toBe(0.5);
    expect(report.staleDecisionRatio).toBe(0.5);
    expect(report.convergenceChangeRatio).toBe(1);
    expect(report.calibration.status).toBe("measured");
    expect(report.calibration.multiclassBrierScore).toBeGreaterThan(0);
    expect(report.ablations).toContainEqual(
      expect.objectContaining({ dimension: "flow", value: "buy", count: 1 }),
    );
  });

  it("keeps calibration pending with no held-out provider observations", () => {
    const report = evaluateShadowObservations([]);
    expect(report.sampleSize).toBe(0);
    expect(report.calibration).toEqual(
      expect.objectContaining({
        sampleSize: 0,
        status: "pending",
        multiclassBrierScore: null,
      }),
    );
  });
});

describe("conservative paper ledger", () => {
  it("uses a partial fill and assumes the stop wins a same-bar ambiguity", () => {
    const entry = simulateConservativePaperOrder(
      {
        orderId: "paper-one",
        side: "long",
        quantityBtc: 1,
        entryPrice: 100,
        stopPrice: 95,
        targetPrice: 110,
        feeBps: 5,
        slippageBps: 10,
      },
      [
        {
          openTime: 1,
          high: 111,
          low: 94,
          close: 105,
          availableLiquidityBtc: 2,
        },
      ],
    );

    expect(entry.status).toBe("partial");
    expect(entry.filledQuantityBtc).toBe(0.5);
    expect(entry.exitReason).toBe("stop");
    expect(entry.netPnlUsd).toBeLessThan(entry.grossPnlUsd);
  });
});
