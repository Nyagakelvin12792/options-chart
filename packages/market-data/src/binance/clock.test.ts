import { describe, expect, it, vi } from "vitest";
import { syncBinanceClock } from "./clock";
import type { BinanceRestClient } from "./client";

describe("syncBinanceClock", () => {
  it("selects the sample with the lowest RTT", async () => {
    // Simulate 5 server time responses with varying latencies.
    // We control Date.now() to produce predictable RTTs.
    const serverTime = 1700000000000;
    let dateNowCall = 0;
    const dateNowValues = [
      // Sample 1: t0=100, t1=200 → RTT=100, midpoint=150, offset=server-150
      100, 200,
      // Sample 2: t0=200, t1=210 → RTT=10, midpoint=205, offset=server-205 (best!)
      200, 210,
      // Sample 3: t0=300, t1=450 → RTT=150, midpoint=375, offset=server-375
      300, 450,
      // Sample 4: t0=500, t1=600 → RTT=100
      500, 600,
      // Sample 5: t0=700, t1=780 → RTT=80
      700, 780,
      // Final Date.now() call for syncedAt
      800,
    ];

    vi.spyOn(Date, "now").mockImplementation(() => {
      return dateNowValues[dateNowCall++] ?? 999;
    });

    const mockClient = {
      fetchServerTime: vi.fn(async () => ({ serverTime })),
    } as unknown as BinanceRestClient;

    const result = await syncBinanceClock(mockClient, 5);

    expect(result.sampleCount).toBe(5);
    expect(result.bestRttMs).toBe(10); // Sample 2 has lowest RTT
    // Sample 2: midpoint = 200 + 10/2 = 205, offset = serverTime - 205
    expect(result.offsetMs).toBe(serverTime - 205);
    expect(mockClient.fetchServerTime).toHaveBeenCalledTimes(5);

    vi.restoreAllMocks();
  });

  it("works with a single sample", async () => {
    const serverTime = 1700000000000;
    let dateNowCall = 0;
    vi.spyOn(Date, "now").mockImplementation(() => {
      return [100, 150, 200][dateNowCall++] ?? 999;
    });

    const mockClient = {
      fetchServerTime: vi.fn(async () => ({ serverTime })),
    } as unknown as BinanceRestClient;

    const result = await syncBinanceClock(mockClient, 1);

    expect(result.sampleCount).toBe(1);
    expect(result.bestRttMs).toBe(50);
    expect(result.offsetMs).toBe(serverTime - 125); // midpoint=100+25=125

    vi.restoreAllMocks();
  });
});
