import { z } from "zod";

export const MARKET_EVENT_SCHEMA_VERSION = "market-event-v1" as const;
export const MARKET_HEALTH_EVENT_SCHEMA_VERSION =
  "market-health-event-v1" as const;

const DECIMAL_STRING_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const MARKET_EVENT_ID_PATTERN = /^market-event-v1:[0-9a-f]{16}$/;
const MARKET_HEALTH_EVENT_ID_PATTERN = /^market-health-event-v1:[0-9a-f]{16}$/;
const LOWERCASE_VENUE_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

const decimalString = z
  .string()
  .refine(
    (value) =>
      DECIMAL_STRING_PATTERN.test(value) && Number.isFinite(Number(value)),
    "Expected a finite decimal string",
  );

const sequenceValue = z.union([z.number().int().nonnegative(), z.string()]);
const nullableSequenceValue = sequenceValue.nullable();
const timestampMs = z.number().int().nonnegative();
const nullableTimestampMs = timestampMs.nullable();

export const MarketInstrumentTypeSchema = z.enum([
  "spot",
  "perpetual",
  "future",
  "option",
]);

export const MarketEventChannelSchema = z.enum([
  "trade",
  "l1-book",
  "l2-book",
  "open-interest",
  "funding",
  "liquidation",
  "index",
]);

export const BinanceSpotTradePayloadV1Schema = z
  .object({
    schemaVersion: z.literal("binance-spot-trade-payload-v1"),
    tradeId: nullableSequenceValue,
    price: decimalString,
    quantity: decimalString,
    tradeTimestampMs: nullableTimestampMs,
    takerSide: z.enum(["buy", "sell"]).nullable(),
    isBuyerMaker: z.boolean().optional(),
  })
  .strict();

export const BinanceSpotL2BookLevelSchema = z
  .tuple([decimalString, decimalString])
  .readonly();

export const BinanceSpotL2BookPayloadV1Schema = z
  .object({
    schemaVersion: z.literal("binance-spot-l2-book-payload-v1"),
    updateType: z.enum(["snapshot", "delta"]),
    sequence: nullableSequenceValue,
    previousSequence: nullableSequenceValue.optional(),
    bids: z.array(BinanceSpotL2BookLevelSchema),
    asks: z.array(BinanceSpotL2BookLevelSchema),
  })
  .strict()
  .superRefine((payload, context) => {
    if (
      typeof payload.previousSequence === "number" &&
      typeof payload.sequence === "number" &&
      payload.sequence < payload.previousSequence
    ) {
      context.addIssue({
        code: "custom",
        message: "L2 sequence precedes previous sequence",
        path: ["sequence"],
      });
    }
  });

export const MarketEventProvenanceV1Schema = z
  .object({
    collector: z.literal("cryptofeed"),
    collectorVersion: z.string().min(1),
    connectionId: z.string().min(1),
    recordedAtMs: timestampMs,
  })
  .strict();

export const MarketEventV1Schema = z
  .object({
    schemaVersion: z.literal(MARKET_EVENT_SCHEMA_VERSION),
    eventId: z.string().regex(MARKET_EVENT_ID_PATTERN),
    venue: z.string().regex(LOWERCASE_VENUE_ID_PATTERN),
    symbol: z.string().min(1),
    instrumentType: MarketInstrumentTypeSchema,
    channel: MarketEventChannelSchema,
    exchangeTimestampMs: nullableTimestampMs,
    receiptTimestampMs: timestampMs,
    sequence: nullableSequenceValue,
    payload: z.unknown(),
    provenance: MarketEventProvenanceV1Schema,
  })
  .strict()
  .superRefine((event, context) => {
    const isBinanceSpot =
      event.venue === "binance" && event.instrumentType === "spot";

    if (isBinanceSpot && event.channel === "trade") {
      const result = BinanceSpotTradePayloadV1Schema.safeParse(event.payload);
      if (!result.success) {
        context.addIssue({
          code: "custom",
          message: "Invalid Binance Spot trade payload",
          path: ["payload"],
        });
      }
    }

    if (isBinanceSpot && event.channel === "l2-book") {
      const result = BinanceSpotL2BookPayloadV1Schema.safeParse(event.payload);
      if (!result.success) {
        context.addIssue({
          code: "custom",
          message: "Invalid Binance Spot L2 book payload",
          path: ["payload"],
        });
      }
    }
  });

const MarketHealthEventBaseV1Schema = z.object({
  schemaVersion: z.literal(MARKET_HEALTH_EVENT_SCHEMA_VERSION),
  healthEventId: z.string().regex(MARKET_HEALTH_EVENT_ID_PATTERN),
  venue: z.string().min(1),
  symbol: z.string().min(1),
  channel: z.union([MarketEventChannelSchema, z.string().min(1)]).nullable(),
  detectedAtMs: timestampMs,
  connectionId: z.string().min(1),
  severity: z.enum(["info", "warning", "error"]),
  relatedEventId: z
    .string()
    .regex(MARKET_EVENT_ID_PATTERN)
    .nullable()
    .optional(),
});

