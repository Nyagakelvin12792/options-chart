import { describe, expect, it } from "vitest";

import {
  assertJevServerReady,
  getJevServerHealth,
  JevConfigurationError,
  readJevServerConfig,
} from "./config";

describe("Jev server configuration", () => {
  it("defaults to disabled with the kill switch active", () => {
    const config = readJevServerConfig({}, "C:/test/options-chart/apps/web");
    const health = getJevServerHealth(config);
    expect(health.ready).toBe(false);
    expect(health.issues).toContain("JEV_SHADOW_DISABLED");
    expect(health.issues).toContain("JEV_KILL_SWITCH_ACTIVE");
    expect(health.issues).toContain("JEV_API_KEY_MISSING");
  });

  it("becomes ready only with explicit enablement, kill release, and a key", () => {
    const config = readJevServerConfig(
      {
        JEV_SHADOW_ENABLED: "true",
        JEV_KILL_SWITCH: "false",
        TYPESAFE_API_KEY: "server-secret",
      },
      "C:/test/options-chart/apps/web",
    );
    expect(assertJevServerReady(config)).toBe("server-secret");
    const serialized = JSON.stringify(getJevServerHealth(config));
    expect(serialized).not.toContain("server-secret");
  });

  it("refuses filesystem durability on Vercel", () => {
    const config = readJevServerConfig({ VERCEL: "1" });
    expect(getJevServerHealth(config).issues).toContain(
      "JEV_DURABLE_STORE_UNAVAILABLE",
    );
  });

  it("rejects malformed or contradictory request budgets", () => {
    expect(() => readJevServerConfig({ JEV_TIMEOUT_MS: "fast" })).toThrow(
      JevConfigurationError,
    );
    expect(() =>
      readJevServerConfig({
        JEV_MAX_CALLS_PER_HOUR: "20",
        JEV_MAX_CALLS_PER_DAY: "10",
      }),
    ).toThrow("must be at least");
  });
});
