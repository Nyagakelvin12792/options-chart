export const EFFECTIVE_TIME_POLICY_VERSION = "flow-effective-time-v1" as const;

export type FeatureTimeSource = "exchange" | "receipt";

export interface EffectiveTimeResolution {
  readonly receiptTimestampMs: number;
  readonly exchangeTimestampMs: number | null;
  readonly featureTimestampMs: number;
  readonly featureTimeSource: FeatureTimeSource;
}

export type SequenceTransitionKind =
  | "initial"
  | "contiguous"
  | "duplicate"
  | "gap"
  | "out-of-order"
  | "opaque-unorderable";

export interface SequenceTransitionEvaluation {
  readonly kind: SequenceTransitionKind;
  readonly previousSequence: number | string | null;
  readonly currentSequence: number | string | null;
  readonly missingCount: number | null;
}

export function isValidTimestampMs(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function isReplayEligible(
  receiptTimestampMs: number,
  replayCutoffMs?: number | null,
): boolean {
  if (!isValidTimestampMs(receiptTimestampMs)) {
    return false;
  }
  if (replayCutoffMs === undefined || replayCutoffMs === null) {
    return true;
  }
  return (
    isValidTimestampMs(replayCutoffMs) && receiptTimestampMs <= replayCutoffMs
  );
}

export function resolveEffectiveTime(input: {
  readonly exchangeTimestampMs: number | null;
  readonly receiptTimestampMs: number;
}): EffectiveTimeResolution {
  if (isValidTimestampMs(input.exchangeTimestampMs)) {
    return {
      receiptTimestampMs: input.receiptTimestampMs,
      exchangeTimestampMs: input.exchangeTimestampMs,
      featureTimestampMs: input.exchangeTimestampMs,
      featureTimeSource: "exchange",
    };
  }
  return {
    receiptTimestampMs: input.receiptTimestampMs,
    exchangeTimestampMs: null,
    featureTimestampMs: input.receiptTimestampMs,
    featureTimeSource: "receipt",
  };
}

export function areSequencesEqual(
  a: number | string | null | undefined,
  b: number | string | null | undefined,
): boolean {
  if (a === null || a === undefined || b === null || b === undefined) {
    return false;
  }
  if (typeof a === "string" && a.length === 0) {
    return false;
  }
  if (typeof b === "string" && b.length === 0) {
    return false;
  }
  return typeof a === typeof b && a === b;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function evaluateSequenceTransition(
  previousSequence: number | string | null | undefined,
  currentSequence: number | string | null | undefined,
  explicitPreviousSequence?: number | string | null | undefined,
): SequenceTransitionEvaluation {
  if (previousSequence === null || previousSequence === undefined) {
    return {
      kind: "initial",
      previousSequence: null,
      currentSequence: currentSequence ?? null,
      missingCount: null,
    };
  }

  if (currentSequence === null || currentSequence === undefined) {
    return {
      kind: "opaque-unorderable",
      previousSequence,
      currentSequence: null,
      missingCount: null,
    };
  }

  if (
    (typeof previousSequence === "string" && previousSequence.length === 0) ||
    (typeof currentSequence === "string" && currentSequence.length === 0)
  ) {
    return {
      kind: "opaque-unorderable",
      previousSequence,
      currentSequence,
      missingCount: null,
    };
  }

  if (areSequencesEqual(previousSequence, currentSequence)) {
    return {
      kind: "duplicate",
      previousSequence,
      currentSequence,
      missingCount: null,
    };
  }

  if (
    typeof previousSequence === "string" ||
    typeof currentSequence === "string"
  ) {
    if (
      explicitPreviousSequence !== undefined &&
      explicitPreviousSequence !== null
    ) {
      if (areSequencesEqual(explicitPreviousSequence, previousSequence)) {
        return {
          kind: "contiguous",
          previousSequence,
          currentSequence,
          missingCount: null,
        };
      }
      return {
        kind: "gap",
        previousSequence,
        currentSequence,
        missingCount: null,
      };
    }
    return {
      kind: "opaque-unorderable",
      previousSequence,
      currentSequence,
      missingCount: null,
    };
  }

  if (
    !isNonNegativeSafeInteger(previousSequence) ||
    !isNonNegativeSafeInteger(currentSequence)
  ) {
    return {
      kind: "opaque-unorderable",
      previousSequence,
      currentSequence,
      missingCount: null,
    };
  }

  if (currentSequence < previousSequence) {
    return {
      kind: "out-of-order",
      previousSequence,
      currentSequence,
      missingCount: null,
    };
  }

  if (
    explicitPreviousSequence !== undefined &&
    explicitPreviousSequence !== null
  ) {
    if (!isNonNegativeSafeInteger(explicitPreviousSequence)) {
      return {
        kind: "opaque-unorderable",
        previousSequence,
        currentSequence,
        missingCount: null,
      };
    }
    if (explicitPreviousSequence === previousSequence) {
      return {
        kind: "contiguous",
        previousSequence,
        currentSequence,
        missingCount: null,
      };
    }
    if (explicitPreviousSequence > previousSequence) {
      return {
        kind: "gap",
        previousSequence,
        currentSequence,
        missingCount: explicitPreviousSequence - previousSequence,
      };
    }
    return {
      kind: "out-of-order",
      previousSequence,
      currentSequence,
      missingCount: null,
    };
  }

  if (currentSequence === previousSequence + 1) {
    return {
      kind: "contiguous",
      previousSequence,
      currentSequence,
      missingCount: null,
    };
  }

  return {
    kind: "gap",
    previousSequence,
    currentSequence,
    missingCount: currentSequence - previousSequence - 1,
  };
}
