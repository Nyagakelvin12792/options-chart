import { z } from "zod";

export const MARKET_STATE_SCHEMA_VERSION = "market-state-v1" as const;
export const DECISION_SYMBOL = "BTCUSDT" as const;

const finite = z.number().refine(Number.isFinite, "must be finite");
const positiveFinite = finite.refine((v) => v > 0, "must be positive");
const timestampMs = z.number().int().nonnegative();
const nonEmpty = z.string().min(1);

export const TimeframeSchema = z.enum([
  "1m",
  "5m",
  "15m",
  "1h",
  "4h",
  "1d",
  "1w",
]);
export type Timeframe = z.infer<typeof TimeframeSchema>;

export const StructureTimeframeSchema = z.enum(["4h", "1h", "15m"]);
export type StructureTimeframe = z.infer<typeof StructureTimeframeSchema>;

export const DecisionModeSchema = z.enum(["live-shadow", "replay", "paper"]);
export type DecisionMode = z.infer<typeof DecisionModeSchema>;

export const SourceHealthStateSchema = z.enum(["live", "stale", "unavailable"]);
export type SourceHealthState = z.infer<typeof SourceHealthStateSchema>;

export const EvidenceSourceSchema = z.enum([
  "binance-spot",
  "deribit",
  "cryptofeed-shadow",
  "risk-terminal",
  "user-drawing",
  "deterministic-derived",
]);
export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;

/** Exact numeric evidence, kept separate from the semantic classification it supports. */
export const NumericEvidenceV1Schema = z.strictObject({
  evidenceId: nonEmpty,
  name: nonEmpty,
  value: finite,
  unit: nonEmpty,
  formulaVersion: nonEmpty,
  source: EvidenceSourceSchema,
  effectiveAtMs: timestampMs,
});
export type NumericEvidenceV1 = z.infer<typeof NumericEvidenceV1Schema>;

export const SourceHealthV1Schema = z.strictObject({
  state: SourceHealthStateSchema,
  asOfMs: timestampMs.nullable(),
  ageMs: timestampMs.nullable(),
  staleAfterMs: z.number().int().positive(),
});
export type SourceHealthV1 = z.infer<typeof SourceHealthV1Schema>;

const evidenceRefs = z.array(nonEmpty);

// ---------------------------------------------------------------- structure
export const StructureStateSchema = z.enum([
  "uptrend",
  "downtrend",
  "range",
  "transition",
  "unavailable",
]);
export type StructureState = z.infer<typeof StructureStateSchema>;

export const StructureAgreementSchema = z.enum([
  "aligned-up",
  "aligned-down",
  "conflicting",
  "mixed",
  "unavailable",
]);
export type StructureAgreement = z.infer<typeof StructureAgreementSchema>;

export const TimeframeStructureV1Schema = z.strictObject({
  timeframe: StructureTimeframeSchema,
  state: StructureStateSchema,
  invalidationPrice: positiveFinite.nullable(),
  evidenceRefs,
  health: SourceHealthV1Schema,
});
export type TimeframeStructureV1 = z.infer<typeof TimeframeStructureV1Schema>;

export const MarketStructureLayerV1Schema = z.strictObject({
  h4: TimeframeStructureV1Schema,
  h1: TimeframeStructureV1Schema,
  m15: TimeframeStructureV1Schema,
  agreement: StructureAgreementSchema,
  transitionTimeframes: z.array(StructureTimeframeSchema),
});
export type MarketStructureLayerV1 = z.infer<
  typeof MarketStructureLayerV1Schema
>;

// ----------------------------------------------------------------- location
export const AvwapStateSchema = z.enum(["above", "at", "below", "unavailable"]);
export type AvwapState = z.infer<typeof AvwapStateSchema>;

export const VolumeProfileStateSchema = z.enum([
  "above-value",
  "inside-value",
  "below-value",
  "unavailable",
]);
export type VolumeProfileState = z.infer<typeof VolumeProfileStateSchema>;

export const LevelStrengthSchema = z.enum([
  "none",
  "weak",
  "moderate",
  "strong",
  "unavailable",
]);
export type LevelStrength = z.infer<typeof LevelStrengthSchema>;

export const ZoneKindSchema = z.enum([
  "gamma-wall",
  "open-interest-wall",
  "volume-wall",
  "flow-wall",
  "gamma-flip",
  "max-pain",
  "avwap",
  "volume-profile-poc",
  "volume-profile-vah",
  "volume-profile-val",
  "user",
]);
export type ZoneKind = z.infer<typeof ZoneKindSchema>;

