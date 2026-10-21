import { neon } from "@neondatabase/serverless";
import {
  parseShadowProviderRunRecord,
  type DecisionProvider,
  type ShadowProviderRunRecordV1,
} from "@options-chart/decision-engine";

import {
  JevAuditStoreError,
  type JevAuditStorePort,
  type JevProviderCallReservationRequest,
  type JevProviderCallReservationResult,
} from "./audit-store";

const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;

type QueryRow = Readonly<Record<string, unknown>>;

export interface PostgresQueryClient {
  query(
    statement: string,
    parameters?: readonly unknown[],
  ): Promise<readonly QueryRow[]>;
}

export class PostgresJevAuditStore implements JevAuditStorePort {
  private readonly client: PostgresQueryClient;
  private schemaReady: Promise<void> | null = null;

  public constructor(databaseUrl: string, client?: PostgresQueryClient) {
    if (databaseUrl.trim().length === 0) {
      throw new JevAuditStoreError(
        "JEV_DATABASE_URL_MISSING",
        "Postgres audit storage requires DATABASE_URL",
      );
    }
    if (client !== undefined) {
      this.client = client;
      return;
    }
    const sql = neon(databaseUrl);
    this.client = {
      query: async (statement, parameters = []) =>
        (await sql.query(statement, [...parameters])) as readonly QueryRow[],
    };
  }

  public async reserveProviderCall(
    request: JevProviderCallReservationRequest,
  ): Promise<JevProviderCallReservationResult> {
    await this.ensureSchema();
    let rows: readonly QueryRow[];
    try {
      rows = await this.client.query(
        `
          WITH provider_lock AS MATERIALIZED (
            SELECT pg_advisory_xact_lock(hashtext($1)) AS acquired
          ),
          counts AS MATERIALIZED (
            SELECT
              COUNT(*) FILTER (WHERE started_at_ms >= $3)::integer AS hourly_calls,
              COUNT(*) FILTER (WHERE started_at_ms >= $4)::integer AS daily_calls
            FROM jev_provider_call_reservations_v1
            CROSS JOIN provider_lock
            WHERE provider = $1
          ),
          inserted AS (
            INSERT INTO jev_provider_call_reservations_v1 (
              reservation_id,
              provider,
              started_at_ms
            )
            SELECT $2, $1, $5
            FROM counts
            WHERE hourly_calls < $6 AND daily_calls < $7
            ON CONFLICT (reservation_id) DO NOTHING
            RETURNING reservation_id
          )
          SELECT
            hourly_calls,
            daily_calls,
            EXISTS(SELECT 1 FROM inserted) AS reserved
          FROM counts
        `,
        [
          request.provider,
          request.reservationId,
          request.startedAtMs - HOUR_MS,
          request.startedAtMs - DAY_MS,
          request.startedAtMs,
          request.maxCallsPerHour,
          request.maxCallsPerDay,
        ],
      );
    } catch {
      throw new JevAuditStoreError(
        "JEV_AUDIT_RESERVATION_FAILED",
        "Postgres provider call reservation failed",
      );
    }

    const row = rows[0];
    if (row === undefined) {
      throw new JevAuditStoreError(
        "JEV_AUDIT_RESERVATION_FAILED",
        "Postgres provider call reservation returned no result",
      );
    }
    if (row.reserved === true) {
      return { status: "reserved", reservationId: request.reservationId };
    }
    if (asCount(row.hourly_calls) >= request.maxCallsPerHour) {
      return { status: "hourly-exhausted" };
    }
    if (asCount(row.daily_calls) >= request.maxCallsPerDay) {
      return { status: "daily-exhausted" };
    }
    throw new JevAuditStoreError(
      "JEV_AUDIT_RESERVATION_CONFLICT",
      "Postgres provider call reservation ID already exists",
    );
  }

  public async append(
    record: ShadowProviderRunRecordV1,
    reservationId: string,
  ): Promise<void> {
    await this.ensureSchema();
    const validated = parseShadowProviderRunRecord(record);
    let rows: readonly QueryRow[];
    try {
      rows = await this.client.query(
        `
          WITH matching_reservation AS (
            SELECT reservation_id
            FROM jev_provider_call_reservations_v1
            WHERE reservation_id = $1 AND provider = $4
          ),
          inserted AS (
            INSERT INTO jev_provider_run_records_v1 (
              run_id,
              reservation_id,
              context_id,
              provider,
              provider_version,
              started_at_ms,
              completed_at_ms,
              status,
              record_hash,
              record_json
            )
            SELECT $2, reservation_id, $3, $4, $5, $6, $7, $8, $9, $10::jsonb
            FROM matching_reservation
            ON CONFLICT (run_id) DO NOTHING
            RETURNING record_hash
          )
          SELECT record_hash FROM inserted
          UNION ALL
          SELECT record_hash
          FROM jev_provider_run_records_v1
          WHERE run_id = $2
          LIMIT 1
        `,
        [
          reservationId,
          validated.runId,
          validated.contextId,
          validated.provider,
          validated.providerVersion,
          validated.startedAtMs,
          validated.completedAtMs,
          validated.status,
          validated.recordHash,
          JSON.stringify(validated),
        ],
      );
    } catch {
      throw new JevAuditStoreError(
        "JEV_AUDIT_WRITE_FAILED",
        "Postgres provider audit record could not be written",
      );
    }
    const storedHash = rows[0]?.record_hash;
    if (storedHash === undefined) {
      throw new JevAuditStoreError(
        "JEV_AUDIT_RESERVATION_MISSING",
        "Postgres provider audit record has no matching reservation",
      );
    }
    if (storedHash !== validated.recordHash) {
      throw new JevAuditStoreError(
        "JEV_AUDIT_ID_CONFLICT",
        "Postgres audit run ID already exists with different content",
      );
    }
  }

