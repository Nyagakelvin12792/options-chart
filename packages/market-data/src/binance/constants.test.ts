import { describe, expect, it } from "vitest";
import {
  BACKOFF_MAX_MS,
  BACKOFF_MIN_MS,
  BINANCE_MAX_KLINES_PER_REQUEST,
  BINANCE_REST_ENDPOINTS,
  BINANCE_REST_FALLBACK,
  BINANCE_REST_PRIMARY,
  BINANCE_WS_ENDPOINTS,
  BINANCE_WS_FALLBACK,
  BINANCE_WS_PRIMARY,
  BOOTSTRAP_TARGET_BARS,
  CLOCK_SYNC_SAMPLES,
  HEALTHY_RESET_MS,
  INTERVAL_MS,
  MAX_RECONNECT_ATTEMPTS,
  PLANNED_RECONNECT_MS,
  REST_TIMEOUT_MS,
  STALE_THRESHOLD_MS,
} from "./constants";

describe("Binance constants", () => {
  it("exports primary and fallback REST endpoints", () => {
    expect(BINANCE_REST_PRIMARY).toBe("https://api.binance.com");
    expect(BINANCE_REST_FALLBACK).toBe("https://data-api.binance.vision");
    expect(BINANCE_REST_ENDPOINTS).toHaveLength(2);
    expect(BINANCE_REST_ENDPOINTS[0]).toBe(BINANCE_REST_PRIMARY);
    expect(BINANCE_REST_ENDPOINTS[1]).toBe(BINANCE_REST_FALLBACK);
  });

  it("exports primary and fallback WS endpoints", () => {
    expect(BINANCE_WS_PRIMARY).toBe("wss://stream.binance.com:9443/ws");
    expect(BINANCE_WS_FALLBACK).toBe(
      "wss://data-stream.binance.vision:9443/ws",
    );
    expect(BINANCE_WS_ENDPOINTS).toHaveLength(2);
  });

  it("defines correct interval millisecond durations", () => {
    expect(INTERVAL_MS["1m"]).toBe(60_000);
    expect(INTERVAL_MS["5m"]).toBe(300_000);
    expect(INTERVAL_MS["15m"]).toBe(900_000);
    expect(INTERVAL_MS["1h"]).toBe(3_600_000);
    expect(INTERVAL_MS["4h"]).toBe(14_400_000);
    expect(INTERVAL_MS["1d"]).toBe(86_400_000);
    expect(INTERVAL_MS["1w"]).toBe(604_800_000);
  });

  it("enforces Binance max 1,000 klines per request", () => {
    expect(BINANCE_MAX_KLINES_PER_REQUEST).toBe(1_000);
  });

  it("targets 2,000 bars for bootstrap", () => {
    expect(BOOTSTRAP_TARGET_BARS).toBe(2_000);
  });

  it("defines REST timeout", () => {
    expect(REST_TIMEOUT_MS).toBe(8_000);
  });

  it("uses 5 clock sync samples", () => {
    expect(CLOCK_SYNC_SAMPLES).toBe(5);
  });

  it("schedules planned reconnect before 24h limit", () => {
    expect(PLANNED_RECONNECT_MS).toBeLessThan(24 * 3_600_000);
    expect(PLANNED_RECONNECT_MS).toBe(23 * 3_600_000);
  });

  it("defines backoff parameters", () => {
    expect(BACKOFF_MIN_MS).toBe(1_000);
    expect(BACKOFF_MAX_MS).toBe(30_000);
  });

  it("sets stale threshold to 15 seconds", () => {
    expect(STALE_THRESHOLD_MS).toBe(15_000);
  });

  it("limits max reconnect attempts", () => {
    expect(MAX_RECONNECT_ATTEMPTS).toBe(10);
  });

  it("resets backoff after 60s healthy connection", () => {
    expect(HEALTHY_RESET_MS).toBe(60_000);
  });
});
