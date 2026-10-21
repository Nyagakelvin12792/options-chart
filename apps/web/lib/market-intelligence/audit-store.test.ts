import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  SHADOW_PROVIDER_RUN_SCHEMA_VERSION,
  buildShadowProviderRunRecord,
} from "@options-chart/decision-engine";
import { describe, expect, it } from "vitest";

import { NdjsonJevAuditStore } from "./audit-store";

function runRecord(contextId: string, startedAtMs: number) {
  return buildShadowProviderRunRecord({
    schemaVersion: SHADOW_PROVIDER_RUN_SCHEMA_VERSION,
    contextId,
    provider: "jev-v1",
    providerVersion: "jev-latest",
    startedAtMs,
    completedAtMs: startedAtMs + 5,
    latencyMs: 5,
    status: "provider-error",
    assessment: null,
    errorCode: "JEV_TEST_ERROR",
    errorMessage: "Recorded test failure",
    warnings: [],
  });
}

describe("NDJSON Jev audit store", () => {
  it("durably appends validated records and deduplicates identical IDs", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "jev-audit-"));
    const store = new NdjsonJevAuditStore(directory);
    const record = runRecord("context-1", 10_000);
    await store.append(record);
    await store.append(record);

    expect(await store.countProviderRunsSince("jev-v1", 0)).toBe(1);
    expect(
      await store.findSuccessfulRun("context-1", "jev-v1", "jev-latest"),
    ).toBeNull();
    const content = await readFile(
      path.join(directory, "provider-runs.ndjson"),
      "utf8",
    );
    expect(content.trim().split(/\r?\n/u)).toHaveLength(1);
  });

  it("fails closed when persistent audit data is corrupt", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "jev-audit-corrupt-"));
    await writeFile(
      path.join(directory, "provider-runs.ndjson"),
      "not-json\n",
      "utf8",
    );
    const store = new NdjsonJevAuditStore(directory);
    await expect(
      store.countProviderRunsSince("jev-v1", 0),
    ).rejects.toMatchObject({ code: "JEV_AUDIT_CORRUPT" });
  });
});
