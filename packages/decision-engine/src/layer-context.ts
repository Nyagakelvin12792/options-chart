import type { EvidenceCollector } from "./evidence-collector";
import type {
  EvidenceSource,
  NumericEvidenceV1,
} from "./market-state-contracts";

export interface LayerContext {
  readonly effectiveAtMs: number;
  readonly collector: EvidenceCollector;
}

export interface EvidenceDraft {
  readonly evidenceId: string;
  readonly name: string;
  readonly value: number;
  readonly unit: string;
  readonly formulaVersion: string;
  readonly source: EvidenceSource;
  /** Observation time; must not be after the state's effective time. */
  readonly asOfMs: number;
}

/** Records exact evidence and returns its reference ID. */
export function recordEvidence(
  ctx: LayerContext,
  draft: EvidenceDraft,
): string {
  const item: NumericEvidenceV1 = {
    evidenceId: draft.evidenceId,
    name: draft.name,
    value: draft.value,
    unit: draft.unit,
    formulaVersion: draft.formulaVersion,
    source: draft.source,
    effectiveAtMs: draft.asOfMs,
  };
  return ctx.collector.add(item);
}
