import { describe, expect, it } from "vitest";

import { BoundedPerformanceTelemetry } from "./telemetry";

describe("BoundedPerformanceTelemetry", () => {
  it("keeps only the newest samples within the configured capacity", () => {
    const telemetry = new BoundedPerformanceTelemetry(
      2,
      () => 0,
      () => 1_000,
    );

    telemetry.record("chart.live-update", 1);
    telemetry.record("chart.live-update", 2);
    telemetry.record("chart.live-update", 3);

    expect(telemetry.snapshot().samples["chart.live-update"]).toEqual([
      { metric: "chart.live-update", durationMs: 2, recordedAt: 1_000 },
      { metric: "chart.live-update", durationMs: 3, recordedAt: 1_000 },
    ]);
  });

  it("records measured operation duration", () => {
    const ticks = [10, 28];
    const telemetry = new BoundedPerformanceTelemetry(
      2,
      () => ticks.shift() ?? 28,
      () => 1_000,
    );

    const result = telemetry.measure("calculation.summary", () => "ok");

    expect(result).toBe("ok");
    expect(
      telemetry.snapshot().samples["calculation.summary"]?.[0]?.durationMs,
    ).toBe(18);
  });
});
