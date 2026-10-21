import type {
  AnchoredVwapResult,
  ChartDrawing,
  VolumeProfileResult,
} from "@options-chart/chart";
import type { Candle, CandleInterval } from "@options-chart/domain";
import {
  buildDecisionContext,
  buildMarketState,
  evaluateDecisionRules,
  type DecisionAssessmentV1,
  type DecisionContextV1,
  type MarketStateInputV1,
  type MarketStateV1,
  type StructureTimeframe,
  type StructureTimeframeInput,
  type ZoneInput,
} from "@options-chart/decision-engine";
import type { OptionsCalculationResult } from "@options-chart/options-engine";

import type { RiskTerminalSnapshot } from "@/components/risk-terminal";
import type { WallConfluenceZoneV2 } from "@/lib/wall-confluence";

export const DASHBOARD_DECISION_ADAPTER_VERSION =
  "dashboard-decision-adapter-v1" as const;
export const CONFIRMED_PIVOT_FORMULA_VERSION =
  "confirmed-pivot-radius-2-v1" as const;

const STRUCTURE_STALE_AFTER_MS: Readonly<Record<StructureTimeframe, number>> = {
  "15m": 45 * 60_000,
  "1h": 3 * 60 * 60_000,
  "4h": 12 * 60 * 60_000,
};

const isPivotHigh = (
  candles: readonly Candle[],
  index: number,
  radius: number,
): boolean => {
  const current = candles[index];
  if (!current) return false;
  for (let offset = 1; offset <= radius; offset += 1) {
    if (
      current.high <= candles[index - offset]!.high ||
      current.high < candles[index + offset]!.high
    ) {
      return false;
    }
  }
  return true;
};

const isPivotLow = (
  candles: readonly Candle[],
  index: number,
  radius: number,
): boolean => {
  const current = candles[index];
  if (!current) return false;
  for (let offset = 1; offset <= radius; offset += 1) {
    if (
      current.low >= candles[index - offset]!.low ||
      current.low > candles[index + offset]!.low
    ) {
      return false;
    }
  }
  return true;
};

/** Uses only closed candles and confirms a pivot with two candles on each side. */
export function buildStructureTimeframeInput(
  rawCandles: readonly Candle[],
  timeframe: StructureTimeframe,
): StructureTimeframeInput | null {
  const radius = 2;
  const candles = rawCandles.filter(
    (candle) => candle.interval === timeframe && candle.isClosed,
  );
  if (candles.length < radius * 2 + 3) return null;

  const highs: number[] = [];
  const lows: number[] = [];
  for (let index = radius; index < candles.length - radius; index += 1) {
    const candle = candles[index]!;
    if (isPivotHigh(candles, index, radius)) highs.push(candle.high);
    if (isPivotLow(candles, index, radius)) lows.push(candle.low);
  }
  if (highs.length < 2 || lows.length < 2) return null;

  const latest = candles.at(-1)!;
  return {
    timeframe,
    formulaVersion: CONFIRMED_PIVOT_FORMULA_VERSION,
    asOfMs: latest.closeTime,
    staleAfterMs: STRUCTURE_STALE_AFTER_MS[timeframe],
    close: latest.close,
    lastSwingHigh: highs.at(-1)!,
    prevSwingHigh: highs.at(-2)!,
    lastSwingLow: lows.at(-1)!,
    prevSwingLow: lows.at(-2)!,
  };
}

function zoneStrength(
  strength: WallConfluenceZoneV2["strength"],
): ZoneInput["strength"] {
  if (strength === "VERY STRONG" || strength === "STRONG") return "strong";
  if (strength === "MODERATE") return "moderate";
  return "weak";
}

function buildZones(
  confluenceZones: readonly WallConfluenceZoneV2[],
  drawings: readonly ChartDrawing[],
  effectiveAtMs: number,
  marketAsOfMs: number | null,
): ZoneInput[] {
  const kindMap = {
    gamma: "gamma-wall",
    "open-interest": "open-interest-wall",
    volume: "volume-wall",
    "max-pain": "max-pain",
    "gamma-flip": "gamma-flip",
  } as const;
  const marketZones = confluenceZones.flatMap((zone): ZoneInput[] => {
    if (marketAsOfMs === null) return [];
    const signal = zone.signals.find((item) => item.kind !== "dealer-flow");
    if (!signal || signal.kind === "dealer-flow") return [];
    return [
      {
        zoneId: zone.id,
        kind: kindMap[signal.kind],
        price: zone.centerPrice,
        strength: zoneStrength(zone.strength),
        formulaVersion: DASHBOARD_DECISION_ADAPTER_VERSION,
        source: "deribit",
        asOfMs: Math.min(effectiveAtMs, marketAsOfMs),
        staleAfterMs: 90_000,
      },
    ];
  });
  const userZones = drawings.flatMap((drawing): ZoneInput[] =>
    drawing.type === "horizontal-line"
      ? [
          {
            zoneId: drawing.id,
            kind: "user",
            price: drawing.price,
            strength: "moderate",
            formulaVersion: "user-horizontal-line-v1",
            source: "user-drawing",
            asOfMs: Math.min(effectiveAtMs, drawing.createdAt),
            staleAfterMs: 365 * 24 * 60 * 60_000,
          },
        ]
      : [],
  );
  return [...marketZones, ...userZones];
}

