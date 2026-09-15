import type {
  VolumeProfileInput,
  VolumeProfilePresentationOptions,
  VolumeProfileRenderInput,
  VolumeProfileResult,
} from "./types";
import { calculateVolumeProfile } from "./calculate";
import { buildVolumeProfileCacheKey, VolumeProfileCache } from "./cache";

export interface VolumeProfileControllerOptions {
  readonly profileId: string;
  readonly debounceMs?: number;
  readonly maxDelayMs?: number;
  readonly cacheCapacity?: number;
  readonly onRender: (renderInput: VolumeProfileRenderInput) => void;
  readonly presentation?: VolumeProfilePresentationOptions;
}

export class VolumeProfileController {
  readonly profileId: string;
  private readonly debounceMs: number;
  private readonly maxDelayMs: number;
  private readonly onRender: (renderInput: VolumeProfileRenderInput) => void;
  private readonly cache: VolumeProfileCache;

  private currentInput: VolumeProfileInput | null = null;
  private currentResult: VolumeProfileResult | null = null;
  private presentationOptions: VolumeProfilePresentationOptions;

  private currentGeneration = 0;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private maxDelayTimer: ReturnType<typeof setTimeout> | null = null;
  private isDisposed = false;

  constructor(options: VolumeProfileControllerOptions) {
    this.profileId = options.profileId;
    this.debounceMs = options.debounceMs ?? 100;
    this.maxDelayMs = options.maxDelayMs ?? 300;
    this.onRender = options.onRender;
    this.cache = new VolumeProfileCache(options.cacheCapacity ?? 50);
    this.presentationOptions = options.presentation ?? {};
  }

  setInput(input: VolumeProfileInput, immediate = false): void {
    if (this.isDisposed) return;

    this.currentInput = input;
    const generation = ++this.currentGeneration;

    // Check memo cache
    const cacheKey = buildVolumeProfileCacheKey(input);
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

    // Schedule debounced calculation
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
            buildVolumeProfileCacheKey(this.currentInput),
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
          buildVolumeProfileCacheKey(this.currentInput),
        );
      }
    }, this.debounceMs);
  }

  setPresentation(presentation: VolumeProfilePresentationOptions): void {
    if (this.isDisposed) return;
    this.presentationOptions = { ...this.presentationOptions, ...presentation };
    if (this.currentResult) {
      this.emitRender(this.currentResult);
    }
  }

  updateViewportRange(from: number, to: number): void {
    if (this.isDisposed || !this.currentInput) return;
    const updated: VolumeProfileInput = {
      ...this.currentInput,
      range: { from, to },
    };
    this.setInput(updated, false);
  }

  getCurrentResult(): VolumeProfileResult | null {
    return this.currentResult;
  }

  getCurrentGeneration(): number {
    return this.currentGeneration;
  }

  private executeCalculation(
    input: VolumeProfileInput,
    generation: number,
    cacheKey: string,
  ): void {
    if (this.isDisposed || generation !== this.currentGeneration) {
      // Discard stale out-of-order execution
      return;
    }

    const result = calculateVolumeProfile(input);

    if (this.isDisposed || generation !== this.currentGeneration) {
      return;
    }

    this.cache.set(cacheKey, result);
    this.currentResult = result;
    this.emitRender(result);
  }

  private emitRender(result: VolumeProfileResult): void {
    if (this.isDisposed) return;
    this.onRender({
      profileId: this.profileId,
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
