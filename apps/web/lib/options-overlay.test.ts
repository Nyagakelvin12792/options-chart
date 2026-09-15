import { describe, expect, it } from "vitest";
import type { OptionsChainSnapshot } from "@options-chart/domain";
import { minimumProfileTimeToExpiryMs } from "@options-chart/options-engine";

import {
  buildUnavailableOptionsChain,
  createExactExpiryScope,
  createExpiryScope,
  formatDeribitExpiryDate,
  listActiveExpiries,
  selectMaxPainExpiry,
} from "./options-overlay";

const NOW = Date.UTC(2026, 7, 27, 12);

describe("options overlay utilities", () => {
  it("uses an empty chain while live Deribit data is unavailable", () => {
    const chain = buildUnavailableOptionsChain(NOW);

    expect(chain.metadata.source).toBe("system");
    expect(chain.metadata.schemaVersion).toBe("m10-unavailable-chain-v1");
    expect(chain.instruments).toEqual([]);
    expect(listActiveExpiries(chain, NOW)).toEqual([]);
  });

  it("maps custom and preset scopes and keeps Max Pain expiry-specific", () => {
    const customExpiry = Date.UTC(2026, 7, 28, 8);
    const custom = createExpiryScope("custom", customExpiry);
    const exact = createExactExpiryScope(customExpiry);

    expect(custom).toEqual({ kind: "custom", expiry: customExpiry });
    expect(exact).toEqual({ kind: "exact-expiry", expiry: customExpiry });
    expect(
      selectMaxPainExpiry(buildUnavailableOptionsChain(NOW), custom, NOW),
    ).toBeNull();
  });

  it("formats active expiries like Deribit contract dates", () => {
    expect(formatDeribitExpiryDate(Date.UTC(2026, 7, 28, 8))).toBe("28 AUG 26");
  });

  it("omits expiries inside the 15-minute calculation floor", () => {
    const expiry = NOW + minimumProfileTimeToExpiryMs;
    const chain = {
      ...buildUnavailableOptionsChain(NOW),
      instruments: [
        {
          instrument: { expiry, isActive: true },
        },
      ],
    } as unknown as OptionsChainSnapshot;

    expect(
      listActiveExpiries(chain, expiry - minimumProfileTimeToExpiryMs),
    ).toContain(expiry);
    expect(
      listActiveExpiries(chain, expiry - minimumProfileTimeToExpiryMs + 1),
    ).not.toContain(expiry);
  });
});
