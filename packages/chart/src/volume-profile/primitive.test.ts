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
import { calculateVolumeProfile } from "./calculate";
import { VolumeProfileController } from "./controller";
import { VolumeProfilePrimitive } from "./volume-profile-primitive";
import type { VolumeProfileInput, VolumeProfileRenderInput } from "./types";

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

describe("VolumeProfile Primitive & Adapter Integration", () => {
  let adapter: LightweightChartsAdapter;
  let dummyRenderInput: VolumeProfileRenderInput;

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

    const candle = makeCandle(1000, 60_000);
    const input: VolumeProfileInput = {
      candles: [candle],
      range: { from: 1000, to: 2000 },
      binConfig: { mode: "rowCount", rowCount: 5 },
      sourceMetadata: {
        exchange: "binance",
        market: "spot",
        symbol: "BTCUSDT",
        sourceTimeframe: "1m",
        displayTimeframe: "15m",
        volumeUnit: "base",
        calculationVersion: "1.0.0",
      },
    };

    const result = calculateVolumeProfile(input);
    dummyRenderInput = {
      profileId: "vp-test",
      result,
      presentation: {
        placement: "right",
        widthFraction: 0.25,
        showPOC: true,
        showVAH: true,
        showVAL: true,
      },
    };
  });

  it("attaches one primitive to candle series and updates in-place on repeated set calls", () => {
    adapter.setVolumeProfile("vp-test", dummyRenderInput);
    expect(mocks.candleSeries.attachPrimitive).toHaveBeenCalledTimes(1);

    // Update with same ID
    const updatedInput: VolumeProfileRenderInput = {
      ...dummyRenderInput,
      presentation: { ...dummyRenderInput.presentation, widthFraction: 0.35 },
    };
    adapter.setVolumeProfile("vp-test", updatedInput);

    // attachPrimitive must NOT be called again
    expect(mocks.candleSeries.attachPrimitive).toHaveBeenCalledTimes(1);
  });

  it("detaches primitive cleanly on removeVolumeProfile", () => {
    adapter.setVolumeProfile("vp-test", dummyRenderInput);
    expect(mocks.candleSeries.attachPrimitive).toHaveBeenCalledTimes(1);

    adapter.removeVolumeProfile("vp-test");
    expect(mocks.candleSeries.detachPrimitive).toHaveBeenCalledTimes(1);

    // Idempotent removal
    adapter.removeVolumeProfile("vp-test");
    expect(mocks.candleSeries.detachPrimitive).toHaveBeenCalledTimes(1);
  });

  it("cleans all attached volume profile primitives on adapter destroy", () => {
    adapter.setVolumeProfile("vp-1", dummyRenderInput);
    adapter.setVolumeProfile("vp-2", { ...dummyRenderInput, profileId: "vp-2" });
    expect(mocks.candleSeries.attachPrimitive).toHaveBeenCalledTimes(2);

    adapter.destroy();
    expect(mocks.candleSeries.detachPrimitive).toHaveBeenCalledTimes(2);
  });

  it("VolumeProfilePrimitive does not modify chart price autoscale", () => {
    const primitive = new VolumeProfilePrimitive(dummyRenderInput);
    expect(primitive.autoscaleInfo()).toBeNull();
  });

  it("VolumeProfilePrimitive provides price axis views for POC, VAH, and VAL", () => {
    const primitive = new VolumeProfilePrimitive(dummyRenderInput);
    const axisViews = primitive.priceAxisViews();
    expect(axisViews).toHaveLength(3);

    const labels = axisViews.map((v) => v.text());
    expect(labels.some((l) => l.startsWith("POC"))).toBe(true);
    expect(labels.some((l) => l.startsWith("VAH"))).toBe(true);
    expect(labels.some((l) => l.startsWith("VAL"))).toBe(true);
  });
});

describe("VolumeProfileController Lifecycle & Performance", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("coalesces rapid viewport updates using trailing debounce", () => {
    const renderSpy = vi.fn();
    const controller = new VolumeProfileController({
      profileId: "vp-ctrl",
      debounceMs: 100,
      onRender: renderSpy,
    });

    const candle = makeCandle(1000, 60_000);
    const baseInput: VolumeProfileInput = {
      candles: [candle],
      range: { from: 1000, to: 2000 },
      binConfig: { mode: "rowCount", rowCount: 5 },
      sourceMetadata: {
        exchange: "binance",
        market: "spot",
        symbol: "BTCUSDT",
        sourceTimeframe: "1m",
        displayTimeframe: "15m",
        volumeUnit: "base",
        calculationVersion: "1.0.0",
      },
    };

    // 5 rapid updates in 50 ms
    controller.setInput(baseInput, false);
    vi.advanceTimersByTime(20);
    controller.setInput({ ...baseInput, range: { from: 1000, to: 2500 } }, false);
    vi.advanceTimersByTime(20);
    controller.setInput({ ...baseInput, range: { from: 1000, to: 3000 } }, false);
    vi.advanceTimersByTime(20);

    expect(renderSpy).toHaveBeenCalledTimes(0);

    // Fast-forward past debounce timeout (100 ms)
    vi.advanceTimersByTime(110);
    expect(renderSpy).toHaveBeenCalledTimes(1);

    controller.dispose();
  });

  it("repaints presentation updates immediately with cached calculation without recomputing rows", () => {
    const renderSpy = vi.fn();
    const controller = new VolumeProfileController({
      profileId: "vp-ctrl",
      onRender: renderSpy,
    });

    const candle = makeCandle(1000, 60_000);
    const input: VolumeProfileInput = {
      candles: [candle],
      range: { from: 1000, to: 2000 },
      binConfig: { mode: "rowCount", rowCount: 5 },
      sourceMetadata: {
        exchange: "binance",
        market: "spot",
        symbol: "BTCUSDT",
        sourceTimeframe: "1m",
        displayTimeframe: "15m",
        volumeUnit: "base",
        calculationVersion: "1.0.0",
      },
    };

    // Immediate calculation
    controller.setInput(input, true);
    expect(renderSpy).toHaveBeenCalledTimes(1);
    const initialResult = controller.getCurrentResult();

    // Change presentation style only
    controller.setPresentation({ placement: "left", widthFraction: 0.4 });
    expect(renderSpy).toHaveBeenCalledTimes(2);

    // Row results object identity is retained (no recomputation)
    const secondCallArg = renderSpy.mock.calls[1]![0];
    expect(secondCallArg.result).toBe(initialResult);
    expect(secondCallArg.presentation.placement).toBe("left");

    controller.dispose();
  });

  it("discards stale generation results and cleans up timers on dispose", () => {
    const renderSpy = vi.fn();
    const controller = new VolumeProfileController({
      profileId: "vp-ctrl",
      debounceMs: 100,
      onRender: renderSpy,
    });

    const candle = makeCandle(1000, 60_000);
    controller.setInput(
      {
        candles: [candle],
        range: { from: 1000, to: 2000 },
        binConfig: { mode: "rowCount", rowCount: 5 },
        sourceMetadata: {
          exchange: "binance",
          market: "spot",
          symbol: "BTCUSDT",
          sourceTimeframe: "1m",
          displayTimeframe: "15m",
          volumeUnit: "base",
          calculationVersion: "1.0.0",
        },
      },
      false,
    );

    // Dispose while pending
    controller.dispose();
    vi.advanceTimersByTime(200);

    expect(renderSpy).toHaveBeenCalledTimes(0);
  });
});
