import { z } from "zod";
import {
  DECISION_SYMBOL,
  DecisionModeSchema,
  SourceHealthStateSchema,
  StructureAgreementSchema,
  StructureStateSchema,
  TimeframeSchema,
  TradeSideSchema,
} from "./market-state-contracts";

export const DECISION_CONTEXT_SCHEMA_VERSION = "decision-context-v1" as const;
export const DECISION_ASSESSMENT_SCHEMA_VERSION =
  "decision-assessment-v1" as const;
export const SHADOW_DECISION_RECORD_SCHEMA_VERSION =
  "shadow-decision-record-v1" as const;

export const DecisionChoiceSchema = z.enum([
  "no-trade",
  "watch-long",
  "watch-short",
  "confirm-long",
  "confirm-short",
  "insufficient-data",
]);
export type DecisionChoice = z.infer<typeof DecisionChoiceSchema>;

export const DECISION_CHOICES: readonly DecisionChoice[] = [
  "no-trade",
  "watch-long",
  "watch-short",
  "confirm-long",
  "confirm-short",
  "insufficient-data",
] as const;

const finite = z.number().refine(Number.isFinite, "must be finite");
const ratio01 = finite.refine((v) => v >= 0 && v <= 1, "must be within [0, 1]");
const timestampMs = z.number().int().nonnegative();
const nonEmpty = z.string().min(1);

export const DecisionDistributionV1Schema = z
  .strictObject({
    "no-trade": ratio01,
    "watch-long": ratio01,
    "watch-short": ratio01,
    "confirm-long": ratio01,
    "confirm-short": ratio01,
    "insufficient-data": ratio01,
  })
  .refine(
    (dist) => {
      const sum =
        dist["no-trade"] +
        dist["watch-long"] +
        dist["watch-short"] +
        dist["confirm-long"] +
        dist["confirm-short"] +
        dist["insufficient-data"];
      return Math.abs(sum - 1.0) < 1e-4;
    },
    {
      message:
        "decision distribution probabilities must sum to 1.0 within tolerance",
    },
  );
export type DecisionDistributionV1 = z.infer<
  typeof DecisionDistributionV1Schema
>;

export const DecisionCheckStatusSchema = z.enum([
  "pass",
  "fail",
  "warn",
  "unavailable",
]);
export type DecisionCheckStatus = z.infer<typeof DecisionCheckStatusSchema>;

export const DecisionCheckResultV1Schema = z.strictObject({
  checkId: nonEmpty,
  status: DecisionCheckStatusSchema,
  reasonCode: nonEmpty,
  message: nonEmpty,
});
export type DecisionCheckResultV1 = z.infer<typeof DecisionCheckResultV1Schema>;

export const DecisionProviderSchema = z.enum([
  "deterministic-rules-v1",
  "recorded-v1",
]);
export type DecisionProvider = z.infer<typeof DecisionProviderSchema>;

// --------------------------------------------------------- DecisionContextV1
export const DecisionContextV1Schema = z.strictObject({
  schemaVersion: z.literal(DECISION_CONTEXT_SCHEMA_VERSION),
  contextId: nonEmpty,
  stateId: nonEmpty,
  createdAtMs: timestampMs,
  effectiveAtMs: timestampMs,
  symbol: z.literal(DECISION_SYMBOL),
  activeTimeframe: TimeframeSchema,
  expiryScope: nonEmpty,
  mode: DecisionModeSchema,
  dataHealth: z.strictObject({
    candles: SourceHealthStateSchema,
    options: SourceHealthStateSchema,
    flow: SourceHealthStateSchema,
    geometry: SourceHealthStateSchema,
    accountRisk: SourceHealthStateSchema,
    isStale: z.boolean(),
    hasWarnings: z.boolean(),
  }),
  marketStructure: z.strictObject({
    h4: StructureStateSchema,
    h1: StructureStateSchema,
    m15: StructureStateSchema,
    agreement: StructureAgreementSchema,
  }),
  optionsRegime: z.strictObject({
    gamma: z.enum(["positive", "negative", "transition", "unavailable"]),
    volatility: z.enum(["contracting", "normal", "expanding", "unavailable"]),
    expiryPressure: z.enum(["none", "building", "imminent", "unavailable"]),
  }),
  location: z.strictObject({
    avwap: z.enum(["above", "at", "below", "unavailable"]),
    volumeProfile: z.enum([
      "above-value",
      "inside-value",
      "below-value",
      "unavailable",
    ]),
    supportStrength: z.enum([
      "none",
      "weak",
      "moderate",
      "strong",
      "unavailable",
    ]),
    resistanceStrength: z.enum([
      "none",
      "weak",
      "moderate",
      "strong",
      "unavailable",
    ]),
    wallInteraction: z.enum([
      "none",
      "approaching",
      "testing",
      "through",
      "unavailable",
    ]),
    hasNearSupport: z.boolean(),
    hasNearResistance: z.boolean(),
  }),
  orderFlow: z.strictObject({
    cvd: z.enum([
      "strong-sell",
      "sell",
      "balanced",
      "buy",
      "strong-buy",
      "unavailable",
    ]),
    aggressiveFlow: z.enum([
      "strong-sell",
      "sell",
      "balanced",
      "buy",
      "strong-buy",
      "unavailable",
    ]),
    imbalance: z.enum(["bid-heavy", "ask-heavy", "balanced", "unavailable"]),
    responseState: z.enum([
      "absorption-pending",
      "rejection",
      "acceptance",
      "unresolved",
      "none",
      "unavailable",
    ]),
    responseDirection: z.enum(["bullish", "bearish"]).nullable(),
  }),
  proposedTrade: z
    .strictObject({
      side: TradeSideSchema,
      geometry: z.enum(["valid", "invalid", "unavailable", "none"]),
      rewardRiskBand: z.enum([
        "below-minimum",
        "acceptable",
        "strong",
        "unavailable",
        "none",
      ]),
      entrySource: nonEmpty,
      stopSource: nonEmpty,
      targetSource: nonEmpty.nullable(),
    })
    .nullable(),
  accountRisk: z.strictObject({
    state: z.enum(["available", "reduced", "prohibited", "unavailable"]),
    reasonCodes: z.array(nonEmpty),
  }),
  contradictions: z.array(nonEmpty),
  prohibitionReasonCodes: z.array(nonEmpty),
  formulaVersions: z.record(z.string(), nonEmpty),
  featureVersions: z.record(z.string(), nonEmpty),
  includedVenues: z.array(nonEmpty),
  warnings: z.array(nonEmpty),
});
export type DecisionContextV1 = z.infer<typeof DecisionContextV1Schema>;

