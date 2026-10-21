import { describe, expect, it, vi } from "vitest";
import { convergeDecision } from "./convergence";
import { buildDecisionContext } from "./decision-context-builder";
import { buildMarketState } from "./market-state-builder";
import { NarrationCoordinator } from "./narration-coordinator";
import {
  buildNarrationInput,
  type NarrationDraftV1,
  type NarrationProviderPort,
} from "./narration-contracts";
import { evaluateDecisionRules } from "./rules-provider";
import { baseInput } from "./test-support/fixtures";

const DRAFT: NarrationDraftV1 = {
  thesis: "Bullish evidence is aligned, subject to the deterministic boundary.",
  evidence: ["Structure and flow agree."],
  conflict: null,
  trigger: "Wait for the already-defined deterministic trigger.",
  invalidation: "Use the existing deterministic invalidation.",
  noTradeReasons: [],
};

function input() {
  const state = buildMarketState(baseInput());
  const context = buildDecisionContext(state);
  const converged = convergeDecision(context, evaluateDecisionRules(context));
  return buildNarrationInput(context, converged);
}

function narrator(
  narrate: NarrationProviderPort["narrate"],
): NarrationProviderPort {
  return {
    provider: "recorded-narrator",
    model: "recorded-v1",
    promptVersion: "narrator-v1",
    narrate,
  };
}

describe("M11.6 post-convergence narration boundary", () => {
  it("contains only IDs, classifications, reasons, warnings, and provenance versions", () => {
    const value = input();
    const serialized = JSON.stringify(value);
    expect(serialized).not.toContain("entryPrice");
    expect(serialized).not.toContain("numericEvidence");
    expect(serialized).not.toContain('"value":67000');
    expect(serialized.length).toBeLessThan(4_000);
    expect(value.assessmentId).toBeTruthy();
    expect(value.reasonCodes.length).toBeGreaterThan(0);
  });

  it("is default-off and caches successful narration by material input", async () => {
    const value = input();
    const narrate = vi.fn(async () => DRAFT);
    const coordinator = new NarrationCoordinator();

    const disabled = await coordinator.run(value, narrator(narrate));
    expect(disabled.status).toBe("disabled");
    expect(narrate).not.toHaveBeenCalled();

    const first = await coordinator.run(value, narrator(narrate), {
      enabled: true,
      now: () => 30_000,
    });
    const cached = await coordinator.run(value, narrator(narrate), {
      enabled: true,
    });
    expect(first.status).toBe("success");
    expect(first.output?.sourceEffectiveAtMs).toBe(value.effectiveAtMs);
    expect(cached.status).toBe("cache-hit");
    expect(narrate).toHaveBeenCalledTimes(1);
  });

  it("rejects stale generations and malformed narrator output", async () => {
    const value = input();
    let resolveFirst: ((draft: NarrationDraftV1) => void) | undefined;
    const firstProvider = narrator(
      () =>
        new Promise<NarrationDraftV1>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const coordinator = new NarrationCoordinator();
    const firstRun = coordinator.run(value, firstProvider, {
      enabled: true,
      timeoutMs: 1_000,
    });
    const secondRun = coordinator.run(
      value,
      narrator(async () => DRAFT),
      { enabled: true, force: true },
    );
    await secondRun;
    resolveFirst?.(DRAFT);
    expect((await firstRun).status).toBe("stale");

    const malformed = await new NarrationCoordinator().run(
      value,
      narrator(async () => ({ thesis: "missing fields" }) as NarrationDraftV1),
      { enabled: true },
    );
    expect(malformed.status).toBe("invalid-response");
  });

  it("bounds timeout and external cancellation even when providers ignore abort", async () => {
    const value = input();
    const never = narrator(() => new Promise<NarrationDraftV1>(() => {}));
    const coordinator = new NarrationCoordinator();
    const timedOut = await coordinator.run(value, never, {
      enabled: true,
      timeoutMs: 5,
    });
    expect(timedOut.status).toBe("timeout");

    const controller = new AbortController();
    controller.abort();
    const cancelled = await coordinator.run(value, never, {
      enabled: true,
      timeoutMs: 1_000,
      signal: controller.signal,
    });
    expect(cancelled.status).toBe("cancelled");
  });
});
