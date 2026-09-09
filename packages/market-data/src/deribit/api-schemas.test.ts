import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  DeribitBookSummariesSchema,
  DeribitIndexUpdateSchema,
  DeribitMarkPriceUpdatesSchema,
  DeribitOptionInstrumentsSchema,
  DeribitOptionInstrumentSchema,
  DeribitOptionTickerSchema,
  DeribitRecentOptionTradesQuerySchema,
  DeribitRecentOptionTradesResultSchema,
  DeribitRecentOptionTradesTimeQuerySchema,
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

  it("validates recent BTC option trades without inferring position intent", () => {
    const result = DeribitRecentOptionTradesResultSchema.parse({
      trades: [
        {
          trade_seq: 467,
          trade_id: "415305279",
          timestamp: 1_770_984_454_552,
          tick_direction: 2,
          price: 0.0525,
          mark_price: 0.05253883,
          iv: 45.91,
          instrument_name: "BTC-24APR26-72000-C",
          index_price: 66_930.31,
          direction: "buy",
          amount: 3,
          contracts: 3,
          source_marker: "preserved",
        },
      ],
      has_more: true,
    });

    expect(result.trades[0]).toMatchObject({
      direction: "buy",
      amount: 3,
      index_price: 66_930.31,
      iv: 45.91,
      source_marker: "preserved",
    });
    expect(
      DeribitRecentOptionTradesResultSchema.safeParse({
        ...result,
        trades: [{ ...result.trades[0], direction: "open" }],
      }).success,
    ).toBe(false);
    expect(
      DeribitRecentOptionTradesResultSchema.safeParse({
        ...result,
        trades: [{ ...result.trades[0], instrument_name: "BTC-PERPETUAL" }],
      }).success,
    ).toBe(false);
  });

  it("bounds and orders recent option trade query windows", () => {
    expect(DeribitRecentOptionTradesQuerySchema.parse({})).toEqual({
      count: 100,
      sorting: "desc",
    });
    expect(
      DeribitRecentOptionTradesQuerySchema.safeParse({ count: "1001" }).success,
    ).toBe(false);
    expect(
      DeribitRecentOptionTradesTimeQuerySchema.safeParse({
        start_timestamp: "200",
        end_timestamp: "100",
      }).success,
    ).toBe(false);
    expect(
      DeribitRecentOptionTradesTimeQuerySchema.safeParse({
        start_timestamp: "100",
        end_timestamp: "200",
      }).success,
    ).toBe(true);
  });

  it("validates the option ticker fields used for gamma reconciliation", () => {
    expect(
      DeribitOptionTickerSchema.parse({
        instrument_name: "BTC-24APR26-72000-C",
        timestamp: 1_770_984_454_552,
        underlying_price: 66_930.31,
        interest_rate: 0.01,
        mark_iv: 45.91,
        greeks: { gamma: 0.00012, delta: 0.51 },
      }).greeks.gamma,
    ).toBe(0.00012);
  });
});
