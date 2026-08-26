import type { FeedHealthState, MarketPrice } from "@options-chart/domain";
import { SchemaValidationError, TransportError } from "@options-chart/shared";

import {
  DeribitHeartbeatEnvelopeSchema,
  DeribitIndexUpdateSchema,
  DeribitMarkPriceUpdatesSchema,
  DeribitRpcResponseSchema,
  DeribitSubscriptionEnvelopeSchema,
} from "./api-schemas";
import {
  DERIBIT_HEARTBEAT_INTERVAL_SECONDS,
  DERIBIT_INDEX_CHANNEL,
  DERIBIT_MARK_HARD_STALE_AFTER_MS,
  DERIBIT_MARK_PRICE_CHANNEL,
  DERIBIT_MARK_STALE_AFTER_MS,
  DERIBIT_RECOVERY_HEALTHY_MS,
  DERIBIT_RECOVERY_VALID_MESSAGES,
  DERIBIT_REQUIRED_CHANNELS,
  DERIBIT_WS_ENDPOINT,
  deribitReconnectDelay,
} from "./constants";
import {
  normalizeDeribitIndexUpdate,
  normalizeDeribitMarkUpdate,
} from "./production-normalizers";
import type { DeribitMarkUpdate, DeribitStreamFreshness } from "./types";

const SOCKET_CONNECTING = 0;
const SOCKET_OPEN = 1;

export interface DeribitSocketLike {
  readonly readyState: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type DeribitSocketFactory = (url: string) => DeribitSocketLike;

export interface DeribitWebSocketOptions {
  readonly endpoint?: string;
  readonly socketFactory?: DeribitSocketFactory;
  readonly now?: () => number;
  readonly random?: () => number;
  readonly onMarkUpdates: (updates: readonly DeribitMarkUpdate[]) => void;
  readonly onIndexPrice: (price: MarketPrice) => void;
  readonly onHealthChange: (state: FeedHealthState, detail: string | null) => void;
  readonly onError: (error: Error) => void;
  readonly onConnected?: (reconnected: boolean) => void;
}

const defaultSocketFactory: DeribitSocketFactory = (url) => new WebSocket(url);

export class DeribitWebSocketClient {
  private readonly endpoint: string;
  private readonly socketFactory: DeribitSocketFactory;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly onMarkUpdates: (updates: readonly DeribitMarkUpdate[]) => void;
  private readonly onIndexPrice: (price: MarketPrice) => void;
  private readonly onHealthChange: (
    state: FeedHealthState,
    detail: string | null,
  ) => void;
  private readonly onError: (error: Error) => void;
  private readonly onConnected: (reconnected: boolean) => void;

  private socket: DeribitSocketLike | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private requestId = 1;
  private heartbeatRequestId: number | null = null;
  private subscriptionRequestId: number | null = null;
  private reconnectAttempt = 0;
  private hasConnected = false;
  private stopped = true;
  private hidden = false;
  private reconciliationComplete = false;
  private heartbeatConfirmed = false;
  private subscriptionsConfirmed = false;
  private currentState: FeedHealthState = "CONNECTING";
  private currentDetail: string | null = null;
  private lastMarkMessageAt: number | null = null;
  private lastIndexMessageAt: number | null = null;
  private consecutiveValidMessages = 0;
  private recoveryStartedAt: number | null = null;

  constructor(options: DeribitWebSocketOptions) {
    this.endpoint = options.endpoint ?? DERIBIT_WS_ENDPOINT;
    this.socketFactory = options.socketFactory ?? defaultSocketFactory;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.onMarkUpdates = options.onMarkUpdates;
    this.onIndexPrice = options.onIndexPrice;
    this.onHealthChange = options.onHealthChange;
    this.onError = options.onError;
    this.onConnected = options.onConnected ?? (() => undefined);
  }

  get state(): FeedHealthState {
    return this.currentState;
  }

  get freshness(): DeribitStreamFreshness {
    return {
      state: this.currentState,
      lastMarkMessageAt: this.lastMarkMessageAt,
      lastIndexMessageAt: this.lastIndexMessageAt,
      consecutiveValidMessages: this.consecutiveValidMessages,
      subscriptionsConfirmed: this.subscriptionsConfirmed,
    };
  }

  get connected(): boolean {
    return this.socket?.readyState === SOCKET_OPEN;
  }

  connect(): void {
    this.stopped = false;
    if (
      this.socket?.readyState === SOCKET_OPEN ||
      this.socket?.readyState === SOCKET_CONNECTING
    ) {
      return;
    }
    this.openSocket();
  }

