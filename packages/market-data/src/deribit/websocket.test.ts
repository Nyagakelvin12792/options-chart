import { afterEach, describe, expect, it, vi } from "vitest";

import type { FeedHealthState } from "@options-chart/domain";

import {
  DERIBIT_INDEX_CHANNEL,
  DERIBIT_MARK_PRICE_CHANNEL,
  DERIBIT_REQUIRED_CHANNELS,
} from "./constants";
import { DeribitWebSocketClient, type DeribitSocketLike } from "./websocket";

interface SentRpc {
  readonly jsonrpc: "2.0";
  readonly id: number;
  readonly method: string;
  readonly params: Readonly<Record<string, unknown>>;
}

class FakeSocket implements DeribitSocketLike {
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  readonly sent: string[] = [];

  open(): void {
    this.readyState = 1;
    this.onopen?.({} as Event);
  }

  message(payload: unknown): void {
    this.onmessage?.({
      data: JSON.stringify(payload),
    } as MessageEvent<unknown>);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code = 1000): void {
    this.readyState = 3;
    this.onclose?.({ code } as CloseEvent);
  }

  rpcMessages(): readonly SentRpc[] {
    return this.sent.map((message) => JSON.parse(message) as SentRpc);
  }
}

const confirmSetup = (socket: FakeSocket): void => {
  const setup = socket.rpcMessages();
  const heartbeat = setup.find(
    (message) => message.method === "public/set_heartbeat",
  );
  const subscribe = setup.find(
    (message) => message.method === "public/subscribe",
  );
  expect(heartbeat).toBeDefined();
  expect(subscribe).toBeDefined();
  socket.message({ jsonrpc: "2.0", id: heartbeat!.id, result: "ok" });
  socket.message({
    jsonrpc: "2.0",
    id: subscribe!.id,
    result: [...DERIBIT_REQUIRED_CHANNELS],
  });
};

afterEach(() => {
  vi.useRealTimers();
});

describe("DeribitWebSocketClient", () => {
  it("establishes heartbeat, subscribes once, and applies recovery hysteresis", () => {
    const base = 1_780_000_000_000;
    let now = base;
    const sockets: FakeSocket[] = [];
    const states: FeedHealthState[] = [];
    const markPrices: number[] = [];
    const indexPrices: number[] = [];
    const client = new DeribitWebSocketClient({
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      now: () => now,
      onMarkUpdates: (updates) =>
        markPrices.push(...updates.map((item) => item.markPriceBtc)),
      onIndexPrice: (price) => indexPrices.push(price.price),
      onHealthChange: (state) => states.push(state),
      onError: () => undefined,
    });

    client.connect();
    sockets[0]!.open();
    confirmSetup(sockets[0]!);
    client.markReconciled();

    sockets[0]!.message({
      jsonrpc: "2.0",
      method: "subscription",
      params: {
        channel: DERIBIT_MARK_PRICE_CHANNEL,
        data: [
          {
            instrument_name: "BTC-25DEC26-80000-C",
            mark_price: 0.13,
            iv: 0.66,
            timestamp: base,
          },
        ],
      },
    });
    now += 1_000;
    sockets[0]!.message({
      jsonrpc: "2.0",
      method: "subscription",
      params: {
        channel: DERIBIT_INDEX_CHANNEL,
        data: { index_name: "btc_usd", price: 78_625, timestamp: now },
      },
    });
    now += 1_000;
    sockets[0]!.message({
      jsonrpc: "2.0",
      method: "subscription",
      params: {
        channel: DERIBIT_MARK_PRICE_CHANNEL,
        data: [
          {
            instrument_name: "BTC-25DEC26-80000-P",
            mark_price: 0.08,
            iv: 0.8,
            timestamp: now,
          },
        ],
      },
    });

    expect(client.state).not.toBe("LIVE");
    now = base + 5_000;
    expect(client.evaluateHealth()).toBe("LIVE");
    expect(markPrices).toEqual([0.13, 0.08]);
    expect(indexPrices).toEqual([78_625]);
    expect(states).toContain("LIVE");
    client.disconnect();
  });

  it("answers test_request and degrades malformed expected messages", () => {
    const socket = new FakeSocket();
    const errors: Error[] = [];
    const client = new DeribitWebSocketClient({
      socketFactory: () => socket,
      onMarkUpdates: () => undefined,
      onIndexPrice: () => undefined,
      onHealthChange: () => undefined,
      onError: (error) => errors.push(error),
    });
    client.connect();
    socket.open();

    socket.message({
      jsonrpc: "2.0",
      method: "heartbeat",
      params: { type: "test_request" },
    });
    expect(socket.rpcMessages().at(-1)?.method).toBe("public/test");

    socket.message({
      jsonrpc: "2.0",
      method: "subscription",
      params: {
        channel: DERIBIT_MARK_PRICE_CHANNEL,
        data: [{ invalid: true }],
      },
    });
    expect(client.state).toBe("DEGRADED");
    expect(errors[0]?.name).toBe("SchemaValidationError");
    client.disconnect();
  });

  it("reconnects with bounded backoff and replays required subscriptions", () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const client = new DeribitWebSocketClient({
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      random: () => 0.5,
      onMarkUpdates: () => undefined,
      onIndexPrice: () => undefined,
      onHealthChange: () => undefined,
      onError: () => undefined,
    });

    client.connect();
    sockets[0]!.open();
    sockets[0]!.close(1006);
    vi.advanceTimersByTime(1_000);
    expect(sockets).toHaveLength(2);
    sockets[1]!.open();

    const replay = sockets[1]!
      .rpcMessages()
      .find((message) => message.method === "public/subscribe");
    expect(replay?.params.channels).toEqual([...DERIBIT_REQUIRED_CHANNELS]);
    client.disconnect();
  });

  it("does not return LIVE until both required channels have emitted", () => {
    const base = 1_780_000_000_000;
    let now = base;
    const socket = new FakeSocket();
    const client = new DeribitWebSocketClient({
      socketFactory: () => socket,
      now: () => now,
      onMarkUpdates: () => undefined,
      onIndexPrice: () => undefined,
      onHealthChange: () => undefined,
      onError: () => undefined,
    });
    client.connect();
    socket.open();
    confirmSetup(socket);
    client.markReconciled();

    for (let index = 0; index < 3; index += 1) {
      socket.message({
        jsonrpc: "2.0",
        method: "subscription",
        params: {
          channel: DERIBIT_MARK_PRICE_CHANNEL,
          data: [
            {
              instrument_name: "BTC-25DEC26-80000-C",
              mark_price: 0.13,
              iv: 0.66,
              timestamp: base + index,
            },
          ],
        },
      });
    }
    now += 6_000;
    expect(client.evaluateHealth()).not.toBe("LIVE");
    client.disconnect();
  });
});
