import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clampRewardRiskRatio,
  DEFAULT_POSITION_TOOL_SETTINGS,
  loadPositionToolSettings,
  MAX_REWARD_RISK_RATIO,
  MIN_REWARD_RISK_RATIO,
  POSITION_TOOL_SETTINGS_STORAGE_KEY,
  savePositionToolSettings,
} from "./position-tool-settings";

describe("Position tool settings", () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    const mockLocalStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
      length: 0,
      key: () => null,
    };
    (globalThis as unknown as { window?: unknown }).window = {
      localStorage: mockLocalStorage,
    };
  });

  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it("loads default settings when storage is empty", () => {
    expect(loadPositionToolSettings()).toEqual(DEFAULT_POSITION_TOOL_SETTINGS);
  });

  it("saves and loads valid settings", () => {
    savePositionToolSettings({ defaultRewardRiskRatio: 3.5 });
    expect(loadPositionToolSettings()).toEqual({
      defaultRewardRiskRatio: 3.5,
    });
  });

  it("clamps ratio to min and max bounds", () => {
    expect(clampRewardRiskRatio(0.1)).toBe(MIN_REWARD_RISK_RATIO);
    expect(clampRewardRiskRatio(25)).toBe(MAX_REWARD_RISK_RATIO);

    savePositionToolSettings({ defaultRewardRiskRatio: 0.1 });
    expect(loadPositionToolSettings().defaultRewardRiskRatio).toBe(
      MIN_REWARD_RISK_RATIO,
    );

    savePositionToolSettings({ defaultRewardRiskRatio: 30 });
    expect(loadPositionToolSettings().defaultRewardRiskRatio).toBe(
      MAX_REWARD_RISK_RATIO,
    );
  });

  it("falls back to default for NaN, Infinity, negative and zero values", () => {
    expect(clampRewardRiskRatio(Number.NaN)).toBe(
      DEFAULT_POSITION_TOOL_SETTINGS.defaultRewardRiskRatio,
    );
    expect(clampRewardRiskRatio(Number.POSITIVE_INFINITY)).toBe(
      DEFAULT_POSITION_TOOL_SETTINGS.defaultRewardRiskRatio,
    );
    expect(clampRewardRiskRatio(Number.NEGATIVE_INFINITY)).toBe(
      DEFAULT_POSITION_TOOL_SETTINGS.defaultRewardRiskRatio,
    );
    expect(clampRewardRiskRatio(-2)).toBe(
      DEFAULT_POSITION_TOOL_SETTINGS.defaultRewardRiskRatio,
    );
    expect(clampRewardRiskRatio(0)).toBe(
      DEFAULT_POSITION_TOOL_SETTINGS.defaultRewardRiskRatio,
    );
  });

  it("falls back to default on malformed JSON without throwing", () => {
    store[POSITION_TOOL_SETTINGS_STORAGE_KEY] = "{malformed-json";
    expect(() => loadPositionToolSettings()).not.toThrow();
    expect(loadPositionToolSettings()).toEqual(DEFAULT_POSITION_TOOL_SETTINGS);

    store[POSITION_TOOL_SETTINGS_STORAGE_KEY] = "null";
    expect(loadPositionToolSettings()).toEqual(DEFAULT_POSITION_TOOL_SETTINGS);

    store[POSITION_TOOL_SETTINGS_STORAGE_KEY] = JSON.stringify({
      defaultRewardRiskRatio: "bad",
    });
    expect(loadPositionToolSettings()).toEqual(DEFAULT_POSITION_TOOL_SETTINGS);
  });
});
