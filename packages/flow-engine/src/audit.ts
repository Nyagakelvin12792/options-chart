import { createHash } from "node:crypto";
import {
  FlowFeatureSnapshotV1Schema,
  type FlowFeatureSnapshotV1,
} from "./contracts";
import { canonicalJsonStringify } from "./canonical-json";

export { canonicalJsonStringify } from "./canonical-json";

export function serializeFlowFeatureSnapshotForAudit(
  snapshot: FlowFeatureSnapshotV1,
): string {
  const validated = FlowFeatureSnapshotV1Schema.parse(snapshot);
  return canonicalJsonStringify(validated);
}

export function deserializeFlowFeatureSnapshotAudit(
  jsonString: string,
): FlowFeatureSnapshotV1 {
  const parsed: unknown = JSON.parse(jsonString);
  const validated = FlowFeatureSnapshotV1Schema.parse(parsed);
  return Object.freeze(validated);
}

export function computeSnapshotAuditDigest(
  snapshot: FlowFeatureSnapshotV1,
): string {
  const canonical = canonicalJsonStringify(snapshot);
  return createHash("sha256").update(canonical).digest("hex");
}
