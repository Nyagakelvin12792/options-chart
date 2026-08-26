import type { Candle, CandleInterval } from "@options-chart/domain";

import type { BinanceRestClient } from "./client";
import { INTERVAL_MS } from "./constants";
import { parseBinanceKlines } from "./normalizers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RepairAction =
  | { readonly type: "update"; readonly candle: Candle }
  | { readonly type: "setData"; readonly candles: readonly Candle[] };

export interface ReconciliationResult {
  /** Number of gaps detected. */
  readonly gapsFound: number;
  /** Number of bars repaired. */
  readonly barsRepaired: number;
  /** The repair action the chart should take. */
  readonly action: RepairAction | null;
}

// ---------------------------------------------------------------------------
// CandleStore
// ---------------------------------------------------------------------------

/**
 * In-memory canonical candle buffer that supports:
 * - Ordered insert/update keyed by `openTime`.
 * - Out-of-order protection.
 * - Gap detection and REST-based reconciliation.
 */
export class CandleStore {
  private readonly candles = new Map<number, Candle>();
  private readonly interval: CandleInterval;
  private sortedCache: Candle[] | null = null;

  constructor(interval: CandleInterval) {
    this.interval = interval;
  }

  /** Number of candles in the store. */
  get size(): number {
    return this.candles.size;
  }

  /** All candles in ascending openTime order. */
  getSorted(): readonly Candle[] {
    if (this.sortedCache === null) {
      this.sortedCache = Array.from(this.candles.values()).sort(
        (a, b) => a.openTime - b.openTime,
      );
    }
    return this.sortedCache;
  }

  /** Last closed candle, or null if none exist. */
  getLastClosed(): Candle | null {
    const sorted = this.getSorted();
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i]!.isClosed) return sorted[i]!;
    }
    return null;
  }

  /** Newest candle in the store by openTime. */
  getLatest(): Candle | null {
    const sorted = this.getSorted();
    return sorted.length > 0 ? sorted[sorted.length - 1]! : null;
  }

  /**
   * Initialize the store from a bootstrap result.
   * Replaces all existing data.
   */
  setHistory(candles: readonly Candle[]): void {
    this.candles.clear();
    this.sortedCache = null;
    for (const candle of candles) {
      this.candles.set(candle.openTime, candle);
    }
  }

  /**
   * Apply a live WebSocket candle update.
   *
   * Rules (from PROJECT_PLAN §5.3):
   * 1. If openTime equals current candle openTime → update in place.
   * 2. If openTime is greater → new candle (previous is implicitly closed).
   * 3. Never create two bars with the same openTime.
   * 4. Reject out-of-order older candles silently.
   *
   * @returns `"update"` if an existing candle was modified, `"append"` if
   *          a new candle was added, or `null` if the candle was rejected.
   */
  applyLiveCandle(candle: Candle): "update" | "append" | null {
    const latest = this.getLatest();

    // No data yet — just insert.
    if (!latest) {
      this.candles.set(candle.openTime, candle);
      this.sortedCache = null;
      return "append";
    }

    if (candle.openTime === latest.openTime) {
      // Same candle — update in place.
      this.candles.set(candle.openTime, candle);
      this.sortedCache = null;
      return "update";
    }

    if (candle.openTime > latest.openTime) {
      // New candle — append.
      this.candles.set(candle.openTime, candle);
      this.sortedCache = null;
      return "append";
    }

    // Out-of-order older candle — reject without reconciliation.
    return null;
  }

  /**
   * Reconcile gaps by fetching missing candles from REST.
   *
   * Called after WebSocket reconnect, sleep/wake, or periodic health check.
   * Queries REST from `lastKnownClosedCandleTime` to now.
   *
   * @returns A `ReconciliationResult` describing what action the chart
   *          should take (`update` for single-bar fix, `setData` for
   *          multi-bar insertion).
   */
  async reconcile(
    client: BinanceRestClient,
    now: number = Date.now(),
  ): Promise<ReconciliationResult> {
    const lastClosed = this.getLastClosed();
    const intervalMs = INTERVAL_MS[this.interval];

    // If no data, nothing to reconcile against.
    if (!lastClosed) {
      return { gapsFound: 0, barsRepaired: 0, action: null };
    }

    // Fetch candles from just after the last closed candle to now.
    const startTime = lastClosed.openTime + intervalMs;
    if (startTime >= now) {
      return { gapsFound: 0, barsRepaired: 0, action: null };
    }

    let freshCandles: readonly Candle[];
    try {
      const payload = await client.fetchKlines({
        interval: this.interval,
        startTime,
        endTime: now,
        limit: 1_000,
      });
      freshCandles = parseBinanceKlines(payload, Date.now(), this.interval);
    } catch {
      // REST failed — cannot reconcile now.
      return { gapsFound: 0, barsRepaired: 0, action: null };
    }

    if (freshCandles.length === 0) {
      return { gapsFound: 0, barsRepaired: 0, action: null };
    }

    // Count gaps: candles in the REST response that we don't have.
    let gapsFound = 0;
    let barsRepaired = 0;
    let needsSetData = false;

    for (const candle of freshCandles) {
      const existing = this.candles.get(candle.openTime);
      if (!existing) {
        gapsFound++;
        barsRepaired++;
        this.candles.set(candle.openTime, candle);
        needsSetData = true; // Missing bar requires setData.
      } else if (existing.isClosed && candle.isClosed) {
        // Existing closed bar — check for mismatch and repair.
        if (
          existing.open !== candle.open ||
          existing.high !== candle.high ||
          existing.low !== candle.low ||
          existing.close !== candle.close ||
          existing.volume !== candle.volume
        ) {
          barsRepaired++;
          this.candles.set(candle.openTime, candle);
        }
      } else {
        // Update unclosed bar.
        this.candles.set(candle.openTime, candle);
      }
    }

    this.sortedCache = null;

    if (barsRepaired === 0) {
      return { gapsFound, barsRepaired, action: null };
    }

    // Determine chart action:
    // - If only the latest bar was updated → update().
    // - If missing older bars were inserted → setData().
    if (!needsSetData && barsRepaired === 1) {
      const latestRepaired = freshCandles[freshCandles.length - 1]!;
      const stored = this.candles.get(latestRepaired.openTime);
      if (stored) {
        return {
          gapsFound,
          barsRepaired,
          action: { type: "update", candle: stored },
        };
      }
    }

    return {
      gapsFound,
      barsRepaired,
      action: { type: "setData", candles: this.getSorted() },
    };
  }

  /** Reset the store for a new interval/timeframe. */
  clear(): void {
    this.candles.clear();
    this.sortedCache = null;
  }
}
