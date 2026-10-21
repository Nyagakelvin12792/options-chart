/** Deterministic sorted-key JSON shared by browser and server audit paths. */
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
