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

export interface OptionsMetricFailure {
  readonly protocolVersion: typeof OPTIONS_WORKER_PROTOCOL_VERSION;
  readonly type: "options-metric-error";
  readonly inputVersion: number;
  readonly message: string;
}

export type OptionsMetricResponse =
  TotalOpenInterestSuccess | OptionsMetricFailure;

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

export const isOptionsMetricResponse = (
  value: unknown,
): value is OptionsMetricResponse => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const response = value as Partial<OptionsMetricResponse>;
  if (
    response.protocolVersion !== OPTIONS_WORKER_PROTOCOL_VERSION ||
    !Number.isInteger(response.inputVersion)
  ) {
    return false;
  }

  if (response.type === "options-metric-error") {
    return typeof response.message === "string";
  }

  return (
    response.type === "total-open-interest-result" &&
    typeof response.totalOpenInterestBtc === "number" &&
    Number.isFinite(response.totalOpenInterestBtc) &&
    typeof response.durationMs === "number" &&
    Number.isFinite(response.durationMs)
  );
};
