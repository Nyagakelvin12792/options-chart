/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Candle } from "@options-chart/domain";
import type { VolumeProfileRangeDrawing } from "../chart-adapter";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const documentMock = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn((event: Event) => {
      const handlers = state.documentEventHandlers[event.type] || [];
      for (const h of handlers) {
        if (typeof h === "function") h(event);
        else h.handleEvent(event);
      }
      return true;
    }),
  };
  (globalThis as any).document = documentMock as any;
  
  if (typeof (globalThis as any).Element === "undefined") {
    (globalThis as any).Element = class Element {};
  }

  class BaseEvent {
    type: string;
    target: any;
    bubbles: boolean;
    constructor(type: string, options: any = {}) {
      this.type = type;
      this.target = options.target || null;
      this.bubbles = options.bubbles || false;
    }
    preventDefault = vi.fn();
    stopPropagation = vi.fn();
  }

  if (typeof (globalThis as any).KeyboardEvent === "undefined") {
    (globalThis as any).KeyboardEvent = class KeyboardEvent extends BaseEvent {
      key: string;
      constructor(type: string, options: any) {
        super(type, options);
        this.key = options.key;
      }
    };
  }

  if (typeof (globalThis as any).PointerEvent === "undefined") {
    (globalThis as any).PointerEvent = class PointerEvent extends BaseEvent {
      clientX: number;
      clientY: number;
      pointerId: number;
      buttons: number;
      constructor(type: string, options: any) {
        super(type, options);
        this.clientX = options.clientX || 0;
        this.clientY = options.clientY || 0;
        this.pointerId = options.pointerId || 0;
        this.buttons = options.buttons || 0;
      }
    };
  }

  if (typeof (globalThis as any).MouseEvent === "undefined") {
    (globalThis as any).MouseEvent = class MouseEvent extends BaseEvent {
      constructor(type: string, options: any = {}) {
        super(type, options);
      }
    };
  }
  
  if (typeof (globalThis as any).requestAnimationFrame === "undefined") {
    (globalThis as any).requestAnimationFrame = vi.fn((cb: any) => { cb(); return 1; });
    (globalThis as any).cancelAnimationFrame = vi.fn();
  }

  const state = {
    visibleRange: { from: 1_700_000_000, to: 1_700_003_600 },
    logicalRangeHandler: null as
      ((range: { from: number; to: number }) => void) | null,
    containerClickHandler: null as EventListener | null,
    eventHandlers: {} as Record<string, EventListenerOrEventListenerObject[]>,
    documentEventHandlers: {} as Record<string, EventListenerOrEventListenerObject[]>,
  };
  documentMock.addEventListener.mockImplementation((type: string, handler: EventListenerOrEventListenerObject) => {
    if (!state.documentEventHandlers[type]) state.documentEventHandlers[type] = [];
    state.documentEventHandlers[type].push(handler);
  });
  const container = {
    addEventListener: vi.fn(
      (type: string, handler: EventListenerOrEventListenerObject) => {
        if (type === "click" && typeof handler === "function") {
          state.containerClickHandler = handler;
        }
        if (!state.eventHandlers[type]) state.eventHandlers[type] = [];
        state.eventHandlers[type].push(handler);
      },
    ),
    removeEventListener: vi.fn(),
    getBoundingClientRect: vi.fn(() => ({
      left: 0,
      top: 0,
      width: 1_200,
      height: 700,
    })),
    dispatchEvent: vi.fn((event: Event) => {
      const handlers = state.eventHandlers[event.type] || [];
      for (const h of handlers) {
        if (typeof h === "function") h(event);
        else h.handleEvent(event);
      }
      return true;
    }),
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
  };
  const candleSeries = {
    setData: vi.fn(),
    update: vi.fn(),
    createPriceLine: vi.fn((options: unknown) => ({ options })),
    removePriceLine: vi.fn(),
    coordinateToPrice: vi.fn(() => 61_000),
    priceToCoordinate: vi.fn(() => 240),
    barsInLogicalRange: vi.fn(() => ({ barsBefore: 25, barsAfter: 12 })),
    attachPrimitive: vi.fn(),
    detachPrimitive: vi.fn(),
  };
  const volumePane = { setHeight: vi.fn() };
  const volumeSeries = {
    setData: vi.fn(),
    update: vi.fn(),
    priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
    getPane: vi.fn(() => volumePane),
  };
  const timeScale = {
    fitContent: vi.fn(),
    setVisibleRange: vi.fn((range: { from: number; to: number }) => {
      state.visibleRange = range;
    }),
    getVisibleRange: vi.fn(() => state.visibleRange),
    subscribeVisibleLogicalRangeChange: vi.fn(
      (handler: (range: { from: number; to: number }) => void) => {
        state.logicalRangeHandler = handler;
      },
    ),
    unsubscribeVisibleLogicalRangeChange: vi.fn(),
    coordinateToTime: vi.fn(() => 1_700_001_800),
    timeToCoordinate: vi.fn(() => 120),
  };
  const chart = {
    addSeries: vi.fn((definition: string) =>
      definition === "candles" ? candleSeries : volumeSeries,
    ),
    timeScale: vi.fn(() => timeScale),
    resize: vi.fn(),
    remove: vi.fn(),
  };
  return {
    state,
    container,
    candleSeries,
    volumeSeries,
    volumePane,
    timeScale,
    chart,
    createChart: vi.fn(() => chart),
  };
});

