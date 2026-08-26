import { expect, it } from "vitest";

import type { DeribitSocketLike } from "../../packages/market-data/src/deribit";
import {
  DeribitInstrumentCatalog,
  DeribitRestClient,
  DeribitWebSocketClient,
  buildDeribitOptionsSnapshot,
  syncDeribitClock,
} from "../../packages/market-data/src/deribit";

const waitFor = async (
  predicate: () => boolean,
  timeoutMs: number,
  label: string,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};

it("validates the live Deribit BTC option chain and reconnect recovery", async () => {
  const rest = new DeribitRestClient();
  const clock = await syncDeribitClock(rest);
  const catalog = new DeribitInstrumentCatalog();
  await catalog.refresh(rest, Date.now() + clock.offsetMs);
  const summaries = await rest.getBookSummary();
  const receivedAt = Date.now() + clock.offsetMs;
  let built = buildDeribitOptionsSnapshot(
    catalog.activeInstruments,
    summaries,
    receivedAt,
  );
  if (built.unknownSummaryInstrumentNames.length > 0) {
    await catalog.refresh(rest, Date.now() + clock.offsetMs);
    built = buildDeribitOptionsSnapshot(
      catalog.activeInstruments,
      summaries,
      receivedAt,
    );
  }

  expect(catalog.size).toBeGreaterThan(0);
  expect(built.snapshot.instruments).toHaveLength(catalog.size);
  expect(built.missingSummaryInstrumentNames).toEqual([]);
  expect(built.unknownSummaryInstrumentNames).toEqual([]);

  const totalOpenInterestBtc = built.snapshot.instruments.reduce(
    (total, item) => total + item.quote.openInterestBtc,
    0,
  );
  const restIvCount = built.snapshot.instruments.filter(
    (item) => item.quote.markIvDecimal !== null,
  ).length;
  expect(totalOpenInterestBtc).toBeGreaterThan(0);
  expect(restIvCount).toBeGreaterThan(0);

  const sockets: DeribitSocketLike[] = [];
  const errors: Error[] = [];
  let markBatchCount = 0;
  let streamedInstrumentCount = 0;
  let indexUpdateCount = 0;
  let reconnectCount = 0;
  const stream = new DeribitWebSocketClient({
    socketFactory: (url) => {
      const socket = new WebSocket(url) as unknown as DeribitSocketLike;
      sockets.push(socket);
      return socket;
    },
    onMarkUpdates: (updates) => {
      markBatchCount += 1;
      streamedInstrumentCount += updates.length;
    },
    onIndexPrice: () => {
      indexUpdateCount += 1;
    },
    onHealthChange: () => undefined,
    onError: (error) => errors.push(error),
    onConnected: (reconnected) => {
      if (!reconnected) {
        stream.markReconciled();
        return;
      }
      reconnectCount += 1;
      void rest
        .getBookSummary()
        .then(() => stream.markReconciled())
        .catch((error: unknown) =>
          errors.push(
            error instanceof Error ? error : new Error(String(error)),
          ),
        );
    },
  });

  stream.connect();
  try {
    await waitFor(
      () =>
        stream.state === "LIVE" && markBatchCount > 0 && indexUpdateCount > 0,
      30_000,
      "initial Deribit LIVE state",
    );

    const firstSocket = sockets[0];
    expect(firstSocket).toBeDefined();
    firstSocket!.close(4_001, "live verification reconnect");

    await waitFor(
      () =>
        sockets.length >= 2 && reconnectCount >= 1 && stream.state === "LIVE",
      45_000,
      "Deribit reconnect recovery",
    );
  } finally {
    stream.disconnect();
  }

  expect(markBatchCount).toBeGreaterThan(0);
  expect(streamedInstrumentCount).toBeGreaterThan(0);
  expect(indexUpdateCount).toBeGreaterThan(0);
  expect(sockets.length).toBeGreaterThanOrEqual(2);
  expect(reconnectCount).toBeGreaterThanOrEqual(1);
  expect(stream.state).toBe("LIVE");
  expect(errors).toEqual([]);

  console.log(
    JSON.stringify({
      catalogSize: catalog.size,
      normalizedSnapshotSize: built.snapshot.instruments.length,
      totalOpenInterestBtc,
      restIvCount,
      clockOffsetMs: clock.offsetMs,
      clockRttMs: clock.bestRttMs,
      markBatchCount,
      streamedInstrumentCount,
      indexUpdateCount,
      socketsCreated: sockets.length,
      reconnectCount,
      finalState: stream.state,
    }),
  );
});