export const ZoneStrengthSchema = z.enum(["weak", "moderate", "strong"]);
export type ZoneStrength = z.infer<typeof ZoneStrengthSchema>;

export const LevelZoneV1Schema = z.strictObject({
  zoneId: nonEmpty,
  kind: ZoneKindSchema,
  price: positiveFinite,
  strength: ZoneStrengthSchema,
  distanceBps: finite.refine((v) => v >= 0, "must be non-negative"),
  formulaVersion: nonEmpty,
  evidenceRefs,
});
export type LevelZoneV1 = z.infer<typeof LevelZoneV1Schema>;

export const WallInteractionStateSchema = z.enum([
  "none",
  "approaching",
  "testing",
  "through",
  "unavailable",
]);
export type WallInteractionState = z.infer<typeof WallInteractionStateSchema>;

export const LocationLayerV1Schema = z.strictObject({
  referencePrice: positiveFinite.nullable(),
  avwap: z.strictObject({ state: AvwapStateSchema, evidenceRefs }),
  volumeProfile: z.strictObject({
    state: VolumeProfileStateSchema,
    evidenceRefs,
  }),
  strongestSupport: LevelZoneV1Schema.nullable(),
  strongestResistance: LevelZoneV1Schema.nullable(),
  supportStrength: LevelStrengthSchema,
  resistanceStrength: LevelStrengthSchema,
  wallInteraction: z.strictObject({
    state: WallInteractionStateSchema,
    wallZoneId: nonEmpty.nullable(),
    evidenceRefs,
  }),
  health: SourceHealthV1Schema,
});
export type LocationLayerV1 = z.infer<typeof LocationLayerV1Schema>;

// --------------------------------------------------------------- order flow
export const FlowPressureStateSchema = z.enum([
  "strong-sell",
  "sell",
  "balanced",
  "buy",
  "strong-buy",
  "unavailable",
]);
export type FlowPressureState = z.infer<typeof FlowPressureStateSchema>;

export const ImbalanceStateSchema = z.enum([
  "bid-heavy",
  "ask-heavy",
  "balanced",
  "unavailable",
]);
export type ImbalanceState = z.infer<typeof ImbalanceStateSchema>;

export const ResponseStateSchema = z.enum([
  "absorption-pending",
  "rejection",
  "acceptance",
  "unresolved",
  "none",
  "unavailable",
]);
export type ResponseState = z.infer<typeof ResponseStateSchema>;

export const ResponseDirectionSchema = z.enum(["bullish", "bearish"]);
export type ResponseDirection = z.infer<typeof ResponseDirectionSchema>;

const ratio01 = finite.refine((v) => v >= 0 && v <= 1, "must be within [0, 1]");

export const OrderFlowLayerV1Schema = z.strictObject({
  health: SourceHealthV1Schema,
  cvd: z.strictObject({ state: FlowPressureStateSchema, evidenceRefs }),
  aggressiveFlow: z.strictObject({
    state: FlowPressureStateSchema,
    evidenceRefs,
  }),
  imbalance: z.strictObject({ state: ImbalanceStateSchema, evidenceRefs }),
  response: z.strictObject({
    state: ResponseStateSchema,
    direction: ResponseDirectionSchema.nullable(),
    levelId: nonEmpty.nullable(),
    recordId: nonEmpty.nullable(),
    evidenceRefs,
  }),
  coverage: z.strictObject({
    tradeSideCoverageRatio: ratio01.nullable(),
    bookCoverageRatio: ratio01.nullable(),
  }),
  featureVersion: nonEmpty.nullable(),
});
export type OrderFlowLayerV1 = z.infer<typeof OrderFlowLayerV1Schema>;

// ------------------------------------------------------------ options regime
export const GammaStateSchema = z.enum([
  "positive",
  "negative",
  "transition",
  "unavailable",
]);
export type GammaState = z.infer<typeof GammaStateSchema>;

export const VolatilityStateSchema = z.enum([
  "contracting",
  "normal",
  "expanding",
  "unavailable",
]);
export type VolatilityState = z.infer<typeof VolatilityStateSchema>;

export const ExpiryPressureStateSchema = z.enum([
  "none",
  "building",
  "imminent",
  "unavailable",
]);
export type ExpiryPressureState = z.infer<typeof ExpiryPressureStateSchema>;

