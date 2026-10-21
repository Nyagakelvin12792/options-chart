import { contentHash } from "./canonical";
import type {
  DecisionMode,
  MarketStateV1,
  Timeframe,
} from "./market-state-contracts";

/** Inputs whose change invalidates any in-flight state construction. */
export interface GenerationKey {
  readonly symbol: "BTCUSDT";
  readonly mode: DecisionMode;
  readonly activeTimeframe: Timeframe;
  readonly expiryScope: string;
  readonly replayCursorMs: number | null;
  /** Opaque marker that changes whenever the underlying data source changes. */
  readonly dataSourceGeneration: string;
}

export interface GenerationToken {
  readonly sequence: number;
  readonly generationId: string;
  readonly key: GenerationKey;
}

export type CommitRejectionReason =
  "superseded" | "cancelled" | "generation-mismatch" | "key-mismatch";

export type CommitResult =
  | { readonly accepted: true; readonly state: MarketStateV1 }
  | { readonly accepted: false; readonly reason: CommitRejectionReason };

/**
 * Owns generation ordering for one consumer. Bounded: it retains only the
 * latest token and the active state, so there is no unbounded global state.
 * Every `begin` supersedes all earlier tokens; only the newest token may commit.
 */
export class MarketStateGenerationGate {
  private sequence = 0;
  private latest: GenerationToken | null = null;
  private cancelled = false;
  private activeState: MarketStateV1 | null = null;

  begin(key: GenerationKey): GenerationToken {
    this.sequence += 1;
    const token: GenerationToken = {
      sequence: this.sequence,
      generationId: `gen-${this.sequence}-${contentHash(key).slice(0, 12)}`,
      key,
    };
    if (
      this.latest === null ||
      contentHash(this.latest.key) !== contentHash(key)
    ) {
      // A different timeframe/expiry/cursor/source/symbol/mode must never keep
      // showing the previous key's state.
      this.activeState = null;
    }
    this.latest = token;
    this.cancelled = false;
    return token;
  }

  /** Invalidates the outstanding token without starting a new generation. */
  cancel(): void {
    this.cancelled = true;
  }

  isCurrent(token: GenerationToken): boolean {
    return (
      this.latest !== null &&
      !this.cancelled &&
      token.sequence === this.latest.sequence
    );
  }

  commit(token: GenerationToken, state: MarketStateV1): CommitResult {
    if (this.latest === null || token.sequence !== this.latest.sequence) {
      return { accepted: false, reason: "superseded" };
    }
    if (this.cancelled) {
      return { accepted: false, reason: "cancelled" };
    }
    const { identity } = state;
    if (identity.generationId !== token.generationId) {
      return { accepted: false, reason: "generation-mismatch" };
    }
    const key = token.key;
    if (
      identity.symbol !== key.symbol ||
      identity.mode !== key.mode ||
      identity.activeTimeframe !== key.activeTimeframe ||
      identity.expiryScope !== key.expiryScope ||
      identity.replayCursorMs !== key.replayCursorMs
    ) {
      return { accepted: false, reason: "key-mismatch" };
    }
    this.activeState = state;
    return { accepted: true, state };
  }

  get active(): MarketStateV1 | null {
    return this.activeState;
  }
}
