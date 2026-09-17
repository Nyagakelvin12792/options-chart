/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { VpPreviewPrimitive } from "./vp-preview-primitive";

const mocks = vi.hoisted(() => {
  return {
    timeScale: {
      timeToCoordinate: vi.fn(() => 100),
    },
    series: {
      priceToCoordinate: vi.fn(() => 200),
    },
  };
});

const mockChart = {
  timeScale: () => mocks.timeScale,
} as any;

const mockSeries = {
  priceToCoordinate: mocks.series.priceToCoordinate,
} as any;

describe("VpPreviewPrimitive", () => {
  it("update(null) — paneViews() returns views but renderer draws nothing", () => {
    const primitive = new VpPreviewPrimitive();
    primitive.attached({ chart: mockChart, series: mockSeries, requestUpdate: vi.fn() } as any);
    
    primitive.update(null);
    const views = primitive.paneViews();
    expect(views).toBeInstanceOf(Array);
    
    const renderer = views[0]?.renderer();
    if (renderer) {
      const ctx = {
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        rect: vi.fn(),
        fill: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        globalAlpha: 1,
        fillStyle: "",
      } as any;
      renderer.draw({
        context: ctx,
        horizontalPixelRatio: 1,
        verticalPixelRatio: 1,
        bitmapSize: { width: 100, height: 100 },
        mediaSize: { width: 100, height: 100 }
      } as any);
      expect(ctx.fill).not.toHaveBeenCalled();
    }
  });

  it("update({ fromEpoch, toEpoch }) with no provisionalResult — renders overlay only", () => {
    const primitive = new VpPreviewPrimitive();
    const requestUpdate = vi.fn();
    primitive.attached({ chart: mockChart, series: mockSeries, requestUpdate } as any);
    
    primitive.update({ fromEpoch: 1_700_000_000, toEpoch: 1_700_003_600 });
    expect(requestUpdate).toHaveBeenCalled();
  });

  it("update({ fromEpoch, toEpoch, provisionalResult: mockResult }) — previewCoords computed", () => {
    const primitive = new VpPreviewPrimitive();
    const requestUpdate = vi.fn();
    primitive.attached({ chart: mockChart, series: mockSeries, requestUpdate } as any);
    
    primitive.update({
      fromEpoch: 1_700_000_000,
      toEpoch: 1_700_003_600,
      provisionalResult: {
        totalVolume: 100,
        valueAreaVolume: 70,
        pocPrice: 60000,
        pocVolume: 20,
        valueAreaLow: 59000,
        valueAreaHigh: 61000,
        bins: [],
        rows: []
      } as any
    });
    
    expect(requestUpdate).toHaveBeenCalled();
  });

  it("After detached(), state is cleared", () => {
    const primitive = new VpPreviewPrimitive();
    const requestUpdate = vi.fn();
    primitive.attached({ chart: mockChart, series: mockSeries, requestUpdate } as any);
    primitive.update({ fromEpoch: 1, toEpoch: 2 });
    
    primitive.detached();
    expect(() => primitive.paneViews()).not.toThrow();
  });

  it("autoscaleInfo() returns null", () => {
    const primitive = new VpPreviewPrimitive();
    expect(primitive.autoscaleInfo()).toBeNull();
  });
});
