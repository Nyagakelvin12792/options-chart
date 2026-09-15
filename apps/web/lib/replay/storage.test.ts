import { describe, expect, it } from "vitest";
import type { OptionsChainSnapshot } from "@options-chart/domain";

import { InMemoryReplaySnapshotStorage } from "./storage";
import type { SerializableOptionsSnapshot } from "./types";

const snapshot = (
  id: string,
  capturedAt: number,
): SerializableOptionsSnapshot => ({
  schemaVersion: "options-replay-snapshot-v1",
  snapshotId: id,
  capturedAt,
  chain: {
    metadata: {
      source: "deribit",
      sourceTimestamp: capturedAt,
      receivedTimestamp: capturedAt,
      normalizedTimestamp: capturedAt,
      schemaVersion: "test-v1",
    },
    currency: "BTC",
    instruments: [],
  } satisfies OptionsChainSnapshot,
});

describe("bounded replay snapshot storage", () => {
  it("orders snapshots and evicts the oldest beyond capacity", async () => {
    const storage = new InMemoryReplaySnapshotStorage(2);
    await storage.write(snapshot("later", 30));
    await storage.write(snapshot("first", 10));
    const result = await storage.write(snapshot("middle", 20));

    expect(result.evictedSnapshotIds).toEqual(["first"]);
    expect(await storage.readRange({ limit: 2 })).toEqual([
      snapshot("middle", 20),
      snapshot("later", 30),
    ]);
  });

  it("selects only a real snapshot at or before replay time", async () => {
    const storage = new InMemoryReplaySnapshotStorage(3);
    await storage.write(snapshot("first", 10));
    await storage.write(snapshot("second", 30));

    await expect(storage.readAtOrBefore(5)).resolves.toBeNull();
    await expect(storage.readAtOrBefore(29)).resolves.toEqual(
      snapshot("first", 10),
    );
  });

  it("rejects unbounded reads", async () => {
    const storage = new InMemoryReplaySnapshotStorage(2);
    await expect(storage.readRange({ limit: 3 })).rejects.toThrow(
      /between 1 and 2/,
    );
  });
});
