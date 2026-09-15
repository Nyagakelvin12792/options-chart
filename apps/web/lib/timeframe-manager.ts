import type { Candle, CandleInterval } from "@options-chart/domain";
import type { ChartVisibleRange } from "@options-chart/chart";
import {
  fetchInitialHistoryPage,
  streamOlderHistoryPages,
  type BinanceRestClient,
} from "@options-chart/market-data";

export interface TimeframeSwitchOptions {
  readonly interval: CandleInterval;
  readonly client: BinanceRestClient;
  readonly targetBars?: number;
  readonly onInitialReady: (
    candles: readonly Candle[],
    meta: { readonly fromCache: boolean; readonly interval: CandleInterval },
  ) => void;
  readonly onBackgroundProgress?: (
    candles: readonly Candle[],
    meta: {
      readonly totalCandles: number;
      readonly targetBars: number;
      readonly interval: CandleInterval;
    },
  ) => void;
  readonly onError?: (error: unknown, interval: CandleInterval) => void;
}

export class TimeframeManager {
  private currentGeneration = 0;
  private readonly candleCache = new Map<CandleInterval, readonly Candle[]>();
  private readonly viewportCache = new Map<CandleInterval, ChartVisibleRange>();

  getCachedCandles(interval: CandleInterval): readonly Candle[] | undefined {
    return this.candleCache.get(interval);
  }

  setCachedCandles(interval: CandleInterval, candles: readonly Candle[]): void {
    this.candleCache.set(interval, candles);
  }

  getCachedViewport(
    interval: CandleInterval,
  ): ChartVisibleRange | undefined {
    return this.viewportCache.get(interval);
  }

  setCachedViewport(
    interval: CandleInterval,
    range: ChartVisibleRange,
  ): void {
    this.viewportCache.set(interval, range);
  }

  clearCaches(): void {
    this.candleCache.clear();
    this.viewportCache.clear();
  }

  /**
   * Switches timeframe using fast staged loading:
   * 1. If cached candles exist, renders them immediately.
   * 2. Otherwise, fetches the first 1,000-bar page (~200ms) and notifies onInitialReady.
   * 3. Streams older history up to targetBars (10,000) in the background.
   * 4. Cancels prior in-flight timeframe requests when a newer switch occurs.
   */
  async switchTimeframe(options: TimeframeSwitchOptions): Promise<void> {
    const {
      interval,
      client,
      targetBars = 10_000,
      onInitialReady,
      onBackgroundProgress,
      onError,
    } = options;

    const generation = ++this.currentGeneration;
    const isCancelled = () => this.currentGeneration !== generation;

    // 1. Instant cache hit
    const cached = this.candleCache.get(interval);
    if (cached && cached.length > 0) {
      onInitialReady(cached, { fromCache: true, interval });
      return;
    }

    try {
      // 2. Fast initial page (up to 1,000 bars)
      const initial = await fetchInitialHistoryPage(client, {
        interval,
        limit: 1_000,
      });

      if (isCancelled()) return;

      const initialCandles = initial.candles;
      this.candleCache.set(interval, initialCandles);
      onInitialReady(initialCandles, { fromCache: false, interval });

      if (initial.reachedBeginning || initialCandles.length >= targetBars) {
        return;
      }

      const earliestOpenTime = initialCandles[0]?.openTime;
      if (!earliestOpenTime) return;

      // 3. Background stream older pages toward targetBars
      const existingCount = initialCandles.length;
      let accumulated = [...initialCandles];
      await streamOlderHistoryPages(client, {
        interval,
        beforeOpenTime: earliestOpenTime,
        targetBars,
        existingCount,
        isCancelled,
        onPage: (newerOldCandles) => {
          if (isCancelled()) return;
          // Merge deduplicated and sorted
          const merged = Array.from(
            new Map(
              [...newerOldCandles, ...accumulated].map((c) => [c.openTime, c]),
            ).values(),
          ).sort((a, b) => a.openTime - b.openTime);

          const trimmed =
            merged.length > targetBars ? merged.slice(-targetBars) : merged;

          accumulated = trimmed;
          this.candleCache.set(interval, accumulated);

          if (onBackgroundProgress) {
            onBackgroundProgress(accumulated, {
              totalCandles: accumulated.length,
              targetBars,
              interval,
            });
          }
        },
      });
    } catch (error) {
      if (!isCancelled() && onError) {
        onError(error, interval);
      }
    }
  }

  cancelActiveLoads(): void {
    this.currentGeneration += 1;
  }
}