  public async findSuccessfulRun(
    contextId: string,
    provider: DecisionProvider,
    providerVersion: string,
  ): Promise<ShadowProviderRunRecordV1 | null> {
    await this.ensureSchema();
    let rows: readonly QueryRow[];
    try {
      rows = await this.client.query(
        `
          SELECT record_json
          FROM jev_provider_run_records_v1
          WHERE context_id = $1
            AND provider = $2
            AND provider_version = $3
            AND status = 'success'
          ORDER BY completed_at_ms DESC
          LIMIT 1
        `,
        [contextId, provider, providerVersion],
      );
    } catch {
      throw new JevAuditStoreError(
        "JEV_AUDIT_READ_FAILED",
        "Postgres provider audit records could not be read",
      );
    }
    const raw = rows[0]?.record_json;
    if (raw === undefined) return null;
    try {
      return parseShadowProviderRunRecord(
        typeof raw === "string" ? JSON.parse(raw) : raw,
      );
    } catch {
      throw new JevAuditStoreError(
        "JEV_AUDIT_CORRUPT",
        "Postgres provider audit storage contains an invalid record",
      );
    }
  }

  public async countProviderRunsSince(
    provider: DecisionProvider,
    sinceMs: number,
  ): Promise<number> {
    await this.ensureSchema();
    let rows: readonly QueryRow[];
    try {
      rows = await this.client.query(
        `
          SELECT COUNT(*)::integer AS run_count
          FROM jev_provider_run_records_v1
          WHERE provider = $1 AND started_at_ms >= $2
        `,
        [provider, sinceMs],
      );
    } catch {
      throw new JevAuditStoreError(
        "JEV_AUDIT_READ_FAILED",
        "Postgres provider audit records could not be counted",
      );
    }
    return asCount(rows[0]?.run_count);
  }

  private ensureSchema(): Promise<void> {
    this.schemaReady ??= this.createSchema();
    return this.schemaReady;
  }

  private async createSchema(): Promise<void> {
    try {
      await this.client.query(`
        CREATE TABLE IF NOT EXISTS jev_provider_call_reservations_v1 (
          reservation_id text PRIMARY KEY,
          provider text NOT NULL,
          started_at_ms bigint NOT NULL CHECK (started_at_ms >= 0)
        )
      `);
      await this.client.query(`
        CREATE INDEX IF NOT EXISTS jev_provider_call_reservations_budget_v1
        ON jev_provider_call_reservations_v1 (provider, started_at_ms DESC)
      `);
      await this.client.query(`
        CREATE TABLE IF NOT EXISTS jev_provider_run_records_v1 (
          run_id text PRIMARY KEY,
          reservation_id text NOT NULL UNIQUE
            REFERENCES jev_provider_call_reservations_v1 (reservation_id),
          context_id text NOT NULL,
          provider text NOT NULL,
          provider_version text NOT NULL,
          started_at_ms bigint NOT NULL CHECK (started_at_ms >= 0),
          completed_at_ms bigint NOT NULL CHECK (completed_at_ms >= started_at_ms),
          status text NOT NULL,
          record_hash text NOT NULL,
          record_json jsonb NOT NULL
        )
      `);
      await this.client.query(`
        CREATE INDEX IF NOT EXISTS jev_provider_run_records_reuse_v1
        ON jev_provider_run_records_v1 (
          context_id,
          provider,
          provider_version,
          completed_at_ms DESC
        )
        WHERE status = 'success'
      `);
    } catch {
      throw new JevAuditStoreError(
        "JEV_AUDIT_SCHEMA_FAILED",
        "Postgres provider audit schema is unavailable",
      );
    }
  }
}

function asCount(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new JevAuditStoreError(
      "JEV_AUDIT_CORRUPT",
      "Postgres provider audit count is invalid",
    );
  }
  return parsed;
}
