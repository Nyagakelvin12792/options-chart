import { describe, expect, it } from "vitest";

import {
  isOptionsCalculationRequest,
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

  it("accepts a versioned full-chain calculation request", () => {
    expect(
      isOptionsCalculationRequest({
        protocolVersion: OPTIONS_WORKER_PROTOCOL_VERSION,
        type: "calculate-options-metrics",
        inputVersion: 4,
        input: {
          chain: {
            metadata: {
              source: "deribit",
              sourceTimestamp: 1,
              receivedTimestamp: 1,
              normalizedTimestamp: 1,
              schemaVersion: "test-v1",
            },
            currency: "BTC",
            instruments: [],
          },
          underlyingPriceUsd: 100_000,
          calculatedAt: 1,
          expiryScope: { kind: "all" },
          interestRateFallbackDecimal: 0,
          maxPainExpiry: null,
          secondaryLevelCount: 3,
        },
      }),
    ).toBe(true);
  });

  it("validates a versioned full-chain worker response", () => {
    expect(
      isOptionsMetricResponse({
        protocolVersion: OPTIONS_WORKER_PROTOCOL_VERSION,
        type: "options-metrics-result",
        inputVersion: 4,
        result: {},
        durationMs: 2.5,
      }),
    ).toBe(true);
  });
});
