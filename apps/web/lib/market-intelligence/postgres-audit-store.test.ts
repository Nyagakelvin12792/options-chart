import {
  SHADOW_PROVIDER_RUN_SCHEMA_VERSION,
  buildShadowProviderRunRecord,
} from "@options-chart/decision-engine";
import { describe, expect, it, vi } from "vitest";

import {
  PostgresJevAuditStore,
  type PostgresQueryClient,
} from "./postgres-audit-store";

function runRecord() {
  return buildShadowProviderRunRecord({
    schemaVersion: SHADOW_PROVIDER_RUN_SCHEMA_VERSION,
    contextId: "postgres-context",
    provider: "jev-v1",
    providerVersion: "jev-latest",
    startedAtMs: 10_000,
    completedAtMs: 10_005,
    latencyMs: 5,
    status: "provider-error",
    assessment: null,
    errorCode: "JEV_TEST_ERROR",
    errorMessage: "Recorded test failure",
    warnings: [],
  });
}

function clientWithResults(...results: readonly unknown[][]) {
  const query = vi.fn();
  for (const result of results) query.mockResolvedValueOnce(result);
  return { client: { query } as PostgresQueryClient, query };
}

const schemaResults: unknown[][] = [[], [], [], []];

describe("Postgres Jev audit store", () => {
  it("atomically reserves a bounded provider call", async () => {
    const { client, query } = clientWithResults(...schemaResults, [
      { hourly_calls: 0, daily_calls: 0, reserved: true },
    ]);
    const store = new PostgresJevAuditStore(
      "postgresql://not-used.example/jev",
      client,
    );
    await expect(
      store.reserveProviderCall({
        reservationId: "reservation-1",
        provider: "jev-v1",
        startedAtMs: 10_000,
        maxCallsPerHour: 1,
        maxCallsPerDay: 1,
      }),
    ).resolves.toEqual({
      status: "reserved",
      reservationId: "reservation-1",
    });
    expect(query).toHaveBeenCalledTimes(5);
    expect(query.mock.calls[4]?.[1]).toEqual([
      "jev-v1",
      "reservation-1",
      10_000 - 60 * 60 * 1_000,
      10_000 - 24 * 60 * 60 * 1_000,
      10_000,
      1,
      1,
    ]);
  });

  it("reports an exhausted hourly budget without reserving", async () => {
    const { client } = clientWithResults(...schemaResults, [
      { hourly_calls: 1, daily_calls: 1, reserved: false },
    ]);
    const store = new PostgresJevAuditStore(
      "postgresql://not-used.example/jev",
      client,
    );
    await expect(
      store.reserveProviderCall({
        reservationId: "reservation-2",
        provider: "jev-v1",
        startedAtMs: 20_000,
        maxCallsPerHour: 1,
        maxCallsPerDay: 2,
      }),
    ).resolves.toEqual({ status: "hourly-exhausted" });
  });

  it("persists and reads a content-validated immutable record", async () => {
    const record = runRecord();
    const { client, query } = clientWithResults(
      ...schemaResults,
      [{ record_hash: record.recordHash }],
      [{ record_json: record }],
      [{ run_count: 1 }],
    );
    const store = new PostgresJevAuditStore(
      "postgresql://not-used.example/jev",
      client,
    );
    await store.append(record, "reservation-1");
    await expect(
      store.findSuccessfulRun(
        record.contextId,
        record.provider,
        record.providerVersion,
      ),
    ).resolves.toEqual(record);
    await expect(store.countProviderRunsSince("jev-v1", 0)).resolves.toBe(1);
    const serializedParameters = JSON.stringify(
      query.mock.calls.flatMap((call) => call[1] ?? []),
    );
    expect(serializedParameters).not.toContain("not-used.example");
  });

  it("fails closed when a stored record does not validate", async () => {
    const { client } = clientWithResults(...schemaResults, [
      { record_json: { runId: "invalid" } },
    ]);
    const store = new PostgresJevAuditStore(
      "postgresql://not-used.example/jev",
      client,
    );
    await expect(
      store.findSuccessfulRun("context", "jev-v1", "jev-latest"),
    ).rejects.toMatchObject({ code: "JEV_AUDIT_CORRUPT" });
  });
});
