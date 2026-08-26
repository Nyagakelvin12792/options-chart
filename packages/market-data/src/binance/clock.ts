import { CLOCK_SYNC_SAMPLES } from "./constants";
import type { BinanceRestClient } from "./client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClockSyncResult {
  /** Estimated local-to-server offset in ms (add to `Date.now()` to get server time). */
  readonly offsetMs: number;
  /** Round-trip time of the best sample in ms. */
  readonly bestRttMs: number;
  /** Timestamp when sync was performed. */
  readonly syncedAt: number;
  /** Number of samples taken. */
  readonly sampleCount: number;
}

interface TimeSample {
  readonly rtt: number;
  readonly offset: number;
}

// ---------------------------------------------------------------------------
// Clock synchronization
// ---------------------------------------------------------------------------

/**
 * 5-sample minimum-RTT Binance clock synchronization.
 *
 * Takes {@link CLOCK_SYNC_SAMPLES} consecutive server-time readings,
 * selects the sample with the lowest round-trip time, and uses its
 * offset as the authoritative local↔server clock skew estimate.
 *
 * The lowest-RTT sample minimises the uncertainty window, producing the
 * most accurate offset estimate without requiring NTP-style algorithms.
 */
export async function syncBinanceClock(
  client: BinanceRestClient,
  sampleCount: number = CLOCK_SYNC_SAMPLES,
): Promise<ClockSyncResult> {
  const samples: TimeSample[] = [];

  for (let i = 0; i < sampleCount; i++) {
    const t0 = Date.now();
    const { serverTime } = await client.fetchServerTime();
    const t1 = Date.now();
    const rtt = t1 - t0;
    // Estimate: server time at the midpoint of the request
    const estimatedLocalMidpoint = t0 + rtt / 2;
    const offset = serverTime - estimatedLocalMidpoint;
    samples.push({ rtt, offset });
  }

  // Select the sample with the lowest RTT
  let best = samples[0]!;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i]!.rtt < best.rtt) {
      best = samples[i]!;
    }
  }

  return {
    offsetMs: best.offset,
    bestRttMs: best.rtt,
    syncedAt: Date.now(),
    sampleCount: samples.length,
  };
}
