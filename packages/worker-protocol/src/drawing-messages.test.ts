import { describe, expect, it } from "vitest";

import {
  DRAWING_WORKER_PROTOCOL_VERSION,
  isDrawingCalculationRequest,
  isDrawingCalculationResponse,
  type VpDrawingCalculationRequest,
  type VwapDrawingCalculationRequest,
  type VwapDrawingCalculationSuccess,
} from "./index";

describe("drawing-messages", () => {
  it("validates valid drawing calculation requests and rejects malformed requests", () => {
    const validVwap: VwapDrawingCalculationRequest = {
      protocolVersion: DRAWING_WORKER_PROTOCOL_VERSION,
      type: "calculate-drawing-avwap",
      drawingId: "avwap-1",
      requestId: 1,
      generation: 1,
      dataRevision: "rev-1",
      symbol: "BTCUSDT",
      timeframe: "1h",
      anchorTimestamp: 1700000000000,
    };

    const validVp: VpDrawingCalculationRequest = {
      protocolVersion: DRAWING_WORKER_PROTOCOL_VERSION,
      type: "calculate-drawing-vp",
      drawingId: "vp-1",
      requestId: 2,
      generation: 1,
      dataRevision: "rev-1",
      symbol: "BTCUSDT",
      timeframe: "1h",
      fromTimestamp: 1700000000000,
      toTimestamp: 1700500000000,
    };

    expect(isDrawingCalculationRequest(validVwap)).toBe(true);
    expect(isDrawingCalculationRequest(validVp)).toBe(true);
    expect(isDrawingCalculationRequest(null)).toBe(false);
    expect(isDrawingCalculationRequest({})).toBe(false);
    expect(
      isDrawingCalculationRequest({
        ...validVwap,
        protocolVersion: "wrong-version",
      }),
    ).toBe(false);
  });

  it("validates drawing calculation responses", () => {
    const validSuccess: VwapDrawingCalculationSuccess = {
      protocolVersion: DRAWING_WORKER_PROTOCOL_VERSION,
      type: "drawing-avwap-result",
      drawingId: "avwap-1",
      requestId: 1,
      generation: 1,
      dataRevision: "rev-1",
      result: {
        anchorTimestamp: 1700000000000,
        resolvedAnchorIndex: 0,
        points: [],
        latestPoint: null,
        totalCandlesConsidered: 100,
        candlesIncluded: 100,
        candlesExcluded: 0,
        exclusions: [],
        calculationDurationMs: 0.5,
        priceSource: "typical",
        bandMultipliers: [1, 2, 3],
      },
      durationMs: 0.8,
    };

    expect(isDrawingCalculationResponse(validSuccess)).toBe(true);
    expect(isDrawingCalculationResponse({ type: "unknown" })).toBe(false);
  });
});
