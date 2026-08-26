import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  DeribitBookSummariesSchema,
  DeribitIndexUpdateSchema,
  DeribitMarkPriceUpdatesSchema,
  DeribitOptionInstrumentsSchema,
  DeribitOptionInstrumentSchema,
  DeribitSubscriptionEnvelopeSchema,
} from "./api-schemas";

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      new URL(`../../../../tests/fixtures/deribit/${name}`, import.meta.url),
      "utf8",
    ),
  );

describe("Deribit API schemas", () => {
  it("validates the BTC inverse instrument and book-summary fixtures", () => {
    expect(
      DeribitOptionInstrumentsSchema.parse(fixture("instruments.json")),
    ).toHaveLength(2);
    expect(
      DeribitBookSummariesSchema.parse(fixture("book-summary.json")),
    ).toHaveLength(2);
  });

  it("validates consolidated mark and index subscription payloads", () => {
    const markEnvelope = DeribitSubscriptionEnvelopeSchema.parse(
      fixture("mark-stream.json"),
    );
    const indexEnvelope = DeribitSubscriptionEnvelopeSchema.parse(
      fixture("index-stream.json"),
    );

    expect(
      DeribitMarkPriceUpdatesSchema.parse(markEnvelope.params.data),
    ).toHaveLength(1);
    expect(
      DeribitIndexUpdateSchema.parse(indexEnvelope.params.data).price,
    ).toBe(78_625.5);
  });

  it("rejects contracts outside the BTC-settled inverse v1 universe", () => {
    const instrument = DeribitOptionInstrumentsSchema.parse(
      fixture("instruments.json"),
    )[0];
    expect(
      DeribitOptionInstrumentSchema.safeParse({
        ...instrument,
        settlement_currency: "USDC",
      }).success,
    ).toBe(false);
    expect(
      DeribitOptionInstrumentSchema.safeParse({
        ...instrument,
        contract_size: 10,
      }).success,
    ).toBe(false);
  });

  it("rejects malformed mark updates before normalization", () => {
    expect(
      DeribitMarkPriceUpdatesSchema.safeParse([
        {
          instrument_name: "BTC-25DEC26-80000-C",
          mark_price: -1,
          iv: 0.66,
          timestamp: 1_780_000_000_200,
        },
      ]).success,
    ).toBe(false);
  });
});
