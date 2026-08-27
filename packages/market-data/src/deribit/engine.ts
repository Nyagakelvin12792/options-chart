import type {
  FeedHealthState,
  MarketPrice,
  OptionsChainSnapshot,
} from "@options-chart/domain";

import type { DeribitBookSummaryPayload } from "./api-schemas";
import { DeribitInstrumentCatalog } from "./catalog";
import type { DeribitInstrumentClient } from "./catalog";
import type { DeribitTimeClient } from "./clock";
import { syncDeribitClock } from "./clock";
import {
  DERIBIT_BOOK_SUMMARY_REFRESH_MS,
  DERIBIT_CATALOG_REFRESH_MS,
  DERIBIT_CLOCK_RESYNC_MS,
  DERIBIT_POLL_RECOVERY_DELAY_MS,
  deribitReconnectDelay,
} from "./constants";
import { DeribitPollHealth } from "./health";
import {
  buildDeribitOptionsSnapshot,
  normalizeDeribitRestIndex,
} from "./production-normalizers";
import { DeribitOptionsStore } from "./store";
import type {
  DeribitClockSyncResult,
  DeribitEngineSnapshot,
  DeribitMarkUpdate,
} from "./types";
import { DeribitWebSocketClient, type DeribitSocketFactory } from "./websocket";

export interface DeribitEngineRestClient
  extends DeribitInstrumentClient, DeribitTimeClient {
  getBookSummary(): Promise<readonly DeribitBookSummaryPayload[]>;
}

export interface VisibilityDocumentLike {
  readonly hidden: boolean;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

export type DeribitHealthFeed = "options" | "stream" | "clock";

export interface DeribitOptionsDataEngineOptions {
  readonly restClient: DeribitEngineRestClient;
  readonly socketFactory?: DeribitSocketFactory;
  readonly visibilityDocument?: VisibilityDocumentLike;
  readonly now?: () => number;
  readonly random?: () => number;
  readonly onSnapshot?: (snapshot: OptionsChainSnapshot) => void;
  readonly onIndexPrice?: (price: MarketPrice) => void;
  readonly onHealthChange?: (
    feed: DeribitHealthFeed,
    state: FeedHealthState,
    detail: string | null,
  ) => void;
  readonly onClockSync?: (clock: DeribitClockSyncResult) => void;
  readonly onResumeReconciled?: (snapshot: DeribitEngineSnapshot) => void;
  readonly onError?: (error: Error) => void;
}

export class DeribitOptionsDataEngine {
  private readonly restClient: DeribitEngineRestClient;
  private readonly visibilityDocument: VisibilityDocumentLike | undefined;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly onSnapshot: (snapshot: OptionsChainSnapshot) => void;
  private readonly onIndexPrice: (price: MarketPrice) => void;
  private readonly onHealthChange: (
    feed: DeribitHealthFeed,
    state: FeedHealthState,
    detail: string | null,
  ) => void;
  private readonly onClockSync: (clock: DeribitClockSyncResult) => void;
  private readonly onResumeReconciled: (
    snapshot: DeribitEngineSnapshot,
  ) => void;
  private readonly onError: (error: Error) => void;
  private readonly stream: DeribitWebSocketClient;
  private readonly catalog = new DeribitInstrumentCatalog();
  private readonly store = new DeribitOptionsStore();
  private readonly pollHealth = new DeribitPollHealth();

  private indexPrice: MarketPrice | null = null;
  private clock: DeribitClockSyncResult | null = null;
  private started = false;
  private catalogRefreshPromise: Promise<void> | null = null;
  private snapshotRefreshPromise: Promise<OptionsChainSnapshot | null> | null =
    null;
  private optionsTimer: ReturnType<typeof setInterval> | null = null;
  private catalogTimer: ReturnType<typeof setInterval> | null = null;
  private clockTimer: ReturnType<typeof setInterval> | null = null;
  private recoveryPollTimer: ReturnType<typeof setTimeout> | null = null;
  private clockRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private clockRetryAttempt = 0;
  private readonly visibilityListener = (): void => {
    if (this.visibilityDocument !== undefined) {
      void this.handleVisibilityChange(this.visibilityDocument.hidden);
    }
  };

