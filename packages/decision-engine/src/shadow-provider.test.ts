import { describe, expect, it, vi } from "vitest";
import { convergeDecision } from "./convergence";
import {
  DecisionAssessmentV1Schema,
  type DecisionAssessmentV1,
  type DecisionContextV1,
} from "./decision-contracts";
import { buildDecisionContext } from "./decision-context-builder";
import { JevDecisionProvider } from "./jev-provider";
import { buildMarketState } from "./market-state-builder";
import { evaluateDecisionRules } from "./rules-provider";
import {
  InMemoryShadowProviderRunStore,
  type ShadowDecisionProviderPort,
} from "./shadow-provider-contracts";
import { runShadowProvider } from "./shadow-provider-runner";
import { baseInput } from "./test-support/fixtures";

function jevAssessment(context: DecisionContextV1): DecisionAssessmentV1 {
  const baseline = evaluateDecisionRules(context);
  return DecisionAssessmentV1Schema.parse({
    ...baseline,
    assessmentId: `jev-test-${context.contextId}`,
    provider: "jev-v1",
    providerVersion: "jev-test-v1",
    promptVersion: "jev-test-prompt-v1",
  });
}

function provider(
  assess: ShadowDecisionProviderPort["assess"],
): ShadowDecisionProviderPort {
  return { provider: "jev-v1", providerVersion: "jev-test-v1", assess };
}

describe("M11.6 shadow provider runner", () => {
  it("is default-off and records disabled runs without calling the provider", async () => {
    const context = buildDecisionContext(buildMarketState(baseInput()));
    const assess = vi.fn(async () => jevAssessment(context));
    const record = await runShadowProvider(context, provider(assess));

    expect(record.status).toBe("disabled");
    expect(record.assessment).toBeNull();
    expect(assess).not.toHaveBeenCalled();
  });

  it("records validated assessments and rejects stale or mismatched results", async () => {
    const context = buildDecisionContext(buildMarketState(baseInput()));
    const success = await runShadowProvider(
      context,
      provider(async () => jevAssessment(context)),
      { enabled: true, now: () => 10_000 },
    );
    expect(success.status).toBe("success");
    expect(success.assessment?.contextId).toBe(context.contextId);

    const stale = await runShadowProvider(
      context,
      provider(async () => jevAssessment(context)),
      { enabled: true, isContextCurrent: () => false },
    );
    expect(stale.status).toBe("stale");
    expect(stale.assessment).toBeNull();

    const otherContext = buildDecisionContext(
      buildMarketState(
        baseInput({
          identity: { ...baseInput().identity, generationId: "other" },
        }),
      ),
    );
    const mismatch = await runShadowProvider(
      context,
      provider(async () => jevAssessment(otherContext)),
      { enabled: true },
    );
    expect(mismatch.status).toBe("invalid-response");
    expect(mismatch.errorCode).toBe("PROVIDER_CONTEXT_MISMATCH");
  });

  it("bounds ignored cancellation and timeout with fail-closed records", async () => {
    const context = buildDecisionContext(buildMarketState(baseInput()));
    const never = provider(() => new Promise<DecisionAssessmentV1>(() => {}));

    const timedOut = await runShadowProvider(context, never, {
      enabled: true,
      timeoutMs: 5,
    });
    expect(timedOut.status).toBe("timeout");
    expect(timedOut.assessment).toBeNull();

    const controller = new AbortController();
    controller.abort("superseded");
    const cancelled = await runShadowProvider(context, never, {
      enabled: true,
      timeoutMs: 1_000,
      signal: controller.signal,
    });
    expect(cancelled.status).toBe("cancelled");
  });

  it("stores immutable provider-run audit records by context", async () => {
    const context = buildDecisionContext(buildMarketState(baseInput()));
    const record = await runShadowProvider(
      context,
      provider(async () => jevAssessment(context)),
      { enabled: true },
    );
    const store = new InMemoryShadowProviderRunStore();
    store.append(record);
    store.append(record);
    expect(store.getByContextId(context.contextId)).toHaveLength(1);
    expect(Object.isFrozen(record)).toBe(true);
  });
});

describe("Jev REST adapter", () => {
  it("sends compact closed-choice state and validates probabilities", async () => {
    const context = buildDecisionContext(buildMarketState(baseInput()));
    let capturedBody: unknown;
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            model: "jev-1.14.0",
            answers: {
              decision: {
                type: "choice",
                choice: "confirm-long",
                confidence: 0.88,
                probabilities: {
                  "no-trade": 0.03,
                  "watch-long": 0.06,
                  "watch-short": 0.01,
                  "confirm-long": 0.88,
                  "confirm-short": 0.01,
                  "insufficient-data": 0.01,
                },
              },
            },
            usage: { input_tokens: 320, output_tokens: 12 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    );
    const times = [20_000, 20_012];
    const adapter = new JevDecisionProvider({
      apiKey: "test-secret",
      fetchImpl: fetchImpl as typeof fetch,
      now: () => times.shift() ?? 20_012,
    });
    const assessment = await adapter.assess(
      context,
      new AbortController().signal,
    );

    expect(assessment.provider).toBe("jev-v1");
    expect(assessment.providerVersion).toBe("jev-1.14.0");
    expect(assessment.choice).toBe("confirm-long");
    expect(assessment.latencyMs).toBe(12);
    expect(convergeDecision(context, assessment).choice).toBe("confirm-long");
    expect(JSON.stringify(capturedBody)).not.toContain("test-secret");
    expect(JSON.stringify(capturedBody)).not.toContain("formulaVersions");
    expect(JSON.stringify(capturedBody).length).toBeLessThan(4_000);
    expect(
      (capturedBody as { questions: { decision: { criteria: object } } })
        .questions.decision.criteria,
    ).toHaveProperty("insufficient-data");
  });

  it("classifies malformed Jev payloads as invalid provider responses", async () => {
    const context = buildDecisionContext(buildMarketState(baseInput()));
    const adapter = new JevDecisionProvider({
      apiKey: "test-secret",
      fetchImpl: vi.fn(
        async () =>
          new Response(JSON.stringify({ model: "jev-latest", answers: {} }), {
            status: 200,
          }),
      ) as typeof fetch,
    });
    const record = await runShadowProvider(context, adapter, {
      enabled: true,
    });
    expect(record.status).toBe("invalid-response");
    expect(record.errorCode).toBe("JEV_SCHEMA_INVALID");
  });
});
