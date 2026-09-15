import type { AnchoredVwapPriceSource } from "@options-chart/chart";

export const ANCHORED_VWAP_SETTINGS_STORAGE_KEY =
  "options-chart.anchored-vwap-settings.v1";

export type AnchoredVwapAnchorMode = "session" | "week" | "month" | "manual";

export interface AnchoredVwapSettings {
  readonly enabled: boolean;
  readonly anchorMode: AnchoredVwapAnchorMode;
  readonly manualTimestamp: number | null;
  readonly priceSource: AnchoredVwapPriceSource;
  readonly band1Multiplier: number;
  readonly band2Multiplier: number;
  readonly band3Multiplier: number;
  readonly showBand1: boolean;
  readonly showBand2: boolean;
  readonly showBand3: boolean;
  readonly showFill: boolean;
  readonly showAnchorLine: boolean;
  readonly showLabel: boolean;
  readonly lineWidth: number;
  readonly vwapColor: string;
  readonly bandColor: string;
  readonly fillOpacityPercent: number;
}

export const DEFAULT_ANCHORED_VWAP_SETTINGS: AnchoredVwapSettings = {
  enabled: false,
  anchorMode: "session",
  manualTimestamp: null,
  priceSource: "typical",
  band1Multiplier: 1,
  band2Multiplier: 2,
  band3Multiplier: 3,
  showBand1: true,
  showBand2: true,
  showBand3: false,
  showFill: true,
  showAnchorLine: true,
  showLabel: true,
  lineWidth: 2,
  vwapColor: "#22d3ee",
  bandColor: "#f2c14e",
  fillOpacityPercent: 8,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const finiteNumber = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;

const booleanValue = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const colorValue = (value: unknown, fallback: string): string =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;

export const normalizeAnchoredVwapSettings = (
  value: unknown,
): AnchoredVwapSettings => {
  const source = isRecord(value) ? value : {};
  const anchorMode = ["session", "week", "month", "manual"].includes(
    String(source.anchorMode),
  )
    ? (source.anchorMode as AnchoredVwapAnchorMode)
    : DEFAULT_ANCHORED_VWAP_SETTINGS.anchorMode;
  const priceSources: readonly AnchoredVwapPriceSource[] = [
    "typical",
    "close",
    "hl2",
    "ohlc4",
    "weighted",
  ];

  return {
    enabled: booleanValue(
      source.enabled,
      DEFAULT_ANCHORED_VWAP_SETTINGS.enabled,
    ),
    anchorMode,
    manualTimestamp:
      typeof source.manualTimestamp === "number" &&
      Number.isFinite(source.manualTimestamp) &&
      source.manualTimestamp > 0
        ? source.manualTimestamp
        : null,
    priceSource: priceSources.includes(
      source.priceSource as AnchoredVwapPriceSource,
    )
      ? (source.priceSource as AnchoredVwapPriceSource)
      : DEFAULT_ANCHORED_VWAP_SETTINGS.priceSource,
    band1Multiplier: finiteNumber(source.band1Multiplier, 1, 0.1, 10),
    band2Multiplier: finiteNumber(source.band2Multiplier, 2, 0.1, 10),
    band3Multiplier: finiteNumber(source.band3Multiplier, 3, 0.1, 10),
    showBand1: booleanValue(source.showBand1, true),
    showBand2: booleanValue(source.showBand2, true),
    showBand3: booleanValue(source.showBand3, false),
    showFill: booleanValue(source.showFill, true),
    showAnchorLine: booleanValue(source.showAnchorLine, true),
    showLabel: booleanValue(source.showLabel, true),
    lineWidth: Math.round(finiteNumber(source.lineWidth, 2, 1, 4)),
    vwapColor: colorValue(source.vwapColor, "#22d3ee"),
    bandColor: colorValue(source.bandColor, "#f2c14e"),
    fillOpacityPercent: finiteNumber(source.fillOpacityPercent, 8, 0, 30),
  };
};

export const parseAnchoredVwapSettings = (
  serialized: string | null,
): AnchoredVwapSettings => {
  if (!serialized) return DEFAULT_ANCHORED_VWAP_SETTINGS;
  try {
    return normalizeAnchoredVwapSettings(JSON.parse(serialized));
  } catch {
    return DEFAULT_ANCHORED_VWAP_SETTINGS;
  }
};

export const serializeAnchoredVwapSettings = (
  settings: AnchoredVwapSettings,
): string => JSON.stringify(normalizeAnchoredVwapSettings(settings));

export const resolveAnchoredVwapAnchor = (
  settings: AnchoredVwapSettings,
  latestTimestamp: number,
): number | null => {
  if (!Number.isFinite(latestTimestamp) || latestTimestamp <= 0) return null;
  if (settings.anchorMode === "manual") return settings.manualTimestamp;

  const date = new Date(latestTimestamp);
  if (settings.anchorMode === "month") {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  }
  if (settings.anchorMode === "week") {
    const day = date.getUTCDay() || 7;
    return (
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) -
      (day - 1) * 86_400_000
    );
  }
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

export const getEnabledBandMultipliers = (
  settings: AnchoredVwapSettings,
): readonly number[] =>
  [
    settings.showBand1 ? settings.band1Multiplier : null,
    settings.showBand2 ? settings.band2Multiplier : null,
    settings.showBand3 ? settings.band3Multiplier : null,
  ].filter((value): value is number => value !== null);
