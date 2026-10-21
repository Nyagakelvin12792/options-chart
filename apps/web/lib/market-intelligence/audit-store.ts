import { mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";

import {
  parseShadowProviderRunRecord,
  type DecisionProvider,
  type ShadowProviderRunRecordV1,
} from "@options-chart/decision-engine";

const AUDIT_FILENAME = "provider-runs.ndjson";
const auditFileQueues = new Map<string, Promise<void>>();

export class JevAuditStoreError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "JevAuditStoreError";
  }
}

export interface JevAuditStorePort {
  append(record: ShadowProviderRunRecordV1): Promise<void>;
  findSuccessfulRun(
    contextId: string,
    provider: DecisionProvider,
    providerVersion: string,
  ): Promise<ShadowProviderRunRecordV1 | null>;
  countProviderRunsSince(
    provider: DecisionProvider,
    sinceMs: number,
  ): Promise<number>;
}

export class NdjsonJevAuditStore implements JevAuditStorePort {
  private readonly filePath: string;

  public constructor(directory: string) {
    this.filePath = path.join(path.resolve(directory), AUDIT_FILENAME);
  }

  public append(record: ShadowProviderRunRecordV1): Promise<void> {
    return this.serialized(async () => {
      const validated = parseShadowProviderRunRecord(record);
      const records = await this.readRecords();
      const existing = records.find((item) => item.runId === validated.runId);
      if (existing !== undefined) {
        if (existing.recordHash !== validated.recordHash) {
          throw new JevAuditStoreError(
            "JEV_AUDIT_ID_CONFLICT",
            "Audit run ID already exists with different content",
          );
        }
        return;
      }
      await mkdir(path.dirname(this.filePath), { recursive: true });
      const handle = await open(this.filePath, "a");
      try {
        await handle.writeFile(`${JSON.stringify(validated)}\n`, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
    });
  }

  public findSuccessfulRun(
    contextId: string,
    provider: DecisionProvider,
    providerVersion: string,
  ): Promise<ShadowProviderRunRecordV1 | null> {
    return this.serialized(async () => {
      const records = await this.readRecords();
      return (
        records
          .filter(
            (record) =>
              record.contextId === contextId &&
              record.provider === provider &&
              record.providerVersion === providerVersion &&
              record.status === "success",
          )
          .sort((left, right) => right.completedAtMs - left.completedAtMs)[0] ??
        null
      );
    });
  }

  public countProviderRunsSince(
    provider: DecisionProvider,
    sinceMs: number,
  ): Promise<number> {
    return this.serialized(async () => {
      const records = await this.readRecords();
      return records.filter(
        (record) =>
          record.provider === provider && record.startedAtMs >= sinceMs,
      ).length;
    });
  }

  private serialized<T>(operation: () => Promise<T>): Promise<T> {
    const previous = auditFileQueues.get(this.filePath) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    const queued = result.then(
      () => undefined,
      () => undefined,
    );
    auditFileQueues.set(this.filePath, queued);
    void queued.finally(() => {
      if (auditFileQueues.get(this.filePath) === queued) {
        auditFileQueues.delete(this.filePath);
      }
    });
    return result;
  }

  private async readRecords(): Promise<readonly ShadowProviderRunRecordV1[]> {
    let content: string;
    try {
      content = await readFile(this.filePath, "utf8");
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return [];
      }
      throw new JevAuditStoreError(
        "JEV_AUDIT_READ_FAILED",
        "Provider audit records could not be read",
      );
    }

    try {
      return content
        .split(/\r?\n/u)
        .filter((line) => line.trim().length > 0)
        .map((line) => parseShadowProviderRunRecord(JSON.parse(line)));
    } catch {
      throw new JevAuditStoreError(
        "JEV_AUDIT_CORRUPT",
        "Provider audit storage contains an invalid record",
      );
    }
  }
}
