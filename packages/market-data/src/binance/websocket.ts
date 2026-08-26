import type { Candle, CandleInterval } from "@options-chart/domain";
import type { FeedHealthState } from "@options-chart/domain";

import type { BinanceWsKlineData } from "./ws-schemas";
import { BinanceWsKlineEventSchema } from "./ws-schemas";
import {
  BACKOFF_MAX_MS,
  BACKOFF_MIN_MS,
  BACKOFF_MULTIPLIER,
  BINANCE_WS_ENDPOINTS,
  HEALTHY_RESET_MS,
  MAX_RECONNECT_ATTEMPTS,
  PLANNED_RECONNECT_MS,
  STALE_THRESHOLD_MS,
} from "./constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BinanceWsOptions {
  readonly symbol?: string;
  readonly interval: CandleInterval;
  /** Override WS endpoints (for testing). */
  readonly endpoints?: readonly string[];
  /** Callback for validated candle updates. */
  readonly onCandle: (candle: Candle) => void;
  /** Callback for feed health state changes. */
  readonly onHealthChange: (
    state: FeedHealthState,
    detail: string | null,
  ) => void;
  /** Callback when the socket reconnects (caller should run gap repair). */
  readonly onReconnect: () => void;
}

// ---------------------------------------------------------------------------
// WebSocket Kline normalizer (WS payload → canonical Candle)
// ---------------------------------------------------------------------------

const WS_SCHEMA_VERSION = "binance-ws-kline-v1";

function wsKlineToCandle(
  k: BinanceWsKlineData,
  interval: CandleInterval,
  receivedTimestamp: number,
): Candle {
  return {
    metadata: {
      source: "binance",
      sourceTimestamp: k.T,
      receivedTimestamp,
      normalizedTimestamp: Date.now(),
      schemaVersion: WS_SCHEMA_VERSION,
    },
    symbol: "BTCUSDT",
    interval,
    openTime: k.t,
    closeTime: k.T,
    open: Number(k.o),
    high: Number(k.h),
    low: Number(k.l),
    close: Number(k.c),
    volume: Number(k.v),
    quoteVolume: Number(k.q),
    tradeCount: k.n,
    isClosed: k.x,
  };
}

// ---------------------------------------------------------------------------
// Backoff with jitter
// ---------------------------------------------------------------------------

function backoffDelay(attempt: number): number {
  const base = Math.min(
    BACKOFF_MIN_MS * Math.pow(BACKOFF_MULTIPLIER, attempt),
    BACKOFF_MAX_MS,
  );
  // Add ±25% jitter.
  const jitter = base * 0.25 * (Math.random() * 2 - 1);
  return Math.max(BACKOFF_MIN_MS, Math.round(base + jitter));
}

// ---------------------------------------------------------------------------
// BinanceKlineSocket
// ---------------------------------------------------------------------------

/**
 * Managed Binance Kline WebSocket client.
 *
 * Features:
 * - Automatic endpoint failover (primary → market-data-only).
 * - Exponential backoff with jitter on unexpected disconnect.
 * - Planned 24-hour proactive reconnection.
 * - Stale detection when no message arrives within threshold.
 * - Feed health state lifecycle (CONNECTING → LIVE → STALE/RECONNECTING → ERROR).
 */
export class BinanceKlineSocket {
  private readonly symbol: string;
  private interval: CandleInterval;
  private readonly endpoints: readonly string[];
  private readonly onCandle: (candle: Candle) => void;
  private readonly onHealthChange: (
    state: FeedHealthState,
    detail: string | null,
  ) => void;
  private readonly onReconnect: () => void;

  private ws: WebSocket | null = null;
  private endpointIndex = 0;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private staleTimer: ReturnType<typeof setTimeout> | null = null;
  private plannedReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectedSince: number | null = null;
  private destroyed = false;
  private _state: FeedHealthState = "CONNECTING";

  constructor(options: BinanceWsOptions) {
    this.symbol = (options.symbol ?? "btcusdt").toLowerCase();
    this.interval = options.interval;
    this.endpoints = options.endpoints ?? BINANCE_WS_ENDPOINTS;
    this.onCandle = options.onCandle;
    this.onHealthChange = options.onHealthChange;
    this.onReconnect = options.onReconnect;
  }

  /** Current feed health state. */
  get state(): FeedHealthState {
    return this._state;
  }

