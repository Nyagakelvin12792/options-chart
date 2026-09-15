import { describe, expect, it } from "vitest";

import {
  DEFAULT_VOLUME_PROFILE_SETTINGS,
  normalizeVolumeProfileSettings,
  parseVolumeProfileSettings,
  serializeVolumeProfileSettings,
} from "./volume-profile-settings";

describe("Volume Profile settings", () => {
  it("uses stable defaults when storage is empty or malformed", () => {
    expect(parseVolumeProfileSettings(null)).toEqual(
      DEFAULT_VOLUME_PROFILE_SETTINGS,
    );
    expect(parseVolumeProfileSettings("not-json")).toEqual(
      DEFAULT_VOLUME_PROFILE_SETTINGS,
    );
  });

  it("retains supported settings and clamps unsafe numeric values", () => {
    expect(
      normalizeVolumeProfileSettings({
        enabled: false,
        rowCount: 9_999,
        directionMode: "total",
        volumeUnit: "quote",
        valueAreaPercent: -5,
        placement: "left",
        widthPercent: 90,
        opacityPercent: 1,
        showLabels: false,
        showPOC: false,
        showVAH: false,
        showVAL: false,
        showValueAreaShading: false,
      }),
    ).toEqual({
      enabled: false,
      rowCount: 2_048,
      directionMode: "total",
      volumeUnit: "quote",
      valueAreaPercent: 1,
      placement: "left",
      widthPercent: 50,
      opacityPercent: 10,
      showLabels: false,
      showPOC: false,
      showVAH: false,
      showVAL: false,
      showValueAreaShading: false,
    });
  });

  it("round-trips a normalized settings record", () => {
    const settings = {
      ...DEFAULT_VOLUME_PROFILE_SETTINGS,
      rowCount: 96,
      widthPercent: 24,
      placement: "left" as const,
    };
    expect(parseVolumeProfileSettings(serializeVolumeProfileSettings(settings))).toEqual(
      settings,
    );
  });
});
