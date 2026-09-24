import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  BinanceSpotL2BookPayloadV1Schema,
  BinanceSpotTradePayloadV1Schema,
  buildMarketEventId,
  buildMarketHealthEventId,
  createMarketEventDraft,
  MARKET_EVENT_V1_JSON_SCHEMA,
  MARKET_HEALTH_EVENT_V1_JSON_SCHEMA,
  MARKET_STORAGE_RECORD_V1_JSON_SCHEMA,
  MarketEventV1Schema,
  MarketHealthEventV1Schema,
  MarketStorageRecordV1Schema,
  withMarketEventId,
} from "./index";

const provenance = {
  collector: "cryptofeed" as const,
  collectorVersion: "m11.2-test",
  connectionId: "binance-spot-btcusdt-1",
  recordedAtMs: 1_800_000_000_250,
};

const sharedIdentityFixture = JSON.parse(
  readFileSync(
    new URL(
      "../../../../tests/fixtures/market-events/identity-v1.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as {
  identity: Parameters<typeof buildMarketEventId>[0];
  expectedEventId: string;
};

const unicodeIdentityFixture = JSON.parse(
  readFileSync(
    new URL(
      "../../../../tests/fixtures/market-events/identity-unicode-v1.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as {
  identity: Parameters<typeof buildMarketEventId>[0];
  expectedEventId: string;
};

const sharedHealthFixture = JSON.parse(
  readFileSync(
    new URL(
      "../../../../tests/fixtures/market-events/health-gap-v1.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as unknown;

const checkedEventJsonSchema = JSON.parse(
  readFileSync(
    new URL(
      "../../../../services/cryptofeed-collector/schemas/market-event-v1.schema.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as unknown;

const checkedHealthJsonSchema = JSON.parse(
  readFileSync(
    new URL(
      "../../../../services/cryptofeed-collector/schemas/market-health-event-v1.schema.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as unknown;

describe("MarketEventV1Schema", () => {
  it("matches the shared cross-language identity fixture", () => {
    expect(buildMarketEventId(sharedIdentityFixture.identity)).toBe(
      sharedIdentityFixture.expectedEventId,
    );
  });

  it("sorts object keys by Unicode code point for cross-language parity", () => {
    expect(buildMarketEventId(unicodeIdentityFixture.identity)).toBe(
      "market-event-v1:37097bb6c13cdd2f",
    );
    expect(unicodeIdentityFixture.expectedEventId).toBe(
      "market-event-v1:37097bb6c13cdd2f",
    );
  });

  it("validates a canonical Binance Spot trade event", () => {
    const event = withMarketEventId(
      createMarketEventDraft({
        venue: "binance",
        symbol: "BTCUSDT",
        instrumentType: "spot",
        channel: "trade",
        exchangeTimestampMs: 1_800_000_000_000,
        receiptTimestampMs: 1_800_000_000_123,
        sequence: 42_000,
        payload: {
          schemaVersion: "binance-spot-trade-payload-v1",
          tradeId: 42_000,
          price: "63500.50",
          quantity: "0.010",
          tradeTimestampMs: 1_800_000_000_000,
          takerSide: "buy",
          isBuyerMaker: false,
        },
        provenance,
      }),
    );

    const parsed = MarketEventV1Schema.parse(event);

    expect(parsed.eventId).toBe("market-event-v1:ea141a06f740da8e");
    expect(parsed.exchangeTimestampMs).toBe(1_800_000_000_000);
    expect(parsed.payload).toMatchObject({
      tradeId: 42_000,
      takerSide: "buy",
    });
  });

  it("rejects uppercase venue identifiers before payload validation can be bypassed", () => {
    const validBinanceTradePayload = {
      schemaVersion: "binance-spot-trade-payload-v1",
      tradeId: 42_000,
      price: "63500.50",
      quantity: "0.010",
      tradeTimestampMs: 1_800_000_000_000,
      takerSide: "buy",
    };
    const baseEvent = {
      schemaVersion: "market-event-v1",
      eventId: "market-event-v1:0000000000000001",
      venue: "BINANCE",
      symbol: "BTCUSDT",
      instrumentType: "spot",
      channel: "trade",
      exchangeTimestampMs: 1_800_000_000_000,
      receiptTimestampMs: 1_800_000_000_123,
      sequence: 42_000,
      provenance,
    };

    expect(
      MarketEventV1Schema.safeParse({
        ...baseEvent,
        payload: validBinanceTradePayload,
      }).success,
    ).toBe(false);
    expect(
      MarketEventV1Schema.safeParse({
        ...baseEvent,
        payload: { arbitrary: "payload" },
      }).success,
    ).toBe(false);
  });

  it("uses the shared dedupe fixture and keeps IDs stable across receipt/provenance changes", () => {
    const payload = {
      schemaVersion: "binance-spot-trade-payload-v1",
      quantity: "0.125",
      price: "65000.01",
      takerSide: null,
      tradeId: null,
      tradeTimestampMs: null,
    };
    const first = withMarketEventId(
      createMarketEventDraft({
        venue: "binance",
        symbol: "BTCUSDT",
        instrumentType: "spot",
        channel: "trade",
        exchangeTimestampMs: null,
        receiptTimestampMs: 1_800_000_000_100,
        sequence: null,
        payload,
        provenance,
      }),
    );
    const second = withMarketEventId(
      createMarketEventDraft({
        venue: "binance",
        symbol: "BTCUSDT",
        instrumentType: "spot",
        channel: "trade",
        exchangeTimestampMs: null,
        receiptTimestampMs: 1_800_000_999_999,
        sequence: null,
        payload,
        provenance: {
          collector: "cryptofeed",
          collectorVersion: "different-version",
          connectionId: "different-connection",
          recordedAtMs: 1_800_001_000_000,
        },
      }),
    );

    expect(first.eventId).toBe("market-event-v1:a3a4d9b34553605d");
    expect(second.eventId).toBe(first.eventId);
  });

  it("preserves absent optional values instead of coercing them to zero", () => {
    const event = withMarketEventId(
      createMarketEventDraft({
        venue: "binance",
        symbol: "BTCUSDT",
        instrumentType: "spot",
        channel: "trade",
        exchangeTimestampMs: null,
        receiptTimestampMs: 1_800_000_000_123,
        sequence: null,
        payload: {
          schemaVersion: "binance-spot-trade-payload-v1",
          tradeId: "missing-sequence-fixture",
          price: "63500.50",
          quantity: "0.010",
          tradeTimestampMs: null,
          takerSide: null,
        },
        provenance,
      }),
    );

    const parsed = MarketEventV1Schema.parse(event);

    expect(parsed.exchangeTimestampMs).toBeNull();
    expect(parsed.sequence).toBeNull();
    expect(parsed.payload).toMatchObject({
      tradeTimestampMs: null,
      takerSide: null,
    });
    expect(parsed.payload).not.toHaveProperty("isBuyerMaker");
  });

  it("accepts finite decimal strings with exponents and rejects non-canonical numeric strings", () => {
    expect(
      BinanceSpotTradePayloadV1Schema.safeParse({
        schemaVersion: "binance-spot-trade-payload-v1",
        tradeId: null,
        price: "6.4e4",
        quantity: "1.25E-1",
        tradeTimestampMs: null,
        takerSide: null,
      }).success,
    ).toBe(true);
    expect(
      BinanceSpotL2BookPayloadV1Schema.safeParse({
        schemaVersion: "binance-spot-l2-book-payload-v1",
        updateType: "delta",
        sequence: "book-exp",
        bids: [[".5E+2", "0"]],
        asks: [["+6.5e4", "1e-8"]],
      }).success,
    ).toBe(true);

    for (const value of [" 1", "1 ", "NaN", "Infinity", "1_000", ""]) {
      expect(
        BinanceSpotTradePayloadV1Schema.safeParse({
          schemaVersion: "binance-spot-trade-payload-v1",
          tradeId: null,
          price: value,
          quantity: "1",
          tradeTimestampMs: null,
          takerSide: null,
        }).success,
      ).toBe(false);
    }
  });

  it("validates Binance Spot L2 book payloads and accepts zero quantities as explicit removals", () => {
    const event = withMarketEventId(
      createMarketEventDraft({
        venue: "binance",
        symbol: "BTCUSDT",
        instrumentType: "spot",
        channel: "l2-book",
        exchangeTimestampMs: 1_800_000_001_000,
        receiptTimestampMs: 1_800_000_001_050,
        sequence: 84_002,
        payload: {
          schemaVersion: "binance-spot-l2-book-payload-v1",
          updateType: "delta",
          sequence: 84_002,
          previousSequence: null,
          bids: [["63499.90", "0"]],
          asks: [["63500.10", "1.250"]],
        },
        provenance,
      }),
    );

    const parsed = MarketEventV1Schema.parse(event);

    expect(parsed.payload).toMatchObject({
      bids: [["63499.90", "0"]],
      previousSequence: null,
    });
  });

  it("rejects malformed Binance channel payloads", () => {
    const result = MarketEventV1Schema.safeParse({
      schemaVersion: "market-event-v1",
      eventId: "bad",
      venue: "binance",
      symbol: "BTCUSDT",
      instrumentType: "spot",
      channel: "l2-book",
      exchangeTimestampMs: 1_800_000_001_000,
      receiptTimestampMs: 1_800_000_001_050,
      sequence: 84_002,
      payload: {
        schemaVersion: "binance-spot-l2-book-payload-v1",
        updateType: "delta",
        sequence: 84_002,
        previousSequence: 84_003,
        bids: [["63499.90", "0.5"]],
        asks: [["63500.10", "1.250"]],
      },
      provenance,
    });

    expect(result.success).toBe(false);
  });

  it("builds deterministic IDs independent of object key order", () => {
    const first = buildMarketEventId({
      venue: "binance",
      symbol: "BTCUSDT",
      instrumentType: "spot",
      channel: "trade",
      exchangeTimestampMs: 1,
      sequence: "abc",
      payload: { b: "2", a: "1" },
    });
    const second = buildMarketEventId({
      venue: "binance",
      symbol: "BTCUSDT",
      instrumentType: "spot",
      channel: "trade",
      exchangeTimestampMs: 1,
      sequence: "abc",
      payload: { a: "1", b: "2" },
    });

    expect(first).toBe("market-event-v1:30a62e325e8c0132");
    expect(second).toBe(first);
  });
});

describe("MarketHealthEventV1Schema", () => {
  it("validates explicit gap, stale, reconnect, duplicate, and unsupported-channel events", () => {
    const base = {
      schemaVersion: "market-health-event-v1",
      venue: "binance",
      symbol: "BTCUSDT",
      channel: "l2-book",
      detectedAtMs: 1_800_000_010_000,
      connectionId: "binance-spot-btcusdt-1",
      severity: "warning",
    } as const;
    const events = [
      {
        ...base,
        type: "gap",
        healthEventId: buildMarketHealthEventId({
          ...base,
          type: "gap",
          details: {
            previousSequence: 10,
            expectedSequence: 11,
            actualSequence: 15,
            missingCount: 4,
          },
        }),
        details: {
          previousSequence: 10,
          expectedSequence: 11,
          actualSequence: 15,
          missingCount: 4,
        },
      },
      {
        ...base,
        type: "stale",
        healthEventId: "market-health-event-v1:0000000000000001",
        details: {
          lastEventTimestampMs: null,
          staleThresholdMs: 15_000,
          elapsedMs: 16_000,
        },
      },
      {
        ...base,
        type: "reconnect",
        healthEventId: "market-health-event-v1:0000000000000002",
        severity: "info",
        details: {
          reason: null,
          attempt: 1,
          backoffMs: null,
        },
      },
      {
        ...base,
        type: "duplicate",
        healthEventId: "market-health-event-v1:0000000000000003",
        relatedEventId: "market-event-v1:00000000000000ab",
        details: {
          duplicateEventId: "market-event-v1:00000000000000ab",
          firstSeenAtMs: null,
        },
      },
      {
        ...base,
        type: "unsupported-channel",
        healthEventId: "market-health-event-v1:0000000000000004",
        channel: "depth20",
        details: {
          unsupportedChannel: "depth20",
          rawChannel: null,
        },
      },
    ];

    expect(
      events.map((event) => MarketHealthEventV1Schema.parse(event).type),
    ).toEqual([
      "gap",
      "stale",
      "reconnect",
      "duplicate",
      "unsupported-channel",
    ]);
  });

  it("keeps health records separate while allowing storage/replay union records", () => {
    const health = {
      schemaVersion: "market-health-event-v1",
      venue: "binance",
      symbol: "BTCUSDT",
      channel: "trade",
      detectedAtMs: 1_800_000_010_000,
      connectionId: "binance-spot-btcusdt-1",
      severity: "warning",
      type: "duplicate",
      healthEventId: "market-health-event-v1:0000000000000005",
      details: {
        duplicateEventId: "market-event-v1:00000000000000ab",
        firstSeenAtMs: null,
      },
    };

    expect(MarketEventV1Schema.safeParse(health).success).toBe(false);
    expect(MarketStorageRecordV1Schema.parse(health)).toMatchObject({
      type: "duplicate",
    });
  });

  it("validates terminal collector errors with strict typed details", () => {
    const collectorError = {
      schemaVersion: "market-health-event-v1",
      healthEventId: "market-health-event-v1:0000000000000006",
      venue: "binance",
      symbol: "BTCUSDT",
      channel: null,
      detectedAtMs: 1_800_000_020_000,
      connectionId: "binance-spot-btcusdt-1",
      severity: "error",
      type: "collector-error",
      details: {
        source: "collector",
        errorCode: "collector-terminal",
        message: "collector stopped after unrecoverable configuration error",
        terminal: true,
        retryable: false,
      },
    };
    const withExtraDetail = {
      ...collectorError,
      details: {
        ...collectorError.details,
        traceback: "not part of the canonical contract",
      },
    };

    expect(MarketHealthEventV1Schema.parse(collectorError)).toMatchObject({
      type: "collector-error",
      details: { terminal: true, retryable: false },
    });
    expect(MarketHealthEventV1Schema.safeParse(withExtraDetail).success).toBe(
      false,
    );
  });

  it("records delegated Cryptofeed observability instead of fabricating gap or reconnect events", () => {
    const observability = {
      schemaVersion: "market-health-event-v1",
      healthEventId: "market-health-event-v1:0000000000000007",
      venue: "binance",
      symbol: "BTCUSDT",
      channel: "l2-book",
      detectedAtMs: 1_800_000_030_000,
      connectionId: "binance-spot-btcusdt-1",
      severity: "info",
      type: "observability",
      details: {
        status: "delegated-unobservable",
        owner: "cryptofeed",
        delegatedSignals: ["sequence-gap", "reconnect-lifecycle"],
        fabricatedEvents: false,
        note: "Cryptofeed owns internal sequencing and reconnect lifecycle state.",
      },
    };

    const parsed = MarketHealthEventV1Schema.parse(observability);

    expect(parsed.type).toBe("observability");
    expect(parsed.type).not.toBe("gap");
    expect(parsed.type).not.toBe("reconnect");
    expect(parsed.details).toMatchObject({
      status: "delegated-unobservable",
      fabricatedEvents: false,
    });
  });

  it("accepts the canonical health fixture as a storage record and rejects the old Python health shape", () => {
    const oldPythonHealthShape = {
      schema_version: "market-health-event-v1",
      health_event_id: "market-health-event-v1:b83456a67638a6d0",
      venue: "binance",
      symbol: "BTCUSDT",
      channel: "l2-book",
      detected_at_ms: 1_700_000_000_500,
      connection_id: "binance-spot-btcusdt-shared",
      severity: "warning",
      event_type: "gap",
      payload: {
        previous_sequence: 100,
        expected_sequence: 101,
        actual_sequence: 105,
        missing_count: 4,
      },
    };

    expect(
      MarketStorageRecordV1Schema.parse(sharedHealthFixture),
    ).toMatchObject({
      schemaVersion: "market-health-event-v1",
      type: "gap",
    });
    expect(
      MarketStorageRecordV1Schema.safeParse(oldPythonHealthShape).success,
    ).toBe(false);
  });
});

describe("MARKET_EVENT_V1_JSON_SCHEMA", () => {
  it("keeps checked Python-service schema files byte-equivalent to TypeScript exports after JSON parsing", () => {
    expect(checkedEventJsonSchema).toEqual(MARKET_EVENT_V1_JSON_SCHEMA);
    expect(checkedHealthJsonSchema).toEqual(MARKET_HEALTH_EVENT_V1_JSON_SCHEMA);
  });

  it("exports a deterministic checked-in schema artifact", () => {
    expect(JSON.stringify(MARKET_EVENT_V1_JSON_SCHEMA)).toContain(
      "binanceSpotTradePayloadV1",
    );
    expect(MARKET_EVENT_V1_JSON_SCHEMA.$id).toBe(
      "https://options-chart.local/schemas/market-event-v1.json",
    );
    expect(MARKET_EVENT_V1_JSON_SCHEMA.properties.eventId).toMatchObject({
      pattern: "^market-event-v1:[0-9a-f]{16}$",
    });
    expect(MARKET_EVENT_V1_JSON_SCHEMA.properties.venue).toMatchObject({
      pattern: "^[a-z][a-z0-9-]*$",
    });
    expect(
      MARKET_EVENT_V1_JSON_SCHEMA.$defs.binanceSpotTradePayloadV1.properties
        .tradeTimestampMs,
    ).toMatchObject({
      anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }],
    });
    expect(
      MARKET_EVENT_V1_JSON_SCHEMA.$defs.binanceSpotTradePayloadV1.required,
    ).not.toContain("isBuyerMaker");
    expect(JSON.stringify(MARKET_STORAGE_RECORD_V1_JSON_SCHEMA)).toContain(
      "MarketStorageRecordV1",
    );
    expect(JSON.stringify(MARKET_HEALTH_EVENT_V1_JSON_SCHEMA)).toContain(
      "collectorErrorDetails",
    );
    expect(JSON.stringify(MARKET_HEALTH_EVENT_V1_JSON_SCHEMA)).toContain(
      "observabilityDetails",
    );
  });
});