  constructor(options: DeribitOptionsDataEngineOptions) {
    this.restClient = options.restClient;
    this.visibilityDocument = options.visibilityDocument;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.onSnapshot = options.onSnapshot ?? (() => undefined);
    this.onIndexPrice = options.onIndexPrice ?? (() => undefined);
    this.onHealthChange = options.onHealthChange ?? (() => undefined);
    this.onClockSync = options.onClockSync ?? (() => undefined);
    this.onResumeReconciled = options.onResumeReconciled ?? (() => undefined);
    this.onError = options.onError ?? (() => undefined);
    this.stream = new DeribitWebSocketClient({
      ...(options.socketFactory === undefined
        ? {}
        : { socketFactory: options.socketFactory }),
      now: this.now,
      random: this.random,
      onMarkUpdates: (updates) => this.handleMarkUpdates(updates),
      onIndexPrice: (price) => this.handleIndexPrice(price),
      onHealthChange: (state, detail) =>
        this.onHealthChange("stream", state, detail),
      onError: this.onError,
      onConnected: (reconnected) => {
        void this.reconcileAfterConnection(reconnected);
      },
    });
  }

  get snapshot(): DeribitEngineSnapshot {
    return {
      chain: this.store.snapshot,
      index: this.indexPrice,
      optionsState: this.pollHealth.state,
      streamState: this.stream.state,
      clock: this.clock,
    };
  }

  get instrumentCatalog(): DeribitInstrumentCatalog {
    return this.catalog;
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;
    this.visibilityDocument?.addEventListener(
      "visibilitychange",
      this.visibilityListener,
    );

    await this.synchronizeClock();
    try {
      await this.refreshCatalog();
      await this.refreshOptionsSnapshot();
    } catch (error) {
      this.reportError(error);
    }
    this.stream.connect();
    this.startTimers();
  }

  stop(): void {
    this.started = false;
    this.stream.disconnect();
    this.visibilityDocument?.removeEventListener(
      "visibilitychange",
      this.visibilityListener,
    );
    this.clearTimers();
  }

  async handleVisibilityChange(hidden: boolean): Promise<void> {
    this.pollHealth.setHidden(hidden);
    this.stream.setHidden(hidden);
    if (hidden) {
      return;
    }

    this.onHealthChange(
      "options",
      this.pollHealth.enterRecovery(),
      "browser resumed",
    );
    this.stream.enterRecovery("browser resumed", true);
    try {
      await this.synchronizeClock();
      if (this.catalog.isStale(this.now())) {
        await this.refreshCatalog();
      }
      this.stream.ensureConnected();
      await this.refreshOptionsSnapshot();
      this.stream.markReconciled();
      this.onResumeReconciled(this.snapshot);
    } catch {
      // Network recovery will retry via poll and reconnect timers
    }
  }

  async refreshCatalog(): Promise<void> {
    if (this.catalogRefreshPromise !== null) {
      return this.catalogRefreshPromise;
    }
    this.catalogRefreshPromise = this.catalog
      .refresh(this.restClient, this.now())
      .then(() => undefined)
      .finally(() => {
        this.catalogRefreshPromise = null;
      });
    return this.catalogRefreshPromise;
  }

  async refreshOptionsSnapshot(): Promise<OptionsChainSnapshot | null> {
    if (this.snapshotRefreshPromise !== null) {
      return this.snapshotRefreshPromise;
    }
    this.snapshotRefreshPromise = this.performSnapshotRefresh().finally(() => {
      this.snapshotRefreshPromise = null;
    });
    return this.snapshotRefreshPromise;
  }

  private async performSnapshotRefresh(): Promise<OptionsChainSnapshot | null> {
    const receivedTimestamp = this.now();
    try {
      const summaries = await this.restClient.getBookSummary();
      let built = buildDeribitOptionsSnapshot(
        this.catalog.activeInstruments,
        summaries,
        receivedTimestamp,
      );
      if (built.unknownSummaryInstrumentNames.length > 0) {
        await this.refreshCatalog();
        built = buildDeribitOptionsSnapshot(
          this.catalog.activeInstruments,
          summaries,
          receivedTimestamp,
        );
      }

      const snapshot = this.store.replace(built.snapshot);
      this.onSnapshot(snapshot);
      const fallbackIndex = summaries[0]?.underlying_price;
      if (fallbackIndex !== undefined && this.stream.state !== "LIVE") {
        this.handleIndexPrice(
          normalizeDeribitRestIndex(fallbackIndex, receivedTimestamp),
        );
      }

      if (built.missingSummaryInstrumentNames.length > 0) {
        const state = this.pollHealth.recordIncomplete(receivedTimestamp);
        this.onHealthChange(
          "options",
          state,
          `${built.missingSummaryInstrumentNames.length} catalog instruments lack summaries`,
        );
        return snapshot;
      }

      const recovery = this.pollHealth.recordSuccess(receivedTimestamp);
      this.onHealthChange("options", recovery.state, null);
      if (recovery.needsFollowUp) {
        this.scheduleRecoveryPoll();
      } else {
        this.clearRecoveryPoll();
      }
      this.stream.markReconciled();
      return snapshot;
    } catch (error) {
      const cached = this.store.restoreLastValid();
      const state = this.pollHealth.recordFailure(cached !== null);
      this.onHealthChange(
        "options",
        state,
        cached === null ? "snapshot unavailable" : "using last valid snapshot",
      );
      this.reportError(error);
      return cached;
    }
  }

