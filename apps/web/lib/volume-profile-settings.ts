import type {
  VolumeProfileDirectionMode,
  VolumeProfilePlacement,
  VolumeProfileVolumeUnit,
} from "@options-chart/chart";

export const VOLUME_PROFILE_SETTINGS_STORAGE_KEY =
  "options-chart.volume-profile-settings.v1";

export interface VolumeProfileSettings {
  readonly enabled: boolean;
  readonly rowCount: number;
  readonly directionMode: VolumeProfileDirectionMode;
  readonly volumeUnit: VolumeProfileVolumeUnit;
  readonly valueAreaPercent: number;
  readonly placement: VolumeProfilePlacement;
  readonly widthPercent: number;
  readonly opacityPercent: number;
  readonly showLabels: boolean;
  readonly showPOC: boolean;
  readonly showVAH: boolean;
  readonly showVAL: boolean;
  readonly showValueAreaShading: boolean;
}

export const DEFAULT_VOLUME_PROFILE_SETTINGS: VolumeProfileSettings = {
  enabled: true,
  rowCount: 70,
  directionMode: "candle-direction",
  volumeUnit: "base",
  valueAreaPercent: 70,
  placement: "right",
  widthPercent: 16,
  opacityPercent: 70,
  showLabels: true,
  showPOC: true,
  showVAH: true,
  showVAL: true,
  showValueAreaShading: true,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const finiteNumber = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
};

const booleanValue = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

export const normalizeVolumeProfileSettings = (
  value: unknown,
): VolumeProfileSettings => {
  const source = isRecord(value) ? value : {};
  return {
    enabled: booleanValue(source.enabled, DEFAULT_VOLUME_PROFILE_SETTINGS.enabled),
    rowCount: Math.round(
      finiteNumber(
        source.rowCount,
        DEFAULT_VOLUME_PROFILE_SETTINGS.rowCount,
        1,
        2_048,
      ),
    ),
    directionMode:
      source.directionMode === "total" ||
      source.directionMode === "candle-direction"
        ? source.directionMode
        : DEFAULT_VOLUME_PROFILE_SETTINGS.directionMode,
    volumeUnit:
      source.volumeUnit === "base" || source.volumeUnit === "quote"
        ? source.volumeUnit
        : DEFAULT_VOLUME_PROFILE_SETTINGS.volumeUnit,
    valueAreaPercent: finiteNumber(
      source.valueAreaPercent,
      DEFAULT_VOLUME_PROFILE_SETTINGS.valueAreaPercent,
      1,
      100,
    ),
    placement:
      source.placement === "left" || source.placement === "right"
        ? source.placement
        : DEFAULT_VOLUME_PROFILE_SETTINGS.placement,
    widthPercent: finiteNumber(
      source.widthPercent,
      DEFAULT_VOLUME_PROFILE_SETTINGS.widthPercent,
      5,
      50,
    ),
    opacityPercent: finiteNumber(
      source.opacityPercent,
      DEFAULT_VOLUME_PROFILE_SETTINGS.opacityPercent,
      10,
      100,
    ),
    showLabels: booleanValue(
      source.showLabels,
      DEFAULT_VOLUME_PROFILE_SETTINGS.showLabels,
    ),
    showPOC: booleanValue(
      source.showPOC,
      DEFAULT_VOLUME_PROFILE_SETTINGS.showPOC,
    ),
    showVAH: booleanValue(
      source.showVAH,
      DEFAULT_VOLUME_PROFILE_SETTINGS.showVAH,
    ),
    showVAL: booleanValue(
      source.showVAL,
      DEFAULT_VOLUME_PROFILE_SETTINGS.showVAL,
    ),
    showValueAreaShading: booleanValue(
      source.showValueAreaShading,
      DEFAULT_VOLUME_PROFILE_SETTINGS.showValueAreaShading,
    ),
  };
};

export const parseVolumeProfileSettings = (
  serialized: string | null,
): VolumeProfileSettings => {
  if (!serialized) return DEFAULT_VOLUME_PROFILE_SETTINGS;
  try {
    return normalizeVolumeProfileSettings(JSON.parse(serialized));
  } catch {
    return DEFAULT_VOLUME_PROFILE_SETTINGS;
  }
};

export const serializeVolumeProfileSettings = (
  settings: VolumeProfileSettings,
): string => JSON.stringify(normalizeVolumeProfileSettings(settings));