export const OptionsRegimeLayerV1Schema = z.strictObject({
  gamma: z.strictObject({ state: GammaStateSchema, evidenceRefs }),
  volatility: z.strictObject({ state: VolatilityStateSchema, evidenceRefs }),
  expiryPressure: z.strictObject({
    state: ExpiryPressureStateSchema,
    evidenceRefs,
  }),
  strongestZone: LevelZoneV1Schema.nullable(),
  health: SourceHealthV1Schema,
});
export type OptionsRegimeLayerV1 = z.infer<typeof OptionsRegimeLayerV1Schema>;

// ------------------------------------------------------------- trade quality
export const TradeSideSchema = z.enum(["long", "short"]);
export type TradeSide = z.infer<typeof TradeSideSchema>;

export const GeometryStateSchema = z.enum([
  "valid",
  "invalid",
  "unavailable",
  "none",
]);
export type GeometryState = z.infer<typeof GeometryStateSchema>;

export const RewardRiskBandSchema = z.enum([
  "below-minimum",
  "acceptable",
  "strong",
  "unavailable",
  "none",
]);
export type RewardRiskBand = z.infer<typeof RewardRiskBandSchema>;

export const AccountRiskStateSchema = z.enum([
  "available",
  "reduced",
  "prohibited",
  "unavailable",
]);
export type AccountRiskState = z.infer<typeof AccountRiskStateSchema>;

export const ContradictionV1Schema = z.strictObject({
  code: nonEmpty,
  layers: z.array(nonEmpty).min(2),
});
export type ContradictionV1 = z.infer<typeof ContradictionV1Schema>;

export const TradeQualityLayerV1Schema = z.strictObject({
  proposedSide: TradeSideSchema.nullable(),
  entrySource: nonEmpty.nullable(),
  stopSource: nonEmpty.nullable(),
  targetSource: nonEmpty.nullable(),
  geometry: GeometryStateSchema,
  geometryReasonCodes: z.array(nonEmpty),
  rewardRiskBand: RewardRiskBandSchema,
  accountRisk: z.strictObject({
    state: AccountRiskStateSchema,
    reasonCodes: z.array(nonEmpty),
  }),
  contradictionState: z.enum(["none", "present"]),
  contradictions: z.array(ContradictionV1Schema),
  prohibitionReasonCodes: z.array(nonEmpty),
  evidenceRefs,
});
export type TradeQualityLayerV1 = z.infer<typeof TradeQualityLayerV1Schema>;

// ------------------------------------------------------- identity & envelope
export const MarketStateIdentityV1Schema = z.strictObject({
  schemaVersion: z.literal(MARKET_STATE_SCHEMA_VERSION),
  stateId: nonEmpty,
  createdAtMs: timestampMs,
  effectiveAtMs: timestampMs,
  symbol: z.literal(DECISION_SYMBOL),
  activeTimeframe: TimeframeSchema,
  expiryScope: nonEmpty,
  mode: DecisionModeSchema,
  generationId: nonEmpty,
  replayCursorMs: timestampMs.nullable(),
});
export type MarketStateIdentityV1 = z.infer<typeof MarketStateIdentityV1Schema>;

export const MarketStateHealthV1Schema = z.strictObject({
  candles: SourceHealthV1Schema,
  options: SourceHealthV1Schema,
  flow: SourceHealthV1Schema,
  geometry: SourceHealthV1Schema,
  accountRisk: SourceHealthV1Schema,
  warnings: z.array(nonEmpty),
});
export type MarketStateHealthV1 = z.infer<typeof MarketStateHealthV1Schema>;

export const MarketStateEvidenceV1Schema = z.strictObject({
  sourceIds: z.array(nonEmpty),
  numericEvidence: z.array(NumericEvidenceV1Schema),
  formulaVersions: z.record(z.string(), nonEmpty),
  featureVersions: z.record(z.string(), nonEmpty),
  includedVenues: z.array(nonEmpty),
  excludedFutureEvidenceIds: z.array(nonEmpty),
  auditWarnings: z.array(nonEmpty),
});
export type MarketStateEvidenceV1 = z.infer<typeof MarketStateEvidenceV1Schema>;

export const MarketStateV1Schema = z.strictObject({
  identity: MarketStateIdentityV1Schema,
  health: MarketStateHealthV1Schema,
  marketStructure: MarketStructureLayerV1Schema,
  location: LocationLayerV1Schema,
  orderFlow: OrderFlowLayerV1Schema,
  optionsRegime: OptionsRegimeLayerV1Schema,
  tradeQuality: TradeQualityLayerV1Schema,
  evidence: MarketStateEvidenceV1Schema,
});
export type MarketStateV1 = z.infer<typeof MarketStateV1Schema>;
