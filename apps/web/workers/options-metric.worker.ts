import {
  calculateOptionsMetrics,
  calculateTotalOpenInterestBtc,
} from "@options-chart/options-engine";
import {
  isOptionsCalculationRequest,
  isTotalOpenInterestRequest,
  OPTIONS_WORKER_PROTOCOL_VERSION,
  type OptionsMetricResponse,
} from "@options-chart/worker-protocol";

const workerScope = self as unknown as {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  postMessage(message: OptionsMetricResponse): void;
};

workerScope.addEventListener("message", (event) => {
  const isTotalRequest = isTotalOpenInterestRequest(event.data);
  const isFullCalculationRequest = isOptionsCalculationRequest(event.data);
  if (!isTotalRequest && !isFullCalculationRequest) {
    return;
  }

  const startedAt = performance.now();
  try {
    if (isTotalRequest) {
      const totalOpenInterestBtc = calculateTotalOpenInterestBtc(
        event.data.openInterestBtc,
      );
      workerScope.postMessage({
        protocolVersion: OPTIONS_WORKER_PROTOCOL_VERSION,
        type: "total-open-interest-result",
        inputVersion: event.data.inputVersion,
        totalOpenInterestBtc,
        durationMs: performance.now() - startedAt,
      });
    } else {
      workerScope.postMessage({
        protocolVersion: OPTIONS_WORKER_PROTOCOL_VERSION,
        type: "options-metrics-result",
        inputVersion: event.data.inputVersion,
        result: calculateOptionsMetrics(event.data.input),
        durationMs: performance.now() - startedAt,
      });
    }
  } catch (error) {
    workerScope.postMessage({
      protocolVersion: OPTIONS_WORKER_PROTOCOL_VERSION,
      type: "options-metric-error",
      inputVersion: event.data.inputVersion,
      message: error instanceof Error ? error.message : "Calculation failed",
    });
  }
});

export {};
