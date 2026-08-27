import type { Candle } from "@options-chart/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    visibleRange: { from: 1_700_000_000, to: 1_700_003_600 },
    logicalRangeHandler: null as
      ((range: { from: number; to: number }) => void) | null,
    containerClickHandler: null as EventListener | null,
  };
  const container = {
    addEventListener: vi.fn(
      (type: string, handler: EventListenerOrEventListenerObject) => {
        if (type === "click" && typeof handler === "function") {
          state.containerClickHandler = handler;
        }
      },
    ),
    removeEventListener: vi.fn(),
    getBoundingClientRect: vi.fn(() => ({
      left: 0,
      top: 0,
      width: 1_200,
      height: 700,
    })),
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
