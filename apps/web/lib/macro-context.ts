import { z } from "zod";

export const REQUIRED_EVIDENCE = {
  net_liquidity: { unit: "$B", days: 11 },
  hy_oas: { unit: "%", days: 5 },
  dfii10: { unit: "%", days: 5 },
  btc_etf_flows: { unit: "$M", days: 5 },
  mvrv: { unit: "ratio", days: 5 },
  hash_ribbons: { unit: "ratio", days: 5 },
  funding_rate: { unit: "% / interval", days: 1 },
  fear_greed: { unit: "/ 100", days: 5 },
} as const;
const classification = z.enum([
  "SUPPORTIVE",
  "MIXED",
  "RESTRICTIVE",
  "INSUFFICIENT DATA",
]);
export const macroContextSchema = z.object({
  snapshotId: z.string().regex(/^[a-f0-9]{24}$/),
  contractVersion: z.literal("1.0.0"),
  methodologyVersion: z.literal("btc-macros-rules-1.0.0-candidate"),
  createdAt: z.iso.datetime(),
  maxAgeSeconds: z.literal(3600),
  brief: z.string().max(10000),
  integrity: z.object({
    mode: z.enum(["live", "demo", "test"]),
    requiredEvidenceComplete: z.boolean(),
    independentCrossCheck: z.boolean(),
  }),
  usable: z.boolean(),
  veto: z.boolean(),
  regime: z.enum([
    "SUPPORTIVE",
    "MIXED",
    "RESTRICTIVE",
    "ASSESSMENT WITHHELD",
    "MANUAL RISK VETO",
  ]),
  macro: classification,
  fundamentals: classification,
  positioning: z.enum([
    "CROWDED",
    "FEARFUL",
    "GREEDY",
    "BALANCED",
    "INSUFFICIENT DATA",
  ]),
  missing: z.array(z.string()).max(100),
  evidence: z
    .array(
      z.object({
        metric: z.string().max(100),
        observationId: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .nullable(),
        value: z.number().finite().nullable(),
        unit: z.string().max(100),
        asOf: z.string().nullable(),
        status: z.string().max(100),
        sourceUrl: z.url().refine((value) => {
          const u = new URL(value);
          return u.protocol === "https:" && !u.username && !u.password;
        }),
      }),
    )
    .max(100),
  conflicts: z.array(z.unknown()).max(100),
  limitations: z.array(z.string()).max(100),
  scope: z.literal(
    "Context only. No option levels, entries, sizing, or orders.",
  ),
});
export type MacroContext = z.infer<typeof macroContextSchema>;
export function validateHandoff(
  input: unknown,
  now = Date.now(),
): { accepted: boolean; reasons: string[]; payload: MacroContext | null } {
  const parsed = macroContextSchema.safeParse(input);
  if (!parsed.success)
    return {
      accepted: false,
      reasons: ["Invalid or unsupported macro snapshot schema"],
      payload: null,
    };
  const payload = parsed.data,
    reasons: string[] = [],
    created = Date.parse(payload.createdAt);
  if (created > now + 300000 || now - created > 3600000)
    reasons.push("Future or expired snapshot");
  if (
    payload.integrity.mode !== "live" ||
    !payload.integrity.requiredEvidenceComplete ||
    !payload.usable ||
    payload.veto ||
    payload.missing.length ||
    [payload.macro, payload.fundamentals, payload.positioning].includes(
      "INSUFFICIENT DATA",
    ) ||
    !["SUPPORTIVE", "MIXED", "RESTRICTIVE"].includes(payload.regime)
  )
    reasons.push("Evidence veto or incomplete context");
  if (
    new Set(payload.evidence.map((row) => row.metric)).size !==
    payload.evidence.length
  )
    reasons.push("Duplicate evidence identifiers");
  for (const [metric, rule] of Object.entries(REQUIRED_EVIDENCE)) {
    const row = payload.evidence.find((r) => r.metric === metric),
      date = Date.parse(row?.asOf || "");
    if (
      !row?.observationId ||
      row.value === null ||
      row.unit !== rule.unit ||
      !["PRIMARY VALIDATED", "REVIEWED IMPORT"].includes(row.status) ||
      !Number.isFinite(date) ||
      date > now + 300000 ||
      now - date > rule.days * 864e5
    )
      reasons.push(`Missing/degraded evidence: ${metric}`);
  }
  return { accepted: reasons.length === 0, reasons, payload };
}
