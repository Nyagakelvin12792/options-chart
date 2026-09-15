import type { Candle } from "@options-chart/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    visibleRange: { from: 1_700_000_000, to: 1_700_003_600 },
  };
  const container = {
    addEventListener: vi.fn(),
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
    priceToCoordinate: vi.fn((p: number) => 700 - (p - 60_000)),
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
    setVisibleRange: vi.fn(),
    getVisibleRange: vi.fn(() => state.visibleRange),
    subscribeVisibleLogicalRangeChange: vi.fn(),
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

import { LightweightChartsAdapter } from "../lightweight/lightweight-chart-adapter";
import { calculateAnchoredVwap } from "./calculate";
import { AnchoredVwapController } from "./controller";
import { AnchoredVwapPrimitive } from "./anchored-vwap-primitive";
import type { AnchoredVwapInput, AnchoredVwapRenderInput } from "./types";

const makeCandle = (openTime: number, close = 60_000): Candle => ({
  metadata: {
    source: "binance",
    sourceTimestamp: openTime + 59_999,
    receivedTimestamp: openTime + 60_000,
    normalizedTimestamp: openTime + 60_001,
    schemaVersion: "test-v1",
  },
  symbol: "BTCUSDT",
  interval: "1m",
  openTime,
  closeTime: openTime + 59_999,
  open: close - 50,
  high: close + 100,
  low: close - 100,
  close,
  volume: 10,
  quoteVolume: 600_000,
  tradeCount: 20,
  isClosed: true,
});

describe("Anchored VWAP Primitive & Adapter Integration", () => {
  let adapter: LightweightChartsAdapter;
  let dummyRenderInput: AnchoredVwapRenderInput;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new LightweightChartsAdapter();
    adapter.initialize(mocks.container as unknown as HTMLElement, {
      symbol: "BTCUSDT",
      width: 1200,
      height: 700,
      backgroundColor: "#0d1117",
      textColor: "#ffffff",
    });

    const candle = makeCandle(1_000, 60_000);
    const input: AnchoredVwapInput = {
      anchorTimestamp: 1_000,
      candles: [candle],
      bandMultipliers: [1, 2],
    };

    const result = calculateAnchoredVwap(input);
    dummyRenderInput = {
      vwapId: "vwap-test",
      result,
      presentation: {
        vwapColor: "#2962ff",
        showBands: true,
        showAnchorLine: true,
      },
    };
  });

  it("attaches one primitive to series and updates in-place on repeated set calls", () => {
    adapter.setAnchoredVwap("vwap-test", dummyRenderInput);
    expect(mocks.candleSeries.attachPrimitive).toHaveBeenCalledTimes(1);

    const updatedInput: AnchoredVwapRenderInput = {
      ...dummyRenderInput,
      presentation: { ...dummyRenderInput.presentation, vwapColor: "#ff9900" },
    };
    adapter.setAnchoredVwap("vwap-test", updatedInput);

    // attachPrimitive must NOT be called again
    expect(mocks.candleSeries.attachPrimitive).toHaveBeenCalledTimes(1);
  });

  it("detaches primitive cleanly on removeAnchoredVwap", () => {
    adapter.setAnchoredVwap("vwap-test", dummyRenderInput);
    expect(mocks.candleSeries.attachPrimitive).toHaveBeenCalledTimes(1);

    adapter.removeAnchoredVwap("vwap-test");
    expect(mocks.candleSeries.detachPrimitive).toHaveBeenCalledTimes(1);

    // Idempotent removal
    adapter.removeAnchoredVwap("vwap-test");
    expect(mocks.candleSeries.detachPrimitive).toHaveBeenCalledTimes(1);
  });

  it("cleans all attached anchored VWAP primitives on adapter destroy", () => {
    adapter.setAnchoredVwap("vwap-1", dummyRenderInput);
    adapter.setAnchoredVwap("vwap-2", { ...dummyRenderInput, vwapId: "vwap-2" });
    expect(mocks.candleSeries.attachPrimitive).toHaveBeenCalledTimes(2);

    adapter.destroy();
    expect(mocks.candleSeries.detachPrimitive).toHaveBeenCalledTimes(2);
  });

  it("AnchoredVwapPrimitive does not modify chart price autoscale", () => {
    const primitive = new AnchoredVwapPrimitive(dummyRenderInput);
    expect(primitive.autoscaleInfo()).toBeNull();
  });

  it("AnchoredVwapPrimitive provides price axis view for VWAP value", () => {
    const primitive = new AnchoredVwapPrimitive(dummyRenderInput);
    const axisViews = primitive.priceAxisViews();
    expect(axisViews).toHaveLength(1);

    const label = axisViews[0]!.text();
    expect(label).toContain("AVWAP");
  });
});

describe("AnchoredVwapController Lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("coalesces rapid anchor timestamp updates using trailing debounce", () => {
    const renderSpy = vi.fn();
    const controller = new AnchoredVwapController({
      vwapId: "vwap-ctrl",
      debounceMs: 100,
      onRender: renderSpy,
    });

    const candle = makeCandle(1_000, 60_000);
    const baseInput: AnchoredVwapInput = {
      anchorTimestamp: 1_000,
      candles: [candle],
    };

    controller.setInput(baseInput, false);
    vi.advanceTimersByTime(20);
    controller.setInput({ ...baseInput, anchorTimestamp: 1_020 }, false);
    vi.advanceTimersByTime(20);
    controller.setInput({ ...baseInput, anchorTimestamp: 1_040 }, false);
    vi.advanceTimersByTime(20);

    expect(renderSpy).toHaveBeenCalledTimes(0);

    // Fast forward debounce
    vi.advanceTimersByTime(110);
    expect(renderSpy).toHaveBeenCalledTimes(1);

    controller.dispose();
  });

  it("repaints presentation updates immediately with cached calculation", () => {
    const renderSpy = vi.fn();
    const controller = new AnchoredVwapController({
      vwapId: "vwap-ctrl",
      onRender: renderSpy,
    });

    const candle = makeCandle(1_000, 60_000);
    const input: AnchoredVwapInput = {
      anchorTimestamp: 1_000,
      candles: [candle],
    };

    controller.setInput(input, true);
    expect(renderSpy).toHaveBeenCalledTimes(1);
    const initialResult = controller.getCurrentResult();

    controller.setPresentation({ vwapColor: "#ff0000" });
    expect(renderSpy).toHaveBeenCalledTimes(2);

    const secondCallArg = renderSpy.mock.calls[1]![0];
    expect(secondCallArg.result).toBe(initialResult);
    expect(secondCallArg.presentation.vwapColor).toBe("#ff0000");

    controller.dispose();
  });
});
