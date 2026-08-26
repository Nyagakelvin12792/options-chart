import { describe, expect, it } from "vitest";

import {
  isOptionsMetricResponse,
  isTotalOpenInterestRequest,
} from "./messages";
import { OPTIONS_WORKER_PROTOCOL_VERSION } from "./versions";

describe("options worker protocol guards", () => {
  it("accepts a versioned calculation request", () => {
    expect(
      isTotalOpenInterestRequest({
        protocolVersion: OPTIONS_WORKER_PROTOCOL_VERSION,
        type: "calculate-total-open-interest",
        inputVersion: 3,
        openInterestBtc: [10, 20.5],
      }),
    ).toBe(true);
  });

  it("rejects invalid input and stale protocol versions", () => {
    expect(
      isTotalOpenInterestRequest({
        protocolVersion: "old-worker-v0",
        type: "calculate-total-open-interest",
        inputVersion: 3,
        openInterestBtc: [10],
      }),
    ).toBe(false);
    expect(
      isTotalOpenInterestRequest({
        protocolVersion: OPTIONS_WORKER_PROTOCOL_VERSION,
        type: "calculate-total-open-interest",
        inputVersion: 3,
        openInterestBtc: [-1],
      }),
    ).toBe(false);
  });

  it("validates successful worker responses", () => {
    expect(
      isOptionsMetricResponse({
        protocolVersion: OPTIONS_WORKER_PROTOCOL_VERSION,
        type: "total-open-interest-result",
        inputVersion: 3,
        totalOpenInterestBtc: 30.5,
        durationMs: 0.4,
      }),
    ).toBe(true);
  });
});
