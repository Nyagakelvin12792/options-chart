import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  DeribitBookSummariesSchema,
  DeribitOptionInstrumentsSchema,
} from "./api-schemas";
import type { DeribitEngineRestClient } from "./engine";
import { DeribitOptionsDataEngine } from "./engine";
import type { DeribitSocketLike } from "./websocket";

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      new URL(`../../../../tests/fixtures/deribit/${name}`, import.meta.url),
      "utf8",
    ),
  );

class EngineSocket implements DeribitSocketLike {
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

  close(): void {
    this.readyState = 3;
  }
}

const buildRestClient = (
  now: () => number,
  getInstruments: DeribitEngineRestClient["getInstruments"],
  getBookSummary: DeribitEngineRestClient["getBookSummary"],
): DeribitEngineRestClient => ({
  getTime: async () => now(),
  getInstruments,
  getBookSummary,
});

describe("DeribitOptionsDataEngine", () => {
  it("starts with a complete catalog, OI snapshot, IV, and REST index fallback", async () => {
    const timestamp = 1_780_000_000_500;
    const instruments = DeribitOptionInstrumentsSchema.parse(
      fixture("instruments.json"),
    );
    const summaries = DeribitBookSummariesSchema.parse(
      fixture("book-summary.json"),
    );
    const socket = new EngineSocket();
    const snapshots: number[] = [];
    const indexPrices: number[] = [];
    const getTime = vi.fn(async () => timestamp);
    const restClient: DeribitEngineRestClient = {
      getTime,
      getInstruments: async () => instruments,
      getBookSummary: async () => summaries,
    };
    const engine = new DeribitOptionsDataEngine({
      restClient,
      socketFactory: () => socket,
      now: () => timestamp,
      onSnapshot: (snapshot) => snapshots.push(snapshot.instruments.length),
      onIndexPrice: (price) => indexPrices.push(price.price),
    });

    await engine.start();

    expect(getTime).toHaveBeenCalledTimes(5);
    expect(engine.instrumentCatalog.size).toBe(2);
    expect(engine.snapshot.chain?.instruments).toHaveLength(2);
    expect(engine.snapshot.chain?.instruments[1]?.quote.markIvDecimal).toBe(
      0.8,
    );
    expect(engine.snapshot.optionsState).toBe("LIVE");
    expect(engine.snapshot.index?.price).toBe(78_500);
    expect(snapshots).toEqual([2]);
    expect(indexPrices).toEqual([78_500]);
    engine.stop();
  });

  it("serves the last-valid chain when a later OI refresh fails", async () => {
    const timestamp = 1_780_000_000_500;
    const instruments = DeribitOptionInstrumentsSchema.parse(
      fixture("instruments.json"),
    );
    const summaries = DeribitBookSummariesSchema.parse(
      fixture("book-summary.json"),
    );
    let failSummary = false;
    const errors: Error[] = [];
    const engine = new DeribitOptionsDataEngine({
      restClient: buildRestClient(
        () => timestamp,
        async () => instruments,
        async () => {
          if (failSummary) {
            throw new Error("snapshot unavailable");
          }
          return summaries;
        },
      ),
      socketFactory: () => new EngineSocket(),
      now: () => timestamp,
      onError: (error) => errors.push(error),
    });
    await engine.start();
    failSummary = true;

    const fallback = await engine.refreshOptionsSnapshot();

    expect(fallback?.instruments).toHaveLength(2);
    expect(engine.snapshot.optionsState).toBe("FALLBACK");
    expect(errors.at(-1)?.message).toBe("snapshot unavailable");
    engine.stop();
  });

  it("refreshes the catalog immediately for a valid unknown stream instrument", async () => {
    const timestamp = 1_780_000_000_500;
    const allInstruments = DeribitOptionInstrumentsSchema.parse(
      fixture("instruments.json"),
    );
    const allSummaries = DeribitBookSummariesSchema.parse(
      fixture("book-summary.json"),
    );
    let expanded = false;
    const socket = new EngineSocket();
    const getInstruments = vi.fn(async () =>
      expanded ? allInstruments : allInstruments.slice(0, 1),
    );
    const engine = new DeribitOptionsDataEngine({
      restClient: buildRestClient(
        () => timestamp,
        getInstruments,
        async () => (expanded ? allSummaries : allSummaries.slice(0, 1)),
      ),
      socketFactory: () => socket,
      now: () => timestamp,
    });
    await engine.start();
    socket.open();
    expanded = true;

    socket.message({
      jsonrpc: "2.0",
      method: "subscription",
      params: {
        channel: "markprice.options.btc_usd",
        data: [
          {
            instrument_name: "BTC-25DEC26-80000-P",
            mark_price: 0.09,
            iv: 0.81,
            timestamp,
          },
        ],
      },
    });

    await vi.waitFor(() => expect(engine.instrumentCatalog.size).toBe(2));
    await vi.waitFor(() =>
      expect(engine.snapshot.chain?.instruments).toHaveLength(2),
    );
    expect(getInstruments).toHaveBeenCalledTimes(2);
    engine.stop();
  });

  it("resynchronizes clock and reconciles the chain after browser resume", async () => {
    const timestamp = 1_780_000_000_500;
    const instruments = DeribitOptionInstrumentsSchema.parse(
      fixture("instruments.json"),
    );
    const summaries = DeribitBookSummariesSchema.parse(
      fixture("book-summary.json"),
    );
    const getTime = vi.fn(async () => timestamp);
    const getBookSummary = vi.fn(async () => summaries);
    const resumes: number[] = [];
    const engine = new DeribitOptionsDataEngine({
      restClient: {
        getTime,
        getInstruments: async () => instruments,
        getBookSummary,
      },
      socketFactory: () => new EngineSocket(),
      now: () => timestamp,
      onResumeReconciled: (snapshot) =>
        resumes.push(snapshot.chain?.instruments.length ?? 0),
    });
    await engine.start();
    await engine.handleVisibilityChange(true);
    await engine.handleVisibilityChange(false);

    expect(getTime).toHaveBeenCalledTimes(10);
    expect(getBookSummary).toHaveBeenCalledTimes(2);
    expect(resumes).toEqual([2]);
    engine.stop();
  });
});