vi.mock("lightweight-charts", () => ({
  CandlestickSeries: "candles",
  HistogramSeries: "volume",
  ColorType: { Solid: "solid" },
  CrosshairMode: { Normal: "normal" },
  LineStyle: { Solid: 0, Dashed: 2 },
  createChart: mocks.createChart,
}));

import { LightweightChartsAdapter } from "./lightweight-chart-adapter";

const makeCandle = (openTime: number, close = 60_000): Candle => ({
  metadata: {
    source: "binance",
    sourceTimestamp: openTime + 3_599_999,
    receivedTimestamp: openTime + 3_600_000,
    normalizedTimestamp: openTime + 3_600_001,
    schemaVersion: "test-v1",
  },
  symbol: "BTCUSDT",
  interval: "1h",
  openTime,
  closeTime: openTime + 3_599_999,
  open: close - 100,
  high: close + 200,
  low: close - 250,
  close,
  volume: 12,
  quoteVolume: 720_000,
  tradeCount: 42,
  isClosed: true,
});

const initialize = () => {
  const adapter = new LightweightChartsAdapter();
  adapter.initialize(mocks.container as unknown as HTMLElement, {
    symbol: "BTCUSDT",
    width: 1_200,
    height: 700,
    backgroundColor: "#111820",
    textColor: "#ffffff",
    enableConflation: false,
  });
  return adapter;
};