export interface DashboardDecisionInput {
  readonly nowMs: number;
  readonly activeTimeframe: CandleInterval;
  readonly expiryScope: string;
  readonly mode: "live-shadow" | "replay";
  readonly replayCursorMs: number | null;
  readonly generationId: string;
  readonly activeCandles: readonly Candle[];
  readonly structureCandles: Readonly<
    Partial<Record<StructureTimeframe, readonly Candle[]>>
  >;
  readonly anchoredVwap: AnchoredVwapResult | null;
  readonly volumeProfile: VolumeProfileResult | null;
  readonly confluenceZones: readonly WallConfluenceZoneV2[];
  readonly drawings: readonly ChartDrawing[];
  readonly optionsResult: OptionsCalculationResult | null;
  readonly atmIvCurrent: number | null;
  readonly nextExpiryMs: number | null;
  readonly risk: RiskTerminalSnapshot | null;
}

export interface DashboardDecisionSnapshot {
  readonly state: MarketStateV1;
  readonly context: DecisionContextV1;
  readonly baseline: DecisionAssessmentV1;
}

export function buildDashboardDecisionSnapshot(
  input: DashboardDecisionInput,
): DashboardDecisionSnapshot {
  const latest = input.activeCandles.at(-1) ?? null;
  const previous = input.activeCandles.at(-2) ?? null;
  const avwapPoint = input.anchoredVwap?.latestPoint ?? null;
  const profile = input.volumeProfile;
  const optionsAsOf =
    input.optionsResult?.summary.metadata.calculatedAt ?? null;

  const marketInput: MarketStateInputV1 = {
    identity: {
      createdAtMs: input.nowMs,
      effectiveAtMs: input.nowMs,
      symbol: "BTCUSDT",
      activeTimeframe: input.activeTimeframe,
      expiryScope: input.expiryScope,
      mode: input.mode,
      generationId: input.generationId,
      replayCursorMs: input.replayCursorMs,
    },
    candles:
      latest === null
        ? null
        : {
            asOfMs: Math.min(input.nowMs, latest.closeTime),
            staleAfterMs: Math.max(
              90_000,
              latest.closeTime - latest.openTime + 60_000,
            ),
            sourceVersion: "binance-spot-candle-v1",
            lastPrice: latest.close,
            previousPrice: previous?.close ?? null,
          },
    structure: {
      h4: buildStructureTimeframeInput(
        input.structureCandles["4h"] ?? [],
        "4h",
      ),
      h1: buildStructureTimeframeInput(
        input.structureCandles["1h"] ?? [],
        "1h",
      ),
      m15: buildStructureTimeframeInput(
        input.structureCandles["15m"] ?? [],
        "15m",
      ),
    },
    avwap:
      avwapPoint === null
        ? null
        : {
            asOfMs: avwapPoint.timestamp,
            staleAfterMs: 24 * 60 * 60_000,
            formulaVersion: "anchored-vwap-v1",
            anchorId: String(input.anchoredVwap!.anchorTimestamp),
            value: avwapPoint.vwap,
          },
    volumeProfile:
      profile?.pocPrice == null || profile.vah == null || profile.val == null
        ? null
        : {
            asOfMs: Math.min(
              input.nowMs,
              profile.qualityMetadata.coverageEnd ?? input.nowMs,
            ),
            staleAfterMs: 24 * 60 * 60_000,
            formulaVersion: profile.version,
            poc: profile.pocPrice,
            vah: profile.vah,
            val: profile.val,
          },
    zones: buildZones(
      input.confluenceZones,
      input.drawings,
      input.nowMs,
      optionsAsOf,
    ),
    options:
      input.optionsResult === null || optionsAsOf === null
        ? null
        : {
            asOfMs: optionsAsOf,
            staleAfterMs: 90_000,
            formulaVersion:
              input.optionsResult.summary.metadata.calculationEngineVersion,
            modeledSignedGexOnePercentUsd:
              input.optionsResult.summary.modeledGexOnePercentUsd,
            gammaFlipPrice: input.optionsResult.gammaFlipPrice,
            atmIvCurrent: input.atmIvCurrent,
            // A historical IV baseline is not yet available; do not fabricate one.
            atmIvBaseline: null,
            nextExpiryMs: input.nextExpiryMs,
          },
    flow: null,
    proposedTrade: input.risk?.proposedTrade ?? null,
    accountRisk: input.risk
      ? {
          asOfMs: Math.min(input.nowMs, input.risk.asOfMs),
          staleAfterMs: 60_000,
          state: input.risk.state,
          reasonCodes: [...input.risk.reasonCodes],
        }
      : null,
  };

  const state = buildMarketState(marketInput);
  const context = buildDecisionContext(state);
  return { state, context, baseline: evaluateDecisionRules(context) };
}
