import { describe, expect, it } from "vitest";
import {
  buildMarketState,
  computeStateId,
  parseMarketState,
} from "./market-state-builder";
import { EvidenceCollector } from "./evidence-collector";
import { isClassificationAvailableAt } from "./flow-layer";
import {
  baseInput,
  downtrend,
  FRESH_MS,
  makeFlowSnapshot,
  NOW,
  uptrend,
} from "./test-support/fixtures";

describe("MarketStateV1 Builder & Contracts", () => {
  it("produces deterministic output and identical stateId for identical inputs", () => {
    const inputA = baseInput();
    const inputB = baseInput();

    const stateA = buildMarketState(inputA);
    const stateB = buildMarketState(inputB);

    expect(computeStateId(stateA)).toBe(computeStateId(stateB));
    expect(stateA.identity.stateId).toBe(stateB.identity.stateId);
    expect(stateA).toEqual(stateB);
    expect(Object.isFrozen(stateA)).toBe(true);
    expect(Object.isFrozen(stateA.marketStructure)).toBe(true);
  });

  it("fails if non-finite numbers are passed in numeric fields", () => {
    const input = baseInput({
      candles: {
        asOfMs: NOW - 1000,
        staleAfterMs: FRESH_MS,
        sourceVersion: "binance-spot-candle-v1",
        lastPrice: NaN,
        previousPrice: 66_950,
      },
    });
    expect(() => buildMarketState(input)).toThrow();
  });

  it("keeps 4h, 1h, and 15m structure independently visible and preserves conflict", () => {
    const input = baseInput({
      structure: {
        h4: uptrend("4h"),
        h1: {
          asOfMs: NOW - 1000,
          staleAfterMs: FRESH_MS,
          timeframe: "1h",
          formulaVersion: "swing-structure-v1",
          close: 67_000,
          lastSwingHigh: 67_100,
          prevSwingHigh: 67_100,
          lastSwingLow: 66_900,
          prevSwingLow: 66_900,
        },
        m15: downtrend("15m"),
      },
    });

    const state = buildMarketState(input);
    const structure = state.marketStructure;

    expect(structure.h4.state).toBe("uptrend");
    expect(structure.h1.state).toBe("range");
    expect(structure.m15.state).toBe("downtrend");
    expect(structure.agreement).toBe("conflicting");
  });

  it("rejects structure evidence assigned to the wrong timeframe slot", () => {
    const input = baseInput({
      structure: {
        h4: uptrend("1h"),
        h1: uptrend("1h"),
        m15: uptrend("15m"),
      },
    });

    expect(() => buildMarketState(input)).toThrow(/h4 requires timeframe 4h/);
  });

  it("rejects zones whose source is not authoritative for their kind", () => {
    const input = baseInput({
      zones: [
        {
          asOfMs: NOW - 1000,
          staleAfterMs: FRESH_MS,
          zoneId: "spoofed-gamma-wall",
          kind: "gamma-wall",
          price: 66_900,
          strength: "strong",
          formulaVersion: "wall-v1",
          source: "user-drawing",
        },
      ],
    });

    expect(() => buildMarketState(input)).toThrow(
      /gamma-wall zones require deribit provenance/,
    );
  });

  it("marks missing or stale flow as unavailable rather than zero or balanced", () => {
    const missingFlow = baseInput({ flow: null });
    const missingState = buildMarketState(missingFlow);
    expect(missingState.orderFlow.cvd.state).toBe("unavailable");
    expect(missingState.orderFlow.aggressiveFlow.state).toBe("unavailable");
    expect(missingState.orderFlow.imbalance.state).toBe("unavailable");
    expect(missingState.orderFlow.response.state).toBe("unavailable");
    expect(missingState.health.flow.state).toBe("unavailable");

    const staleFlow = baseInput({
      flow: {
        staleAfterMs: 1_000,
        snapshot: makeFlowSnapshot(Array(10).fill("buy"), NOW - 10_000),
      },
    });
    const staleState = buildMarketState(staleFlow);
    expect(staleState.orderFlow.cvd.state).toBe("unavailable");
    expect(staleState.health.flow.state).toBe("stale");
  });

  it("marks missing or stale options as unavailable rather than neutral gamma", () => {
    const missingOpt = baseInput({ options: null });
    const stateMissing = buildMarketState(missingOpt);
    expect(stateMissing.optionsRegime.gamma.state).toBe("unavailable");
    expect(stateMissing.optionsRegime.volatility.state).toBe("unavailable");
    expect(stateMissing.optionsRegime.expiryPressure.state).toBe("unavailable");

    const staleOpt = baseInput({
      options: {
        asOfMs: NOW - 100_000,
        staleAfterMs: 10_000,
        formulaVersion: "gex-model-v1",
        modeledSignedGexOnePercentUsd: 100_000_000,
        gammaFlipPrice: 65_000,
        atmIvCurrent: 0.5,
        atmIvBaseline: 0.5,
        nextExpiryMs: NOW + 3_600_000,
      },
    });
    const stateStale = buildMarketState(staleOpt);
    expect(stateStale.optionsRegime.gamma.state).toBe("unavailable");
    expect(stateStale.health.options.state).toBe("stale");
  });

  it("excludes future-dated data and records provenance without look-ahead", () => {
    const input = baseInput({
      options: {
        asOfMs: NOW + 10_000, // in the future relative to effectiveAtMs (NOW)
        staleAfterMs: FRESH_MS,
        formulaVersion: "gex-model-v1",
        modeledSignedGexOnePercentUsd: 100_000_000,
        gammaFlipPrice: 65_000,
        atmIvCurrent: 0.5,
        atmIvBaseline: 0.5,
        nextExpiryMs: NOW + 3_600_000,
      },
    });

    const state = buildMarketState(input);
    expect(state.optionsRegime.gamma.state).toBe("unavailable");
    expect(state.health.options.state).toBe("unavailable");
    expect(
      state.evidence.numericEvidence.some(
        (e) => e.name.startsWith("options.") && e.effectiveAtMs > NOW,
      ),
    ).toBe(false);
  });

  it("excludes classifications finalized after the effective-time cutoff", () => {
    expect(
      isClassificationAvailableAt(
        {
          lifecycle: "finalized",
          candidateTimestampMs: NOW - 10_000,
          finalizedTimestampMs: NOW + 1,
        },
        NOW,
      ),
    ).toBe(false);
    expect(
      isClassificationAvailableAt(
        {
          lifecycle: "finalized",
          candidateTimestampMs: NOW - 10_000,
          finalizedTimestampMs: NOW - 1,
        },
        NOW,
      ),
    ).toBe(true);
  });

  it("rejects duplicate evidence IDs with conflicting metadata", () => {
    const collector = new EvidenceCollector();
    collector.add({
      evidenceId: "same-id",
      name: "candles.lastPrice",
      value: 67_000,
      unit: "usd",
      formulaVersion: "candles-v1",
      source: "binance-spot",
      effectiveAtMs: NOW - 1000,
    });

    expect(() =>
      collector.add({
        evidenceId: "same-id",
        name: "options.gammaFlipPrice",
        value: 67_000,
        unit: "usd",
        formulaVersion: "gex-v1",
        source: "deribit",
        effectiveAtMs: NOW - 1000,
      }),
    ).toThrow(/Conflicting evidence/);
  });

  it("keeps AVWAP and Volume Profile distinct in location layer", () => {
    const input = baseInput();
    const state = buildMarketState(input);
    const loc = state.location;

    expect(loc.avwap.state).toBe("above");
    expect(loc.volumeProfile.state).toBe("inside-value");
    expect(loc.strongestSupport).not.toBeNull();

    // Without AVWAP, VP and zones remain intact
    const noAvwapInput = baseInput({ avwap: null });
    const noAvwapState = buildMarketState(noAvwapInput);
    expect(noAvwapState.location.avwap.state).toBe("unavailable");
    expect(noAvwapState.location.volumeProfile.state).toBe("inside-value");
    expect(noAvwapState.location.strongestSupport).not.toBeNull();
  });

  it("detects invalid trade geometry and marks geometry invalid", () => {
    const invalidLong = baseInput({
      proposedTrade: {
        asOfMs: NOW - 1000,
        staleAfterMs: FRESH_MS,
        side: "long",
        entryPrice: 67_000,
        stopPrice: 67_500, // Invalid: stop is above entry for long!
        targetPrice: 68_000,
        entrySource: "market-price",
        stopSource: "swing-low",
        targetSource: "resistance-zone",
        rewardRiskRatio: 2,
        rewardRiskFormulaVersion: "risk-terminal-v1",
      },
    });

    const state = buildMarketState(invalidLong);
    expect(state.tradeQuality.geometry).toBe("invalid");
    expect(state.tradeQuality.geometryReasonCodes).toContain(
      "stop-must-be-below-entry",
    );
    expect(state.tradeQuality.prohibitionReasonCodes).toContain(
      "GEOMETRY_INVALID",
    );
  });

  it("enforces account-risk prohibitions unconditionally", () => {
    const prohibitedAccount = baseInput({
      accountRisk: {
        asOfMs: NOW - 1000,
        staleAfterMs: FRESH_MS,
        state: "prohibited",
        reasonCodes: ["DAILY_MAX_DRAWDOWN_EXCEEDED"],
      },
    });

    const state = buildMarketState(prohibitedAccount);
    expect(state.tradeQuality.accountRisk.state).toBe("prohibited");
    expect(state.tradeQuality.prohibitionReasonCodes).toContain(
      "ACCOUNT_RISK_PROHIBITED",
    );
  });

  it("validates serialized state against schema with parseMarketState", () => {
    const state = buildMarketState(baseInput());
    const roundTripped = parseMarketState(JSON.parse(JSON.stringify(state)));
    expect(roundTripped.identity.stateId).toBe(state.identity.stateId);
    expect(roundTripped.identity.schemaVersion).toBe("market-state-v1");

    expect(() =>
      parseMarketState({
        ...state,
        identity: { ...state.identity, schemaVersion: "market-state-v2" },
      }),
    ).toThrow();
  });
});
