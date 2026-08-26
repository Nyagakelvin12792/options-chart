import type { FeedHealthState } from "@options-chart/domain";

import {
  DERIBIT_OI_STALE_AFTER_MS,
  DERIBIT_POLL_RECOVERY_DELAY_MS,
} from "./constants";

export interface PollSuccessResult {
  readonly state: FeedHealthState;
  readonly needsFollowUp: boolean;
}

export class DeribitPollHealth {
  private currentState: FeedHealthState = "CONNECTING";
  private lastSuccessAt: number | null = null;
  private recoveryFirstSuccessAt: number | null = null;
  private hidden = false;

  get state(): FeedHealthState {
    return this.currentState;
  }

  get lastValidAt(): number | null {
    return this.lastSuccessAt;
  }

  setHidden(hidden: boolean): void {
    this.hidden = hidden;
  }

  recordSuccess(now: number): PollSuccessResult {
    this.lastSuccessAt = now;
    if (this.currentState === "CONNECTING") {
      this.currentState = "LIVE";
      return { state: this.currentState, needsFollowUp: false };
    }
    if (this.currentState === "LIVE") {
      this.recoveryFirstSuccessAt = null;
      return { state: this.currentState, needsFollowUp: false };
    }

    if (this.recoveryFirstSuccessAt === null) {
      this.recoveryFirstSuccessAt = now;
      this.currentState = "DEGRADED";
      return { state: this.currentState, needsFollowUp: true };
    }
    if (now - this.recoveryFirstSuccessAt < DERIBIT_POLL_RECOVERY_DELAY_MS) {
      return { state: this.currentState, needsFollowUp: true };
    }

    this.recoveryFirstSuccessAt = null;
    this.currentState = "LIVE";
    return { state: this.currentState, needsFollowUp: false };
  }

  recordFailure(hasFallback: boolean): FeedHealthState {
    this.recoveryFirstSuccessAt = null;
    this.currentState = hasFallback ? "FALLBACK" : "ERROR";
    return this.currentState;
  }

  recordIncomplete(now: number): FeedHealthState {
    this.lastSuccessAt = now;
    this.recoveryFirstSuccessAt = null;
    this.currentState = "DEGRADED";
    return this.currentState;
  }

  enterRecovery(): FeedHealthState {
    this.recoveryFirstSuccessAt = null;
    this.currentState = this.lastSuccessAt === null ? "CONNECTING" : "DEGRADED";
    return this.currentState;
  }

  evaluate(now: number, staleAfterMs = DERIBIT_OI_STALE_AFTER_MS): FeedHealthState {
    if (
      !this.hidden &&
      this.lastSuccessAt !== null &&
      now - this.lastSuccessAt >= staleAfterMs
    ) {
      this.recoveryFirstSuccessAt = null;
      this.currentState = "STALE";
    }
    return this.currentState;
  }
}