  private handleMarkUpdates(updates: readonly DeribitMarkUpdate[]): void {
    const result = this.store.applyMarkUpdates(updates);
    if (result.snapshot !== null && result.applied > 0) {
      this.onSnapshot(result.snapshot);
    }
    if (result.unknownInstrumentNames.length > 0) {
      void this.refreshCatalogForUnknownInstrument();
    }
  }

  private handleIndexPrice(price: MarketPrice): void {
    this.indexPrice = price;
    this.onIndexPrice(price);
  }

  private async refreshCatalogForUnknownInstrument(): Promise<void> {
    try {
      await this.refreshCatalog();
      await this.refreshOptionsSnapshot();
    } catch (error) {
      this.reportError(error);
    }
  }

  private async reconcileAfterConnection(reconnected: boolean): Promise<void> {
    if (!this.started) {
      return;
    }
    if (!reconnected && this.store.snapshot !== null) {
      this.stream.markReconciled();
      return;
    }
    this.stream.enterRecovery("Deribit connection restored", true);
    await this.synchronizeClock();
    try {
      if (this.catalog.isStale(this.now())) {
        await this.refreshCatalog();
      }
      await this.refreshOptionsSnapshot();
      this.stream.markReconciled();
    } catch (error) {
      this.reportError(error);
    }
  }

  private async synchronizeClock(): Promise<void> {
    try {
      this.clock = await syncDeribitClock(this.restClient, undefined, this.now);
      this.clockRetryAttempt = 0;
      this.clearClockRetry();
      this.onClockSync(this.clock);
      this.onHealthChange("clock", this.clock.state, null);
    } catch (error) {
      this.clock = null;
      this.onHealthChange(
        "clock",
        "ERROR",
        "Deribit clock synchronization failed",
      );
      this.reportError(error);
      this.scheduleClockRetry();
    }
  }

  private startTimers(): void {
    this.optionsTimer = setInterval(() => {
      void this.refreshOptionsSnapshot();
      const state = this.pollHealth.evaluate(this.now());
      this.onHealthChange(
        "options",
        state,
        state === "STALE" ? "OI snapshot stale" : null,
      );
    }, DERIBIT_BOOK_SUMMARY_REFRESH_MS);
    this.catalogTimer = setInterval(() => {
      void this.refreshCatalog().catch((error: unknown) =>
        this.reportError(error),
      );
    }, DERIBIT_CATALOG_REFRESH_MS);
    this.clockTimer = setInterval(() => {
      void this.synchronizeClock();
    }, DERIBIT_CLOCK_RESYNC_MS);
  }

  private scheduleRecoveryPoll(): void {
    if (this.recoveryPollTimer !== null) {
      return;
    }
    this.recoveryPollTimer = setTimeout(() => {
      this.recoveryPollTimer = null;
      void this.refreshOptionsSnapshot();
    }, DERIBIT_POLL_RECOVERY_DELAY_MS);
  }

  private scheduleClockRetry(): void {
    if (!this.started || this.clockRetryTimer !== null) {
      return;
    }
    const delay = deribitReconnectDelay(this.clockRetryAttempt, this.random);
    this.clockRetryAttempt += 1;
    this.clockRetryTimer = setTimeout(() => {
      this.clockRetryTimer = null;
      void this.synchronizeClock();
    }, delay);
  }

  private clearRecoveryPoll(): void {
    if (this.recoveryPollTimer !== null) {
      clearTimeout(this.recoveryPollTimer);
      this.recoveryPollTimer = null;
    }
  }

  private clearClockRetry(): void {
    if (this.clockRetryTimer !== null) {
      clearTimeout(this.clockRetryTimer);
      this.clockRetryTimer = null;
    }
  }

  private clearTimers(): void {
    if (this.optionsTimer !== null) {
      clearInterval(this.optionsTimer);
      this.optionsTimer = null;
    }
    if (this.catalogTimer !== null) {
      clearInterval(this.catalogTimer);
      this.catalogTimer = null;
    }
    if (this.clockTimer !== null) {
      clearInterval(this.clockTimer);
      this.clockTimer = null;
    }
    this.clearRecoveryPoll();
    this.clearClockRetry();
  }

  private reportError(error: unknown): void {
    this.onError(error instanceof Error ? error : new Error(String(error)));
  }
}
