import { z } from "zod";

export const DeribitConsolidatedInstrumentSchema = z
  .object({
    instrument_name: z.string().min(1),
    creation_timestamp: z.number().int().nonnegative(),
    expiration_timestamp: z.number().int().positive(),
    strike: z.number().positive(),
    option_type: z.enum(["call", "put"]),
    underlying_price: z.number().positive(),
    open_interest: z.number().nonnegative(),
    mark_price: z.number().nonnegative().nullable(),
    mark_iv: z.number().nonnegative().nullable(),
    interest_rate: z.number().finite().nullable(),
  })
  .strict()
  .refine(
    (instrument) =>
      instrument.expiration_timestamp > instrument.creation_timestamp,
    "Expiration must follow instrument creation",
  );

export const DeribitConsolidatedSnapshotSchema = z
  .object({
    schema_version: z.literal("m0.5-deribit-snapshot-v1"),
    timestamp: z.number().int().positive(),
    instruments: z.array(DeribitConsolidatedInstrumentSchema).min(1),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const names = new Set<string>();
    snapshot.instruments.forEach((instrument, index) => {
      if (names.has(instrument.instrument_name)) {
        context.addIssue({
          code: "custom",
          message: "Instrument names must be unique",
          path: ["instruments", index, "instrument_name"],
        });
      }
      names.add(instrument.instrument_name);
    });
  });

export type DeribitConsolidatedSnapshot = z.infer<
  typeof DeribitConsolidatedSnapshotSchema
>;
