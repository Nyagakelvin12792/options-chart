import { describe, expect, it } from "vitest";

import { canonicalize, contentHash } from "./canonical";

describe("browser-safe canonical hashing", () => {
  it("matches the Node SHA-256 digest for sorted UTF-8 canonical JSON", () => {
    const value = { b: 2, a: "β" };
    expect(canonicalize(value)).toBe('{"a":"β","b":2}');
    expect(contentHash(value)).toBe(
      "ac19126ad8c67206a8a6d5f2e0ed49924258e2e6b8d118ad16fe62399200ed2a",
    );
  });

  it("rejects non-finite numeric evidence before hashing", () => {
    expect(() => contentHash({ value: Number.NaN })).toThrow(
      "Non-finite number",
    );
  });
});
