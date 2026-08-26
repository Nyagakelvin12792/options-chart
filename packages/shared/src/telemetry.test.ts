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

  it("records async operation duration through promise settlement", async () => {
    const ticks = [20, 47];
    const telemetry = new BoundedPerformanceTelemetry(
      2,
      () => ticks.shift() ?? 47,
      () => 1_000,
    );

    const result = await telemetry.measureAsync(
      "worker.round-trip",
      async () => "ok",
    );

    expect(result).toBe("ok");
    expect(
      telemetry.snapshot().samples["worker.round-trip"]?.[0]?.durationMs,
    ).toBe(27);
  });

  it("records async duration when the operation rejects", async () => {
    const ticks = [4, 19];
    const telemetry = new BoundedPerformanceTelemetry(
      2,
      () => ticks.shift() ?? 19,
      () => 1_000,
    );

    await expect(
      telemetry.measureAsync("validation.deribit-batch", async () => {
        throw new Error("invalid batch");
      }),
    ).rejects.toThrow("invalid batch");

    expect(
      telemetry.snapshot().samples["validation.deribit-batch"]?.[0]?.durationMs,
    ).toBe(15);
  });
});
