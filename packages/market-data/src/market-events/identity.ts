import type {
  MarketEventChannel,
  MarketEventProvenanceV1,
  MarketEventV1,
  MarketInstrumentType,
} from "./schemas";
import { MARKET_EVENT_SCHEMA_VERSION } from "./schemas";

type StableJsonValue =
  | string
  | number
  | boolean
  | null
  | StableJsonValue[]
  | { readonly [key: string]: StableJsonValue };

export interface MarketEventIdentityInput {
  readonly venue: string;
  readonly symbol: string;
  readonly instrumentType: MarketInstrumentType;
  readonly channel: MarketEventChannel;
  readonly exchangeTimestampMs: number | null;
  readonly sequence: number | string | null;
  readonly payload: unknown;
}

export type MarketEventWithoutIdV1 = Omit<MarketEventV1, "eventId">;

export function buildMarketEventId(input: MarketEventIdentityInput): string {
  return `market-event-v1:${fnv1a64(stableStringify(input))}`;
}

export function withMarketEventId(
  event: MarketEventWithoutIdV1,
): MarketEventV1 {
  return {
    ...event,
    eventId: buildMarketEventId({
      venue: event.venue,
      symbol: event.symbol,
      instrumentType: event.instrumentType,
      channel: event.channel,
      exchangeTimestampMs: event.exchangeTimestampMs,
      sequence: event.sequence,
      payload: event.payload,
    }),
  };
}

export function buildMarketHealthEventId(input: {
  readonly type: string;
  readonly venue: string;
  readonly symbol: string;
  readonly channel: string | null;
  readonly detectedAtMs: number;
  readonly connectionId: string;
  readonly details: unknown;
}): string {
  return `market-health-event-v1:${fnv1a64(stableStringify(input))}`;
}

export function createMarketEventDraft(input: {
  readonly venue: string;
  readonly symbol: string;
  readonly instrumentType: MarketInstrumentType;
  readonly channel: MarketEventChannel;
  readonly exchangeTimestampMs: number | null;
  readonly receiptTimestampMs: number;
  readonly sequence: number | string | null;
  readonly payload: unknown;
  readonly provenance: MarketEventProvenanceV1;
}): MarketEventWithoutIdV1 {
  return {
    schemaVersion: MARKET_EVENT_SCHEMA_VERSION,
    venue: input.venue,
    symbol: input.symbol,
    instrumentType: input.instrumentType,
    channel: input.channel,
    exchangeTimestampMs: input.exchangeTimestampMs,
    receiptTimestampMs: input.receiptTimestampMs,
    sequence: input.sequence,
    payload: input.payload,
    provenance: input.provenance,
  };
}

function stableStringify(value: unknown): string {
  return JSON.stringify(toStableJsonValue(value));
}

function toStableJsonValue(value: unknown): StableJsonValue {
  if (value === null) {
    return null;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toStableJsonValue(item));
  }

  if (typeof value === "object") {
    const output: Record<string, StableJsonValue> = {};
    for (const key of Object.keys(value).sort(compareByCodePoint)) {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) {
        output[key] = toStableJsonValue(child);
      }
    }
    return output;
  }

  return String(value);
}

function compareByCodePoint(left: string, right: string): number {
  const leftCodePoints = Array.from(left);
  const rightCodePoints = Array.from(right);
  const length = Math.min(leftCodePoints.length, rightCodePoints.length);

  for (let index = 0; index < length; index += 1) {
    const leftCodePoint = leftCodePoints[index]?.codePointAt(0) ?? 0;
    const rightCodePoint = rightCodePoints[index]?.codePointAt(0) ?? 0;
    if (leftCodePoint !== rightCodePoint) {
      return leftCodePoint - rightCodePoint;
    }
  }

  return leftCodePoints.length - rightCodePoints.length;
}

function fnv1a64(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  const bytes = new TextEncoder().encode(input);

  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }

  return hash.toString(16).padStart(16, "0");
}
