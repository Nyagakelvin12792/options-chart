import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  DeribitBookSummariesSchema,
  DeribitOptionInstrumentsSchema,
} from "./api-schemas";
import {
  buildDeribitOptionsSnapshot,
  normalizeDeribitOptionInstrument,
} from "./production-normalizers";
import { DeribitOptionsStore } from "./store";
import type { DeribitMarkUpdate } from "./types";

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      new URL(`../../../../tests/fixtures/deribit/${name}`, import.meta.url),
      "utf8",
    ),
  );

const snapshot = () => {
  const receivedAt = 1_780_000_000_500;
  const catalog = DeribitOptionInstrumentsSchema.parse(
    fixture("instruments.json"),
  ).map((item) => normalizeDeribitOptionInstrument(item, receivedAt));
  return buildDeribitOptionsSnapshot(
    catalog,
    DeribitBookSummariesSchema.parse(fixture("book-summary.json")),
    receivedAt,
  ).snapshot;
};

const markUpdate = (instrumentName: string): DeribitMarkUpdate => ({
  metadata: {
    source: "deribit",
    sourceTimestamp: 1_780_000_000_600,
    receivedTimestamp: 1_780_000_000_650,
    normalizedTimestamp: 1_780_000_000_650,
    schemaVersion: "deribit-mark-stream-v1",
  },
  instrumentName,
  markPriceBtc: 0.2,
  markIvDecimal: 0.7,
});

describe("DeribitOptionsStore", () => {
  it("merges live marks without changing REST open interest", () => {
    const store = new DeribitOptionsStore();
    store.replace(snapshot());
    const result = store.applyMarkUpdates([markUpdate("BTC-25DEC26-80000-C")]);

    expect(result.applied).toBe(1);
    expect(result.snapshot?.instruments[0]?.quote).toMatchObject({
      openInterestBtc: 125.5,
      markPriceBtc: 0.2,
      markIvDecimal: 0.7,
    });
  });

  it("reports unknown live instruments and retains the last-valid snapshot", () => {
    const store = new DeribitOptionsStore();
    const original = store.replace(snapshot());
    const result = store.applyMarkUpdates([markUpdate("BTC-01JAN27-90000-C")]);

    expect(result.unknownInstrumentNames).toEqual(["BTC-01JAN27-90000-C"]);
    expect(store.restoreLastValid()).not.toBeNull();
    expect(store.cachedSnapshot?.instruments).toHaveLength(
      original.instruments.length,
    );
  });
});
