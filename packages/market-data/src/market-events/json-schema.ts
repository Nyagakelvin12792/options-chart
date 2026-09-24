export const MARKET_EVENT_V1_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://options-chart.local/schemas/market-event-v1.json",
  title: "MarketEventV1",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "eventId",
    "venue",
    "symbol",
    "instrumentType",
    "channel",
    "exchangeTimestampMs",
    "receiptTimestampMs",
    "sequence",
    "payload",
    "provenance",
  ],
  properties: {
    schemaVersion: { const: "market-event-v1" },
    eventId: { type: "string", pattern: "^market-event-v1:[0-9a-f]{16}$" },
    venue: { type: "string", pattern: "^[a-z][a-z0-9-]*$" },
    symbol: { type: "string", minLength: 1 },
    instrumentType: {
      enum: ["spot", "perpetual", "future", "option"],
    },
    channel: {
      enum: [
        "trade",
        "l1-book",
        "l2-book",
        "open-interest",
        "funding",
        "liquidation",
        "index",
      ],
    },
    exchangeTimestampMs: {
      anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }],
    },
    receiptTimestampMs: { type: "integer", minimum: 0 },
    sequence: {
      anyOf: [
        { type: "integer", minimum: 0 },
        { type: "string" },
        { type: "null" },
      ],
    },
    payload: true,
    provenance: {
      type: "object",
      additionalProperties: false,
      required: [
        "collector",
        "collectorVersion",
        "connectionId",
        "recordedAtMs",
      ],
      properties: {
        collector: { const: "cryptofeed" },
        collectorVersion: { type: "string", minLength: 1 },
        connectionId: { type: "string", minLength: 1 },
        recordedAtMs: { type: "integer", minimum: 0 },
      },
    },
  },
  allOf: [
    {
      if: {
        properties: {
          venue: { const: "binance" },
          instrumentType: { const: "spot" },
          channel: { const: "trade" },
        },
        required: ["venue", "instrumentType", "channel"],
      },
      then: {
        required: ["payload"],
        properties: {
          payload: {
            $ref: "#/$defs/binanceSpotTradePayloadV1",
          },
        },
      },
    },
    {
      if: {
        properties: {
          venue: { const: "binance" },
          instrumentType: { const: "spot" },
          channel: { const: "l2-book" },
        },
        required: ["venue", "instrumentType", "channel"],
      },
      then: {
        required: ["payload"],
        properties: {
          payload: {
            $ref: "#/$defs/binanceSpotL2BookPayloadV1",
          },
        },
      },
    },
  ],
  $defs: {
    sequence: {
      anyOf: [{ type: "integer", minimum: 0 }, { type: "string" }],
    },
    nullableSequence: {
      anyOf: [
        { type: "integer", minimum: 0 },
        { type: "string" },
        { type: "null" },
      ],
    },
    decimalString: {
      type: "string",
      pattern: "^(?!\\s*$)[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?$",
    },
    binanceSpotTradePayloadV1: {
      type: "object",
      additionalProperties: false,
      required: [
        "schemaVersion",
        "tradeId",
        "price",
        "quantity",
        "tradeTimestampMs",
        "takerSide",
      ],
      properties: {
        schemaVersion: { const: "binance-spot-trade-payload-v1" },
        tradeId: { $ref: "#/$defs/nullableSequence" },
        price: { $ref: "#/$defs/decimalString" },
        quantity: { $ref: "#/$defs/decimalString" },
        tradeTimestampMs: {
          anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }],
        },
        takerSide: { enum: ["buy", "sell", null] },
        isBuyerMaker: { type: "boolean" },
      },
    },
    binanceSpotL2BookLevel: {
      type: "array",
      minItems: 2,
      maxItems: 2,
      prefixItems: [
        { $ref: "#/$defs/decimalString" },
        { $ref: "#/$defs/decimalString" },
      ],
    },
    binanceSpotL2BookPayloadV1: {
      type: "object",
      additionalProperties: false,
      required: ["schemaVersion", "updateType", "sequence", "bids", "asks"],
      properties: {
        schemaVersion: { const: "binance-spot-l2-book-payload-v1" },
        updateType: { enum: ["snapshot", "delta"] },
        sequence: { $ref: "#/$defs/nullableSequence" },
        previousSequence: { $ref: "#/$defs/nullableSequence" },
        bids: {
          type: "array",
          items: { $ref: "#/$defs/binanceSpotL2BookLevel" },
        },
        asks: {
          type: "array",
          items: { $ref: "#/$defs/binanceSpotL2BookLevel" },
        },
      },
    },
  },
} as const;

