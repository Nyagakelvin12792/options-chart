import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REQUIRED_EVIDENCE, validateHandoff } from "./macro-context";
export function contextFixture(now = Date.now()) {
  return {
    snapshotId: "a".repeat(24),
    contractVersion: "1.0.0",
    methodologyVersion: "btc-macros-rules-1.0.0-candidate",
    createdAt: new Date(now).toISOString(),
    maxAgeSeconds: 3600,
    brief: "Software fixture",
    integrity: {
      mode: "live",
      requiredEvidenceComplete: true,
      independentCrossCheck: false,
    },
    usable: true,
    veto: false,
    regime: "SUPPORTIVE",
    macro: "SUPPORTIVE",
    fundamentals: "MIXED",
    positioning: "BALANCED",
    missing: [],
    evidence: Object.entries(REQUIRED_EVIDENCE).map(([metric, rule]) => ({
      metric,
      observationId: "b".repeat(64),
      value: 1,
      unit: rule.unit,
      asOf: new Date(now).toISOString(),
      status: "PRIMARY VALIDATED",
      sourceUrl: "https://example.com/evidence",
    })),
    conflicts: [],
    limitations: ["Controlled software fixture, not market evidence."],
    scope: "Context only. No option levels, entries, sizing, or orders.",
  };
}
const degradedProducer: unknown = JSON.parse(
  readFileSync(
    new URL(
      "../../../tests/fixtures/macro/degraded-producer.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
describe("macro handoff consumer", () => {
  it("recognizes the real producer HTTP export and blocks its missing evidence", () => {
    const result = validateHandoff(degradedProducer);
    expect(result.payload).not.toBeNull();
    expect(result.accepted).toBe(false);
    expect(result.reasons).toContain("Evidence veto or incomplete context");
  });
  it("accepts a complete supported context", () =>
    expect(validateHandoff(contextFixture()).accepted).toBe(true));
  it("expires an imported snapshot as time advances", () => {
    const now = Date.now();
    expect(validateHandoff(contextFixture(now), now + 3600001).accepted).toBe(
      false,
    );
  });
  it.each([null, {}, [], { contractVersion: "2" }])(
    "rejects malformed external input",
    (input) => expect(validateHandoff(input).accepted).toBe(false),
  );
  it("rejects unit changes, duplicate inputs, vetoes and incomplete groups", () => {
    const p = contextFixture();
    for (const value of [
      { ...p, veto: true },
      { ...p, macro: "INSUFFICIENT DATA" },
      { ...p, evidence: [...p.evidence, p.evidence[0]] },
      {
        ...p,
        evidence: p.evidence.map((row, index) =>
          index ? row : { ...row, unit: "$M" },
        ),
      },
    ])
      expect(validateHandoff(value).accepted).toBe(false);
  });
  it("rejects future and stale underlying observations", () => {
    const p = contextFixture();
    for (const date of ["2000-01-01", "2099-01-01"])
      expect(
        validateHandoff({
          ...p,
          evidence: p.evidence.map((row, index) =>
            index ? row : { ...row, asOf: date },
          ),
        }).accepted,
      ).toBe(false);
  });
});
