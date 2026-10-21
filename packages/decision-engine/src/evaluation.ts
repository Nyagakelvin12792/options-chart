import { z } from "zod";

import {
  DECISION_CHOICES,
  DecisionChoiceSchema,
  DecisionDistributionV1Schema,
  type DecisionChoice,
} from "./decision-contracts";
import { TimeframeSchema } from "./market-state-contracts";

const finite = z.number().refine(Number.isFinite, "must be finite");
const timestampMs = z.number().int().nonnegative();

export const ShadowEvaluationObservationV1Schema = z.strictObject({
  observationId: z.string().min(1),
  effectiveAtMs: timestampMs,
  horizonEndMs: timestampMs,
  baselineChoice: DecisionChoiceSchema,
  providerChoice: DecisionChoiceSchema.nullable(),
  convergedChoice: DecisionChoiceSchema,
  providerDistribution: DecisionDistributionV1Schema.nullable(),
  providerStatus: z.enum([
    "success",
    "disabled",
    "timeout",
    "cancelled",
    "stale",
    "provider-error",
    "invalid-response",
  ]),
  staleDecision: z.boolean(),
  referencePrice: finite.positive(),
  horizonEndPrice: finite.positive(),
  mfeBps: finite,
  maeBps: finite,
  structure: z.string().min(1),
  flow: z.string().min(1),
  optionsRegime: z.string().min(1),
  timeframe: TimeframeSchema,
  expiryScope: z.string().min(1),
});
export type ShadowEvaluationObservationV1 = z.infer<
  typeof ShadowEvaluationObservationV1Schema
>;

export interface ChoiceFrequency {
  readonly choice: DecisionChoice;
  readonly baselineCount: number;
  readonly providerCount: number;
  readonly convergedCount: number;
}

export interface EvaluationSlice {
  readonly dimension: string;
  readonly value: string;
  readonly count: number;
  readonly meanForwardReturnBps: number;
  readonly meanMfeBps: number;
  readonly meanMaeBps: number;
}

export interface ShadowEvaluationReportV1 {
  readonly schemaVersion: "shadow-evaluation-report-v1";
  readonly sampleSize: number;
  readonly providerCoverageRatio: number;
  readonly staleDecisionRatio: number;
  readonly baselineProviderAgreementRatio: number | null;
  readonly convergenceChangeRatio: number | null;
  readonly classFrequencies: readonly ChoiceFrequency[];
  readonly performance: {
    readonly baselineMeanDirectionalReturnBps: number | null;
    readonly convergedMeanDirectionalReturnBps: number | null;
    readonly convergedMaxDrawdownBps: number | null;
    readonly meanMfeBps: number | null;
    readonly meanMaeBps: number | null;
  };
  readonly calibration: {
    readonly sampleSize: number;
    readonly multiclassBrierScore: number | null;
    readonly status: "pending" | "measured";
    readonly warning: string;
  };
  readonly ablations: readonly EvaluationSlice[];
}

const direction = (choice: DecisionChoice): -1 | 0 | 1 => {
  if (choice.endsWith("long")) return 1;
  if (choice.endsWith("short")) return -1;
  return 0;
};

const mean = (values: readonly number[]): number | null =>
  values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;

const ratio = (numerator: number, denominator: number): number | null =>
  denominator === 0 ? null : numerator / denominator;

function realizedChoice(
  observation: ShadowEvaluationObservationV1,
): DecisionChoice {
  const forwardBps =
    ((observation.horizonEndPrice - observation.referencePrice) /
      observation.referencePrice) *
    10_000;
  if (forwardBps >= 10) return "confirm-long";
  if (forwardBps <= -10) return "confirm-short";
  return "no-trade";
}

function directionalReturn(
  observation: ShadowEvaluationObservationV1,
  choice: DecisionChoice,
): number {
  const forwardBps =
    ((observation.horizonEndPrice - observation.referencePrice) /
      observation.referencePrice) *
    10_000;
  return forwardBps * direction(choice);
}

function maxDrawdown(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let equity = 0;
  let peak = 0;
  let drawdown = 0;
  for (const value of values) {
    equity += value;
    peak = Math.max(peak, equity);
    drawdown = Math.max(drawdown, peak - equity);
  }
  return drawdown;
}

