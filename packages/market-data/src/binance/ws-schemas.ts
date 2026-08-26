import { z } from "zod";

// ---------------------------------------------------------------------------
// Binance WebSocket Kline event schema
//
// Reference: https://binance-docs.github.io/apidocs/spot/en/#kline-candlestick-streams
// The WS kline payload wraps the kline data inside an `e`/`E`/`s`/`k` envelope.
// ---------------------------------------------------------------------------

const decimalString = z
  .string()
  .refine(
    (value) => value.trim() !== "" && Number.isFinite(Number(value)),
    "Expected a finite decimal string",
  );

/**
 * Inner `k` object of a Binance Kline WebSocket message.
 */
export const BinanceWsKlineDataSchema = z
  .object({
    /** Kline start time (ms). */
    t: z.number().int().nonnegative(),
    /** Kline close time (ms). */
    T: z.number().int().nonnegative(),
    /** Symbol. */
    s: z.string(),
    /** Interval. */
    i: z.string(),
    /** First trade ID. */
    f: z.number().int(),
    /** Last trade ID. */
    L: z.number().int(),
    /** Open price. */
    o: decimalString,
    /** Close price. */
    c: decimalString,
    /** High price. */
    h: decimalString,
    /** Low price. */
    l: decimalString,
    /** Base asset volume. */
    v: decimalString,
    /** Number of trades. */
    n: z.number().int().nonnegative(),
    /** Is this kline closed? */
    x: z.boolean(),
    /** Quote asset volume. */
    q: decimalString,
    /** Taker buy base asset volume. */
    V: decimalString,
    /** Taker buy quote asset volume. */
    Q: decimalString,
    /** Ignore. */
    B: z.string(),
  })
  .superRefine((k, context) => {
    const open = Number(k.o);
    const high = Number(k.h);
    const low = Number(k.l);
    const close = Number(k.c);

    if (high < Math.max(open, close) || low > Math.min(open, close)) {
      context.addIssue({
        code: "custom",
        message: "WebSocket kline OHLC values are inconsistent",
      });
    }
    if (k.T < k.t) {
      context.addIssue({
        code: "custom",
        message: "WebSocket kline close time precedes open time",
      });
    }
  });

/**
 * Full Binance Kline WebSocket event.
 */
export const BinanceWsKlineEventSchema = z.object({
  /** Event type – always "kline". */
  e: z.literal("kline"),
  /** Event time (ms). */
  E: z.number().int().nonnegative(),
  /** Symbol. */
  s: z.string(),
  /** Kline data. */
  k: BinanceWsKlineDataSchema,
});

export type BinanceWsKlineEvent = z.infer<typeof BinanceWsKlineEventSchema>;
export type BinanceWsKlineData = z.infer<typeof BinanceWsKlineDataSchema>;
