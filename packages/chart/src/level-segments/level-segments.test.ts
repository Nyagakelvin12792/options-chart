import { describe, expect, it, vi } from "vitest";
import type {
  IRange,
  ISeriesApi,
  SeriesAttachedParameter,
  Time,
  UTCTimestamp,
} from "lightweight-charts";

import { LevelSegmentsPrimitive } from "./level-segments-primitive";
import type { LevelSegment } from "./types";

function createMockAttachedParams(options?: {
  visibleRange?: IRange<Time> | null;
  timeToCoord?: (time: UTCTimestamp) => number | null;
  priceToCoord?: (price: number) => number | null;
}): SeriesAttachedParameter<Time> {
  const visibleRange: IRange<Time> | null =
    options?.visibleRange !== undefined
      ? options.visibleRange
      : {
          from: 1000 as UTCTimestamp,
          to: 2000 as UTCTimestamp,
        };

  const timeToCoord =
    options?.timeToCoord ??
    ((time: UTCTimestamp) => {
      if (time >= 1000 && time <= 2000) {
        return ((Number(time) - 1000) / 1000) * 800;
      }
      return null;
    });

  const priceToCoord =
    options?.priceToCoord ??
    ((price: number) => {
      return 800 - price * 0.01;
    });

  const mockSeries = {
    priceToCoordinate: vi.fn(priceToCoord),
  } as unknown as ISeriesApi<"Candlestick">;

  const mockChart = {
    timeScale: () => ({
      timeToCoordinate: vi.fn(timeToCoord),
      getVisibleRange: () => visibleRange,
    }),
  };

  return {
    chart: mockChart,
    series: mockSeries,
    requestUpdate: vi.fn(),
  } as unknown as SeriesAttachedParameter<Time>;
}

describe("LevelSegmentsPrimitive", () => {
  it("initializes without errors and provides autoscaleInfo as null", () => {
    const primitive = new LevelSegmentsPrimitive();
    expect(primitive.autoscaleInfo()).toBeNull();
    const views = primitive.paneViews();
    expect(views).toHaveLength(2);
    const bandView = views[0];
    const lineView = views[1];
    expect(bandView).toBeDefined();
    expect(lineView).toBeDefined();
    if (bandView && lineView && bandView.zOrder && lineView.zOrder) {
      expect(bandView.zOrder()).toBe("bottom");
      expect(lineView.zOrder()).toBe("normal");
    }
  });

  it("calculates right-extending coordinates based on activation timestamp", () => {
    const segments: LevelSegment[] = [
      {
        id: "call-wall-1",
        kind: "call-wall",
        label: "Call Wall",
        price: 65000,
        activationTimestamp: 1500 * 1000, // midway in visible window (1000-2000)
        importance: "primary",
      },
      {
        id: "put-wall-1",
        kind: "put-wall",
        label: "Put Wall",
        price: 55000,
        activationTimestamp: 500 * 1000, // before visible window (past)
        importance: "primary",
      },
      {
        id: "max-pain-1",
        kind: "max-pain",
        label: "Max Pain",
        price: 60000,
        activationTimestamp: null, // full viewport
      },
      {
        id: "confluence-1",
        kind: "confluence-zone",
        label: "Confluence Band",
        price: 62000,
        priceLow: 61000,
        priceHigh: 63000,
        activationTimestamp: 1250 * 1000,
        bias: "support",
        score: 85,
      },
    ];

    const primitive = new LevelSegmentsPrimitive(segments, { showPips: true });
    const mockParams = createMockAttachedParams();
    primitive.attached(mockParams);

    const mockContext = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillRect: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      setLineDash: vi.fn(),
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
    };

    const drawTarget = {
      useBitmapCoordinateSpace: (
        cb: (params: {
          context: unknown;
          horizontalPixelRatio: number;
          verticalPixelRatio: number;
          bitmapSize: { width: number; height: number };
        }) => void,
      ) => {
        cb({
          context: mockContext,
          horizontalPixelRatio: 1,
          verticalPixelRatio: 1,
          bitmapSize: { width: 800, height: 600 },
        });
      },
    };

    const views = primitive.paneViews();
    const bandView = views[0];
    const lineView = views[1];

    // Render confluence bands
    expect(bandView).toBeDefined();
    bandView?.renderer()?.draw(drawTarget as never);
    expect(mockContext.fillRect).toHaveBeenCalled();

    // Render level lines
    expect(lineView).toBeDefined();
    lineView?.renderer()?.draw(drawTarget as never);
    expect(mockContext.stroke).toHaveBeenCalled();
    expect(mockContext.arc).toHaveBeenCalled();
  });

  it("handles dynamic updates via updateSegments and clean detachment", () => {
    const primitive = new LevelSegmentsPrimitive([]);
    const mockParams = createMockAttachedParams();
    primitive.attached(mockParams);

    const updatedSegments: LevelSegment[] = [
      {
        id: "gamma-flip-1",
        kind: "gamma-flip",
        label: "Gamma Flip",
        price: 64000,
        activationTimestamp: 1600 * 1000,
      },
    ];

    primitive.updateSegments(updatedSegments);
    expect(mockParams.requestUpdate).toHaveBeenCalled();

    primitive.detached();
    const mockContext = {
      save: vi.fn(),
      stroke: vi.fn(),
    };
    const drawTarget = {
      useBitmapCoordinateSpace: (
        cb: (params: {
          context: unknown;
          horizontalPixelRatio: number;
          verticalPixelRatio: number;
          bitmapSize: { width: number; height: number };
        }) => void,
      ) => {
        cb({
          context: mockContext,
          horizontalPixelRatio: 1,
          verticalPixelRatio: 1,
          bitmapSize: { width: 800, height: 600 },
        });
      },
    };
    const views = primitive.paneViews();
    const lineView = views[1];
    expect(lineView).toBeDefined();
    lineView?.renderer()?.draw(drawTarget as never);
    expect(mockContext.stroke).not.toHaveBeenCalled();
  });
});
