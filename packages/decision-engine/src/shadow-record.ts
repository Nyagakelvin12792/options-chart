import { assertCanonicalSafe, contentHash, deepFreeze } from "./canonical";
import {
  SHADOW_DECISION_RECORD_SCHEMA_VERSION,
  ShadowDecisionRecordV1Schema,
  type DecisionAssessmentV1,
  type DecisionChoice,
  type DecisionContextV1,
  type ShadowDecisionRecordV1,
} from "./decision-contracts";
import type { MarketStateV1 } from "./market-state-contracts";

type ShadowRecordContent = Omit<
  ShadowDecisionRecordV1,
  "recordId" | "recordHash"
>;

export function buildShadowDecisionRecord(
  state: MarketStateV1,
  context: DecisionContextV1,
  assessment: DecisionAssessmentV1,
  convergedChoice: DecisionChoice = assessment.choice,
): ShadowDecisionRecordV1 {
  const content: ShadowRecordContent = {
    schemaVersion: SHADOW_DECISION_RECORD_SCHEMA_VERSION,
    stateId: state.identity.stateId,
    contextId: context.contextId,
    assessmentId: assessment.assessmentId,
    assessment,
    convergedChoice,
    effectiveAtMs: context.effectiveAtMs,
    createdAtMs: context.createdAtMs,
    rulesVersion: assessment.providerVersion,
    reasonCodes: [...assessment.reasonCodes].sort(),
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

  const validated = ShadowDecisionRecordV1Schema.parse({
    ...content,
    recordId,
    recordHash: hash,
  });

  return deepFreeze(validated);
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
    const existing = this.records.get(record.recordId);
    if (existing !== undefined) {
      if (existing.recordHash === record.recordHash) {
        // Idempotent duplicate: safe no-op
        return;
      }
      throw new Error(
        `DUPLICATE_RECORD_ID_MUTATION: recordId ${record.recordId} already exists with differing hash`,
      );
    }

    this.records.set(record.recordId, record);
    this.insertionOrder.push(record.recordId);

    const ids = this.stateIndex.get(record.stateId) ?? [];
    ids.push(record.recordId);
    this.stateIndex.set(record.stateId, ids);
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
    const slice = this.insertionOrder.slice(-limit);
    return slice
      .map((id) => this.records.get(id)!)
      .filter((r) => r !== undefined);
  }
}
