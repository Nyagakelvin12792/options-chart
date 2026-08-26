import type {
  OptionsCalculationInput,
  OptionsCalculationResult,
} from "@options-chart/options-engine";

import { OPTIONS_WORKER_PROTOCOL_VERSION } from "./versions";

export interface TotalOpenInterestRequest {
  readonly protocolVersion: typeof OPTIONS_WORKER_PROTOCOL_VERSION;
  readonly type: "calculate-total-open-interest";
  readonly inputVersion: number;
  readonly openInterestBtc: readonly number[];
}

export interface TotalOpenInterestSuccess {
  readonly protocolVersion: typeof OPTIONS_WORKER_PROTOCOL_VERSION;
  readonly type: "total-open-interest-result";
  readonly inputVersion: number;
  readonly totalOpenInterestBtc: number;
  readonly durationMs: number;
}

export interface OptionsCalculationRequest {
  readonly protocolVersion: typeof OPTIONS_WORKER_PROTOCOL_VERSION;
  readonly type: "calculate-options-metrics";
  readonly inputVersion: number;
  readonly input: OptionsCalculationInput;
}

export interface OptionsCalculationSuccess {
  readonly protocolVersion: typeof OPTIONS_WORKER_PROTOCOL_VERSION;
  readonly type: "options-metrics-result";
  readonly inputVersion: number;
  readonly result: OptionsCalculationResult;
  readonly durationMs: number;
}

export interface OptionsMetricFailure {
  readonly protocolVersion: typeof OPTIONS_WORKER_PROTOCOL_VERSION;
  readonly type: "options-metric-error";
  readonly inputVersion: number;
  readonly message: string;
}

export type OptionsMetricResponse =
  TotalOpenInterestSuccess | OptionsCalculationSuccess | OptionsMetricFailure;

const hasValidEnvelope = (
  value: unknown,
): value is {
  readonly protocolVersion: typeof OPTIONS_WORKER_PROTOCOL_VERSION;
  readonly inputVersion: number;
  readonly type: string;
} => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const envelope = value as {
    readonly protocolVersion?: unknown;
    readonly inputVersion?: unknown;
    readonly type?: unknown;
  };
  return (
    envelope.protocolVersion === OPTIONS_WORKER_PROTOCOL_VERSION &&
    typeof envelope.inputVersion === "number" &&
    Number.isInteger(envelope.inputVersion) &&
    envelope.inputVersion >= 0 &&
    typeof envelope.type === "string"
  );
};

export const isTotalOpenInterestRequest = (
  value: unknown,
): value is TotalOpenInterestRequest => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const request = value as Partial<TotalOpenInterestRequest>;
  return (
    request.protocolVersion === OPTIONS_WORKER_PROTOCOL_VERSION &&
    request.type === "calculate-total-open-interest" &&
    Number.isInteger(request.inputVersion) &&
    typeof request.inputVersion === "number" &&
    request.inputVersion >= 0 &&
    Array.isArray(request.openInterestBtc) &&
    request.openInterestBtc.every(
      (openInterest) =>
        typeof openInterest === "number" &&
        Number.isFinite(openInterest) &&
        openInterest >= 0,
    )
  );
};

export const isOptionsCalculationRequest = (
  value: unknown,
): value is OptionsCalculationRequest => {
  if (!hasValidEnvelope(value) || value.type !== "calculate-options-metrics") {
    return false;
  }
  const request = value as Partial<OptionsCalculationRequest>;
  if (!request.input || typeof request.input !== "object") {
    return false;
  }
  const input = request.input as Partial<OptionsCalculationInput>;
  const scope = input.expiryScope;
  const validScope =
    !!scope &&
    typeof scope === "object" &&
    (scope.kind === "0-dte" ||
      scope.kind === "next-expiry" ||
      scope.kind === "this-friday" ||
      scope.kind === "next-friday" ||
      scope.kind === "less-than-or-equal-7-dte" ||
      scope.kind === "less-than-or-equal-30-dte" ||
      scope.kind === "all" ||
      (scope.kind === "custom" &&
        Number.isFinite((scope as { readonly expiry?: number }).expiry)));
  return (
    !!input.chain &&
    typeof input.chain === "object" &&
    Array.isArray(input.chain.instruments) &&
    typeof input.underlyingPriceUsd === "number" &&
    Number.isFinite(input.underlyingPriceUsd) &&
    input.underlyingPriceUsd > 0 &&
    typeof input.calculatedAt === "number" &&
    Number.isFinite(input.calculatedAt) &&
    validScope &&
    typeof input.interestRateFallbackDecimal === "number" &&
    Number.isFinite(input.interestRateFallbackDecimal) &&
    (input.maxPainExpiry === null ||
      (typeof input.maxPainExpiry === "number" &&
        Number.isFinite(input.maxPainExpiry))) &&
    typeof input.secondaryLevelCount === "number" &&
    Number.isInteger(input.secondaryLevelCount) &&
    input.secondaryLevelCount >= 0
  );
};

export const isOptionsMetricResponse = (
  value: unknown,
): value is OptionsMetricResponse => {
  if (!hasValidEnvelope(value)) {
    return false;
  }
  const response = value as Partial<OptionsMetricResponse>;
  if (response.type === "options-metric-error") {
    return typeof response.message === "string";
  }

  if (response.type === "options-metrics-result") {
    return (
      !!response.result &&
      typeof response.result === "object" &&
      typeof response.durationMs === "number" &&
      Number.isFinite(response.durationMs) &&
      response.durationMs >= 0
    );
  }

  return (
    response.type === "total-open-interest-result" &&
    typeof response.totalOpenInterestBtc === "number" &&
    Number.isFinite(response.totalOpenInterestBtc) &&
    typeof response.durationMs === "number" &&
    Number.isFinite(response.durationMs) &&
    response.durationMs >= 0
  );
};