  disconnect(): void {
    this.stopped = true;
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000, "client shutdown");
  }

  setHidden(hidden: boolean): void {
    this.hidden = hidden;
  }

  markReconciled(): void {
    this.reconciliationComplete = true;
    this.evaluateHealth(this.now());
  }

  enterRecovery(detail: string, requiresReconciliation = true): void {
    if (requiresReconciliation) {
      this.reconciliationComplete = false;
    }
    this.resetRecovery();
    this.setState(this.connected ? "DEGRADED" : "RECONNECTING", detail);
  }

  ensureConnected(): void {
    if (!this.connected) {
      this.scheduleReconnect("connection verification failed", true);
    }
  }

  evaluateHealth(now = this.now()): FeedHealthState {
    if (this.hidden) {
      return this.currentState;
    }

    const oldestExpectedMessageAt =
      this.lastMarkMessageAt === null || this.lastIndexMessageAt === null
        ? null
        : Math.min(this.lastMarkMessageAt, this.lastIndexMessageAt);
    if (oldestExpectedMessageAt !== null) {
      const ageMs = now - oldestExpectedMessageAt;
      if (ageMs >= DERIBIT_MARK_HARD_STALE_AFTER_MS) {
        this.resetRecovery();
        this.setState("STALE", `Deribit stream stale for ${ageMs} ms`);
        this.scheduleReconnect("hard stale threshold exceeded", true);
        return this.currentState;
      }
      if (ageMs >= DERIBIT_MARK_STALE_AFTER_MS) {
        this.resetRecovery();
        this.setState("DEGRADED", `Deribit stream delayed for ${ageMs} ms`);
        return this.currentState;
      }
    }

    if (
      this.heartbeatConfirmed &&
      this.subscriptionsConfirmed &&
      this.reconciliationComplete &&
      this.consecutiveValidMessages >= DERIBIT_RECOVERY_VALID_MESSAGES &&
      this.recoveryStartedAt !== null &&
      now - this.recoveryStartedAt >= DERIBIT_RECOVERY_HEALTHY_MS
    ) {
      this.reconnectAttempt = 0;
      this.setState("LIVE", null);
    }
    return this.currentState;
  }

