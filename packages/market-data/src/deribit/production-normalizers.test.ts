import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  DeribitBookSummariesSchema,
  DeribitIndexUpdateSchema,
  DeribitMarkPriceUpdatesSchema,
  DeribitOptionInstrumentsSchema,
  DeribitSubscriptionEnvelopeSchema,
} from "./api-schemas";
import {
  buildDeribitOptionsSnapshot,
  normalizeDeribitIndexUpdate,
  normalizeDeribitMarkUpdate,
  normalizeDeribitOptionInstrument,
} from "./production-normalizers";

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      new URL(`../../../../tests/fixtures/deribit/${name}`, import.meta.url),
      "utf8",
    ),
  );

describe("Deribit production normalizers", () => {
  it("builds a complete active chain and converts book-summary IV points once", () => {
    const receivedAt = 1_780_000_000_500;
    const catalog = DeribitOptionInstrumentsSchema.parse(
      fixture("instruments.json"),
    ).map((item) => normalizeDeribitOptionInstrument(item, receivedAt));
    const summaries = DeribitBookSummariesSchema.parse(
      fixture("book-summary.json"),
    );

    const result = buildDeribitOptionsSnapshot(catalog, summaries, receivedAt);

    expect(result.missingSummaryInstrumentNames).toEqual([]);
    expect(result.unknownSummaryInstrumentNames).toEqual([]);
    expect(result.snapshot.instruments).toHaveLength(2);
    expect(result.snapshot.instruments[0]?.quote.openInterestBtc).toBe(125.5);
    expect(result.snapshot.instruments[0]?.quote.volumeBtc).toBe(20);
    expect(result.snapshot.instruments[1]?.quote.markIvDecimal).toBe(0.8);
  });

  it("keeps consolidated stream IV in its documented decimal unit", () => {
    const envelope = DeribitSubscriptionEnvelopeSchema.parse(
      fixture("mark-stream.json"),
    );
    const raw = DeribitMarkPriceUpdatesSchema.parse(envelope.params.data)[0];
    expect(raw).toBeDefined();

    const update = normalizeDeribitMarkUpdate(raw!, 1_780_000_000_250);
    expect(update.markIvDecimal).toBe(0.66);
    expect(update.markPriceBtc).toBe(0.13);
  });

  it("normalizes the Deribit index separately from Binance chart spot", () => {
    const envelope = DeribitSubscriptionEnvelopeSchema.parse(
      fixture("index-stream.json"),
    );
    const raw = DeribitIndexUpdateSchema.parse(envelope.params.data);
    const price = normalizeDeribitIndexUpdate(raw, 1_780_000_000_250);

    expect(price.symbol).toBe("BTC-USD");
    expect(price.metadata.source).toBe("deribit");
    expect(price.price).toBe(78_625.5);
  });

  it("reports catalog/snapshot races without admitting unknown instruments", () => {
    const receivedAt = 1_780_000_000_500;
    const catalog = DeribitOptionInstrumentsSchema.parse(
      fixture("instruments.json"),
    )
      .slice(0, 1)
      .map((item) => normalizeDeribitOptionInstrument(item, receivedAt));
    const summaries = DeribitBookSummariesSchema.parse(
      fixture("book-summary.json"),
    );

    const result = buildDeribitOptionsSnapshot(catalog, summaries, receivedAt);
    expect(result.snapshot.instruments).toHaveLength(1);
    expect(result.unknownSummaryInstrumentNames).toEqual([
      "BTC-25DEC26-80000-P",
    ]);
  });
});
