"use client";

import { LightweightChartsAdapter } from "@options-chart/chart";
import {
  parseBinanceKlines,
  parseDeribitSnapshot,
} from "@options-chart/market-data";
import {
  isOptionsMetricResponse,
  OPTIONS_WORKER_PROTOCOL_VERSION,
  type TotalOpenInterestRequest,
} from "@options-chart/worker-protocol";
import { useEffect, useRef, useState } from "react";

import { DERIBIT_WALKING_SKELETON_FIXTURE } from "@/fixtures/deribit-walking-skeleton";

interface DashboardClientProps {
  readonly accessLabel: string;
  readonly accessMode: "google" | "development";
}

interface ChartBenchmarkResult {
  readonly updates: number;
  readonly durationMs: number;
  readonly averageUpdateMs: number;
}

declare global {
  interface Window {
    __optionsChartBenchmark?: () => ChartBenchmarkResult;
  }
}

const btcFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function DashboardClient({
  accessLabel,
  accessMode,
}: DashboardClientProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartAdapterRef = useRef<LightweightChartsAdapter | null>(null);
  const latestCandleRef = useRef<
    ReturnType<typeof parseBinanceKlines>[number] | null
  >(null);
  const latestInputVersionRef = useRef(0);
  const [candleStatus, setCandleStatus] = useState("Loading history");
  const [candleCount, setCandleCount] = useState(0);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [metricStatus, setMetricStatus] = useState("Worker queued");
  const [totalOpenInterest, setTotalOpenInterest] = useState<number | null>(
    null,
  );
  const [workerDuration, setWorkerDuration] = useState<number | null>(null);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) {
      return;
    }

    const adapter = new LightweightChartsAdapter();
    adapter.initialize(container, {
      symbol: "BTCUSDT",
      width: Math.max(container.clientWidth, 1),
      height: Math.max(container.clientHeight, 1),
      backgroundColor: "#111820",
      textColor: "#aebbc7",
    });
    chartAdapterRef.current = adapter;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }
      adapter.resize(
        Math.max(Math.floor(entry.contentRect.width), 1),
        Math.max(Math.floor(entry.contentRect.height), 1),
      );
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      adapter.destroy();
      chartAdapterRef.current = null;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const loadCandles = async () => {
      try {
        const response = await fetch("/api/binance/klines", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Candle request failed with HTTP ${response.status}`);
        }

        const payload: unknown = await response.json();
        const candles = parseBinanceKlines(payload, Date.now(), "1h");
        if (controller.signal.aborted) {
          return;
        }

        chartAdapterRef.current?.setHistory(candles);
        const latestCandle = candles.at(-1) ?? null;
        latestCandleRef.current = latestCandle;
        setCandleCount(candles.length);
        setLastPrice(latestCandle?.close ?? null);
        setCandleStatus("Validated Binance REST");
      } catch (error) {
        if (!controller.signal.aborted) {
          setCandleStatus(
            error instanceof Error
              ? error.message
              : "Candle history unavailable",
          );
        }
      }
    };

    void loadCandles();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const worker = new Worker(
      new URL("../workers/options-metric.worker.ts", import.meta.url),
      { type: "module", name: "options-metric" },
    );
    const inputVersion = latestInputVersionRef.current + 1;
    latestInputVersionRef.current = inputVersion;

    try {
      const snapshot = parseDeribitSnapshot(
        DERIBIT_WALKING_SKELETON_FIXTURE,
        Date.now(),
      );
      const request: TotalOpenInterestRequest = {
        protocolVersion: OPTIONS_WORKER_PROTOCOL_VERSION,
        type: "calculate-total-open-interest",
        inputVersion,
        openInterestBtc: snapshot.instruments.map(
          ({ quote }) => quote.openInterestBtc,
        ),
      };

      worker.addEventListener("message", (event: MessageEvent<unknown>) => {
        if (
          !isOptionsMetricResponse(event.data) ||
          event.data.inputVersion !== latestInputVersionRef.current
        ) {
          return;
        }

        if (event.data.type === "options-metric-error") {
          setMetricStatus(event.data.message);
          return;
        }

        setTotalOpenInterest(event.data.totalOpenInterestBtc);
        setWorkerDuration(event.data.durationMs);
        setMetricStatus("Validated fixture via worker");
      });
      worker.postMessage(request);
    } catch (error) {
      setMetricStatus(
        error instanceof Error ? error.message : "Fixture validation failed",
      );
    }

    return () => worker.terminate();
  }, []);

  useEffect(() => {
    window.__optionsChartBenchmark = () => {
      const adapter = chartAdapterRef.current;
      const candle = latestCandleRef.current;
      if (!adapter || !candle) {
        throw new Error("Chart benchmark requires loaded candle history");
      }

      const updates = 500;
      const startedAt = performance.now();
      for (let index = 0; index < updates; index += 1) {
        adapter.updateCandle(candle);
      }
      const durationMs = performance.now() - startedAt;
      return {
        updates,
        durationMs,
        averageUpdateMs: durationMs / updates,
      };
    };

    return () => {
      delete window.__optionsChartBenchmark;
    };
  }, []);

  return (
    <main className="dashboard-shell">
      <header className="command-bar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            OC
          </span>
          <div>
            <p className="symbol-label">BTCUSDT</p>
            <h1>Options Chart</h1>
          </div>
        </div>
        <div className="session-cluster">
          <span className="interval-chip">1h</span>
          <span className="access-status">
            <span className="status-dot" aria-hidden="true" />
            {accessMode === "development" ? "Local access" : accessLabel}
          </span>
        </div>
      </header>

      <section className="market-strip" aria-label="Market status">
        <div>
          <span>BTC spot</span>
          <strong>
            {lastPrice === null ? "--" : usdFormatter.format(lastPrice)}
          </strong>
        </div>
        <div>
          <span>Candles</span>
          <strong>{candleCount || "--"}</strong>
        </div>
        <div className="market-strip-wide">
          <span>Source</span>
          <strong>{candleStatus}</strong>
        </div>
      </section>

      <div className="workspace-grid">
        <section
          className="chart-workspace"
          aria-label="BTCUSDT candlestick chart"
        >
          <div className="chart-heading">
            <div>
              <span>BINANCE SPOT</span>
              <strong>BTC / USDT</strong>
            </div>
            <span className="chart-adapter-label">
              Lightweight Charts 5.2.1
            </span>
          </div>
          <div
            ref={chartContainerRef}
            className="chart-stage"
            data-testid="candlestick-chart"
          />
        </section>

        <aside className="metric-rail" aria-label="Options metrics">
          <div className="rail-heading">
            <span>DERIBIT FIXTURE</span>
            <strong>Worker output</strong>
          </div>
          <dl className="metric-list">
            <div>
              <dt>Total open interest</dt>
              <dd data-testid="total-open-interest">
                {totalOpenInterest === null
                  ? "--"
                  : `${btcFormatter.format(totalOpenInterest)} BTC`}
              </dd>
            </div>
            <div>
              <dt>Input contracts</dt>
              <dd>{DERIBIT_WALKING_SKELETON_FIXTURE.instruments.length}</dd>
            </div>
            <div>
              <dt>Worker duration</dt>
              <dd>
                {workerDuration === null
                  ? "--"
                  : `${workerDuration.toFixed(3)} ms`}
              </dd>
            </div>
          </dl>
          <p className="rail-status">{metricStatus}</p>
          <p className="fixture-note">
            Fixture data is labeled and never presented as live market data.
          </p>
        </aside>
      </div>

      <footer className="status-bar">
        <span>Read-only market analytics</span>
        <span>{accessLabel}</span>
      </footer>
    </main>
  );
}
