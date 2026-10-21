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
    const config = readJevServerConfig({
      VERCEL: "1",
      JEV_AUDIT_STORE: "filesystem",
    });
    expect(getJevServerHealth(config).issues).toContain(
      "JEV_DURABLE_STORE_UNAVAILABLE",
    );
  });

  it("accepts Postgres durability on Vercel without exposing its URL", () => {
    const config = readJevServerConfig({
      VERCEL: "1",
      JEV_AUDIT_STORE: "postgres",
      DATABASE_URL: "postgresql://secret.example/jev",
      JEV_SHADOW_ENABLED: "true",
      JEV_KILL_SWITCH: "false",
      TYPESAFE_API_KEY: "server-secret",
    });
    const health = getJevServerHealth(config);
    expect(health.ready).toBe(true);
    expect(health.persistence).toBe("postgres");
    expect(JSON.stringify(health)).not.toContain("secret.example");
  });

  it("fails closed when Postgres is selected without DATABASE_URL", () => {
    const config = readJevServerConfig({ JEV_AUDIT_STORE: "postgres" });
    expect(getJevServerHealth(config).issues).toContain(
      "JEV_DATABASE_URL_MISSING",
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
