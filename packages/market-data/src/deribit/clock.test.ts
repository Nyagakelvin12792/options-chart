import { describe, expect, it } from "vitest";

import { StaleDataError } from "@options-chart/shared";

import { syncDeribitClock } from "./clock";

describe("syncDeribitClock", () => {
  it("selects the minimum-RTT sample from five exchanges", async () => {
    const localTimes = [100, 200, 300, 310, 400, 450, 500, 580, 600, 640, 700];
    let localIndex = 0;
    const serverTimes = [1_100, 1_305, 1_425, 1_540, 1_620];
    let serverIndex = 0;

    const result = await syncDeribitClock(
      { getTime: async () => serverTimes[serverIndex++]! },
      5,
      () => localTimes[localIndex++]!,
    );

    expect(result.bestRttMs).toBe(10);
    expect(result.offsetMs).toBe(1_000);
    expect(result.sampleCount).toBe(5);
    expect(result.state).toBe("LIVE");
  });

  it("marks accepted clock skew over five seconds as degraded", async () => {
    const times = [1_000, 1_010, 1_020];
    let index = 0;
    const result = await syncDeribitClock(
      { getTime: async () => 11_005 },
      1,
      () => times[index++]!,
    );
    expect(result.offsetMs).toBe(10_000);
    expect(result.state).toBe("DEGRADED");
  });

  it("rejects clock skew over sixty seconds", async () => {
    const times = [1_000, 1_010, 1_020];
    let index = 0;
    await expect(
      syncDeribitClock(
        { getTime: async () => 71_005 },
        1,
        () => times[index++]!,
      ),
    ).rejects.toBeInstanceOf(StaleDataError);
  });
});
