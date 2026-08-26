"use client";

import { LightweightChartsAdapter } from "@options-chart/chart";
import type {
  Candle,
  CandleInterval,
  FeedHealthState,
} from "@options-chart/domain";
import {
  BinanceKlineSocket,
  BinanceRestClient,
  bootstrapHistory,
  CandleStore,
  parseDeribitSnapshot,
} from "@options-chart/market-data";
import {
  isOptionsMetricResponse,
  OPTIONS_WORKER_PROTOCOL_VERSION,
  type TotalOpenInterestRequest,
} from "@options-chart/worker-protocol";
import { useCallback, useEffect, useRef, useState } from "react";

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

const SUPPORTED_INTERVALS: readonly CandleInterval[] = [
  "1m",
  "5m",
  "15m",
  "1h",
  "4h",
  "1d",
  "1w",
];

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
  const candleStoreRef = useRef<CandleStore | null>(null);
  const binanceSocketRef = useRef<BinanceKlineSocket | null>(null);
  const restClientRef = useRef<BinanceRestClient | null>(null);
  const latestCandleRef = useRef<Candle | null>(null);
  const latestInputVersionRef = useRef(0);

  const [selectedInterval, setSelectedInterval] =
    useState<CandleInterval>("1h");
  const [feedState, setFeedState] = useState<FeedHealthState>("CONNECTING");
  const [candleStatus, setCandleStatus] = useState("Initializing");
  const [candleCount, setCandleCount] = useState(0);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [metricStatus, setMetricStatus] = useState("Worker queued");
  const [totalOpenInterest, setTotalOpenInterest] = useState<number | null>(
    null,
  );
  const [workerDuration, setWorkerDuration] = useState<number | null>(null);

  // Initialize REST client once
  if (!restClientRef.current) {
    restClientRef.current = new BinanceRestClient();
  }

  // Initialize chart adapter
  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

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
      if (!entry) return;
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

  // Reconcile gaps safely while preserving chart viewport
  const handleReconcile = useCallback(async () => {
    const store = candleStoreRef.current;
    const client = restClientRef.current;
    const adapter = chartAdapterRef.current;
    if (!store || !client || !adapter) return;

    const result = await store.reconcile(client);
    if (!result.action) return;

    if (result.action.type === "update") {
      adapter.updateCandle(result.action.candle);
      latestCandleRef.current = result.action.candle;
      setLastPrice(result.action.candle.close);
    } else if (result.action.type === "setData") {
      const visibleRange = adapter.getVisibleRange();
      adapter.setHistory(result.action.candles);
      if (visibleRange) {
        adapter.setVisibleRange(visibleRange);
      }
      setCandleCount(result.action.candles.length);
      const latest = result.action.candles.at(-1) ?? null;
      latestCandleRef.current = latest;
      if (latest) {
        setLastPrice(latest.close);
      }
    }
  }, []);

  // Bootstrap history and establish live WebSocket stream for selected interval
  useEffect(() => {
    const store = new CandleStore(selectedInterval);
    candleStoreRef.current = store;
    const client = restClientRef.current;
    if (!client) return;

    let isMounted = true;
    setCandleStatus(`Loading ${selectedInterval} history`);

    // 1. Paginated historical bootstrap
    void bootstrapHistory(client, {
      interval: selectedInterval,
      targetBars: 120, // Walking skeleton bootstrap bar count
    }).then((bootstrap) => {
      if (!isMounted) return;

      store.setHistory(bootstrap.candles);
      chartAdapterRef.current?.setHistory(bootstrap.candles);

      const latest = bootstrap.candles.at(-1) ?? null;
      latestCandleRef.current = latest;
      setCandleCount(bootstrap.candles.length);
      setLastPrice(latest?.close ?? null);

      const statusLabel =
        bootstrap.completeness === "COMPLETE"
          ? `Binance REST & Live WS (${selectedInterval})`
          : `Binance REST [Degraded] (${selectedInterval})`;
      setCandleStatus(statusLabel);

      // 2. Connect WebSocket after historical bootstrap
      const ws = new BinanceKlineSocket({
        interval: selectedInterval,
        onCandle: (candle) => {
          if (!isMounted) return;
          store.applyLiveCandle(candle);
          chartAdapterRef.current?.updateCandle(candle);
          latestCandleRef.current = candle;
          setLastPrice(candle.close);
          setCandleCount(store.size);
        },
        onHealthChange: (state, _detail) => {
          if (!isMounted) return;
          setFeedState(state);
        },
        onReconnect: () => {
          void handleReconcile();
        },
      });

      binanceSocketRef.current = ws;
      ws.connect();
    });

    return () => {
      isMounted = false;
      if (binanceSocketRef.current) {
        binanceSocketRef.current.destroy();
        binanceSocketRef.current = null;
      }
      candleStoreRef.current = null;
    };
  }, [selectedInterval, handleReconcile]);

  // Sleep/wake recovery: reconcile on visibilitychange
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void handleReconcile();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [handleReconcile]);

  // Deribit calculation worker bridge
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

  // Performance benchmark hook
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
          <nav
            aria-label="Timeframe selector"
            className="timeframe-nav"
            style={{ display: "flex", gap: "4px" }}
          >
            {SUPPORTED_INTERVALS.map((tf) => (
              <button
                key={tf}
                type="button"
                className={`interval-chip ${tf === selectedInterval ? "active" : ""}`}
                style={{
                  background:
                    tf === selectedInterval ? "#223544" : "transparent",
                  color: tf === selectedInterval ? "#78d5ad" : "#9fadb9",
                  borderColor: tf === selectedInterval ? "#3e8f73" : "#354552",
                  cursor: "pointer",
                }}
                onClick={() => setSelectedInterval(tf)}
              >
                {tf}
              </button>
            ))}
          </nav>

          <span className="access-status">
            <span
              className="status-dot"
              aria-hidden="true"
              style={{
                background:
                  feedState === "LIVE"
                    ? "#39b980"
                    : feedState === "STALE" || feedState === "DEGRADED"
                      ? "#e0a135"
                      : feedState === "RECONNECTING" ||
                          feedState === "CONNECTING"
                        ? "#5498e8"
                        : "#dc5362",
              }}
            />
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
          <span>Feed / Status</span>
          <strong>
            {feedState} &bull; {candleStatus}
          </strong>
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
              <strong>BTC / USDT ({selectedInterval})</strong>
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