describe("LightweightChartsAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.visibleRange = {
      from: 1_700_000_000,
      to: 1_700_003_600,
    };
    mocks.state.logicalRangeHandler = null;
    mocks.state.containerClickHandler = null;
  });

  it("creates one chart and loads candlestick and volume history", () => {
    const adapter = initialize();
    const candles = [
      makeCandle(1_700_000_000_000),
      makeCandle(1_700_003_600_000),
    ];

    adapter.setHistory(candles);

    expect(mocks.createChart).toHaveBeenCalledTimes(1);
    expect(mocks.createChart).toHaveBeenCalledWith(
      mocks.container,
      expect.objectContaining({
        crosshair: expect.objectContaining({ mode: "normal" }),
      }),
    );
    expect(mocks.candleSeries.setData).toHaveBeenCalledTimes(1);
    expect(mocks.volumeSeries.setData).toHaveBeenCalledTimes(1);
    expect(mocks.timeScale.fitContent).toHaveBeenCalledTimes(1);
    expect(adapter.getDiagnostics()).toMatchObject({
      chartCreateCount: 1,
      historyReplacementCount: 1,
      dataPointCount: 2,
      conflationEnabled: false,
    });
  });

  it("uses incremental updates without resetting the viewport", () => {
    const adapter = initialize();
    adapter.setHistory([makeCandle(1_700_000_000_000)]);
    vi.clearAllMocks();

    adapter.updateCandle(makeCandle(1_700_000_000_000, 61_000));

    expect(mocks.candleSeries.update).toHaveBeenCalledTimes(1);
    expect(mocks.volumeSeries.update).toHaveBeenCalledTimes(1);
    expect(mocks.candleSeries.setData).not.toHaveBeenCalled();
    expect(mocks.timeScale.fitContent).not.toHaveBeenCalled();
    expect(adapter.getDiagnostics().realtimeUpdateCount).toBe(1);
  });

  it("can omit the volume pane while preserving candle updates", () => {
    const adapter = new LightweightChartsAdapter();
    adapter.initialize(mocks.container as unknown as HTMLElement, {
      symbol: "BTCUSDT",
      width: 1_200,
      height: 700,
      backgroundColor: "#111820",
      textColor: "#ffffff",
      showVolumePane: false,
    });

    adapter.setHistory([makeCandle(1_700_000_000_000)]);
    adapter.updateCandle(makeCandle(1_700_000_000_000, 61_000));

    expect(mocks.chart.addSeries).toHaveBeenCalledTimes(1);
    expect(mocks.candleSeries.setData).toHaveBeenCalledTimes(1);
    expect(mocks.candleSeries.update).toHaveBeenCalledTimes(1);
    expect(mocks.volumeSeries.setData).not.toHaveBeenCalled();
    expect(mocks.volumeSeries.update).not.toHaveBeenCalled();
  });

  it("restores the exact visible range after a repair replacement", () => {
    const adapter = initialize();
    const before = adapter.getVisibleRange();

    adapter.setHistory([makeCandle(1_700_000_000_000)], {
      preserveVisibleRange: true,
      fitContent: false,
    });

    expect(mocks.timeScale.setVisibleRange).toHaveBeenCalledWith({
      from: (before?.fromTimestamp ?? 0) / 1_000,
      to: (before?.toTimestamp ?? 0) / 1_000,
    });
    expect(mocks.timeScale.fitContent).not.toHaveBeenCalled();
  });

  it("maps an options level price onto the chart y-coordinate", () => {
    const adapter = initialize();

    expect(adapter.priceToCoordinate(61_000)).toBe(240);
    expect(mocks.candleSeries.priceToCoordinate).toHaveBeenCalledWith(61_000);
    expect(adapter.priceToCoordinate(Number.NaN)).toBeNull();
  });

  it("keeps drawings separate from history replacements", () => {
    const adapter = initialize();
    adapter.addDrawing({
      id: "horizontal",
      type: "horizontal-line",
      price: 60_500,
      createdAt: 1,
    });
    adapter.addDrawing({
      id: "vertical",
      type: "vertical-line",
      timestamp: 1_700_000_000_000,
      createdAt: 2,
    });

    adapter.setHistory([makeCandle(1_700_000_000_000)]);

    expect(adapter.getDrawings()).toHaveLength(2);
    expect(mocks.candleSeries.createPriceLine).toHaveBeenCalledTimes(1);
    expect(mocks.candleSeries.attachPrimitive).toHaveBeenCalledTimes(1);
    adapter.deleteSelectedDrawing();
    expect(adapter.getDrawings()).toHaveLength(1);
  });

  it("renders long and short position drawings as entry, stop, and target", () => {
    const adapter = initialize();
    adapter.addDrawing({
      id: "long-position",
      type: "position",
      direction: "long",
      entry: 60_000,
      stopLoss: 59_500,
      takeProfit: 61_000,
      createdAt: 1,
    });
    adapter.addDrawing({
      id: "short-position",
      type: "position",
      direction: "short",
      entry: 60_000,
      stopLoss: 60_500,
      takeProfit: 59_000,
      createdAt: 2,
    });

    expect(adapter.getDrawings()).toHaveLength(2);
    expect(mocks.candleSeries.createPriceLine).not.toHaveBeenCalled();
    expect(mocks.candleSeries.attachPrimitive).toHaveBeenCalledTimes(2);
  });

  it("renders a fixed Volume Profile range with two draggable boundaries", () => {
    const adapter = initialize();
    adapter.addDrawing({
      id: "vp-range",
      type: "volume-profile-range",
      fromTimestamp: 1_700_000_000_000,
      toTimestamp: 1_700_003_600_000,
      createdAt: 1,
    });

    expect(adapter.getDrawings()).toEqual([
      expect.objectContaining({
        id: "vp-range",
        fromTimestamp: 1_700_000_000_000,
        toTimestamp: 1_700_003_600_000,
      }),
    ]);
    expect(mocks.candleSeries.attachPrimitive).toHaveBeenCalledTimes(2);
    adapter.removeDrawing("vp-range");
    expect(mocks.candleSeries.detachPrimitive).toHaveBeenCalledTimes(2);
  });

  it("reports viewport proximity and removes chart listeners on destroy", () => {
    const adapter = initialize();
    const listener = vi.fn();
    adapter.subscribeViewportChange(listener);

    mocks.state.logicalRangeHandler?.({ from: 10, to: 50 });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ barsBefore: 25, barsAfter: 12 }),
    );
    adapter.destroy();
    expect(mocks.container.removeEventListener).toHaveBeenCalledWith(
      "click",
      expect.any(Function),
      true,
    );
    expect(
      mocks.timeScale.unsubscribeVisibleLogicalRangeChange,
    ).toHaveBeenCalledTimes(1);
    expect(mocks.chart.remove).toHaveBeenCalledTimes(1);
  });
});

