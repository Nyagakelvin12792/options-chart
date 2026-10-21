import {
  JevDecisionProvider,
  parseDecisionContext,
  runShadowProvider,
  type DecisionContextV1,
  type ShadowProviderRunRecordV1,
} from "@options-chart/decision-engine";

import type { JevAuditStorePort } from "./audit-store";
import { assertJevServerReady, type JevServerConfig } from "./config";

const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;
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
  const key = [
    dependencies.config.auditDirectory,
    dependencies.config.model,
    validatedContext.contextId,
  ].join(":");
  const existing = activeRuns.get(key);
  if (existing !== undefined) return existing;

  const task = serializedProviderRun(
    [dependencies.config.auditDirectory, dependencies.config.model].join(":"),
    () => execute(validatedContext, dependencies, options),
  );
  activeRuns.set(key, task);
  try {
    return await task;
  } finally {
    if (activeRuns.get(key) === task) activeRuns.delete(key);
  }
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
  const [hourlyCalls, dailyCalls] = await Promise.all([
    dependencies.store.countProviderRunsSince(
      provider.provider,
      currentTime - HOUR_MS,
    ),
    dependencies.store.countProviderRunsSince(
      provider.provider,
      currentTime - DAY_MS,
    ),
  ]);
  if (hourlyCalls >= dependencies.config.maxCallsPerHour) {
    throw new JevShadowServiceError(
      "JEV_HOURLY_BUDGET_EXHAUSTED",
      429,
      "Jev hourly request budget is exhausted",
    );
  }
  if (dailyCalls >= dependencies.config.maxCallsPerDay) {
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
    await dependencies.store.append(record);
  } catch {
    throw new JevShadowServiceError(
      "JEV_AUDIT_PERSIST_FAILED",
      503,
      "Jev result was discarded because its audit record could not be persisted",
    );
  }
  return { record, reused: false };
}
