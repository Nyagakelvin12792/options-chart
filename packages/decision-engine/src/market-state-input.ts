import { z } from "zod";
import {
  DECISION_SYMBOL,
  DecisionModeSchema,
  StructureTimeframeSchema,
  TimeframeSchema,
  TradeSideSchema,
  ZoneKindSchema,
  ZoneStrengthSchema,
  AccountRiskStateSchema,
} from "./market-state-contracts";

const finite = z.number().refine(Number.isFinite, "must be finite");
const positiveFinite = finite.refine((v) => v > 0, "must be positive");
const timestampMs = z.number().int().nonnegative();
const nonEmpty = z.string().min(1);
const stamp = {
  asOfMs: timestampMs,
  staleAfterMs: z.number().int().positive(),
};

export const MarketStateIdentityInputSchema = z
  .strictObject({
    createdAtMs: timestampMs,
    effectiveAtMs: timestampMs,
    symbol: z.literal(DECISION_SYMBOL),
    activeTimeframe: TimeframeSchema,
    expiryScope: nonEmpty,
    mode: DecisionModeSchema,
    generationId: nonEmpty,
    replayCursorMs: timestampMs.nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "replay") {
      if (value.replayCursorMs === null) {
        ctx.addIssue({
          code: "custom",
          message: "replay mode requires replayCursorMs",
        });
      } else if (value.effectiveAtMs !== value.replayCursorMs) {
        ctx.addIssue({
          code: "custom",
          message: "replay effectiveAtMs must equal replayCursorMs",
        });
      }
    } else if (value.replayCursorMs !== null) {
      ctx.addIssue({
        code: "custom",
        message: "replayCursorMs is replay-only",
      });
    }
  });
export type MarketStateIdentityInput = z.infer<
  typeof MarketStateIdentityInputSchema
>;

/** Last candle evidence from the authoritative Binance BTCUSDT Spot source. */
export const CandleInputSchema = z.strictObject({
  ...stamp,
  sourceVersion: nonEmpty,
  lastPrice: positiveFinite,
  previousPrice: positiveFinite.nullable(),
});
export type CandleInput = z.infer<typeof CandleInputSchema>;

/**
 * Swing evidence for one structure timeframe. Swing-point detection is an
 * upstream calculation; this layer only classifies the supplied evidence.
 */
export const StructureTimeframeInputSchema = z.strictObject({
  ...stamp,
  timeframe: StructureTimeframeSchema,
  formulaVersion: nonEmpty,
  close: positiveFinite,
  lastSwingHigh: positiveFinite,
  prevSwingHigh: positiveFinite,
  lastSwingLow: positiveFinite,
  prevSwingLow: positiveFinite,
});
export type StructureTimeframeInput = z.infer<
  typeof StructureTimeframeInputSchema
>;

export const AvwapInputSchema = z.strictObject({
  ...stamp,
  formulaVersion: nonEmpty,
  anchorId: nonEmpty,
  value: positiveFinite,
});
export type AvwapInput = z.infer<typeof AvwapInputSchema>;

export const VolumeProfileInputSchema = z
  .strictObject({
    ...stamp,
    formulaVersion: nonEmpty,
    poc: positiveFinite,
    vah: positiveFinite,
    val: positiveFinite,
  })
  .refine((v) => v.val <= v.poc && v.poc <= v.vah, {
    message: "volume profile requires val <= poc <= vah",
  });
export type VolumeProfileInput = z.infer<typeof VolumeProfileInputSchema>;

