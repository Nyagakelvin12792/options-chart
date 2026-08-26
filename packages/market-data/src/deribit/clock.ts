import { StaleDataError } from "@options-chart/shared";

import {
  DERIBIT_CLOCK_DEGRADED_OFFSET_MS,
  DERIBIT_CLOCK_REJECT_OFFSET_MS,
  DERIBIT_CLOCK_SYNC_SAMPLES,
} from "./constants";
import type { DeribitClockSyncResult } from "./types";

export interface DeribitTimeClient {
  getTime(): Promise<number>;
}

export const syncDeribitClock = async (
  client: DeribitTimeClient,
  sampleCount = DERIBIT_CLOCK_SYNC_SAMPLES,
  now: () => number = Date.now,
): Promise<DeribitClockSyncResult> => {
  if (!Number.isInteger(sampleCount) || sampleCount <= 0) {
    throw new RangeError(
      "Deribit clock sample count must be a positive integer",
    );
  }

  const samples: Array<{ offsetMs: number; rttMs: number }> = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const requestStart = now();
    const serverTime = await client.getTime();
    const responseEnd = now();
    const rttMs = Math.max(0, responseEnd - requestStart);
    const midpoint = requestStart + rttMs / 2;
    samples.push({ offsetMs: serverTime - midpoint, rttMs });
  }

  const selected = samples.reduce((best, sample) =>
    sample.rttMs < best.rttMs ? sample : best,
  );
  if (Math.abs(selected.offsetMs) > DERIBIT_CLOCK_REJECT_OFFSET_MS) {
    throw new StaleDataError(
      "Deribit clock offset exceeds the accepted limit",
      {
        source: "deribit",
        operation: "clock-sync",
        timestamp: now(),
        retryable: true,
        context: {
          offsetMs: selected.offsetMs,
          rttMs: selected.rttMs,
          sampleCount,
        },
      },
    );
  }

  return {
    offsetMs: selected.offsetMs,
    bestRttMs: selected.rttMs,
    sampleCount,
    syncedAt: now(),
    state:
      Math.abs(selected.offsetMs) > DERIBIT_CLOCK_DEGRADED_OFFSET_MS
        ? "DEGRADED"
        : "LIVE",
  };
};
