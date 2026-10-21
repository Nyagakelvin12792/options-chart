import { z } from "zod";
import {
  DECISION_ASSESSMENT_SCHEMA_VERSION,
  DECISION_CHOICES,
  DecisionChoiceSchema,
  DecisionDistributionV1Schema,
  type DecisionAssessmentV1,
  type DecisionChoice,
  type DecisionContextV1,
} from "./decision-contracts";
import { computeAssessmentId, parseDecisionAssessment } from "./rules-provider";
import type { ShadowDecisionProviderPort } from "./shadow-provider-contracts";
import { ShadowProviderError } from "./shadow-provider-runner";

export const JEV_PROMPT_VERSION = "jev-decision-question-v1" as const;
export const DEFAULT_JEV_ENDPOINT =
  "https://api.typesafe.ai/v1/systemone" as const;
export const DEFAULT_JEV_MODEL = "jev-latest" as const;

const ratio01 = z.number().refine((value) => value >= 0 && value <= 1);
const JevChoiceAnswerSchema = z.strictObject({
  type: z.literal("choice"),
  choice: DecisionChoiceSchema,
  confidence: ratio01,
  probabilities: z.record(z.string(), ratio01),
});
const JevResponseSchema = z.strictObject({
  model: z.string().min(1),
  answers: z.strictObject({ decision: JevChoiceAnswerSchema }),
  usage: z.strictObject({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
  }),
});

export interface JevProviderConfig {
  readonly apiKey: string;
  readonly endpoint?: string;
  readonly model?: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
}

const DECISION_CRITERIA: Readonly<Record<DecisionChoice, string>> = {
  "no-trade":
    "Evidence is contradictory, risk is not justified, or the setup should be rejected.",
  "watch-long":
    "Long-side evidence is developing but lacks enough confirmation for a confirmed setup.",
  "watch-short":
    "Short-side evidence is developing but lacks enough confirmation for a confirmed setup.",
  "confirm-long":
    "Structure, location, flow, and options regime coherently support the proposed long setup.",
  "confirm-short":
    "Structure, location, flow, and options regime coherently support the proposed short setup.",
  "insufficient-data":
    "Required evidence is unavailable, stale, or inadequate for a semantic assessment.",
};

/** Removes numeric evidence, prices, balances, and sizing from the Jev payload. */
export function buildJevDecisionState(context: DecisionContextV1): unknown {
  return {
    schemaVersion: context.schemaVersion,
    contextId: context.contextId,
    effectiveAtMs: context.effectiveAtMs,
    symbol: context.symbol,
    activeTimeframe: context.activeTimeframe,
    expiryScope: context.expiryScope,
    mode: context.mode,
    dataHealth: context.dataHealth,
    marketStructure: context.marketStructure,
    optionsRegime: context.optionsRegime,
    location: context.location,
    orderFlow: context.orderFlow,
    proposedTrade: context.proposedTrade,
    accountRisk: context.accountRisk,
    contradictions: context.contradictions,
    prohibitionReasonCodes: context.prohibitionReasonCodes,
    includedVenues: context.includedVenues,
    warnings: context.warnings,
  };
}

function distributionOf(raw: Record<string, number>) {
  const distribution = Object.fromEntries(
    DECISION_CHOICES.map((choice) => [choice, raw[choice]]),
  );
  return DecisionDistributionV1Schema.parse(distribution);
}

export class JevDecisionProvider implements ShadowDecisionProviderPort {
  public readonly provider = "jev-v1" as const;
  public readonly providerVersion: string;
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  public constructor(config: JevProviderConfig) {
    const apiKey = config.apiKey.trim();
    if (apiKey.length === 0) {
      throw new ShadowProviderError(
        "JEV_API_KEY_MISSING",
        "Jev API key is required when the provider is enabled",
      );
    }
    this.apiKey = apiKey;
    this.endpoint = config.endpoint ?? DEFAULT_JEV_ENDPOINT;
    this.providerVersion = config.model ?? DEFAULT_JEV_MODEL;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.now = config.now ?? Date.now;
  }

  public async assess(
    context: DecisionContextV1,
    signal: AbortSignal,
  ): Promise<DecisionAssessmentV1> {
    const startedAtMs = this.now();
    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.providerVersion,
          state: buildJevDecisionState(context),
          questions: {
            decision: {
              type: "choice",
              instructions:
                "Classify this read-only BTC market setup. Do not invent prices, calculate risk, or override deterministic prohibitions.",
              criteria: DECISION_CRITERIA,
            },
          },
        }),
        signal,
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new ShadowProviderError(
        "JEV_NETWORK_ERROR",
        "Jev request failed before a response was received",
      );
    }

    if (!response.ok) {
      throw new ShadowProviderError(
        `JEV_HTTP_${response.status}`,
        `Jev returned HTTP ${response.status}`,
      );
    }

    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw new ShadowProviderError(
        "JEV_INVALID_JSON",
        "Jev returned invalid JSON",
        "invalid-response",
      );
    }

    const parsed = JevResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ShadowProviderError(
        "JEV_SCHEMA_INVALID",
        "Jev response failed runtime validation",
        "invalid-response",
      );
    }
    const answer = parsed.data.answers.decision;
    const distribution = distributionOf(answer.probabilities);
    const completedAtMs = Math.max(startedAtMs, this.now());
    const content = {
      schemaVersion: DECISION_ASSESSMENT_SCHEMA_VERSION,
      contextId: context.contextId,
      provider: this.provider,
      providerVersion: parsed.data.model,
      promptVersion: JEV_PROMPT_VERSION,
      startedAtMs,
      completedAtMs,
      isStale: false,
      checks: [
        {
          checkId: "jev-typed-decision",
          status: "pass" as const,
          reasonCode: "JEV_TYPED_RESPONSE_VALID",
          message: "Jev returned a validated closed-choice assessment",
        },
      ],
      choice: answer.choice,
      distribution,
      confidence: answer.confidence,
      reasonCodes: ["JEV_TYPED_ASSESSMENT"],
      summary: `Jev typed assessment: ${answer.choice}`,
      warnings: [],
      latencyMs: completedAtMs - startedAtMs,
    };
    return parseDecisionAssessment({
      ...content,
      assessmentId: computeAssessmentId(content),
    });
  }
}
