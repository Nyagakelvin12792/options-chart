import { z } from "zod";
import { contentHash, deepFreeze } from "./canonical";
import {
  DecisionChoiceSchema,
  type DecisionContextV1,
} from "./decision-contracts";
import type { ConvergedDecisionResult } from "./convergence";
import { SourceHealthStateSchema } from "./market-state-contracts";

export const NARRATION_INPUT_SCHEMA_VERSION = "narration-input-v1" as const;
export const NARRATION_OUTPUT_SCHEMA_VERSION = "narration-output-v1" as const;
const nonEmpty = z.string().min(1);
const timestampMs = z.number().int().nonnegative();

export const NarrationInputV1Schema = z.strictObject({
  schemaVersion: z.literal(NARRATION_INPUT_SCHEMA_VERSION),
  inputId: nonEmpty,
  stateId: nonEmpty,
  contextId: nonEmpty,
  assessmentId: nonEmpty,
  effectiveAtMs: timestampMs,
  convergedChoice: DecisionChoiceSchema,
  reasonCodes: z.array(nonEmpty),
  warnings: z.array(nonEmpty),
  dataHealth: z.strictObject({
    candles: SourceHealthStateSchema,
    options: SourceHealthStateSchema,
    flow: SourceHealthStateSchema,
    geometry: SourceHealthStateSchema,
    accountRisk: SourceHealthStateSchema,
  }),
  evidenceVersions: z.strictObject({
    formulaVersions: z.record(z.string(), nonEmpty),
    featureVersions: z.record(z.string(), nonEmpty),
    includedVenues: z.array(nonEmpty),
  }),
});
export type NarrationInputV1 = z.infer<typeof NarrationInputV1Schema>;

export const NarrationDraftV1Schema = z.strictObject({
  thesis: nonEmpty,
  evidence: z.array(nonEmpty).max(5),
  conflict: nonEmpty.nullable(),
  trigger: nonEmpty,
  invalidation: nonEmpty,
  noTradeReasons: z.array(nonEmpty).max(5),
});
export type NarrationDraftV1 = z.infer<typeof NarrationDraftV1Schema>;

export const NarrationOutputV1Schema = z.strictObject({
  schemaVersion: z.literal(NARRATION_OUTPUT_SCHEMA_VERSION),
  narrationId: nonEmpty,
  inputId: nonEmpty,
  provider: nonEmpty,
  model: nonEmpty,
  promptVersion: nonEmpty,
  generatedAtMs: timestampMs,
  sourceEffectiveAtMs: timestampMs,
  draft: NarrationDraftV1Schema,
  outputHash: nonEmpty,
});
export type NarrationOutputV1 = z.infer<typeof NarrationOutputV1Schema>;

export interface NarrationProviderPort {
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
  narrate(
    input: NarrationInputV1,
    signal: AbortSignal,
  ): Promise<NarrationDraftV1>;
}

export function buildNarrationInput(
  context: DecisionContextV1,
  converged: ConvergedDecisionResult,
): NarrationInputV1 {
  if (converged.assessment.contextId !== context.contextId) {
    throw new Error("narration assessment does not belong to context");
  }
  const content = {
    schemaVersion: NARRATION_INPUT_SCHEMA_VERSION,
    stateId: context.stateId,
    contextId: context.contextId,
    assessmentId: converged.assessment.assessmentId,
    effectiveAtMs: context.effectiveAtMs,
    convergedChoice: converged.choice,
    reasonCodes: [...converged.reasonCodes].sort(),
    warnings: [...context.warnings].sort(),
    dataHealth: {
      candles: context.dataHealth.candles,
      options: context.dataHealth.options,
      flow: context.dataHealth.flow,
      geometry: context.dataHealth.geometry,
      accountRisk: context.dataHealth.accountRisk,
    },
    evidenceVersions: {
      formulaVersions: { ...context.formulaVersions },
      featureVersions: { ...context.featureVersions },
      includedVenues: [...context.includedVenues].sort(),
    },
  };
  return deepFreeze(
    NarrationInputV1Schema.parse({
      ...content,
      inputId: `narration-input-${contentHash(content)}`,
    }),
  );
}

type OutputContent = Omit<NarrationOutputV1, "narrationId" | "outputHash">;

export function buildNarrationOutput(
  content: OutputContent,
): NarrationOutputV1 {
  const validatedContent = {
    ...content,
    draft: NarrationDraftV1Schema.parse(content.draft),
  };
  const outputHash = contentHash(validatedContent);
  return parseNarrationOutput({
    ...validatedContent,
    narrationId: `narration-${content.inputId}-${outputHash.slice(0, 16)}`,
    outputHash,
  });
}

export function parseNarrationOutput(raw: unknown): NarrationOutputV1 {
  const output = NarrationOutputV1Schema.parse(raw);
  const { narrationId, outputHash, ...content } = output;
  const expectedHash = contentHash(content);
  if (outputHash !== expectedHash) {
    throw new Error("narration outputHash does not match content");
  }
  if (
    narrationId !== `narration-${content.inputId}-${expectedHash.slice(0, 16)}`
  ) {
    throw new Error("narration narrationId does not match content");
  }
  return deepFreeze(output);
}
