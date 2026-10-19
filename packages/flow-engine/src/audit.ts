import { createHash } from "node:crypto";
import {
  FlowFeatureSnapshotV1Schema,
  type FlowFeatureSnapshotV1,
} from "./contracts";

export function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items = value.map((item) =>
      item === undefined ? "null" : canonicalJsonStringify(item),
    );
    return `[${items.join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const entries: string[] = [];
  for (const key of keys) {
    const val = obj[key];
    if (val !== undefined) {
      entries.push(`${JSON.stringify(key)}:${canonicalJsonStringify(val)}`);
    }
  }
  return `{${entries.join(",")}}`;
}

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