// ------------------------------------------------------ DecisionAssessmentV1
export const DecisionAssessmentV1Schema = z
  .strictObject({
    schemaVersion: z.literal(DECISION_ASSESSMENT_SCHEMA_VERSION),
    assessmentId: nonEmpty,
    contextId: nonEmpty,
    provider: DecisionProviderSchema,
    providerVersion: nonEmpty,
    promptVersion: nonEmpty,
    startedAtMs: timestampMs,
    completedAtMs: timestampMs,
    isStale: z.boolean(),
    checks: z.array(DecisionCheckResultV1Schema),
    choice: DecisionChoiceSchema,
    distribution: DecisionDistributionV1Schema,
    confidence: ratio01.nullable(),
    reasonCodes: z.array(nonEmpty),
    summary: nonEmpty,
    warnings: z.array(nonEmpty),
    latencyMs: z.number().int().nonnegative().nullable(),
  })
  .superRefine((assessment, ctx) => {
    if (assessment.completedAtMs < assessment.startedAtMs) {
      ctx.addIssue({
        code: "custom",
        path: ["completedAtMs"],
        message: "completedAtMs must not precede startedAtMs",
      });
    }
    const elapsedMs = assessment.completedAtMs - assessment.startedAtMs;
    if (assessment.latencyMs !== null && assessment.latencyMs !== elapsedMs) {
      ctx.addIssue({
        code: "custom",
        path: ["latencyMs"],
        message: "latencyMs must equal completedAtMs - startedAtMs",
      });
    }
    const selectedProbability = assessment.distribution[assessment.choice];
    const maximumProbability = Math.max(
      ...Object.values(assessment.distribution),
    );
    if (selectedProbability !== maximumProbability) {
      ctx.addIssue({
        code: "custom",
        path: ["choice"],
        message: "choice must be a maximum-probability outcome",
      });
    }
  });
export type DecisionAssessmentV1 = z.infer<typeof DecisionAssessmentV1Schema>;

// ---------------------------------------------------- ShadowDecisionRecordV1
export const ShadowDecisionRecordV1Schema = z.strictObject({
  schemaVersion: z.literal(SHADOW_DECISION_RECORD_SCHEMA_VERSION),
  recordId: nonEmpty,
  stateId: nonEmpty,
  contextId: nonEmpty,
  assessmentId: nonEmpty,
  assessment: DecisionAssessmentV1Schema,
  convergedChoice: DecisionChoiceSchema,
  convergenceRuleStep: z.number().int().min(1).max(10),
  assessmentDiscarded: z.boolean(),
  effectiveAtMs: timestampMs,
  createdAtMs: timestampMs,
  rulesVersion: nonEmpty,
  reasonCodes: z.array(nonEmpty),
  warnings: z.array(nonEmpty),
  dataHealthSummary: z.strictObject({
    candles: SourceHealthStateSchema,
    options: SourceHealthStateSchema,
    flow: SourceHealthStateSchema,
  }),
  recordHash: nonEmpty,
});
export type ShadowDecisionRecordV1 = z.infer<
  typeof ShadowDecisionRecordV1Schema
>;