function buildAblations(
  observations: readonly ShadowEvaluationObservationV1[],
): EvaluationSlice[] {
  const dimensions = [
    ["structure", (item: ShadowEvaluationObservationV1) => item.structure],
    ["flow", (item: ShadowEvaluationObservationV1) => item.flow],
    ["options", (item: ShadowEvaluationObservationV1) => item.optionsRegime],
    ["timeframe", (item: ShadowEvaluationObservationV1) => item.timeframe],
    ["expiry", (item: ShadowEvaluationObservationV1) => item.expiryScope],
  ] as const;
  return dimensions.flatMap(([dimension, select]) => {
    const groups = new Map<string, ShadowEvaluationObservationV1[]>();
    for (const item of observations) {
      const key = select(item);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return [...groups.entries()].map(([value, items]) => ({
      dimension,
      value,
      count: items.length,
      meanForwardReturnBps:
        mean(
          items.map((item) => directionalReturn(item, item.convergedChoice)),
        ) ?? 0,
      meanMfeBps: mean(items.map((item) => item.mfeBps)) ?? 0,
      meanMaeBps: mean(items.map((item) => item.maeBps)) ?? 0,
    }));
  });
}

/**
 * Produces descriptive shadow evidence only. Provider confidence is never
 * interpreted as a win probability; calibration uses held-out class labels.
 */
export function evaluateShadowObservations(
  rawObservations: readonly ShadowEvaluationObservationV1[],
): ShadowEvaluationReportV1 {
  const observations = rawObservations
    .map((item) => ShadowEvaluationObservationV1Schema.parse(item))
    .sort((left, right) => left.effectiveAtMs - right.effectiveAtMs);
  const providerRuns = observations.filter(
    (item) => item.providerStatus === "success" && item.providerChoice !== null,
  );
  const calibrated = providerRuns.filter(
    (item) => item.providerDistribution !== null && !item.staleDecision,
  );
  const brierScores = calibrated.map((item) => {
    const actual = realizedChoice(item);
    return (
      DECISION_CHOICES.reduce((sum, choice) => {
        const target = choice === actual ? 1 : 0;
        return sum + (item.providerDistribution![choice] - target) ** 2;
      }, 0) / DECISION_CHOICES.length
    );
  });
  const convergedReturns = observations.map((item) =>
    directionalReturn(item, item.convergedChoice),
  );

  return {
    schemaVersion: "shadow-evaluation-report-v1",
    sampleSize: observations.length,
    providerCoverageRatio: ratio(providerRuns.length, observations.length) ?? 0,
    staleDecisionRatio:
      ratio(
        observations.filter((item) => item.staleDecision).length,
        observations.length,
      ) ?? 0,
    baselineProviderAgreementRatio: ratio(
      providerRuns.filter((item) => item.providerChoice === item.baselineChoice)
        .length,
      providerRuns.length,
    ),
    convergenceChangeRatio: ratio(
      providerRuns.filter(
        (item) => item.convergedChoice !== item.providerChoice,
      ).length,
      providerRuns.length,
    ),
    classFrequencies: DECISION_CHOICES.map((choice) => ({
      choice,
      baselineCount: observations.filter(
        (item) => item.baselineChoice === choice,
      ).length,
      providerCount: providerRuns.filter(
        (item) => item.providerChoice === choice,
      ).length,
      convergedCount: observations.filter(
        (item) => item.convergedChoice === choice,
      ).length,
    })),
    performance: {
      baselineMeanDirectionalReturnBps: mean(
        observations.map((item) =>
          directionalReturn(item, item.baselineChoice),
        ),
      ),
      convergedMeanDirectionalReturnBps: mean(convergedReturns),
      convergedMaxDrawdownBps: maxDrawdown(convergedReturns),
      meanMfeBps: mean(observations.map((item) => item.mfeBps)),
      meanMaeBps: mean(observations.map((item) => item.maeBps)),
    },
    calibration: {
      sampleSize: calibrated.length,
      multiclassBrierScore: mean(brierScores),
      status: calibrated.length === 0 ? "pending" : "measured",
      warning:
        calibrated.length === 0
          ? "No held-out provider observations are available"
          : "Descriptive only; approval thresholds require product-owner review",
    },
    ablations: buildAblations(observations),
  };
}
