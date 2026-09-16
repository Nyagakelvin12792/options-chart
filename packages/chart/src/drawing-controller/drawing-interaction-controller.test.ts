import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Candle } from "@options-chart/domain";
import type { ChartDrawing, VolumeProfileRangeDrawing, AnchoredVwapDrawing } from "../chart-adapter";
import { DrawingInteractionController } from "./drawing-interaction-controller";

function createMockCandles(): Candle[] {
  return [
    {
      metadata: { source: "binance", sourceTimestamp: 1000, receivedTimestamp: 1000, normalizedTimestamp: 1000, schemaVersion: "1.0.0" },
      symbol: "BTCUSDT",
      interval: "1m",
      openTime: 1_000_000,
      closeTime: 1_059_999,
      open: 60000,
      high: 60100,
      low: 59900,
      close: 60050,
      volume: 10,
      quoteVolume: 600500,
      tradeCount: 1,
      isClosed: true,
    },
    {
      metadata: { source: "binance", sourceTimestamp: 2000, receivedTimestamp: 2000, normalizedTimestamp: 2000, schemaVersion: "1.0.0" },
      symbol: "BTCUSDT",
      interval: "1m",
      openTime: 1_060_000,
      closeTime: 1_119_999,
      open: 60050,
      high: 60200,
      low: 60000,
      close: 60150,
      volume: 15,
      quoteVolume: 902250,
      tradeCount: 1,
      isClosed: true,
    },
    {
      metadata: { source: "binance", sourceTimestamp: 3000, receivedTimestamp: 3000, normalizedTimestamp: 3000, schemaVersion: "1.0.0" },
      symbol: "BTCUSDT",
      interval: "1m",
      openTime: 1_120_000,
      closeTime: 1_179_999,
      open: 60150,
      high: 60300,
      low: 60100,
      close: 60250,
      volume: 20,
      quoteVolume: 1205000,
      tradeCount: 1,
      isClosed: true,
    },
  ];
}

describe("DrawingInteractionController", () => {
  let eventListeners: Map<string, Function>;
  let container: any;
  let drawings: ChartDrawing[];
  let addedDrawings: ChartDrawing[];
  let updatedDrawings: { drawing: ChartDrawing; commit: boolean }[];
  let deletedIds: string[];
  let selectedId: string | null;

  const mockChart = {
    applyOptions: vi.fn(),
    timeScale: () => ({
      coordinateToTime: (x: number) => Math.floor((1_000_000 + x * 1_000) / 1000),
      timeToCoordinate: (time: number) => (time * 1000 - 1_000_000) / 1000,
      coordinateToLogical: () => 0,
      getVisibleLogicalRange: () => ({ from: 0, to: 10 }),
      logicalToCoordinate: () => 0,
    }),
  };

  const mockSeries = {
    coordinateToPrice: (y: number) => 60000 - y * 10,
    priceToCoordinate: (price: number) => (60000 - price) / 10,
  };

  beforeEach(() => {
    eventListeners = new Map();
    container = {
      addEventListener: vi.fn((type: string, handler: Function) => {
        eventListeners.set(type, handler);
      }),
      removeEventListener: vi.fn((type: string) => {
        eventListeners.delete(type);
      }),
      setPointerCapture: vi.fn(),
      style: { cursor: "default" },
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        right: 500,
        bottom: 500,
        width: 500,
        height: 500,
      }),
    };

    drawings = [];
    addedDrawings = [];
    updatedDrawings = [];
    deletedIds = [];
    selectedId = null;
  });

  function fireContainerEvent(type: string, eventData: any) {
    const handler = eventListeners.get(type);
    if (handler) {
      handler({
        preventDefault: vi.fn(),
        pointerId: 1,
        pointerType: "mouse",
        ...eventData,
      });
    }
  }

  function createController() {
    return new DrawingInteractionController({
      getContainer: () => container,
      getChart: () => mockChart as any,
      getSeries: () => mockSeries as any,
      getCandles: () => createMockCandles(),
      getDrawings: () => drawings,
      getVpPrimitive: () => undefined,
      getAvwapPrimitive: () => undefined,
      onDrawingAdd: (d) => {
        addedDrawings.push(d);
        drawings.push(d);
      },
      onDrawingUpdate: (d, commit) => {
        updatedDrawings.push({ drawing: d, commit });
        const idx = drawings.findIndex((item) => item.id === d.id);
        if (idx >= 0) drawings[idx] = d;
      },
      onDrawingDelete: (id) => {
        deletedIds.push(id);
        drawings = drawings.filter((d) => d.id !== id);
      },
      onDrawingSelect: (id) => {
        selectedId = id;
      },
    });
  }

  it("handles mode switching and escape cancellation", () => {
    const controller = createController();
    expect(controller.getDrawingMode()).toBe("pointer");

    controller.setDrawingMode("fixed-range-volume-profile");
    expect(controller.getDrawingMode()).toBe("fixed-range-volume-profile");

    // Press Escape resets mode to pointer
    controller.handleKeyDown({ key: "Escape" } as any);
    expect(controller.getDrawingMode()).toBe("pointer");

    controller.destroy();
  });

  it("deletes selected drawing on Delete or Backspace key", () => {
    const vpDrawing: VolumeProfileRangeDrawing = {
      id: "vp-1",
      type: "volume-profile-range",
      fromTimestamp: 1_000_000,
      toTimestamp: 1_120_000,
      from: 1_000_000,
      to: 1_120_000,
      createdAt: 1_000_000,
    };
    drawings.push(vpDrawing);

    const controller = createController();
    controller.selectDrawing("vp-1");
    expect(selectedId).toBe("vp-1");

    controller.handleKeyDown({ key: "Delete" } as any);
    expect(deletedIds).toContain("vp-1");
    expect(drawings).toHaveLength(0);

    controller.destroy();
  });

  it("creates an Anchored VWAP drawing and auto-switches to pointer mode", () => {
    const controller = createController();
    controller.setDrawingMode("anchored-vwap");

    // Click at coordinate x = 60
    fireContainerEvent("pointerdown", { clientX: 60, clientY: 100 });

    expect(addedDrawings).toHaveLength(1);
    const created = addedDrawings[0] as AnchoredVwapDrawing;
    expect(created.type).toBe("anchored-vwap");
    expect(created.anchorTimestamp).toBe(1_060_000); // Snapped to nearest candle!
    expect(controller.getDrawingMode()).toBe("pointer");
    expect(selectedId).toBe(created.id);

    controller.destroy();
  });

  it("suppresses chart scroll during drag and restores on release", () => {
    const vpDrawing: VolumeProfileRangeDrawing = {
      id: "vp-1",
      type: "volume-profile-range",
      fromTimestamp: 1_000_000,
      toTimestamp: 1_120_000,
      from: 1_000_000,
      to: 1_120_000,
      createdAt: 1_000_000,
    };
    drawings.push(vpDrawing);

    const controller = createController();
    controller.selectDrawing("vp-1");

    // Click on start boundary (x = 0 coordinate for timestamp 1_000_000)
    fireContainerEvent("pointerdown", { clientX: 0, clientY: 50 });

    expect(mockChart.applyOptions).toHaveBeenCalledWith(
      expect.objectContaining({ handleScroll: false, handleScale: false }),
    );

    // Release pointer
    fireContainerEvent("pointerup", { clientX: 60, clientY: 50 });

    expect(mockChart.applyOptions).toHaveBeenCalledWith(
      expect.objectContaining({ handleScroll: true, handleScale: true }),
    );

    controller.destroy();
  });
});