  /** Number of reconnection attempts since last healthy connection. */
  get attempts(): number {
    return this.reconnectAttempt;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /** Open the WebSocket connection. */
  connect(): void {
    if (this.destroyed) return;
    this.setState("CONNECTING", null);
    this.openSocket();
  }

  /** Permanently close the socket and cancel all timers. */
  destroy(): void {
    this.destroyed = true;
    this.clearAllTimers();
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Switch to a new interval. Closes the current socket and reconnects
   * with the new stream name.
   */
  switchInterval(newInterval: CandleInterval): void {
    if (newInterval === this.interval) return;
    this.interval = newInterval;
    this.reconnectAttempt = 0;
    this.endpointIndex = 0;
    this.closeAndReconnect("interval-switch");
  }

  // -----------------------------------------------------------------------
  // Socket management
  // -----------------------------------------------------------------------

  private openSocket(): void {
    if (this.destroyed) return;

    const base = this.endpoints[this.endpointIndex % this.endpoints.length]!;
    const streamName = `${this.symbol}@kline_${this.interval}`;
    const url = `${base}/${streamName}`;

    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      if (this.destroyed || ws !== this.ws) return;
      this.connectedSince = Date.now();
      this.reconnectAttempt = 0;
      this.setState("LIVE", null);
      this.resetStaleTimer();
      this.scheduleProactiveReconnect();
    };

    ws.onmessage = (event: MessageEvent) => {
      if (this.destroyed || ws !== this.ws) return;
      this.handleMessage(event.data as string);
    };

    ws.onerror = () => {
      // The `onclose` handler will fire next; we handle reconnection there.
    };

    ws.onclose = (event: CloseEvent) => {
      if (this.destroyed || ws !== this.ws) return;
      this.handleDisconnect(event);
    };
  }

  private handleMessage(data: string): void {
    this.resetStaleTimer();

    // Reset healthy-connection timer.
    if (
      this.connectedSince !== null &&
      Date.now() - this.connectedSince >= HEALTHY_RESET_MS
    ) {
      this.reconnectAttempt = 0;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      // Malformed JSON — skip silently.
      return;
    }

    const result = BinanceWsKlineEventSchema.safeParse(parsed);
    if (!result.success) {
      // Not a kline event (could be a pong or other message) — skip.
      return;
    }

    const candle = wsKlineToCandle(result.data.k, this.interval, Date.now());
    this.onCandle(candle);
  }

  private handleDisconnect(event: CloseEvent): void {
    this.clearAllTimers();

    if (this.reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      this.setState(
        "ERROR",
        `Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) exhausted`,
      );
      return;
    }

    this.setState(
      "RECONNECTING",
      `WebSocket closed: code=${event.code} reason=${event.reason || "none"}`,
    );

    // Try next endpoint on alternating attempts.
    if (this.reconnectAttempt > 0 && this.reconnectAttempt % 2 === 0) {
      this.endpointIndex = (this.endpointIndex + 1) % this.endpoints.length;
    }

    const delay = backoffDelay(this.reconnectAttempt);
    this.reconnectAttempt++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.onReconnect();
      this.openSocket();
    }, delay);
  }

  private closeAndReconnect(reason: string): void {
    this.clearAllTimers();
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.setState("RECONNECTING", reason);
    this.onReconnect();
    this.openSocket();
  }

  // -----------------------------------------------------------------------
  // Timers
  // -----------------------------------------------------------------------

  private resetStaleTimer(): void {
    if (this.staleTimer !== null) {
      clearTimeout(this.staleTimer);
    }
    this.staleTimer = setTimeout(() => {
      this.staleTimer = null;
      if (!this.destroyed && this._state === "LIVE") {
        this.setState("STALE", "No kline message within stale threshold");
      }
    }, STALE_THRESHOLD_MS);
  }

  private scheduleProactiveReconnect(): void {
    if (this.plannedReconnectTimer !== null) {
      clearTimeout(this.plannedReconnectTimer);
    }
    this.plannedReconnectTimer = setTimeout(() => {
      this.plannedReconnectTimer = null;
      if (!this.destroyed) {
        this.closeAndReconnect("planned-24h-reconnect");
      }
    }, PLANNED_RECONNECT_MS);
  }

  private clearAllTimers(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.staleTimer !== null) {
      clearTimeout(this.staleTimer);
      this.staleTimer = null;
    }
    if (this.plannedReconnectTimer !== null) {
      clearTimeout(this.plannedReconnectTimer);
      this.plannedReconnectTimer = null;
    }
  }

  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------

  private setState(state: FeedHealthState, detail: string | null): void {
    if (this._state !== state) {
      this._state = state;
      this.onHealthChange(state, detail);
    }
  }
}
