import { describe, expect, it } from "vitest";
import { calculateOptionsMetrics } from "@options-chart/options-engine";

import {
  buildFallbackOptionsChain,
  createExpiryScope,
  listActiveExpiries,
  selectMaxPainExpiry,
} from "./options-overlay";

const NOW = Date.UTC(2026, 7, 27, 12);

describe("options overlay utilities", () => {
  it("builds an explicit multi-expiry fallback chain around spot", () => {
    const chain = buildFallbackOptionsChain(80_000, NOW);

    expect(chain.metadata.source).toBe("system");
    expect(chain.metadata.schemaVersion).toBe("m6-fallback-chain-v1");
    expect(chain.instruments.length).toBeGreaterThanOrEqual(42);
    expect(listActiveExpiries(chain, NOW).length).toBeGreaterThanOrEqual(3);
    expect(
      chain.instruments.every(
        ({ instrument, quote }) =>
          instrument.expiry > NOW &&
          instrument.strike > 0 &&
          quote.markIvDecimal !== null &&
          quote.openInterestBtc > 0,
      ),
    ).toBe(true);
  });

  it("maps custom and preset scopes and keeps Max Pain expiry-specific", () => {
    const chain = buildFallbackOptionsChain(80_000, NOW);
    const customExpiry = listActiveExpiries(chain, NOW)[1] ?? null;
    const custom = createExpiryScope("custom", customExpiry);

    expect(custom).toEqual({ kind: "custom", expiry: customExpiry });
    expect(selectMaxPainExpiry(chain, custom, NOW)).toBe(customExpiry);
    expect(
      selectMaxPainExpiry(chain, createExpiryScope("next-expiry", null), NOW),
    ).toBe(listActiveExpiries(chain, NOW)[0]);
  });

  it("produces auditable primary and ranked fallback levels", () => {
    const chain = buildFallbackOptionsChain(80_000, NOW);
    const scope = createExpiryScope("less-than-or-equal-30-dte", null);
    const result = calculateOptionsMetrics({
      chain,
      underlyingPriceUsd: 80_000,
      calculatedAt: NOW,
      expiryScope: scope,
      interestRateFallbackDecimal: 0.01,
      maxPainExpiry: selectMaxPainExpiry(chain, scope, NOW),
      secondaryLevelCount: 3,
    });
    const kinds = result.summary.keyLevels.map(({ kind }) => kind);

    expect(kinds).toContain("call-wall");
    expect(kinds).toContain("put-wall");
    expect(kinds).toContain("gamma-flip");
    expect(kinds).toContain("max-pain");
    expect(kinds.filter((kind) => kind === "secondary-gex")).toHaveLength(3);
    expect(result.summary.metadata.expiryScope).toBe(
      "less-than-or-equal-30-dte",
    );
  });
});
