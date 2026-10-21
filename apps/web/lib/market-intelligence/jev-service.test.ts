import type {
  DecisionProvider,
  ShadowProviderRunRecordV1,
} from "@options-chart/decision-engine";
import { describe, expect, it, vi } from "vitest";

import type {
  JevAuditStorePort,
  JevProviderCallReservationRequest,
  JevProviderCallReservationResult,
} from "./audit-store";
import { readJevServerConfig } from "./config";
import { JevShadowServiceError, runJevShadowAssessment } from "./jev-service";
import { testDecisionContext } from "./test-support";

class MemoryAuditStore implements JevAuditStorePort {
  public readonly records: ShadowProviderRunRecordV1[] = [];
  public readonly reservations: JevProviderCallReservationRequest[] = [];
  public failAppend = false;

  public async append(
    record: ShadowProviderRunRecordV1,
    reservationId: string,
  ): Promise<void> {
    if (this.failAppend) throw new Error("disk unavailable");
    if (
      !this.reservations.some(
        (reservation) => reservation.reservationId === reservationId,
      )
    ) {
      throw new Error("reservation unavailable");
    }
    this.records.push(record);
  }

  public async reserveProviderCall(
    request: JevProviderCallReservationRequest,
  ): Promise<JevProviderCallReservationResult> {
    const hourly = this.reservations.filter(
      (reservation) =>
        reservation.provider === request.provider &&
        reservation.startedAtMs >= request.startedAtMs - 60 * 60 * 1_000,
    ).length;
    const daily = this.reservations.filter(
      (reservation) =>
        reservation.provider === request.provider &&
        reservation.startedAtMs >= request.startedAtMs - 24 * 60 * 60 * 1_000,
    ).length;
    if (hourly >= request.maxCallsPerHour) {
      return { status: "hourly-exhausted" };
    }
    if (daily >= request.maxCallsPerDay) {
      return { status: "daily-exhausted" };
    }
    this.reservations.push(request);
    return { status: "reserved", reservationId: request.reservationId };
  }

  public async findSuccessfulRun(
    contextId: string,
    provider: DecisionProvider,
    providerVersion: string,
  ): Promise<ShadowProviderRunRecordV1 | null> {
    return (
      this.records.find(
        (record) =>
          record.contextId === contextId &&
          record.provider === provider &&
          record.providerVersion === providerVersion &&
          record.status === "success",
      ) ?? null
    );
  }

  public async countProviderRunsSince(
    provider: DecisionProvider,
    sinceMs: number,
  ): Promise<number> {
    return this.records.filter(
      (record) => record.provider === provider && record.startedAtMs >= sinceMs,
    ).length;
  }
}

function readyConfig(
  overrides: Readonly<Record<string, string | undefined>> = {},
) {
  return readJevServerConfig({
    JEV_SHADOW_ENABLED: "true",
    JEV_KILL_SWITCH: "false",
    TYPESAFE_API_KEY: "test-secret",
    ...overrides,
  });
}

function successfulFetch() {
  return vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          model: "jev-1.14.0",
          answers: {
            decision: {
              type: "choice",
              choice: "confirm-long",
              confidence: 0.8,
              probabilities: {
                "no-trade": 0.05,
                "watch-long": 0.1,
                "watch-short": 0.01,
                "confirm-long": 0.8,
                "confirm-short": 0.01,
                "insufficient-data": 0.03,
              },
            },
          },
          usage: { input_tokens: 250, output_tokens: 12 },
        }),
        { status: 200 },
      ),
  );
}

describe("Jev server shadow service", () => {
  it("persists a validated assessment and reuses it for an identical context", async () => {
    const store = new MemoryAuditStore();
    const fetchImpl = successfulFetch();
    const context = testDecisionContext();
    const dependencies = {
      config: readyConfig(),
      store,
      fetchImpl: fetchImpl as typeof fetch,
      now: () => 1_700_000_100_000,
    };

    const first = await runJevShadowAssessment(context, dependencies);
    const second = await runJevShadowAssessment(context, dependencies);
    expect(first.record.status).toBe("success");
    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(store.records).toHaveLength(1);
  });

  it("coalesces concurrent requests for the same immutable context", async () => {
    const store = new MemoryAuditStore();
    const fetchImpl = successfulFetch();
    const context = testDecisionContext("concurrent-context");
    const dependencies = {
      config: readyConfig(),
      store,
      fetchImpl: fetchImpl as typeof fetch,
      now: () => 1_700_000_100_000,
    };
    const [left, right] = await Promise.all([
      runJevShadowAssessment(context, dependencies),
      runJevShadowAssessment(context, dependencies),
    ]);
    expect(left.record.runId).toBe(right.record.runId);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("enforces the persistent hourly request budget", async () => {
    const store = new MemoryAuditStore();
    const fetchImpl = successfulFetch();
    const dependencies = {
      config: readyConfig({
        JEV_MAX_CALLS_PER_HOUR: "1",
        JEV_MAX_CALLS_PER_DAY: "2",
      }),
      store,
      fetchImpl: fetchImpl as typeof fetch,
      now: () => 1_700_000_100_000,
    };
    await runJevShadowAssessment(testDecisionContext("budget-1"), dependencies);
    await expect(
      runJevShadowAssessment(testDecisionContext("budget-2"), dependencies),
    ).rejects.toMatchObject({ code: "JEV_HOURLY_BUDGET_EXHAUSTED" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("discards results that cannot be persisted", async () => {
    const store = new MemoryAuditStore();
    store.failAppend = true;
    await expect(
      runJevShadowAssessment(testDecisionContext("audit-fail"), {
        config: readyConfig(),
        store,
        fetchImpl: successfulFetch() as typeof fetch,
        now: () => 1_700_000_100_000,
      }),
    ).rejects.toBeInstanceOf(JevShadowServiceError);
    await expect(
      runJevShadowAssessment(testDecisionContext("audit-fail-again"), {
        config: readyConfig(),
        store,
        fetchImpl: successfulFetch() as typeof fetch,
        now: () => 1_700_000_100_000,
      }),
    ).rejects.toMatchObject({ code: "JEV_AUDIT_PERSIST_FAILED" });
  });
});
