import { z } from "zod";
import { contentHash, deepFreeze } from "./canonical";
import {
  DecisionAssessmentV1Schema,
  DecisionProviderSchema,
  type DecisionAssessmentV1,
  type DecisionContextV1,
  type DecisionProvider,
} from "./decision-contracts";

export const SHADOW_PROVIDER_RUN_SCHEMA_VERSION =
  "shadow-provider-run-v1" as const;

const timestampMs = z.number().int().nonnegative();
const nonEmpty = z.string().min(1);

export const ShadowProviderRunStatusSchema = z.enum([
  "success",
  "disabled",
  "timeout",
  "cancelled",
  "stale",
  "provider-error",
  "invalid-response",
]);
export type ShadowProviderRunStatus = z.infer<
  typeof ShadowProviderRunStatusSchema
>;

export const ShadowProviderRunRecordV1Schema = z
  .strictObject({
    schemaVersion: z.literal(SHADOW_PROVIDER_RUN_SCHEMA_VERSION),
    runId: nonEmpty,
    contextId: nonEmpty,
    provider: DecisionProviderSchema,
    providerVersion: nonEmpty,
    startedAtMs: timestampMs,
    completedAtMs: timestampMs,
    latencyMs: z.number().int().nonnegative(),
    status: ShadowProviderRunStatusSchema,
    assessment: DecisionAssessmentV1Schema.nullable(),
    errorCode: nonEmpty.nullable(),
    errorMessage: nonEmpty.nullable(),
    warnings: z.array(nonEmpty),
    recordHash: nonEmpty,
  })
  .superRefine((record, ctx) => {
    if (record.completedAtMs < record.startedAtMs) {
      ctx.addIssue({
        code: "custom",
        path: ["completedAtMs"],
        message: "completedAtMs must not precede startedAtMs",
      });
    }
    if (record.latencyMs !== record.completedAtMs - record.startedAtMs) {
      ctx.addIssue({
        code: "custom",
        path: ["latencyMs"],
        message: "latencyMs must match provider run timestamps",
      });
    }
    if (record.status === "success" && record.assessment === null) {
      ctx.addIssue({
        code: "custom",
        path: ["assessment"],
        message: "successful provider runs require an assessment",
      });
    }
    if (record.status !== "success" && record.assessment !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["assessment"],
        message: "non-successful provider runs cannot publish an assessment",
      });
    }
    if (record.status === "success" && record.errorCode !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["errorCode"],
        message: "successful provider runs cannot contain an error",
      });
    }
  });
export type ShadowProviderRunRecordV1 = z.infer<
  typeof ShadowProviderRunRecordV1Schema
>;

type RunContent = Omit<ShadowProviderRunRecordV1, "runId" | "recordHash">;

export function buildShadowProviderRunRecord(
  content: RunContent,
): ShadowProviderRunRecordV1 {
  const recordHash = contentHash(content);
  return parseShadowProviderRunRecord({
    ...content,
    runId: `provider-run-${content.startedAtMs}-${recordHash.slice(0, 16)}`,
    recordHash,
  });
}

export function parseShadowProviderRunRecord(
  raw: unknown,
): ShadowProviderRunRecordV1 {
  const record = ShadowProviderRunRecordV1Schema.parse(raw);
  const { runId, recordHash, ...content } = record;
  const expectedHash = contentHash(content);
  if (recordHash !== expectedHash) {
    throw new Error("provider run recordHash does not match content");
  }
  if (
    runId !== `provider-run-${content.startedAtMs}-${expectedHash.slice(0, 16)}`
  ) {
    throw new Error("provider run runId does not match content");
  }
  if (
    record.assessment !== null &&
    record.assessment.contextId !== record.contextId
  ) {
    throw new Error("provider assessment does not belong to run context");
  }
  return deepFreeze(record);
}

export interface ShadowDecisionProviderPort {
  readonly provider: Exclude<DecisionProvider, "deterministic-rules-v1">;
  readonly providerVersion: string;
  assess(
    context: DecisionContextV1,
    signal: AbortSignal,
  ): Promise<DecisionAssessmentV1>;
}

export interface ShadowProviderRunStorePort {
  append(record: ShadowProviderRunRecordV1): Promise<void> | void;
  getByContextId(
    contextId: string,
  ):
    | Promise<readonly ShadowProviderRunRecordV1[]>
    | readonly ShadowProviderRunRecordV1[];
}

export class InMemoryShadowProviderRunStore implements ShadowProviderRunStorePort {
  private readonly records: ShadowProviderRunRecordV1[] = [];

  append(record: ShadowProviderRunRecordV1): void {
    const validated = parseShadowProviderRunRecord(record);
    if (this.records.some((item) => item.runId === validated.runId)) return;
    this.records.push(validated);
  }

  getByContextId(contextId: string): readonly ShadowProviderRunRecordV1[] {
    return this.records.filter((record) => record.contextId === contextId);
  }
}