export const ZoneInputSchema = z
  .strictObject({
    ...stamp,
    zoneId: nonEmpty,
    kind: ZoneKindSchema,
    price: positiveFinite,
    strength: ZoneStrengthSchema,
    formulaVersion: nonEmpty,
    source: z.enum([
      "binance-spot",
      "deribit",
      "cryptofeed-shadow",
      "user-drawing",
    ]),
  })
  .superRefine((zone, ctx) => {
    const expectedSource =
      zone.kind === "gamma-wall" ||
      zone.kind === "open-interest-wall" ||
      zone.kind === "volume-wall" ||
      zone.kind === "gamma-flip" ||
      zone.kind === "max-pain"
        ? "deribit"
        : zone.kind === "flow-wall"
          ? "cryptofeed-shadow"
          : zone.kind === "user"
            ? "user-drawing"
            : "binance-spot";

    if (zone.source !== expectedSource) {
      ctx.addIssue({
        code: "custom",
        path: ["source"],
        message: `${zone.kind} zones require ${expectedSource} provenance`,
      });
    }
  });
export type ZoneInput = z.infer<typeof ZoneInputSchema>;

export const OptionsInputSchema = z.strictObject({
  ...stamp,
  formulaVersion: nonEmpty,
  modeledSignedGexOnePercentUsd: finite.nullable(),
  gammaFlipPrice: positiveFinite.nullable(),
  atmIvCurrent: positiveFinite.nullable(),
  atmIvBaseline: positiveFinite.nullable(),
  nextExpiryMs: timestampMs.nullable(),
});
export type OptionsInput = z.infer<typeof OptionsInputSchema>;

export const FlowInputSchema = z.strictObject({
  staleAfterMs: z.number().int().positive(),
  /** Validated against the M11.3 `FlowFeatureSnapshotV1Schema` by the builder. */
  snapshot: z.unknown(),
});
export type FlowInput = z.infer<typeof FlowInputSchema>;

/**
 * Proposed trade geometry. `rewardRiskRatio` comes from the Risk Terminal; this
 * package never computes position size or risk amounts.
 */
export const ProposedTradeInputSchema = z.strictObject({
  ...stamp,
  side: TradeSideSchema,
  entryPrice: positiveFinite,
  stopPrice: positiveFinite,
  targetPrice: positiveFinite.nullable(),
  entrySource: nonEmpty,
  stopSource: nonEmpty,
  targetSource: nonEmpty.nullable(),
  rewardRiskRatio: positiveFinite.nullable(),
  rewardRiskFormulaVersion: nonEmpty,
});
export type ProposedTradeInput = z.infer<typeof ProposedTradeInputSchema>;

/** Risk Terminal verdict only; balances and limits never enter this package. */
export const AccountRiskInputSchema = z.strictObject({
  ...stamp,
  state: AccountRiskStateSchema.exclude(["unavailable"]),
  reasonCodes: z.array(nonEmpty),
});
export type AccountRiskInput = z.infer<typeof AccountRiskInputSchema>;

const MarketStructureInputSchema = z
  .strictObject({
    h4: StructureTimeframeInputSchema.nullable(),
    h1: StructureTimeframeInputSchema.nullable(),
    m15: StructureTimeframeInputSchema.nullable(),
  })
  .superRefine((structure, ctx) => {
    const slots = [
      ["h4", structure.h4, "4h"],
      ["h1", structure.h1, "1h"],
      ["m15", structure.m15, "15m"],
    ] as const;
    for (const [slot, value, expected] of slots) {
      if (value !== null && value.timeframe !== expected) {
        ctx.addIssue({
          code: "custom",
          path: [slot, "timeframe"],
          message: `${slot} requires timeframe ${expected}`,
        });
      }
    }
  });

export const MarketStateInputV1Schema = z.strictObject({
  identity: MarketStateIdentityInputSchema,
  candles: CandleInputSchema.nullable(),
  structure: MarketStructureInputSchema,
  avwap: AvwapInputSchema.nullable(),
  volumeProfile: VolumeProfileInputSchema.nullable(),
  zones: z.array(ZoneInputSchema),
  options: OptionsInputSchema.nullable(),
  flow: FlowInputSchema.nullable(),
  proposedTrade: ProposedTradeInputSchema.nullable(),
  accountRisk: AccountRiskInputSchema.nullable(),
});
export type MarketStateInputV1 = z.infer<typeof MarketStateInputV1Schema>;
