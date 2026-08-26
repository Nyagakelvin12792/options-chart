import { z } from "zod";

const decimalString = z
  .string()
  .refine(
    (value) => value.trim() !== "" && Number.isFinite(Number(value)),
    "Expected a finite decimal string",
  );

export const BinanceKlineSchema = z
  .tuple([
    z.number().int().nonnegative(),
    decimalString,
    decimalString,
    decimalString,
    decimalString,
    decimalString,
    z.number().int().nonnegative(),
    decimalString,
    z.number().int().nonnegative(),
    decimalString,
    decimalString,
    z.string(),
  ])
  .superRefine((kline, context) => {
    const open = Number(kline[1]);
    const high = Number(kline[2]);
    const low = Number(kline[3]);
    const close = Number(kline[4]);

    if (high < Math.max(open, close) || low > Math.min(open, close)) {
      context.addIssue({
        code: "custom",
        message: "Kline OHLC values are inconsistent",
      });
    }
    if (kline[6] < kline[0]) {
      context.addIssue({
        code: "custom",
        message: "Kline close time precedes open time",
      });
    }
  });

export const BinanceKlinePageSchema = z
  .array(BinanceKlineSchema)
  .min(1)
  .max(1_000)
  .superRefine((klines, context) => {
    for (let index = 1; index < klines.length; index += 1) {
      const current = klines[index];
      const previous = klines[index - 1];
      if (current && previous && current[0] <= previous[0]) {
        context.addIssue({
          code: "custom",
          message: "Klines must be strictly ordered by open time",
          path: [index, 0],
        });
      }
    }
  });

export type BinanceKline = z.infer<typeof BinanceKlineSchema>;