  private openSocket(): void {
    if (this.stopped) {
      return;
    }
    this.clearReconnectTimer();
    this.heartbeatConfirmed = false;
    this.subscriptionsConfirmed = false;
    this.resetRecovery();
    this.setState(this.hasConnected ? "RECONNECTING" : "CONNECTING", null);

    let socket: DeribitSocketLike;
    try {
      socket = this.socketFactory(this.endpoint);
    } catch (error) {
      this.reportTransportError("Deribit WebSocket construction failed", error);
      this.scheduleReconnect("socket construction failed");
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket || this.stopped) {
        return;
      }
      const reconnected = this.hasConnected;
      this.hasConnected = true;
      this.heartbeatRequestId = this.sendRpc("public/set_heartbeat", {
        interval: DERIBIT_HEARTBEAT_INTERVAL_SECONDS,
      });
      this.subscriptionRequestId = this.sendRpc("public/subscribe", {
        channels: [...DERIBIT_REQUIRED_CHANNELS],
      });
      this.startHealthTimer();
      this.onConnected(reconnected);
    };
    socket.onmessage = (event) => this.handleMessage(event.data);
    socket.onerror = (event) => {
      this.reportTransportError("Deribit WebSocket emitted an error", event);
    };
    socket.onclose = (event) => {
      if (this.socket !== socket) {
        return;
      }
      this.socket = null;
      this.stopHealthTimer();
      if (!this.stopped) {
        this.scheduleReconnect(`socket closed (${event.code})`);
      }
    };
  }

  private handleMessage(raw: unknown): void {
    const receivedTimestamp = this.now();
    let payload: unknown;
    try {
      payload = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (error) {
      this.handleMalformed("Deribit WebSocket frame is not valid JSON", error);
      return;
    }

    const heartbeat = DeribitHeartbeatEnvelopeSchema.safeParse(payload);
    if (heartbeat.success) {
      if (heartbeat.data.params.type === "test_request") {
        this.sendRpc("public/test", {});
      }
      return;
    }

    const subscription = DeribitSubscriptionEnvelopeSchema.safeParse(payload);
    if (subscription.success) {
      if (subscription.data.params.channel === DERIBIT_MARK_PRICE_CHANNEL) {
        const updates = DeribitMarkPriceUpdatesSchema.safeParse(
          subscription.data.params.data,
        );
        if (!updates.success) {
          this.handleMalformed("Deribit mark-price update is invalid", updates.error);
          return;
        }
        this.lastMarkMessageAt = receivedTimestamp;
        this.recordValidMessage(receivedTimestamp);
        this.onMarkUpdates(
          updates.data.map((update) =>
            normalizeDeribitMarkUpdate(update, receivedTimestamp),
          ),
        );
        return;
      }
      if (subscription.data.params.channel === DERIBIT_INDEX_CHANNEL) {
        const update = DeribitIndexUpdateSchema.safeParse(subscription.data.params.data);
        if (!update.success) {
          this.handleMalformed("Deribit index update is invalid", update.error);
          return;
        }
        this.lastIndexMessageAt = receivedTimestamp;
        this.recordValidMessage(receivedTimestamp);
        this.onIndexPrice(normalizeDeribitIndexUpdate(update.data, receivedTimestamp));
      }
      return;
    }

    const response = DeribitRpcResponseSchema.safeParse(payload);
    if (!response.success) {
      this.handleMalformed("Deribit WebSocket message envelope is invalid", response.error);
      return;
    }
    if (response.data.error !== undefined) {
      this.reportTransportError(
        `Deribit WebSocket RPC error: ${response.data.error.message}`,
        response.data.error,
      );
      this.scheduleReconnect("JSON-RPC request failed", true);
      return;
    }
    if (response.data.id === this.heartbeatRequestId && response.data.result === "ok") {
      this.heartbeatConfirmed = true;
      return;
    }
    if (response.data.id === this.subscriptionRequestId) {
      const channels = Array.isArray(response.data.result)
        ? response.data.result.filter((channel): channel is string => typeof channel === "string")
        : [];
      this.subscriptionsConfirmed = DERIBIT_REQUIRED_CHANNELS.every((channel) =>
        channels.includes(channel),
      );
      if (!this.subscriptionsConfirmed) {
        this.reportTransportError("Deribit did not confirm all required subscriptions", {
          channels,
        });
        this.scheduleReconnect("subscription confirmation incomplete", true);
      }
    }
  }

  private recordValidMessage(timestamp: number): void {
    if (this.recoveryStartedAt === null) {
      this.recoveryStartedAt = timestamp;
    }
    this.consecutiveValidMessages += 1;
    this.evaluateHealth(timestamp);
  }

  private handleMalformed(message: string, cause: unknown): void {
    this.resetRecovery();
    this.setState("DEGRADED", message);
    this.onError(
      new SchemaValidationError(message, {
        source: "deribit",
        operation: "websocket-message",
        timestamp: this.now(),
        retryable: false,
        cause,
      }),
    );
  }

  private reportTransportError(message: string, cause: unknown): void {
    this.onError(
      new TransportError(message, {
        source: "deribit",
        operation: "websocket",
        timestamp: this.now(),
        retryable: true,
        cause,
      }),
    );
  }

  private sendRpc(method: string, params: Readonly<Record<string, unknown>>): number {
    const id = this.requestId;
    this.requestId += 1;
    if (!this.connected || this.socket === null) {
      this.reportTransportError(`Cannot send ${method} while socket is closed`, null);
      return id;
    }
    this.socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    return id;
  }

  private scheduleReconnect(detail: string, immediate = false): void {
    if (this.stopped || this.reconnectTimer !== null) {
      return;
    }
    this.setState("RECONNECTING", detail);
    const socket = this.socket;
    this.socket = null;
    socket?.close(1012, "reconnect");
    this.stopHealthTimer();
    const delay = immediate
      ? 0
      : deribitReconnectDelay(this.reconnectAttempt, this.random);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  private resetRecovery(): void {
    this.consecutiveValidMessages = 0;
    this.recoveryStartedAt = null;
  }

  private startHealthTimer(): void {
    this.stopHealthTimer();
    this.healthTimer = setInterval(() => this.evaluateHealth(this.now()), 1_000);
  }

  private stopHealthTimer(): void {
    if (this.healthTimer !== null) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearReconnectTimer();
    this.stopHealthTimer();
  }

  private setState(state: FeedHealthState, detail: string | null): void {
    if (this.currentState === state && this.currentDetail === detail) {
      return;
    }
    this.currentState = state;
    this.currentDetail = detail;
    this.onHealthChange(state, detail);
  }
}