export const MARKET_HEALTH_EVENT_V1_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://options-chart.local/schemas/market-health-event-v1.json",
  title: "MarketHealthEventV1",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "healthEventId",
    "venue",
    "symbol",
    "channel",
    "detectedAtMs",
    "connectionId",
    "severity",
    "type",
    "details",
  ],
  properties: {
    schemaVersion: { const: "market-health-event-v1" },
    healthEventId: {
      type: "string",
      pattern: "^market-health-event-v1:[0-9a-f]{16}$",
    },
    venue: { type: "string", minLength: 1 },
    symbol: { type: "string", minLength: 1 },
    channel: {
      anyOf: [{ type: "string", minLength: 1 }, { type: "null" }],
    },
    detectedAtMs: { type: "integer", minimum: 0 },
    connectionId: { type: "string", minLength: 1 },
    severity: { enum: ["info", "warning", "error"] },
    relatedEventId: {
      anyOf: [
        { type: "string", pattern: "^market-event-v1:[0-9a-f]{16}$" },
        { type: "null" },
      ],
    },
    type: {
      enum: [
        "gap",
        "stale",
        "reconnect",
        "duplicate",
        "unsupported-channel",
        "collector-error",
        "observability",
      ],
    },
    details: true,
  },
  allOf: [
    {
      if: { properties: { type: { const: "gap" } }, required: ["type"] },
      then: {
        properties: { details: { $ref: "#/$defs/gapDetails" } },
        required: ["details"],
      },
    },
    {
      if: { properties: { type: { const: "stale" } }, required: ["type"] },
      then: {
        properties: { details: { $ref: "#/$defs/staleDetails" } },
        required: ["details"],
      },
    },
    {
      if: { properties: { type: { const: "reconnect" } }, required: ["type"] },
      then: {
        properties: { details: { $ref: "#/$defs/reconnectDetails" } },
        required: ["details"],
      },
    },
    {
      if: { properties: { type: { const: "duplicate" } }, required: ["type"] },
      then: {
        properties: { details: { $ref: "#/$defs/duplicateDetails" } },
        required: ["details"],
      },
    },
    {
      if: {
        properties: { type: { const: "unsupported-channel" } },
        required: ["type"],
      },
      then: {
        properties: { details: { $ref: "#/$defs/unsupportedChannelDetails" } },
        required: ["details"],
      },
    },
    {
      if: {
        properties: { type: { const: "collector-error" } },
        required: ["type"],
      },
      then: {
        properties: { details: { $ref: "#/$defs/collectorErrorDetails" } },
        required: ["details"],
      },
    },
    {
      if: {
        properties: { type: { const: "observability" } },
        required: ["type"],
      },
      then: {
        properties: { details: { $ref: "#/$defs/observabilityDetails" } },
        required: ["details"],
      },
    },
  ],
  $defs: {
    nullableSequence: {
      anyOf: [
        { type: "integer", minimum: 0 },
        { type: "string" },
        { type: "null" },
      ],
    },
    nullableTimestampMs: {
      anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }],
    },
    gapDetails: {
      type: "object",
      additionalProperties: false,
      required: ["expectedSequence", "actualSequence", "missingCount"],
      properties: {
        previousSequence: { $ref: "#/$defs/nullableSequence" },
        expectedSequence: { $ref: "#/$defs/nullableSequence" },
        actualSequence: { $ref: "#/$defs/nullableSequence" },
        missingCount: {
          anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }],
        },
      },
    },
    staleDetails: {
      type: "object",
      additionalProperties: false,
      required: ["lastEventTimestampMs", "staleThresholdMs", "elapsedMs"],
      properties: {
        lastEventTimestampMs: { $ref: "#/$defs/nullableTimestampMs" },
        staleThresholdMs: { type: "integer", minimum: 1 },
        elapsedMs: { type: "integer", minimum: 0 },
      },
    },
    reconnectDetails: {
      type: "object",
      additionalProperties: false,
      required: ["reason", "attempt", "backoffMs"],
      properties: {
        reason: {
          anyOf: [{ type: "string", minLength: 1 }, { type: "null" }],
        },
        attempt: { type: "integer", minimum: 0 },
        backoffMs: {
          anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }],
        },
      },
    },
    duplicateDetails: {
      type: "object",
      additionalProperties: false,
      required: ["duplicateEventId", "firstSeenAtMs"],
      properties: {
        duplicateEventId: {
          type: "string",
          pattern: "^market-event-v1:[0-9a-f]{16}$",
        },
        firstSeenAtMs: { $ref: "#/$defs/nullableTimestampMs" },
      },
    },
    unsupportedChannelDetails: {
      type: "object",
      additionalProperties: false,
      required: ["unsupportedChannel"],
      properties: {
        unsupportedChannel: { type: "string", minLength: 1 },
        rawChannel: {
          anyOf: [{ type: "string", minLength: 1 }, { type: "null" }],
        },
      },
    },
    collectorErrorDetails: {
      type: "object",
      additionalProperties: false,
      required: ["source", "errorCode", "message", "terminal", "retryable"],
      properties: {
        source: {
          enum: ["collector", "adapter", "storage", "replay", "configuration"],
        },
        errorCode: { type: "string", minLength: 1 },
        message: { type: "string", minLength: 1 },
        terminal: { const: true },
        retryable: { const: false },
      },
    },
    observabilityDetails: {
      type: "object",
      additionalProperties: false,
      required: ["status", "owner", "delegatedSignals", "fabricatedEvents"],
      properties: {
        status: { const: "delegated-unobservable" },
        owner: { const: "cryptofeed" },
        delegatedSignals: {
          type: "array",
          minItems: 1,
          items: { enum: ["sequence-gap", "reconnect-lifecycle"] },
        },
        fabricatedEvents: { const: false },
        note: { type: "string", minLength: 1 },
      },
    },
  },
} as const;

export const MARKET_STORAGE_RECORD_V1_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://options-chart.local/schemas/market-storage-record-v1.json",
  title: "MarketStorageRecordV1",
  anyOf: [MARKET_EVENT_V1_JSON_SCHEMA, MARKET_HEALTH_EVENT_V1_JSON_SCHEMA],
} as const;
