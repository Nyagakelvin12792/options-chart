import type {
  BoundedReplaySnapshotStorage,
  ReplaySnapshotRange,
  ReplaySnapshotWriteResult,
  SerializableOptionsSnapshot,
} from "./types";

const compareSnapshots = (
  left: SerializableOptionsSnapshot,
  right: SerializableOptionsSnapshot,
): number =>
  left.capturedAt - right.capturedAt ||
  left.snapshotId.localeCompare(right.snapshotId);

const validateCapacity = (capacity: number): void => {
  if (!Number.isSafeInteger(capacity) || capacity <= 0) {
    throw new RangeError("Replay snapshot capacity must be a positive integer");
  }
};

const validateRange = (range: ReplaySnapshotRange, capacity: number): void => {
  if (
    !Number.isSafeInteger(range.limit) ||
    range.limit <= 0 ||
    range.limit > capacity
  ) {
    throw new RangeError(
      `Replay range limit must be between 1 and ${capacity}`,
    );
  }
};

export class InMemoryReplaySnapshotStorage implements BoundedReplaySnapshotStorage {
  private readonly snapshots = new Map<string, SerializableOptionsSnapshot>();

  constructor(readonly capacity = 288) {
    validateCapacity(capacity);
  }

  async count(): Promise<number> {
    return this.snapshots.size;
  }

  async readAtOrBefore(
    replayTime: number,
  ): Promise<SerializableOptionsSnapshot | null> {
    return (
      this.sorted()
        .filter(({ capturedAt }) => capturedAt <= replayTime)
        .at(-1) ?? null
    );
  }

  async readRange(
    range: ReplaySnapshotRange,
  ): Promise<readonly SerializableOptionsSnapshot[]> {
    validateRange(range, this.capacity);
    return this.sorted()
      .filter(
        ({ capturedAt }) =>
          (range.fromInclusive === undefined ||
            capturedAt >= range.fromInclusive) &&
          (range.toInclusive === undefined || capturedAt <= range.toInclusive),
      )
      .slice(-range.limit);
  }

  async write(
    snapshot: SerializableOptionsSnapshot,
  ): Promise<ReplaySnapshotWriteResult> {
    this.snapshots.set(snapshot.snapshotId, snapshot);
    const evictedSnapshotIds: string[] = [];
    for (const oldest of this.sorted().slice(
      0,
      Math.max(0, this.snapshots.size - this.capacity),
    )) {
      this.snapshots.delete(oldest.snapshotId);
      evictedSnapshotIds.push(oldest.snapshotId);
    }
    return {
      stored: snapshot,
      evictedSnapshotIds,
      size: this.snapshots.size,
    };
  }

  async clear(): Promise<void> {
    this.snapshots.clear();
  }

  private sorted(): readonly SerializableOptionsSnapshot[] {
    return [...this.snapshots.values()].sort(compareSnapshots);
  }
}

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed"));
  });

const transactionComplete = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });

export class IndexedDbReplaySnapshotStorage implements BoundedReplaySnapshotStorage {
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(
    readonly capacity = 288,
    private readonly databaseName = "options-chart-replay-v1",
  ) {
    validateCapacity(capacity);
  }

  async count(): Promise<number> {
    const database = await this.open();
    const transaction = database.transaction("snapshots", "readonly");
    return requestResult(transaction.objectStore("snapshots").count());
  }

  async readAtOrBefore(
    replayTime: number,
  ): Promise<SerializableOptionsSnapshot | null> {
    const snapshots = await this.readRange({
      toInclusive: replayTime,
      limit: this.capacity,
    });
    return snapshots.at(-1) ?? null;
  }

  async readRange(
    range: ReplaySnapshotRange,
  ): Promise<readonly SerializableOptionsSnapshot[]> {
    validateRange(range, this.capacity);
    const database = await this.open();
    const transaction = database.transaction("snapshots", "readonly");
    const snapshots = (await requestResult(
      transaction.objectStore("snapshots").getAll(),
    )) as SerializableOptionsSnapshot[];
    return snapshots
      .sort(compareSnapshots)
      .filter(
        ({ capturedAt }) =>
          (range.fromInclusive === undefined ||
            capturedAt >= range.fromInclusive) &&
          (range.toInclusive === undefined || capturedAt <= range.toInclusive),
      )
      .slice(-range.limit);
  }

  async write(
    snapshot: SerializableOptionsSnapshot,
  ): Promise<ReplaySnapshotWriteResult> {
    const database = await this.open();
    const transaction = database.transaction("snapshots", "readwrite");
    const store = transaction.objectStore("snapshots");
    await requestResult(store.put(snapshot));
    const snapshots = (
      (await requestResult(store.getAll())) as SerializableOptionsSnapshot[]
    ).sort(compareSnapshots);
    const evictedSnapshotIds = snapshots
      .slice(0, Math.max(0, snapshots.length - this.capacity))
      .map(({ snapshotId }) => snapshotId);
    for (const snapshotId of evictedSnapshotIds) store.delete(snapshotId);
    await transactionComplete(transaction);
    return {
      stored: snapshot,
      evictedSnapshotIds,
      size: snapshots.length - evictedSnapshotIds.length,
    };
  }

  async clear(): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction("snapshots", "readwrite");
    transaction.objectStore("snapshots").clear();
    await transactionComplete(transaction);
  }

  private open(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    if (typeof indexedDB === "undefined") {
      return Promise.reject(new Error("IndexedDB is unavailable"));
    }
    this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("snapshots")) {
          database.createObjectStore("snapshots", { keyPath: "snapshotId" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error("Unable to open replay storage"));
    });
    return this.databasePromise;
  }
}

export const createReplaySnapshotStorage = (
  capacity = 288,
): BoundedReplaySnapshotStorage =>
  typeof indexedDB === "undefined"
    ? new InMemoryReplaySnapshotStorage(capacity)
    : new IndexedDbReplaySnapshotStorage(capacity);
