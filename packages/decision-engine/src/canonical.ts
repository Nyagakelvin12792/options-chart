import { createHash } from "node:crypto";
import { canonicalJsonStringify } from "@options-chart/flow-engine";

/**
 * Rejects values that cannot be serialized faithfully. `JSON.stringify` would
 * silently turn NaN/Infinity into `null`, which would hide missing evidence
 * inside a content hash, so non-finite numbers are a hard error here.
 */
export function assertCanonicalSafe(value: unknown, path = "$"): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Non-finite number at ${path}`);
    }
    return;
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value === "undefined") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertCanonicalSafe(item, `${path}[${index}]`),
    );
    return;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(
      value as Record<string, unknown>,
    )) {
      assertCanonicalSafe(item, `${path}.${key}`);
    }
    return;
  }
  throw new TypeError(`Unsupported value type ${typeof value} at ${path}`);
}

/** Canonical (sorted-key) JSON; throws on non-finite numbers. */
export function canonicalize(value: unknown): string {
  assertCanonicalSafe(value);
  return canonicalJsonStringify(value);
}

/** SHA-256 hex digest of the canonical JSON form. */
export function contentHash(value: unknown): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

/** Deterministic identifier: `<prefix>:<first 32 hex chars of the content hash>`. */
export function deriveId(prefix: string, value: unknown): string {
  return `${prefix}:${contentHash(value).slice(0, 32)}`;
}

/** Recursively freezes plain data so stored records cannot be mutated. */
export function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
