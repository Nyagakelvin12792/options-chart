import { parseDecisionAssessment } from "./rules-provider";
import {
  SHADOW_PROVIDER_RUN_SCHEMA_VERSION,
  buildShadowProviderRunRecord,
  type ShadowDecisionProviderPort,
  type ShadowProviderRunRecordV1,
  type ShadowProviderRunStatus,
} from "./shadow-provider-contracts";
import type { DecisionContextV1 } from "./decision-contracts";

export class ShadowProviderError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly status: Extract<
      ShadowProviderRunStatus,
      "provider-error" | "invalid-response"
    > = "provider-error",
  ) {
    super(message);
    this.name = "ShadowProviderError";
  }
}

export interface ShadowProviderRunOptions {
  readonly enabled?: boolean;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly now?: () => number;
  readonly isContextCurrent?: (contextId: string) => boolean;
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "Shadow provider failed";
}

export async function runShadowProvider(
  context: DecisionContextV1,
  provider: ShadowDecisionProviderPort,
  options: ShadowProviderRunOptions = {},
): Promise<ShadowProviderRunRecordV1> {
  const now = options.now ?? Date.now;
  const startedAtMs = now();
  const finish = (
    status: ShadowProviderRunStatus,
    assessment: ShadowProviderRunRecordV1["assessment"],
    errorCode: string | null,
    errorMessage: string | null,
    warnings: readonly string[] = [],
  ): ShadowProviderRunRecordV1 => {
    const completedAtMs = Math.max(startedAtMs, now());
    return buildShadowProviderRunRecord({
      schemaVersion: SHADOW_PROVIDER_RUN_SCHEMA_VERSION,
      contextId: context.contextId,
      provider: provider.provider,
      providerVersion: provider.providerVersion,
      startedAtMs,
      completedAtMs,
      latencyMs: completedAtMs - startedAtMs,
      status,
      assessment,
      errorCode,
      errorMessage,
      warnings: [...new Set(warnings)].sort(),
    });
  };

  if (options.enabled !== true) {
    return finish(
      "disabled",
      null,
      "PROVIDER_DISABLED",
      "Shadow provider is disabled",
    );
  }

  const timeoutMs = options.timeoutMs ?? 2_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("timeoutMs must be a positive integer");
  }

  const controller = new AbortController();
  let abortReason: "timeout" | "cancelled" | null = null;
  const cancel = (): void => {
    abortReason = "cancelled";
    controller.abort(options.signal?.reason);
  };
  if (options.signal?.aborted) cancel();
  else options.signal?.addEventListener("abort", cancel, { once: true });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancelled = new Promise<never>((_, reject) => {
    const rejectCancelled = (): void => {
      reject(
        new ShadowProviderError(
          abortReason === "timeout" ? "PROVIDER_TIMEOUT" : "PROVIDER_CANCELLED",
          abortReason === "timeout"
            ? "Shadow provider timed out"
            : "Shadow provider was cancelled",
        ),
      );
    };
    if (controller.signal.aborted) rejectCancelled();
    else
      controller.signal.addEventListener("abort", rejectCancelled, {
        once: true,
      });
  });
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      abortReason = "timeout";
      controller.abort(new Error("provider timeout"));
      reject(
        new ShadowProviderError(
          "PROVIDER_TIMEOUT",
          "Shadow provider timed out",
        ),
      );
    }, timeoutMs);
  });

  try {
    const assessment = await Promise.race([
      provider.assess(context, controller.signal),
      cancelled,
      timeout,
    ]);
    const validated = parseDecisionAssessment(assessment);
    if (validated.contextId !== context.contextId) {
      throw new ShadowProviderError(
        "PROVIDER_CONTEXT_MISMATCH",
        "Provider assessment does not match the requested context",
        "invalid-response",
      );
    }
    if (validated.provider !== provider.provider) {
      throw new ShadowProviderError(
        "PROVIDER_IDENTITY_MISMATCH",
        "Provider assessment identity does not match the adapter",
        "invalid-response",
      );
    }
    if (options.isContextCurrent?.(context.contextId) === false) {
      return finish(
        "stale",
        null,
        "PROVIDER_RESULT_STALE",
        "Provider result was superseded by a newer context",
      );
    }
    return finish("success", validated, null, null);
  } catch (error) {
    const status: ShadowProviderRunStatus =
      abortReason === "timeout"
        ? "timeout"
        : abortReason === "cancelled"
          ? "cancelled"
          : error instanceof ShadowProviderError
            ? error.status
            : "provider-error";
    const code =
      abortReason === "timeout"
        ? "PROVIDER_TIMEOUT"
        : abortReason === "cancelled"
          ? "PROVIDER_CANCELLED"
          : error instanceof ShadowProviderError
            ? error.code
            : "PROVIDER_ERROR";
    return finish(status, null, code, messageOf(error));
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
  }
}
