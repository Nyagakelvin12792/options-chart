import {
  NarrationDraftV1Schema,
  buildNarrationOutput,
  type NarrationInputV1,
  type NarrationOutputV1,
  type NarrationProviderPort,
} from "./narration-contracts";

export type NarrationRunStatus =
  | "success"
  | "cache-hit"
  | "disabled"
  | "timeout"
  | "cancelled"
  | "stale"
  | "provider-error"
  | "invalid-response";

export interface NarrationRunResult {
  readonly status: NarrationRunStatus;
  readonly output: NarrationOutputV1 | null;
  readonly errorCode: string | null;
}

export interface NarrationRunOptions {
  readonly enabled?: boolean;
  readonly force?: boolean;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly now?: () => number;
}

export class NarrationCoordinator {
  private readonly cache = new Map<string, NarrationOutputV1>();
  private generation = 0;
  private activeController: AbortController | null = null;

  public invalidate(): void {
    this.generation += 1;
    this.activeController?.abort(new Error("narration superseded"));
  }

  public getCached(
    inputId: string,
    provider: NarrationProviderPort,
  ): NarrationOutputV1 | null {
    return this.cache.get(this.cacheKey(inputId, provider)) ?? null;
  }

  public async run(
    input: NarrationInputV1,
    provider: NarrationProviderPort,
    options: NarrationRunOptions = {},
  ): Promise<NarrationRunResult> {
    if (options.enabled !== true) {
      return {
        status: "disabled",
        output: null,
        errorCode: "NARRATOR_DISABLED",
      };
    }
    const cacheKey = this.cacheKey(input.inputId, provider);
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined && options.force !== true) {
      return { status: "cache-hit", output: cached, errorCode: null };
    }

    const timeoutMs = options.timeoutMs ?? 5_000;
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new RangeError("timeoutMs must be a positive integer");
    }
    const now = options.now ?? Date.now;
    this.activeController?.abort(new Error("narration superseded"));
    const generation = ++this.generation;
    const controller = new AbortController();
    this.activeController = controller;
    let abortReason: "timeout" | "cancelled" | null = null;
    const cancel = (): void => {
      abortReason = "cancelled";
      controller.abort(options.signal?.reason);
    };
    if (options.signal?.aborted) cancel();
    else options.signal?.addEventListener("abort", cancel, { once: true });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const aborted = new Promise<never>((_, reject) => {
      const fail = (): void => reject(new Error("narration aborted"));
      if (controller.signal.aborted) fail();
      else controller.signal.addEventListener("abort", fail, { once: true });
    });
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        abortReason = "timeout";
        controller.abort(new Error("narration timeout"));
        reject(new Error("narration timeout"));
      }, timeoutMs);
    });

    try {
      const rawDraft = await Promise.race([
        provider.narrate(input, controller.signal),
        aborted,
        timeout,
      ]);
      const parsed = NarrationDraftV1Schema.safeParse(rawDraft);
      if (!parsed.success) {
        return {
          status: "invalid-response",
          output: null,
          errorCode: "NARRATOR_SCHEMA_INVALID",
        };
      }
      if (generation !== this.generation) {
        return {
          status: "stale",
          output: null,
          errorCode: "NARRATOR_RESULT_STALE",
        };
      }
      const output = buildNarrationOutput({
        schemaVersion: "narration-output-v1",
        inputId: input.inputId,
        provider: provider.provider,
        model: provider.model,
        promptVersion: provider.promptVersion,
        generatedAtMs: now(),
        sourceEffectiveAtMs: input.effectiveAtMs,
        draft: parsed.data,
      });
      this.cache.set(cacheKey, output);
      return { status: "success", output, errorCode: null };
    } catch {
      if (generation !== this.generation) {
        return {
          status: "stale",
          output: null,
          errorCode: "NARRATOR_RESULT_STALE",
        };
      }
      if (abortReason === "timeout") {
        return {
          status: "timeout",
          output: null,
          errorCode: "NARRATOR_TIMEOUT",
        };
      }
      if (abortReason === "cancelled") {
        return {
          status: "cancelled",
          output: null,
          errorCode: "NARRATOR_CANCELLED",
        };
      }
      return {
        status: "provider-error",
        output: null,
        errorCode: "NARRATOR_PROVIDER_ERROR",
      };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
      if (this.activeController === controller) this.activeController = null;
    }
  }

  private cacheKey(inputId: string, provider: NarrationProviderPort): string {
    return [
      inputId,
      provider.provider,
      provider.model,
      provider.promptVersion,
    ].join(":");
  }
}
