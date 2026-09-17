export interface PositionToolSettings {
  readonly defaultRewardRiskRatio: number;
}

export const DEFAULT_POSITION_TOOL_SETTINGS: PositionToolSettings = {
  defaultRewardRiskRatio: 2.0,
};

export const MIN_REWARD_RISK_RATIO = 0.25;
export const MAX_REWARD_RISK_RATIO = 20.0;
export const POSITION_TOOL_SETTINGS_STORAGE_KEY =
  "options-chart:position-tool-settings:v1";

export const clampRewardRiskRatio = (ratio: number): number => {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return DEFAULT_POSITION_TOOL_SETTINGS.defaultRewardRiskRatio;
  }
  return Math.min(Math.max(ratio, MIN_REWARD_RISK_RATIO), MAX_REWARD_RISK_RATIO);
};

export const loadPositionToolSettings = (): PositionToolSettings => {
  if (typeof window === "undefined" || !window.localStorage) {
    return DEFAULT_POSITION_TOOL_SETTINGS;
  }
  try {
    const raw = window.localStorage.getItem(POSITION_TOOL_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_POSITION_TOOL_SETTINGS;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return DEFAULT_POSITION_TOOL_SETTINGS;
    }
    const ratio = Number(parsed.defaultRewardRiskRatio);
    return {
      defaultRewardRiskRatio: clampRewardRiskRatio(ratio),
    };
  } catch {
    return DEFAULT_POSITION_TOOL_SETTINGS;
  }
};

export const savePositionToolSettings = (settings: PositionToolSettings): void => {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const safeSettings: PositionToolSettings = {
      defaultRewardRiskRatio: clampRewardRiskRatio(settings.defaultRewardRiskRatio),
    };
    window.localStorage.setItem(
      POSITION_TOOL_SETTINGS_STORAGE_KEY,
      JSON.stringify(safeSettings),
    );
  } catch {
    // ignore storage errors
  }
};
