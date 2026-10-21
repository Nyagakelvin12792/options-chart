import { mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";

import {
  DecisionProviderSchema,
  parseShadowProviderRunRecord,
  type DecisionProvider,
  type ShadowProviderRunRecordV1,
} from "@options-chart/decision-engine";

const AUDIT_FILENAME = "provider-runs.ndjson";
const RESERVATION_FILENAME = "provider-call-reservations.ndjson";
const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;
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
  append(
    record: ShadowProviderRunRecordV1,
    reservationId: string,
  ): Promise<void>;
  reserveProviderCall(
    request: JevProviderCallReservationRequest,
  ): Promise<JevProviderCallReservationResult>;
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

export interface JevProviderCallReservationRequest {
  readonly reservationId: string;
  readonly provider: DecisionProvider;
  readonly startedAtMs: number;
  readonly maxCallsPerHour: number;
  readonly maxCallsPerDay: number;
}

export type JevProviderCallReservationResult =
  | { readonly status: "reserved"; readonly reservationId: string }
  | { readonly status: "hourly-exhausted" }
  | { readonly status: "daily-exhausted" };

interface StoredReservation {
  readonly schemaVersion: "jev-provider-call-reservation-v1";
  readonly reservationId: string;
  readonly provider: DecisionProvider;
  readonly startedAtMs: number;
}

export class NdjsonJevAuditStore implements JevAuditStorePort {
  private readonly filePath: string;
  private readonly reservationFilePath: string;
  private readonly queueKey: string;

  public constructor(directory: string) {
    const resolvedDirectory = path.resolve(directory);
    this.filePath = path.join(resolvedDirectory, AUDIT_FILENAME);
    this.reservationFilePath = path.join(
      resolvedDirectory,
      RESERVATION_FILENAME,
    );
    this.queueKey = resolvedDirectory;
  }

  public append(
    record: ShadowProviderRunRecordV1,
    reservationId: string,
  ): Promise<void> {
    return this.serialized(async () => {
      const validated = parseShadowProviderRunRecord(record);
      const reservations = await this.readReservations();
      const reservation = reservations.find(
        (item) => item.reservationId === reservationId,
      );
      if (
        reservation === undefined ||
        reservation.provider !== record.provider
      ) {
        throw new JevAuditStoreError(
          "JEV_AUDIT_RESERVATION_MISSING",
          "Provider audit record does not have a matching call reservation",
        );
      }
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

  public reserveProviderCall(
    request: JevProviderCallReservationRequest,
  ): Promise<JevProviderCallReservationResult> {
    return this.serialized(async () => {
      const reservations = await this.readReservations();
      const existing = reservations.find(
        (item) => item.reservationId === request.reservationId,
      );
      if (existing !== undefined) {
        if (
          existing.provider !== request.provider ||
          existing.startedAtMs !== request.startedAtMs
        ) {
          throw new JevAuditStoreError(
            "JEV_AUDIT_RESERVATION_CONFLICT",
            "Provider call reservation ID already exists with different content",
          );
        }
        return { status: "reserved", reservationId: request.reservationId };
      }

      const hourlyCalls = reservations.filter(
        (item) =>
          item.provider === request.provider &&
          item.startedAtMs >= request.startedAtMs - HOUR_MS,
      ).length;
      const dailyCalls = reservations.filter(
        (item) =>
          item.provider === request.provider &&
          item.startedAtMs >= request.startedAtMs - DAY_MS,
      ).length;
      if (hourlyCalls >= request.maxCallsPerHour) {
        return { status: "hourly-exhausted" };
      }
      if (dailyCalls >= request.maxCallsPerDay) {
        return { status: "daily-exhausted" };
      }

      const reservation: StoredReservation = {
        schemaVersion: "jev-provider-call-reservation-v1",
        reservationId: request.reservationId,
        provider: request.provider,
        startedAtMs: request.startedAtMs,
      };
      await mkdir(path.dirname(this.reservationFilePath), { recursive: true });
      const handle = await open(this.reservationFilePath, "a");
      try {
        await handle.writeFile(`${JSON.stringify(reservation)}\n`, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      return { status: "reserved", reservationId: request.reservationId };
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
    const previous = auditFileQueues.get(this.queueKey) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    const queued = result.then(
      () => undefined,
      () => undefined,
    );
    auditFileQueues.set(this.queueKey, queued);
    void queued.finally(() => {
      if (auditFileQueues.get(this.queueKey) === queued) {
        auditFileQueues.delete(this.queueKey);
      }
    });
    return result;
  }

  private async readReservations(): Promise<readonly StoredReservation[]> {
    let content: string;
    try {
      content = await readFile(this.reservationFilePath, "utf8");
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
        "Provider call reservations could not be read",
      );
    }

    try {
      return content
        .split(/\r?\n/u)
        .filter((line) => line.trim().length > 0)
        .map((line) => this.parseReservation(JSON.parse(line)));
    } catch {
      throw new JevAuditStoreError(
        "JEV_AUDIT_CORRUPT",
        "Provider call reservation storage contains an invalid record",
      );
    }
  }

  private parseReservation(raw: unknown): StoredReservation {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new TypeError("Invalid provider call reservation");
    }
    const record = raw as Record<string, unknown>;
    const provider = DecisionProviderSchema.parse(record.provider);
    if (
      record.schemaVersion !== "jev-provider-call-reservation-v1" ||
      typeof record.reservationId !== "string" ||
      record.reservationId.length === 0 ||
      typeof record.startedAtMs !== "number" ||
      !Number.isSafeInteger(record.startedAtMs) ||
      record.startedAtMs < 0 ||
      Object.keys(record).some(
        (key) =>
          ![
            "schemaVersion",
            "reservationId",
            "provider",
            "startedAtMs",
          ].includes(key),
      )
    ) {
      throw new TypeError("Invalid provider call reservation");
    }
    return {
      schemaVersion: "jev-provider-call-reservation-v1",
      reservationId: record.reservationId,
      provider,
      startedAtMs: record.startedAtMs,
    };
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
