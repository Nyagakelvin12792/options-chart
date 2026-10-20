import type { SourceHealthV1 } from "./market-state-contracts";

export const MISSING_SOURCE_STALE_AFTER_MS = 1;

export interface ResolvedSource {
  readonly health: SourceHealthV1;
  /** True only when the input is present, not future-dated, and not stale. */
  readonly usable: boolean;
  /** True when the input is dated after the state's effective time. */
  readonly future: boolean;
}

/**
 * Resolves freshness against the explicit effective time. Evidence dated after
 * `effectiveAtMs` is treated as unavailable so a later observation can never
 * influence an earlier replay cursor. No wall clock is read here.
 */
export function resolveSourceHealth(
  effectiveAtMs: number,
  stamp: { readonly asOfMs: number; readonly staleAfterMs: number } | null,
): ResolvedSource {
  if (stamp === null) {
    return {
      health: {
        state: "unavailable",
        asOfMs: null,
        ageMs: null,
        staleAfterMs: MISSING_SOURCE_STALE_AFTER_MS,
      },
      usable: false,
      future: false,
    };
  }
  if (stamp.asOfMs > effectiveAtMs) {
    return {
      health: {
        state: "unavailable",
        asOfMs: null,
        ageMs: null,
        staleAfterMs: stamp.staleAfterMs,
      },
      usable: false,
      future: true,
    };
  }
  const ageMs = effectiveAtMs - stamp.asOfMs;
  const isStale = ageMs > stamp.staleAfterMs;
  return {
    health: {
      state: isStale ? "stale" : "live",
      asOfMs: stamp.asOfMs,
      ageMs,
      staleAfterMs: stamp.staleAfterMs,
    },
    usable: !isStale,
    future: false,
  };
}
