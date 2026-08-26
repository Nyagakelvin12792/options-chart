import type { Candle, GammaLevel } from "@options-chart/domain";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineStyle,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

import type {
  ChartAdapter,
  ChartInitializeOptions,
  ChartVisibleRange,
} from "../chart-adapter";

const LEVEL_COLORS: Readonly<Record<GammaLevel["kind"], string>> = {
  "call-wall": "#29b57a",
  "put-wall": "#e05263",
  "gamma-flip": "#f0b44d",
  "max-pain": "#65a9ff",
  "secondary-gex": "#9aa7b6",
};

const toChartTimestamp = (timestamp: number): UTCTimestamp =>
  Math.floor(timestamp / 1_000) as UTCTimestamp;

const toChartCandle = (candle: Candle): CandlestickData<UTCTimestamp> => ({
  time: toChartTimestamp(candle.openTime),
  open: candle.open,
  high: candle.high,
  low: candle.low,
  close: candle.close,
});

const toChartVolume = (candle: Candle): HistogramData<UTCTimestamp> => ({
  time: toChartTimestamp(candle.openTime),
  value: candle.volume,
  color:
    candle.close >= candle.open
      ? "rgba(37, 169, 119, 0.45)"
      : "rgba(220, 83, 98, 0.45)",
});

export class LightweightChartsAdapter implements ChartAdapter {
  readonly name = "lightweight-charts";
  readonly version = "5.2.1";

  private chart: IChartApi | null = null;
  private series: ISeriesApi<"Candlestick"> | null = null;
  private volumeSeries: ISeriesApi<"Histogram"> | null = null;
  private readonly levelLines = new Map<string, IPriceLine>();

  initialize(container: HTMLElement, options: ChartInitializeOptions): void {
    if (this.chart) {
      throw new Error("Chart adapter is already initialized");
    }

    this.chart = createChart(container, {
      width: options.width,
      height: options.height,
      layout: {
        background: { type: ColorType.Solid, color: options.backgroundColor },
        textColor: options.textColor,
        fontFamily: "Arial, Helvetica, sans-serif",
      },
      grid: {
        vertLines: { color: "#202b35" },
        horzLines: { color: "#202b35" },
      },
      rightPriceScale: {
        borderColor: "#33414e",
        scaleMargins: {
          top: 0.08,
          bottom: 0.22,
        },
      },
      timeScale: {
        borderColor: "#33414e",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { color: "#7d8b99", labelBackgroundColor: "#25313c" },
        horzLine: { color: "#7d8b99", labelBackgroundColor: "#25313c" },
      },
      handleScale: true,
      handleScroll: true,
    });

    this.series = this.chart.addSeries(CandlestickSeries, {
      upColor: "#25a977",
      downColor: "#dc5362",
      borderVisible: false,
      wickUpColor: "#25a977",
      wickDownColor: "#dc5362",
      priceLineVisible: true,
      lastValueVisible: true,
    });

    this.volumeSeries = this.chart.addSeries(HistogramSeries, {
      priceFormat: {
        type: "volume",
      },
      priceScaleId: "",
    });

    this.volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });
  }

  setHistory(candles: readonly Candle[]): void {
    this.requireSeries().setData(candles.map(toChartCandle));
    this.volumeSeries?.setData(candles.map(toChartVolume));
    this.requireChart().timeScale().fitContent();
  }

  updateCandle(candle: Candle): void {
    this.requireSeries().update(toChartCandle(candle));
    this.volumeSeries?.update(toChartVolume(candle));
  }

  setLevels(levels: readonly GammaLevel[]): void {
    const series = this.requireSeries();
    for (const line of this.levelLines.values()) {
      series.removePriceLine(line);
    }
    this.levelLines.clear();

    for (const level of levels) {
      const line = series.createPriceLine({
        price: level.price,
        color: LEVEL_COLORS[level.kind],
        lineWidth: level.importance === "primary" ? 2 : 1,
        lineStyle:
          level.importance === "primary" ? LineStyle.Solid : LineStyle.Dashed,
        axisLabelVisible: true,
        title: level.label,
      });
      this.levelLines.set(level.id, line);
    }
  }

  removeLevel(id: string): void {
    const line = this.levelLines.get(id);
    if (!line) {
      return;
    }

    this.requireSeries().removePriceLine(line);
    this.levelLines.delete(id);
  }

  setVisibleRange(range: ChartVisibleRange): void {
    this.requireChart()
      .timeScale()
      .setVisibleRange({
        from: toChartTimestamp(range.fromTimestamp),
        to: toChartTimestamp(range.toTimestamp),
      });
  }

  getVisibleRange(): ChartVisibleRange | null {
    const range = this.requireChart().timeScale().getVisibleRange();
    if (
      !range ||
      typeof range.from !== "number" ||
      typeof range.to !== "number"
    ) {
      return null;
    }

    return {
      fromTimestamp: range.from * 1_000,
      toTimestamp: range.to * 1_000,
    };
  }

  resize(width: number, height: number): void {
    this.requireChart().resize(width, height);
  }

  destroy(): void {
    this.levelLines.clear();
    this.chart?.remove();
    this.chart = null;
    this.series = null;
    this.volumeSeries = null;
  }

  private requireChart(): IChartApi {
    if (!this.chart) {
      throw new Error("Chart adapter is not initialized");
    }
    return this.chart;
  }

  private requireSeries(): ISeriesApi<"Candlestick"> {
    if (!this.series) {
      throw new Error("Chart adapter is not initialized");
    }
    return this.series;
  }
}