export const MarketGapHealthEventV1Schema =
  MarketHealthEventBaseV1Schema.extend({
    type: z.literal("gap"),
    details: z
      .object({
        previousSequence: nullableSequenceValue.optional(),
        expectedSequence: nullableSequenceValue,
        actualSequence: nullableSequenceValue,
        missingCount: z.number().int().positive().nullable(),
      })
      .strict(),
  }).strict();

export const MarketStaleHealthEventV1Schema =
  MarketHealthEventBaseV1Schema.extend({
    type: z.literal("stale"),
    details: z
      .object({
        lastEventTimestampMs: nullableTimestampMs,
        staleThresholdMs: z.number().int().positive(),
        elapsedMs: z.number().int().nonnegative(),
      })
      .strict(),
  }).strict();

export const MarketReconnectHealthEventV1Schema =
  MarketHealthEventBaseV1Schema.extend({
    type: z.literal("reconnect"),
    details: z
      .object({
        reason: z.string().min(1).nullable(),
        attempt: z.number().int().nonnegative(),
        backoffMs: z.number().int().nonnegative().nullable(),
      })
      .strict(),
  }).strict();

export const MarketDuplicateHealthEventV1Schema =
  MarketHealthEventBaseV1Schema.extend({
    type: z.literal("duplicate"),
    details: z
      .object({
        duplicateEventId: z.string().regex(MARKET_EVENT_ID_PATTERN),
        firstSeenAtMs: nullableTimestampMs,
      })
      .strict(),
  }).strict();

export const MarketUnsupportedChannelHealthEventV1Schema =
  MarketHealthEventBaseV1Schema.extend({
    type: z.literal("unsupported-channel"),
    details: z
      .object({
        unsupportedChannel: z.string().min(1),
        rawChannel: z.string().min(1).nullable().optional(),
      })
      .strict(),
  }).strict();

export const MarketCollectorErrorHealthEventV1Schema =
  MarketHealthEventBaseV1Schema.extend({
    type: z.literal("collector-error"),
    details: z
      .object({
        source: z.enum([
          "collector",
          "adapter",
          "storage",
          "replay",
          "configuration",
        ]),
        errorCode: z.string().min(1),
        message: z.string().min(1),
        terminal: z.literal(true),
        retryable: z.literal(false),
      })
      .strict(),
  }).strict();

export const MarketObservabilityHealthEventV1Schema =
  MarketHealthEventBaseV1Schema.extend({
    type: z.literal("observability"),
    details: z
      .object({
        status: z.literal("delegated-unobservable"),
        owner: z.literal("cryptofeed"),
        delegatedSignals: z
          .array(z.enum(["sequence-gap", "reconnect-lifecycle"]))
          .min(1),
        fabricatedEvents: z.literal(false),
        note: z.string().min(1).optional(),
      })
      .strict(),
  }).strict();

export const MarketHealthEventV1Schema = z.discriminatedUnion("type", [
  MarketGapHealthEventV1Schema,
  MarketStaleHealthEventV1Schema,
  MarketReconnectHealthEventV1Schema,
  MarketDuplicateHealthEventV1Schema,
  MarketUnsupportedChannelHealthEventV1Schema,
  MarketCollectorErrorHealthEventV1Schema,
  MarketObservabilityHealthEventV1Schema,
]);

export const MarketStorageRecordV1Schema = z.union([
  MarketEventV1Schema,
  MarketHealthEventV1Schema,
]);

export type MarketInstrumentType = z.infer<typeof MarketInstrumentTypeSchema>;
export type MarketEventChannel = z.infer<typeof MarketEventChannelSchema>;
export type MarketEventProvenanceV1 = z.infer<
  typeof MarketEventProvenanceV1Schema
>;
export type BinanceSpotTradePayloadV1 = z.infer<
  typeof BinanceSpotTradePayloadV1Schema
>;
export type BinanceSpotL2BookLevel = z.infer<
  typeof BinanceSpotL2BookLevelSchema
>;
export type BinanceSpotL2BookPayloadV1 = z.infer<
  typeof BinanceSpotL2BookPayloadV1Schema
>;
export type MarketEventV1 = z.infer<typeof MarketEventV1Schema>;
export type MarketHealthEventV1 = z.infer<typeof MarketHealthEventV1Schema>;
export type MarketStorageRecordV1 = z.infer<typeof MarketStorageRecordV1Schema>;
