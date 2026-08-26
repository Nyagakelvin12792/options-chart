import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DeribitOptionInstrumentsSchema } from "./api-schemas";
import { DeribitInstrumentCatalog } from "./catalog";
import { DERIBIT_CATALOG_REFRESH_MS } from "./constants";

const instruments = () =>
  DeribitOptionInstrumentsSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          "../../../../tests/fixtures/deribit/instruments.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );

describe("DeribitInstrumentCatalog", () => {
  it("keeps only active, unexpired BTC inverse options", () => {
    const catalog = new DeribitInstrumentCatalog();
    const payloads = instruments();
    const entries = catalog.replace(
      [
        ...payloads,
        {
          ...payloads[0]!,
          instrument_name: "BTC-25DEC26-90000-C",
          is_active: false,
        },
      ],
      1_780_000_000_000,
    );

    expect(entries).toHaveLength(2);
    expect(catalog.has("BTC-25DEC26-80000-C")).toBe(true);
    expect(catalog.has("BTC-25DEC26-90000-C")).toBe(false);
  });

  it("becomes stale at the hourly refresh boundary", () => {
    const catalog = new DeribitInstrumentCatalog();
    const refreshedAt = 1_780_000_000_000;
    catalog.replace(instruments(), refreshedAt);

    expect(catalog.isStale(refreshedAt + DERIBIT_CATALOG_REFRESH_MS - 1)).toBe(
      false,
    );
    expect(catalog.isStale(refreshedAt + DERIBIT_CATALOG_REFRESH_MS)).toBe(
      true,
    );
  });
});
