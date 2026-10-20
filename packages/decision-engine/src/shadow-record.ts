import { assertCanonicalSafe, contentHash, deepFreeze } from "./canonical";
import {
  SHADOW_DECISION_RECORD_SCHEMA_VERSION,
  ShadowDecisionRecordV1Schema,
  type DecisionContextV1,
  type ShadowDecisionRecordV1,
} from "./decision-contracts";
import {
  CONVERGENCE_RULES_VERSION,
  type ConvergedDecisionResult,
} from "./convergence";
import type { MarketStateV1 } from "./market-state-contracts";

type ShadowRecordContent = Omit<
  ShadowDecisionRecordV1,
  "recordId" | "recordHash"
>;

export function buildShadowDecisionRecord(
  state: MarketStateV1,
  context: DecisionContextV1,
  converged: ConvergedDecisionResult,
): ShadowDecisionRecordV1 {
  const assessment = converged.assessment;
  if (context.stateId !== state.identity.stateId) {
    throw new Error("shadow record context does not belong to market state");
  }
  if (assessment.contextId !== context.contextId) {
    throw new Error("shadow record assessment does not belong to context");
  }

  const content: ShadowRecordContent = {
    schemaVersion: SHADOW_DECISION_RECORD_SCHEMA_VERSION,
    stateId: state.identity.stateId,
    contextId: context.contextId,
    assessmentId: assessment.assessmentId,
    assessment,
    convergedChoice: converged.choice,
    convergenceRuleStep: converged.ruleStepTriggered,
    assessmentDiscarded: converged.discarded,
    effectiveAtMs: context.effectiveAtMs,
    createdAtMs: context.createdAtMs,
    rulesVersion: CONVERGENCE_RULES_VERSION,
    reasonCodes: [...converged.reasonCodes].sort(),
    warnings: [...assessment.warnings].sort(),
    dataHealthSummary: {
      candles: context.dataHealth.candles,
      options: context.dataHealth.options,
      flow: context.dataHealth.flow,
    },
  };

  assertCanonicalSafe(content);
  const hash = contentHash(content);
  const recordId = `shadow-${content.effectiveAtMs}-${hash.slice(0, 16)}`;

  return parseShadowDecisionRecord({
    ...content,
    recordId,
    recordHash: hash,
  });
}

/** Validates record links and verifies its content-addressed hash and ID. */
export function parseShadowDecisionRecord(
  raw: unknown,
): ShadowDecisionRecordV1 {
  const record = ShadowDecisionRecordV1Schema.parse(raw);
  if (record.assessmentId !== record.assessment.assessmentId) {
    throw new Error("shadow record assessmentId does not match assessment");
  }
  if (record.contextId !== record.assessment.contextId) {
    throw new Error("shadow record contextId does not match assessment");
  }
  const { recordId, recordHash, ...content } = record;
  const expectedHash = contentHash(content);
  if (recordHash !== expectedHash) {
    throw new Error("shadow recordHash does not match record content");
  }
  const expectedId = `shadow-${content.effectiveAtMs}-${expectedHash.slice(0, 16)}`;
  if (recordId !== expectedId) {
    throw new Error("shadow recordId does not match record content");
  }
  return deepFreeze(record);
}

/**
 * Storage port interface for shadow decision records.
 * Keeps storage abstracted so M11.5 remains pure TypeScript without
 * binding to any specific database or filesystem provider.
 */
export interface DecisionStorePort {
  append(record: ShadowDecisionRecordV1): Promise<void> | void;
  getById(
    recordId: string,
  ): Promise<ShadowDecisionRecordV1 | null> | ShadowDecisionRecordV1 | null;
  getByStateId(
    stateId: string,
  ):
    | Promise<readonly ShadowDecisionRecordV1[]>
    | readonly ShadowDecisionRecordV1[];
  getRecent(
    limit: number,
  ):
    | Promise<readonly ShadowDecisionRecordV1[]>
    | readonly ShadowDecisionRecordV1[];
}

/**
 * Deterministic in-memory decision store implementing the append-only
 * idempotency policy.
 */
export class InMemoryDecisionStore implements DecisionStorePort {
  private readonly records = new Map<string, ShadowDecisionRecordV1>();
  private readonly stateIndex = new Map<string, string[]>();
  private readonly insertionOrder: string[] = [];

  append(record: ShadowDecisionRecordV1): void {
    const validated = parseShadowDecisionRecord(record);
    const existing = this.records.get(validated.recordId);
    if (existing !== undefined) {
      if (existing.recordHash === validated.recordHash) {
        // Idempotent duplicate: safe no-op
        return;
      }
      throw new Error(
        `DUPLICATE_RECORD_ID_MUTATION: recordId ${validated.recordId} already exists with differing hash`,
      );
    }

    this.records.set(validated.recordId, validated);
    this.insertionOrder.push(validated.recordId);

    const ids = this.stateIndex.get(validated.stateId) ?? [];
    ids.push(validated.recordId);
    this.stateIndex.set(validated.stateId, ids);
  }

  getById(recordId: string): ShadowDecisionRecordV1 | null {
    return this.records.get(recordId) ?? null;
  }

  getByStateId(stateId: string): readonly ShadowDecisionRecordV1[] {
    const ids = this.stateIndex.get(stateId) ?? [];
    return ids
      .map((id) => this.records.get(id)!)
      .filter((r) => r !== undefined);
  }

  getRecent(limit: number): readonly ShadowDecisionRecordV1[] {
    if (!Number.isInteger(limit) || limit < 0) {
      throw new RangeError("limit must be a nonnegative integer");
    }
    if (limit === 0) return [];
    const slice = this.insertionOrder.slice(-limit);
    return slice
      .map((id) => this.records.get(id)!)
      .filter((r) => r !== undefined);
  }
}
