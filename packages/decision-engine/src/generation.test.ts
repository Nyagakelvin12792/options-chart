import { describe, expect, it } from "vitest";
import { type GenerationKey, MarketStateGenerationGate } from "./generation";
import { buildMarketState } from "./market-state-builder";
import { baseInput, NOW } from "./test-support/fixtures";

const DEFAULT_KEY: GenerationKey = {
  symbol: "BTCUSDT",
  mode: "live-shadow",
  activeTimeframe: "1h",
  expiryScope: "next-expiry",
  replayCursorMs: null,
  dataSourceGeneration: "src-1",
};

describe("MarketStateGenerationGate", () => {
  it("accepts commit with matching generation token and key", () => {
    const gate = new MarketStateGenerationGate();
    const token = gate.begin(DEFAULT_KEY);

    const input = baseInput({
      identity: {
        createdAtMs: NOW + 5,
        effectiveAtMs: NOW,
        symbol: "BTCUSDT",
        activeTimeframe: "1h",
        expiryScope: "next-expiry",
        mode: "live-shadow",
        generationId: token.generationId,
        replayCursorMs: null,
      },
    });

    const state = buildMarketState(input);
    const result = gate.commit(token, state);

    expect(result.accepted).toBe(true);
    expect(gate.active).toBe(state);
    expect(gate.isCurrent(token)).toBe(true);
  });

  it("supersedes older generation tokens when begin is called again", () => {
    const gate = new MarketStateGenerationGate();
    const token1 = gate.begin(DEFAULT_KEY);
    const token2 = gate.begin(DEFAULT_KEY);

    expect(gate.isCurrent(token1)).toBe(false);
    expect(gate.isCurrent(token2)).toBe(true);

    const input1 = baseInput({
      identity: {
        createdAtMs: NOW + 5,
        effectiveAtMs: NOW,
        symbol: "BTCUSDT",
        activeTimeframe: "1h",
        expiryScope: "next-expiry",
        mode: "live-shadow",
        generationId: token1.generationId,
        replayCursorMs: null,
      },
    });
    const state1 = buildMarketState(input1);
    const result1 = gate.commit(token1, state1);

    expect(result1.accepted).toBe(false);
    if (!result1.accepted) {
      expect(result1.reason).toBe("superseded");
    }
  });

  it("rejects commit when gate is cancelled", () => {
    const gate = new MarketStateGenerationGate();
    const token = gate.begin(DEFAULT_KEY);
    gate.cancel();

    expect(gate.isCurrent(token)).toBe(false);

    const input = baseInput({
      identity: {
        createdAtMs: NOW + 5,
        effectiveAtMs: NOW,
        symbol: "BTCUSDT",
        activeTimeframe: "1h",
        expiryScope: "next-expiry",
        mode: "live-shadow",
        generationId: token.generationId,
        replayCursorMs: null,
      },
    });
    const state = buildMarketState(input);
    const result = gate.commit(token, state);

    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.reason).toBe("cancelled");
    }
  });

  it("rejects commit when state identity does not match token key", () => {
    const gate = new MarketStateGenerationGate();
    const token = gate.begin(DEFAULT_KEY);

    const mismatchedInput = baseInput({
      identity: {
        createdAtMs: NOW + 5,
        effectiveAtMs: NOW,
        symbol: "BTCUSDT",
        activeTimeframe: "4h", // Mismatched timeframe! (Key has 1h)
        expiryScope: "next-expiry",
        mode: "live-shadow",
        generationId: token.generationId,
        replayCursorMs: null,
      },
    });
    const state = buildMarketState(mismatchedInput);
    const result = gate.commit(token, state);

    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.reason).toBe("key-mismatch");
    }
  });

  it("clears active state when a new generation key is introduced", () => {
    const gate = new MarketStateGenerationGate();
    const token1 = gate.begin(DEFAULT_KEY);
    const state1 = buildMarketState(
      baseInput({
        identity: {
          createdAtMs: NOW + 5,
          effectiveAtMs: NOW,
          symbol: "BTCUSDT",
          activeTimeframe: "1h",
          expiryScope: "next-expiry",
          mode: "live-shadow",
          generationId: token1.generationId,
          replayCursorMs: null,
        },
      }),
    );
    gate.commit(token1, state1);
    expect(gate.active).toBe(state1);

    // Switch timeframe key
    gate.begin({ ...DEFAULT_KEY, activeTimeframe: "15m" });
    expect(gate.active).toBeNull();
  });
});
