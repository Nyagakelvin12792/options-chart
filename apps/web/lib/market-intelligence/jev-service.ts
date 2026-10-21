import { createHash, randomUUID } from "node:crypto";

import {
  JevDecisionProvider,
  parseDecisionContext,
  runShadowProvider,
  type DecisionContextV1,
  type ShadowProviderRunRecordV1,
} from "@options-chart/decision-engine";

import type { JevAuditStorePort } from "./audit-store";
import { assertJevServerReady, type JevServerConfig } from "./config";

const activeRuns = new Map<
  string,
  Promise<{
    readonly record: ShadowProviderRunRecordV1;
    readonly reused: boolean;
  }>
>();
const providerQueues = new Map<string, Promise<void>>();

export class JevShadowServiceError extends Error {
  public constructor(
    public readonly code: string,
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = "JevShadowServiceError";
  }
}

export interface JevShadowServiceDependencies {
  readonly config: JevServerConfig;
  readonly store: JevAuditStorePort;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
}

export interface JevShadowServiceOptions {
  readonly signal?: AbortSignal;
}

export interface JevShadowServiceResult {
  readonly record: ShadowProviderRunRecordV1;
  readonly reused: boolean;
}

export async function runJevShadowAssessment(
  context: DecisionContextV1,
  dependencies: JevShadowServiceDependencies,
  options: JevShadowServiceOptions = {},
): Promise<JevShadowServiceResult> {
  const validatedContext = parseDecisionContext(context);
  const storeKey = persistenceKey(dependencies.config);
  const key = [
    storeKey,
    dependencies.config.model,
    validatedContext.contextId,
  ].join(":");
  const existing = activeRuns.get(key);
  if (existing !== undefined) return existing;

  const task = serializedProviderRun(
    [storeKey, dependencies.config.model].join(":"),
    () => execute(validatedContext, dependencies, options),
  );
  activeRuns.set(key, task);
  try {
    return await task;
  } finally {
    if (activeRuns.get(key) === task) activeRuns.delete(key);
  }
}

function persistenceKey(config: JevServerConfig): string {
  if (config.auditStore === "filesystem") {
    return `filesystem:${config.auditDirectory}`;
  }
  const databaseIdentity = createHash("sha256")
    .update(config.databaseUrl ?? "missing")
    .digest("hex");
  return `postgres:${databaseIdentity}`;
}

function serializedProviderRun<T>(
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = providerQueues.get(key) ?? Promise.resolve();
  const result = previous.then(operation, operation);
  const queued = result.then(
    () => undefined,
    () => undefined,
  );
  providerQueues.set(key, queued);
  void queued.finally(() => {
    if (providerQueues.get(key) === queued) providerQueues.delete(key);
  });
  return result;
}

async function execute(
  context: DecisionContextV1,
  dependencies: JevShadowServiceDependencies,
  options: JevShadowServiceOptions,
): Promise<JevShadowServiceResult> {
  const apiKey = assertJevServerReady(dependencies.config);
  const provider = new JevDecisionProvider({
    apiKey,
    model: dependencies.config.model,
    ...(dependencies.fetchImpl ? { fetchImpl: dependencies.fetchImpl } : {}),
    ...(dependencies.now ? { now: dependencies.now } : {}),
  });
  const reusable = await dependencies.store.findSuccessfulRun(
    context.contextId,
    provider.provider,
    provider.providerVersion,
  );
  if (reusable !== null) return { record: reusable, reused: true };

  const now = dependencies.now ?? Date.now;
  const currentTime = now();
  let reservation;
  try {
    reservation = await dependencies.store.reserveProviderCall({
      reservationId: randomUUID(),
      provider: provider.provider,
      startedAtMs: currentTime,
      maxCallsPerHour: dependencies.config.maxCallsPerHour,
      maxCallsPerDay: dependencies.config.maxCallsPerDay,
    });
  } catch {
    throw new JevShadowServiceError(
      "JEV_AUDIT_RESERVATION_FAILED",
      503,
      "Jev request was blocked because its durable call reservation failed",
    );
  }
  if (reservation.status === "hourly-exhausted") {
    throw new JevShadowServiceError(
      "JEV_HOURLY_BUDGET_EXHAUSTED",
      429,
      "Jev hourly request budget is exhausted",
    );
  }
  if (reservation.status === "daily-exhausted") {
    throw new JevShadowServiceError(
      "JEV_DAILY_BUDGET_EXHAUSTED",
      429,
      "Jev daily request budget is exhausted",
    );
  }

  const record = await runShadowProvider(context, provider, {
    enabled: true,
    timeoutMs: dependencies.config.timeoutMs,
    ...(options.signal ? { signal: options.signal } : {}),
    ...(dependencies.now ? { now: dependencies.now } : {}),
  });
  try {
    await dependencies.store.append(record, reservation.reservationId);
  } catch {
    throw new JevShadowServiceError(
      "JEV_AUDIT_PERSIST_FAILED",
      503,
      "Jev result was discarded because its audit record could not be persisted",
    );
  }
  return { record, reused: false };
}