const makePointerEvent = (type: string, x = 100, y = 200) =>
  new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true });

describe("Batch 1: one-shot tools, candle-snap, and VP preview", () => {
  const initialize = () => {
    const adapter = new LightweightChartsAdapter();
    adapter.initialize(mocks.container as unknown as HTMLElement, {
      symbol: "BTCUSDT",
      width: 1_200,
      height: 700,
      backgroundColor: "#111820",
      textColor: "#ffffff",
      showVolumePane: true,
    });
    return adapter;
  };

  it("Test 1 — VP creates exactly one drawing", () => {
    const adapter = initialize();
    adapter.setHistory([
      makeCandle(1_700_000_000_000),
      makeCandle(1_700_001_800_000),
      makeCandle(1_700_003_600_000),
    ]);
    adapter.setDrawingMode("fixed-range-volume-profile");
    
    mocks.timeScale.coordinateToTime.mockReturnValueOnce(1_700_000_000).mockReturnValueOnce(1_700_003_600);
    mocks.container.dispatchEvent(makePointerEvent("pointerdown", 100, 200));
    mocks.container.dispatchEvent(makePointerEvent("pointermove", 200, 200));
    mocks.container.dispatchEvent(makePointerEvent("pointerup", 200, 200));
    
    const drawings = adapter.getDrawings();
    expect(drawings).toHaveLength(1);
    expect(drawings[0]?.type).toBe("volume-profile-range");
  });

  it("Test 2 — VP completion returns to pointer", () => {
    const adapter = initialize();
    adapter.setHistory([makeCandle(1_700_000_000_000)]);
    adapter.setDrawingMode("fixed-range-volume-profile");
    
    const spy = vi.fn();
    adapter.subscribeDrawingModeChange?.(spy);
    
    mocks.container.dispatchEvent(makePointerEvent("pointerdown", 100, 200));
    mocks.container.dispatchEvent(makePointerEvent("pointerup", 200, 200));
    
    expect(spy).toHaveBeenCalledWith("pointer");
  });

  it("Test 3 — Subsequent drag does not create another VP", () => {
    const adapter = initialize();
    adapter.setHistory([makeCandle(1_700_000_000_000)]);
    adapter.setDrawingMode("fixed-range-volume-profile");
    
    mocks.container.dispatchEvent(makePointerEvent("pointerdown", 100, 200));
    mocks.container.dispatchEvent(makePointerEvent("pointerup", 200, 200));
    
    expect(adapter.getDrawings()).toHaveLength(1);
    
    mocks.container.dispatchEvent(makePointerEvent("pointerdown", 300, 200));
    mocks.container.dispatchEvent(makePointerEvent("pointerup", 400, 200));
    
    expect(adapter.getDrawings()).toHaveLength(1);
  });

  it("Test 4 — Toolbar subscription fires on mode change", () => {
    const adapter = initialize();
    const spy = vi.fn();
    const unsub = adapter.subscribeDrawingModeChange?.(spy);
    
    adapter.setDrawingMode("horizontal-line");
    expect(spy).toHaveBeenCalledWith("horizontal-line");
    
    adapter.setDrawingMode("horizontal-line");
    expect(spy).toHaveBeenCalledTimes(1);
    
    adapter.setDrawingMode("pointer");
    expect(spy).toHaveBeenCalledWith("pointer");
    expect(spy).toHaveBeenCalledTimes(2);
    
    unsub?.();
    adapter.setDrawingMode("horizontal-line");
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("Test 5 — H-line completion returns to pointer", () => {
    const adapter = initialize();
    adapter.setDrawingMode("horizontal-line");
    
    const spy = vi.fn();
    adapter.subscribeDrawingModeChange?.(spy);
    
    mocks.state.containerClickHandler?.(new MouseEvent("click"));
    
    expect(spy).toHaveBeenCalledWith("pointer");
    expect(adapter.getDrawings()).toHaveLength(1);
    expect(adapter.getDrawings()[0]?.type).toBe("horizontal-line");
  });

  it("Test 6 — V-line completion returns to pointer", () => {
    const adapter = initialize();
    adapter.setDrawingMode("vertical-line");
    
    const spy = vi.fn();
    adapter.subscribeDrawingModeChange?.(spy);
    
    mocks.state.containerClickHandler?.(new MouseEvent("click"));
    
    expect(spy).toHaveBeenCalledWith("pointer");
    expect(adapter.getDrawings()).toHaveLength(1);
    expect(adapter.getDrawings()[0]?.type).toBe("vertical-line");
  });

  it("Test 7 — AVWAP completion returns to pointer", () => {
    const adapter = initialize();
    adapter.setDrawingMode("anchored-vwap");
    
    const modeSpy = vi.fn();
    adapter.subscribeDrawingModeChange?.(modeSpy);
    const timeSpy = vi.fn();
    adapter.subscribeTimeSelection(timeSpy);
    
    mocks.state.containerClickHandler?.(new MouseEvent("click"));
    
    expect(modeSpy).toHaveBeenCalledWith("pointer");
    expect(timeSpy).toHaveBeenCalled();
  });

  it("Test 8 — Position 3-point completion returns to pointer", () => {
    const adapter = initialize();
    adapter.setDrawingMode("long-position");
    
    const modeSpy = vi.fn();
    adapter.subscribeDrawingModeChange?.(modeSpy);
    
    mocks.candleSeries.coordinateToPrice.mockReturnValueOnce(60000);
    mocks.state.containerClickHandler?.(new MouseEvent("click"));
    mocks.candleSeries.coordinateToPrice.mockReturnValueOnce(59000);
    mocks.state.containerClickHandler?.(new MouseEvent("click"));
    mocks.candleSeries.coordinateToPrice.mockReturnValueOnce(61000);
    mocks.state.containerClickHandler?.(new MouseEvent("click"));
    
    expect(adapter.getDrawings()).toHaveLength(1);
    expect(adapter.getDrawings()[0]?.type).toBe("position");
    expect(modeSpy).toHaveBeenCalledWith("pointer");
  });

  it("Test 9 — Escape cancels VP pending state", () => {
    const adapter = initialize();
    adapter.setDrawingMode("fixed-range-volume-profile");
    
    mocks.container.dispatchEvent(makePointerEvent("pointerdown", 100, 200));
    
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    
    mocks.container.dispatchEvent(makePointerEvent("pointerup", 200, 200));
    
    expect(adapter.getDrawings()).toHaveLength(0);
    const spy = vi.fn();
    adapter.subscribeDrawingModeChange?.(spy);
  });

  it("Test 10 — pointercancel clears VP preview and returns to pointer", () => {
    const adapter = initialize();
    adapter.setDrawingMode("fixed-range-volume-profile");
    mocks.container.dispatchEvent(makePointerEvent("pointerdown", 100, 200));
    
    const spy = vi.fn();
    adapter.subscribeDrawingModeChange?.(spy);
    
    mocks.container.dispatchEvent(makePointerEvent("pointercancel", 100, 200));
    
    expect(spy).toHaveBeenCalledWith("pointer");
    mocks.container.dispatchEvent(makePointerEvent("pointerup", 200, 200));
    expect(adapter.getDrawings()).toHaveLength(0);
  });

  it("Test 11 — Switching tools clears pending state", () => {
    const adapter = initialize();
    adapter.setDrawingMode("fixed-range-volume-profile");
    mocks.container.dispatchEvent(makePointerEvent("pointerdown", 100, 200));
    
    adapter.setDrawingMode("horizontal-line");
    mocks.container.dispatchEvent(makePointerEvent("pointerup", 200, 200));
    
    expect(adapter.getDrawings()).toHaveLength(0);
  });

  it("Test 12 — Preview timestamps snap to real candles", () => {
    const adapter = initialize();
    adapter.setHistory([
      makeCandle(1_700_000_000_000),
      makeCandle(1_700_003_600_000),
    ]);
    adapter.setDrawingMode("fixed-range-volume-profile");
    
    mocks.timeScale.coordinateToTime.mockReturnValueOnce(1_700_001_800);
    mocks.container.dispatchEvent(makePointerEvent("pointerdown", 100, 200));
    
    mocks.timeScale.coordinateToTime.mockReturnValueOnce(1_700_003_600);
    mocks.container.dispatchEvent(makePointerEvent("pointerup", 200, 200));
    
    const drawing = adapter.getDrawings()[0] as VolumeProfileRangeDrawing | undefined;
    expect(drawing).toBeDefined();
    expect([1_700_000_000_000, 1_700_003_600_000]).toContain(drawing?.fromTimestamp);
  });

  it("Test 13 — Reverse-direction drag normalizes range", () => {
    const adapter = initialize();
    adapter.setHistory([
      makeCandle(1_700_000_000_000),
      makeCandle(1_700_003_600_000),
    ]);
    adapter.setDrawingMode("fixed-range-volume-profile");
    
    mocks.timeScale.coordinateToTime.mockReturnValueOnce(1_700_003_600);
    mocks.container.dispatchEvent(makePointerEvent("pointerdown", 300, 200));
    
    mocks.timeScale.coordinateToTime.mockReturnValueOnce(1_700_000_000);
    mocks.container.dispatchEvent(makePointerEvent("pointerup", 100, 200));
    
    const drawing = adapter.getDrawings()[0] as VolumeProfileRangeDrawing | undefined;
    expect(drawing).toBeDefined();
    expect(drawing!.fromTimestamp).toBeLessThan(drawing!.toTimestamp);
  });

  it("Test 14 — Boundary drag snaps to candle", () => {
    const adapter = initialize();
    adapter.setHistory([
      makeCandle(1_700_000_000_000),
      makeCandle(1_700_003_600_000),
    ]);
    adapter.addDrawing({
      id: "vp1",
      type: "volume-profile-range",
      fromTimestamp: 1_700_000_000_000,
      toTimestamp: 1_700_003_600_000,
      createdAt: Date.now()
    });
    adapter.setDrawingMode("pointer");
    
    mocks.timeScale.timeToCoordinate.mockReturnValue(120);
    mocks.container.dispatchEvent(makePointerEvent("pointerdown", 120, 200));
    mocks.timeScale.coordinateToTime.mockReturnValueOnce(1_700_001_800);
    mocks.container.dispatchEvent(makePointerEvent("pointermove", 150, 200));
    mocks.container.dispatchEvent(makePointerEvent("pointerup", 150, 200));
    
    const drawing = adapter.getDrawings()[0] as VolumeProfileRangeDrawing | undefined;
    expect(drawing).toBeDefined();
    expect([1_700_000_000_000, 1_700_003_600_000]).toContain(drawing?.fromTimestamp);
  });

  it("Test 15 — Adapter destroy removes listeners", () => {
    const adapter = initialize();
    const modeSpy = vi.fn();
    const drawSpy = vi.fn();
    adapter.subscribeDrawingModeChange?.(modeSpy);
    adapter.subscribeDrawingsChange(drawSpy);
    
    adapter.destroy();
    
    expect(() => adapter.setDrawingMode("horizontal-line")).not.toThrow();
    expect(modeSpy).not.toHaveBeenCalled();
    expect(drawSpy).not.toHaveBeenCalled();
  });

  it("Test 16 — Escape cancels long-position pending", () => {
    const adapter = initialize();
    adapter.setDrawingMode("long-position");
    
    mocks.candleSeries.coordinateToPrice.mockReturnValueOnce(60000);
    mocks.state.containerClickHandler?.(new MouseEvent("click"));
    
    const modeSpy = vi.fn();
    adapter.subscribeDrawingModeChange?.(modeSpy);
    
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    
    expect(adapter.getDrawings()).toHaveLength(0);
    expect(modeSpy).toHaveBeenCalledWith("pointer");
  });

  it("Test 17 — Chart viewport unchanged during VP preview", () => {
    const adapter = initialize();
    adapter.setHistory([makeCandle(1_700_000_000_000)]);
    adapter.setDrawingMode("fixed-range-volume-profile");
    
    const beforeCount = mocks.timeScale.setVisibleRange.mock.calls.length;
    
    mocks.container.dispatchEvent(makePointerEvent("pointerdown", 100, 200));
    mocks.container.dispatchEvent(makePointerEvent("pointermove", 150, 200));
    mocks.container.dispatchEvent(makePointerEvent("pointerup", 200, 200));
    
    const afterCount = mocks.timeScale.setVisibleRange.mock.calls.length;
    expect(afterCount).toBe(beforeCount);
  });

  it("Test 18 — Existing drawings survive setHistory", () => {
    const adapter = initialize();
    adapter.addDrawing({
      id: "h1", type: "horizontal-line", price: 60000, createdAt: 1
    });
    adapter.addDrawing({
      id: "v1", type: "vertical-line", timestamp: 1_700_000_000_000, createdAt: 2
    });
    
    expect(adapter.getDrawings()).toHaveLength(2);
    
    adapter.setHistory([makeCandle(1_700_000_000_000)]);
    
    expect(adapter.getDrawings()).toHaveLength(2);
  });
});
