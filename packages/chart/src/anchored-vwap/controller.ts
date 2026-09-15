import type {
  AnchoredVwapInput,
  AnchoredVwapPresentationOptions,
  AnchoredVwapRenderInput,
  AnchoredVwapResult,
} from "./types";
import { calculateAnchoredVwap } from "./calculate";
import { buildAnchoredVwapCacheKey, AnchoredVwapCache } from "./cache";

export interface AnchoredVwapControllerOptions {
  readonly vwapId: string;
  readonly debounceMs?: number | undefined;
  readonly maxDelayMs?: number | undefined;
  readonly cacheCapacity?: number | undefined;
  readonly onRender: (renderInput: AnchoredVwapRenderInput) => void;
  readonly presentation?: AnchoredVwapPresentationOptions | undefined;
}

export class AnchoredVwapController {
  readonly vwapId: string;
  private readonly debounceMs: number;
  private readonly maxDelayMs: number;
  private readonly onRender: (renderInput: AnchoredVwapRenderInput) => void;
  private readonly cache: AnchoredVwapCache;

  private currentInput: AnchoredVwapInput | null = null;
  private currentResult: AnchoredVwapResult | null = null;
  private presentationOptions: AnchoredVwapPresentationOptions;

  private currentGeneration = 0;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private maxDelayTimer: ReturnType<typeof setTimeout> | null = null;
  private isDisposed = false;

  constructor(options: AnchoredVwapControllerOptions) {
    this.vwapId = options.vwapId;
    this.debounceMs = options.debounceMs ?? 100;
    this.maxDelayMs = options.maxDelayMs ?? 300;
    this.onRender = options.onRender;
    this.cache = new AnchoredVwapCache(options.cacheCapacity ?? 50);
    this.presentationOptions = options.presentation ?? {};
  }

  setInput(input: AnchoredVwapInput, immediate = false): void {
    if (this.isDisposed) return;

    this.currentInput = input;
    const generation = ++this.currentGeneration;

    const cacheKey = buildAnchoredVwapCacheKey(input);
    const cachedResult = this.cache.get(cacheKey);

    if (cachedResult) {
      this.clearTimers();
      this.currentResult = cachedResult;
      this.emitRender(cachedResult);
      return;
    }

    if (immediate) {
      this.clearTimers();
      this.executeCalculation(input, generation, cacheKey);
      return;
    }

    if (!this.maxDelayTimer) {
      this.maxDelayTimer = setTimeout(() => {
        this.maxDelayTimer = null;
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
          this.debounceTimer = null;
        }
        if (this.currentInput && !this.isDisposed) {
          this.executeCalculation(
            this.currentInput,
            this.currentGeneration,
            buildAnchoredVwapCacheKey(this.currentInput),
          );
        }
      }, this.maxDelayMs);
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      if (this.maxDelayTimer) {
        clearTimeout(this.maxDelayTimer);
        this.maxDelayTimer = null;
      }
      if (this.currentInput && !this.isDisposed) {
        this.executeCalculation(
          this.currentInput,
          this.currentGeneration,
          buildAnchoredVwapCacheKey(this.currentInput),
        );
      }
    }, this.debounceMs);
  }

  setAnchorTimestamp(anchorTimestamp: number, immediate = false): void {
    if (this.isDisposed || !this.currentInput) return;
    this.setInput(
      {
        ...this.currentInput,
        anchorTimestamp,
      },
      immediate,
    );
  }

  setReplayCutoff(replayCutoff: number | undefined, immediate = false): void {
    if (this.isDisposed || !this.currentInput) return;
    this.setInput(
      {
        ...this.currentInput,
        replayCutoff,
      },
      immediate,
    );
  }

  setPresentation(presentation: AnchoredVwapPresentationOptions): void {
    if (this.isDisposed) return;
    this.presentationOptions = { ...this.presentationOptions, ...presentation };
    if (this.currentResult) {
      this.emitRender(this.currentResult);
    }
  }

  getCurrentResult(): AnchoredVwapResult | null {
    return this.currentResult;
  }

  getCurrentGeneration(): number {
    return this.currentGeneration;
  }

  private executeCalculation(
    input: AnchoredVwapInput,
    generation: number,
    cacheKey: string,
  ): void {
    if (this.isDisposed || generation !== this.currentGeneration) {
      return;
    }

    const result = calculateAnchoredVwap(input);

    if (this.isDisposed || generation !== this.currentGeneration) {
      return;
    }

    this.cache.set(cacheKey, result);
    this.currentResult = result;
    this.emitRender(result);
  }

  private emitRender(result: AnchoredVwapResult): void {
    if (this.isDisposed) return;
    this.onRender({
      vwapId: this.vwapId,
      result,
      presentation: this.presentationOptions,
    });
  }

  private clearTimers(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.maxDelayTimer) {
      clearTimeout(this.maxDelayTimer);
      this.maxDelayTimer = null;
    }
  }

  dispose(): void {
    this.isDisposed = true;
    this.currentGeneration += 1;
    this.clearTimers();
    this.cache.clear();
    this.currentInput = null;
    this.currentResult = null;
  }
}
