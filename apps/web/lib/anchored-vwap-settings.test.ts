import { describe, expect, it } from "vitest";

import {
  DEFAULT_ANCHORED_VWAP_SETTINGS,
  getEnabledBandMultipliers,
  normalizeAnchoredVwapSettings,
  parseAnchoredVwapSettings,
  resolveAnchoredVwapAnchor,
} from "./anchored-vwap-settings";

describe("Anchored VWAP settings", () => {
  it("uses safe defaults for invalid stored data", () => {
    expect(parseAnchoredVwapSettings("not json")).toEqual(
      DEFAULT_ANCHORED_VWAP_SETTINGS,
    );
    expect(normalizeAnchoredVwapSettings({ lineWidth: 99 }).lineWidth).toBe(4);
  });

  it("resolves UTC session, week, month, and manual anchors", () => {
    const timestamp = Date.UTC(2026, 8, 15, 13, 45);
    expect(
      resolveAnchoredVwapAnchor(DEFAULT_ANCHORED_VWAP_SETTINGS, timestamp),
    ).toBe(Date.UTC(2026, 8, 15));
    expect(
      resolveAnchoredVwapAnchor(
        { ...DEFAULT_ANCHORED_VWAP_SETTINGS, anchorMode: "week" },
        timestamp,
      ),
    ).toBe(Date.UTC(2026, 8, 14));
    expect(
      resolveAnchoredVwapAnchor(
        { ...DEFAULT_ANCHORED_VWAP_SETTINGS, anchorMode: "month" },
        timestamp,
      ),
    ).toBe(Date.UTC(2026, 8, 1));
    expect(
      resolveAnchoredVwapAnchor(
        {
          ...DEFAULT_ANCHORED_VWAP_SETTINGS,
          anchorMode: "manual",
          manualTimestamp: 1234,
        },
        timestamp,
      ),
    ).toBe(1234);
  });

  it("returns only enabled standard-deviation bands", () => {
    expect(getEnabledBandMultipliers(DEFAULT_ANCHORED_VWAP_SETTINGS)).toEqual([
      1, 2,
    ]);
  });
});
