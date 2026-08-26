import { z } from "zod";

const finiteNullableNumber = z.number().finite().nullable();
const nonnegativeNullableNumber = z.number().finite().nonnegative().nullable();

export const DeribitRpcErrorSchema = z
  .object({
    code: z.number().int(),
    message: z.string().min(1),
    data: z.unknown().optional(),
  })
  .passthrough();

export const DeribitRpcResponseSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    id: z.union([z.number().int(), z.string()]).optional(),
    result: z.unknown().optional(),
    error: DeribitRpcErrorSchema.optional(),
  })
  .passthrough()
  .superRefine((response, context) => {
    const hasResult = Object.prototype.hasOwnProperty.call(response, "result");
    const hasError = response.error !== undefined;
    if (hasResult === hasError) {
      context.addIssue({
        code: "custom",
        message: "A JSON-RPC response must contain exactly one of result or error",
      });
    }
  });

export const DeribitOptionInstrumentSchema = z
  .object({
    instrument_name: z.string().regex(/^BTC-[A-Z0-9]+-[0-9]+-[CP]$/),
    kind: z.literal("option"),
    base_currency: z.literal("BTC"),
    quote_currency: z.string().min(1),
    counter_currency: z.literal("USD"),
    settlement_currency: z.literal("BTC"),
    price_index: z.literal("btc_usd"),
    instrument_type: z.literal("reversed").optional(),
    creation_timestamp: z.number().int().nonnegative(),
    expiration_timestamp: z.number().int().positive(),
    strike: z.number().finite().positive(),
    option_type: z.enum(["call", "put"]),
    contract_size: z.literal(1),
    is_active: z.boolean(),
    state: z.enum([
      "open",
      "settlement",
      "delivered",
      "inactive",
      "locked",
      "halted",
      "archivized",
    ]),
  })
  .passthrough()
  .refine(
    (instrument) => instrument.expiration_timestamp > instrument.creation_timestamp,
    "Expiration must follow instrument creation",
  );

export const DeribitOptionInstrumentsSchema = z.array(DeribitOptionInstrumentSchema);

export const DeribitBookSummarySchema = z
  .object({
    instrument_name: z.string().min(1),
    base_currency: z.literal("BTC"),
    quote_currency: z.string().min(1),
    creation_timestamp: z.number().int().positive(),
    open_interest: z.number().finite().nonnegative(),
    mark_price: nonnegativeNullableNumber,
    mark_iv: nonnegativeNullableNumber,
    interest_rate: finiteNullableNumber,
    underlying_price: z.number().finite().positive(),
    underlying_index: z.string().min(1),
    volume: z.number().finite().nonnegative().optional(),
    volume_usd: z.number().finite().nonnegative().optional(),
    bid_price: nonnegativeNullableNumber.optional(),
    ask_price: nonnegativeNullableNumber.optional(),
    mid_price: nonnegativeNullableNumber.optional(),
    last: nonnegativeNullableNumber.optional(),
  })
  .passthrough();

export const DeribitBookSummariesSchema = z.array(DeribitBookSummarySchema);

export const DeribitMarkPriceUpdateSchema = z
  .object({
    instrument_name: z.string().min(1),
    mark_price: z.number().finite().nonnegative(),
    iv: z.number().finite().nonnegative(),
    timestamp: z.number().int().positive(),
  })
  .strict();

export const DeribitMarkPriceUpdatesSchema = z
  .array(DeribitMarkPriceUpdateSchema)
  .min(1);

export const DeribitIndexUpdateSchema = z
  .object({
    index_name: z.literal("btc_usd"),
    price: z.number().finite().positive(),
    timestamp: z.number().int().positive(),
  })
  .strict();

export const DeribitIndexPriceResultSchema = z
  .object({
    index_price: z.number().finite().positive(),
    estimated_delivery_price: z.number().finite().positive().optional(),
  })
  .passthrough();

export const DeribitTimeResultSchema = z.number().int().positive();

export const DeribitSubscriptionEnvelopeSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    method: z.literal("subscription"),
    params: z
      .object({
        channel: z.string().min(1),
        data: z.unknown(),
      })
      .strict(),
  })
  .strict();

export const DeribitHeartbeatEnvelopeSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    method: z.literal("heartbeat"),
    params: z
      .object({
        type: z.enum(["heartbeat", "test_request"]),
      })
      .passthrough(),
  })
  .strict();

export type DeribitRpcError = z.infer<typeof DeribitRpcErrorSchema>;
export type DeribitOptionInstrumentPayload = z.infer<
  typeof DeribitOptionInstrumentSchema
>;
export type DeribitBookSummaryPayload = z.infer<typeof DeribitBookSummarySchema>;
export type DeribitMarkPriceUpdatePayload = z.infer<
  typeof DeribitMarkPriceUpdateSchema
>;
export type DeribitIndexUpdatePayload = z.infer<typeof DeribitIndexUpdateSchema>;
