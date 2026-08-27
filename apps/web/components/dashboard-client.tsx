"use client";

import {
  LightweightChartsAdapter,
  type ChartAdapter,
  type ChartAdapterDiagnostics,
  type ChartDrawing,
  type ChartDrawingMode,
  type ChartVisibleRange,
} from "@options-chart/chart";
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
  fetchOlderHistory,
  parseDeribitSnapshot,
  TIMEFRAME_DEBOUNCE_MS,
} from "@options-chart/market-data";
import {
  isOptionsMetricResponse,
  OPTIONS_WORKER_PROTOCOL_VERSION,
  type TotalOpenInterestRequest,
} from "@options-chart/worker-protocol";
import {
  Eraser,
  MousePointer2,
  SeparatorHorizontal,
  SeparatorVertical,
  Settings2,
  Trash2,
} from "lucide-react";
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

interface ConflationBenchmarkResult {
  readonly disabled: ChartBenchmarkResult;
  readonly enabled: ChartBenchmarkResult;
  readonly recommendation: "disabled" | "enabled";
}

interface ChartSoakResult extends ChartBenchmarkResult {
  readonly simulatedHours: number;
  readonly chartCreateCountBefore: number;
  readonly chartCreateCountAfter: number;
  readonly listenerCountBefore: number;
  readonly listenerCountAfter: number;
  readonly domNodesBefore: number;
  readonly domNodesAfter: number;
  readonly heapBytesBefore: number | null;
  readonly heapBytesAfter: number | null;
}

interface ChartTestApi {
  getDiagnostics(): ChartAdapterDiagnostics;
  getRuntimeHealth(): {
    readonly chart: ChartAdapterDiagnostics;
    readonly activeBinanceSockets: number;
    readonly activeWorkers: number;
  };
  getDrawings(): readonly ChartDrawing[];
  getSelectedInterval(): CandleInterval;
  getVisibleRange(): ChartVisibleRange | null;
  zoomToLastBars(count: number): ChartVisibleRange;
  reconcile(): Promise<void>;
  loadOlderHistory(): Promise<void>;
  addHorizontalDrawing(price: number): void;
  addVerticalDrawing(timestamp: number): void;
  runConflationBenchmark(): ConflationBenchmarkResult;
  runSoak(updates?: number): ChartSoakResult;
}

declare global {
  interface Window {
    __optionsChartBenchmark?: () => ChartBenchmarkResult;
    __optionsChartTest?: ChartTestApi;
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
const EXPIRY_SCOPES = [
  "0DTE",
  "Next Expiry",
  "This Friday",
  "Next Friday",
  "<= 7 DTE",
  "<= 30 DTE",
  "All Expiries",
] as const;
const HISTORY_TARGET_BARS = 2_000;
const LAZY_HISTORY_PAGE_BARS = 1_000;
const LAZY_HISTORY_THRESHOLD_BARS = 80;
const INITIAL_VISIBLE_BARS = 180;
const DRAWING_STORAGE_KEY = "options-chart:user-drawings:v1";
const DAY_MS = 86_400_000;

const btcFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const percentFormatter = new Intl.NumberFormat("en-US", {
  signDisplay: "always",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const isChartDrawing = (value: unknown): value is ChartDrawing => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.createdAt !== "number"
  ) {
    return false;
  }
  if (candidate.type === "horizontal-line") {
    return (
      typeof candidate.price === "number" && Number.isFinite(candidate.price)
    );
  }
  return (
    candidate.type === "vertical-line" &&
    typeof candidate.timestamp === "number" &&
    Number.isFinite(candidate.timestamp)
  );
};

const readStoredDrawings = (): readonly ChartDrawing[] => {
  try {
    const raw = localStorage.getItem(DRAWING_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isChartDrawing) : [];
  } catch {
    return [];
  }
};

const calculateDayChange = (candles: readonly Candle[]): number | null => {
  const latest = candles.at(-1);
  if (!latest) return null;
  const cutoff = latest.openTime - DAY_MS;
  const baseline =
    candles.find((candle) => candle.openTime >= cutoff) ?? candles[0];
  if (!baseline || baseline.close === 0) return null;
  return ((latest.close - baseline.close) / baseline.close) * 100;
};

const getHeapBytes = (): number | null => {
  const memory = (
    performance as Performance & {
      readonly memory?: { readonly usedJSHeapSize?: number };
    }
  ).memory;
  return memory?.usedJSHeapSize ?? null;
};

export function DashboardClient({
  accessLabel,
  accessMode,
}: DashboardClientProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartAdapterRef = useRef<ChartAdapter | null>(null);
  const candleStoreRef = useRef<CandleStore | null>(null);
  const binanceSocketRef = useRef<BinanceKlineSocket | null>(null);
  const restClientRef = useRef<BinanceRestClient | null>(null);
  const latestCandleRef = useRef<Candle | null>(null);
  const latestInputVersionRef = useRef(0);
  const activeWorkerCountRef = useRef(0);
  const activeIntervalRef = useRef<CandleInterval>("1h");
  const feedGenerationRef = useRef(0);
  const olderHistoryLoadingRef = useRef(false);
  const reachedHistoryBeginningRef = useRef(false);
  const viewportReadyRef = useRef(false);
  const loadOlderHistoryRef = useRef<() => void>(() => undefined);
  const diagnosticsTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  const [requestedInterval, setRequestedInterval] =
    useState<CandleInterval>("1h");
  const [selectedInterval, setSelectedInterval] =
    useState<CandleInterval>("1h");
  const [expiryScope, setExpiryScope] =
    useState<(typeof EXPIRY_SCOPES)[number]>("<= 30 DTE");
  const [feedState, setFeedState] = useState<FeedHealthState>("CONNECTING");
  const [candleStatus, setCandleStatus] = useState("Initializing");
  const [candleCount, setCandleCount] = useState(0);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [dayChange, setDayChange] = useState<number | null>(null);
  const [drawingMode, setDrawingModeState] =
    useState<ChartDrawingMode>("pointer");
  const [drawingCount, setDrawingCount] = useState(0);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [diagnostics, setDiagnostics] =
    useState<ChartAdapterDiagnostics | null>(null);
  const [metricStatus, setMetricStatus] = useState("Worker queued");
  const [totalOpenInterest, setTotalOpenInterest] = useState<number | null>(
    null,
  );
  const [workerDuration, setWorkerDuration] = useState<number | null>(null);

  if (!restClientRef.current) {
    restClientRef.current = new BinanceRestClient({
      endpoints: ["/api/binance"],
    });
  }

  const refreshDiagnostics = useCallback(() => {
    const adapter = chartAdapterRef.current;
    if (adapter) setDiagnostics(adapter.getDiagnostics());
  }, []);

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
    } else {
      adapter.setHistory(result.action.candles, {
        preserveVisibleRange: true,
        fitContent: false,
      });
      setCandleCount(result.action.candles.length);
      const latest = result.action.candles.at(-1) ?? null;
      latestCandleRef.current = latest;
      if (latest) setLastPrice(latest.close);
    }
    setCandleStatus(
      `Reconciled ${result.barsRepaired} bar${result.barsRepaired === 1 ? "" : "s"}`,
    );
    refreshDiagnostics();
  }, [refreshDiagnostics]);

  const loadOlderHistory = useCallback(async () => {
    const store = candleStoreRef.current;
    const client = restClientRef.current;
    const adapter = chartAdapterRef.current;
    if (
      !store ||
      !client ||
      !adapter ||
      olderHistoryLoadingRef.current ||
      reachedHistoryBeginningRef.current
    ) {
      return;
    }
    const earliest = store.getEarliest();
    if (!earliest) return;

    olderHistoryLoadingRef.current = true;
    const intervalAtStart = activeIntervalRef.current;
    try {
      const result = await fetchOlderHistory(client, {
        interval: intervalAtStart,
        beforeOpenTime: earliest.openTime,
        limit: LAZY_HISTORY_PAGE_BARS,
      });
      if (
        candleStoreRef.current !== store ||
        activeIntervalRef.current !== intervalAtStart
      ) {
        return;
      }
      store.mergeHistory(result.candles);
      reachedHistoryBeginningRef.current = result.reachedBeginning;
      adapter.setHistory(store.getSorted(), {
        preserveVisibleRange: true,
        fitContent: false,
      });
      setCandleCount(store.size);
      setCandleStatus(
        result.candles.length > 0
          ? `Loaded ${result.candles.length} older ${intervalAtStart} bars`
          : `Earliest ${intervalAtStart} history reached`,
      );
      refreshDiagnostics();
    } catch {
      setCandleStatus(`Older ${intervalAtStart} history unavailable`);
    } finally {
      olderHistoryLoadingRef.current = false;
    }
  }, [refreshDiagnostics]);
  loadOlderHistoryRef.current = () => {
    void loadOlderHistory();
  };

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    const adapter: ChartAdapter = new LightweightChartsAdapter();
    adapter.initialize(container, {
      symbol: "BTCUSDT",
      width: Math.max(container.clientWidth, 1),
      height: Math.max(container.clientHeight, 1),
      backgroundColor: "#111820",
      textColor: "#aebbc7",
      enableConflation: false,
    });
    chartAdapterRef.current = adapter;

    for (const drawing of readStoredDrawings()) adapter.addDrawing(drawing);
    setDrawingCount(adapter.getDrawings().length);

    const unsubscribeDrawings = adapter.subscribeDrawingsChange((drawings) => {
      localStorage.setItem(DRAWING_STORAGE_KEY, JSON.stringify(drawings));
      setDrawingCount(drawings.length);
      setDiagnostics(adapter.getDiagnostics());
    });
    const unsubscribeViewport = adapter.subscribeViewportChange((viewport) => {
      if (
        viewportReadyRef.current &&
        viewport.barsBefore < LAZY_HISTORY_THRESHOLD_BARS
      ) {
        loadOlderHistoryRef.current();
      }
    });
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      adapter.resize(
        Math.max(Math.floor(entry.contentRect.width), 1),
        Math.max(Math.floor(entry.contentRect.height), 1),
      );
    });
    observer.observe(container);
    setDiagnostics(adapter.getDiagnostics());

    return () => {
      observer.disconnect();
      unsubscribeViewport();
      unsubscribeDrawings();
      adapter.destroy();
      chartAdapterRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (requestedInterval === selectedInterval) return;
    const timer = setTimeout(
      () => setSelectedInterval(requestedInterval),
      TIMEFRAME_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [requestedInterval, selectedInterval]);

  useEffect(() => {
    const generation = feedGenerationRef.current + 1;
    feedGenerationRef.current = generation;
    activeIntervalRef.current = selectedInterval;
    viewportReadyRef.current = false;
    reachedHistoryBeginningRef.current = false;
    olderHistoryLoadingRef.current = false;

    const store = new CandleStore(selectedInterval);
    candleStoreRef.current = store;
    const client = restClientRef.current;
    if (!client) return;

    let socket: BinanceKlineSocket | null = null;
    setFeedState("CONNECTING");
    setCandleStatus(`Loading 2,000 ${selectedInterval} bars`);

    void (async () => {
      try {
        const bootstrap = await bootstrapHistory(client, {
          interval: selectedInterval,
          targetBars: HISTORY_TARGET_BARS,
        });
        if (feedGenerationRef.current !== generation) return;

        store.setHistory(bootstrap.candles);
        const adapter = chartAdapterRef.current;
        adapter?.setHistory(bootstrap.candles, { fitContent: false });
        const visibleFrom =
          bootstrap.candles[
            Math.max(bootstrap.candles.length - INITIAL_VISIBLE_BARS, 0)
          ];
        const visibleTo = bootstrap.candles.at(-1);
        if (adapter && visibleFrom && visibleTo) {
          adapter.setVisibleRange({
            fromTimestamp: visibleFrom.openTime,
            toTimestamp: visibleTo.openTime,
          });
        }
        const latest = visibleTo ?? null;
        latestCandleRef.current = latest;
        setCandleCount(bootstrap.candles.length);
        setLastPrice(latest?.close ?? null);
        setDayChange(calculateDayChange(bootstrap.candles));
        setCandleStatus(
          bootstrap.completeness === "COMPLETE"
            ? `Binance REST + live ${selectedInterval}`
            : `Binance REST degraded ${selectedInterval}`,
        );
        requestAnimationFrame(() => {
          if (feedGenerationRef.current === generation) {
            viewportReadyRef.current = true;
          }
        });
        refreshDiagnostics();

        socket = new BinanceKlineSocket({
          interval: selectedInterval,
          onCandle: (candle) => {
            if (feedGenerationRef.current !== generation) return;
            if (store.applyLiveCandle(candle) === null) return;
            chartAdapterRef.current?.updateCandle(candle);
            latestCandleRef.current = candle;
            setLastPrice(candle.close);
            setCandleCount(store.size);
          },
          onHealthChange: (state) => {
            if (feedGenerationRef.current === generation) setFeedState(state);
          },
          onReconnect: () => {
            if (feedGenerationRef.current === generation) {
              void handleReconcile();
            }
          },
        });
        binanceSocketRef.current = socket;
        socket.connect();
      } catch (error) {
        if (feedGenerationRef.current !== generation) return;
        setFeedState("DEGRADED");
        setCandleStatus(
          error instanceof Error ? error.message : "History load failed",
        );
      }
    })();

    return () => {
      socket?.destroy();
      if (binanceSocketRef.current === socket) binanceSocketRef.current = null;
      if (candleStoreRef.current === store) candleStoreRef.current = null;
    };
  }, [selectedInterval, handleReconcile, refreshDiagnostics]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void handleReconcile();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [handleReconcile]);

  useEffect(() => {
    const worker = new Worker(
      new URL("../workers/options-metric.worker.ts", import.meta.url),
      { type: "module", name: "options-metric" },
    );
    activeWorkerCountRef.current = 1;
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
        if (event.data.type !== "total-open-interest-result") return;
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
    return () => {
      worker.terminate();
      activeWorkerCountRef.current = 0;
    };
  }, []);

  useEffect(() => {
    if (!diagnosticsOpen) {
      if (diagnosticsTimerRef.current) {
        clearInterval(diagnosticsTimerRef.current);
        diagnosticsTimerRef.current = null;
      }
      return;
    }
    refreshDiagnostics();
    diagnosticsTimerRef.current = setInterval(refreshDiagnostics, 1_000);
    return () => {
      if (diagnosticsTimerRef.current) {
        clearInterval(diagnosticsTimerRef.current);
        diagnosticsTimerRef.current = null;
      }
    };
  }, [diagnosticsOpen, refreshDiagnostics]);

  useEffect(() => {
    const runBenchmark = (): ChartBenchmarkResult => {
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
      return { updates, durationMs, averageUpdateMs: durationMs / updates };
    };

    const runIsolatedBenchmark = (
      candles: readonly Candle[],
      enableConflation: boolean,
    ): ChartBenchmarkResult => {
      const mount = document.createElement("div");
      mount.style.cssText =
        "position:fixed;left:-2000px;top:0;width:1200px;height:700px;visibility:hidden";
      document.body.append(mount);
      const adapter = new LightweightChartsAdapter();
      try {
        adapter.initialize(mount, {
          symbol: "BTCUSDT",
          width: 1_200,
          height: 700,
          backgroundColor: "#111820",
          textColor: "#aebbc7",
          enableConflation,
        });
        const startedAt = performance.now();
        adapter.setHistory(candles);
        const latest = candles.at(-1);
        const updates = 500;
        if (latest) {
          for (let index = 0; index < updates; index += 1) {
            adapter.updateCandle(latest);
          }
        }
        const durationMs = performance.now() - startedAt;
        return { updates, durationMs, averageUpdateMs: durationMs / updates };
      } finally {
        adapter.destroy();
        mount.remove();
      }
    };

    window.__optionsChartBenchmark = runBenchmark;
    window.__optionsChartTest = {
      getDiagnostics: () => {
        const adapter = chartAdapterRef.current;
        if (!adapter) throw new Error("Chart is unavailable");
        return adapter.getDiagnostics();
      },
      getRuntimeHealth: () => {
        const adapter = chartAdapterRef.current;
        if (!adapter) throw new Error("Chart is unavailable");
        return {
          chart: adapter.getDiagnostics(),
          activeBinanceSockets: binanceSocketRef.current ? 1 : 0,
          activeWorkers: activeWorkerCountRef.current,
        };
      },
      getDrawings: () => chartAdapterRef.current?.getDrawings() ?? [],
      getSelectedInterval: () => activeIntervalRef.current,
      getVisibleRange: () => chartAdapterRef.current?.getVisibleRange() ?? null,
      zoomToLastBars: (count) => {
        const candles = candleStoreRef.current?.getSorted() ?? [];
        const toIndex = Math.max(candles.length - 20, 1);
        const fromIndex = Math.max(toIndex - Math.max(count, 2), 0);
        const from = candles[fromIndex];
        const to = candles[toIndex];
        const adapter = chartAdapterRef.current;
        if (!from || !to || !adapter) throw new Error("History is unavailable");
        const range = {
          fromTimestamp: from.openTime,
          toTimestamp: to.openTime,
        };
        adapter.setVisibleRange(range);
        return {
          fromTimestamp: Math.floor(range.fromTimestamp / 1_000) * 1_000,
          toTimestamp: Math.floor(range.toTimestamp / 1_000) * 1_000,
        };
      },
      reconcile: handleReconcile,
      loadOlderHistory,
      addHorizontalDrawing: (price) => {
        chartAdapterRef.current?.addDrawing({
          id: `test-horizontal-${Date.now()}`,
          type: "horizontal-line",
          price,
          createdAt: Date.now(),
        });
      },
      addVerticalDrawing: (timestamp) => {
        chartAdapterRef.current?.addDrawing({
          id: `test-vertical-${Date.now()}`,
          type: "vertical-line",
          timestamp,
          createdAt: Date.now(),
        });
      },
      runConflationBenchmark: () => {
        const candles = candleStoreRef.current?.getSorted() ?? [];
        if (candles.length === 0) throw new Error("History is unavailable");
        const disabled = runIsolatedBenchmark(candles, false);
        const enabled = runIsolatedBenchmark(candles, true);
        return {
          disabled,
          enabled,
          recommendation:
            enabled.durationMs < disabled.durationMs * 0.9
              ? "enabled"
              : "disabled",
        };
      },
      runSoak: (updates = 28_800) => {
        const adapter = chartAdapterRef.current;
        const candle = latestCandleRef.current;
        if (!adapter || !candle) throw new Error("Chart is unavailable");
        const before = adapter.getDiagnostics();
        const domNodesBefore = document.getElementsByTagName("*").length;
        const heapBytesBefore = getHeapBytes();
        const startedAt = performance.now();
        for (let index = 0; index < updates; index += 1) {
          adapter.updateCandle(candle);
        }
        const durationMs = performance.now() - startedAt;
        const after = adapter.getDiagnostics();
        return {
          updates,
          simulatedHours: updates / 3_600,
          durationMs,
          averageUpdateMs: durationMs / updates,
          chartCreateCountBefore: before.chartCreateCount,
          chartCreateCountAfter: after.chartCreateCount,
          listenerCountBefore: before.listenerCount,
          listenerCountAfter: after.listenerCount,
          domNodesBefore,
          domNodesAfter: document.getElementsByTagName("*").length,
          heapBytesBefore,
          heapBytesAfter: getHeapBytes(),
        };
      },
    };

    return () => {
      delete window.__optionsChartBenchmark;
      delete window.__optionsChartTest;
    };
  }, [handleReconcile, loadOlderHistory]);

  const setDrawingMode = (mode: ChartDrawingMode) => {
    setDrawingModeState(mode);
    chartAdapterRef.current?.setDrawingMode(mode);
  };

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

        <div className="quote-cluster" aria-label="BTC market price">
          <strong>
            {lastPrice === null ? "--" : usdFormatter.format(lastPrice)}
          </strong>
          <span
            className={
              dayChange !== null && dayChange < 0 ? "negative" : "positive"
            }
          >
            {dayChange === null
              ? "--"
              : `${percentFormatter.format(dayChange)}%`}
          </span>
        </div>

        <nav aria-label="Timeframe selector" className="timeframe-nav">
          {SUPPORTED_INTERVALS.map((timeframe) => (
            <button
              key={timeframe}
              type="button"
              className={`interval-chip ${timeframe === requestedInterval ? "active" : ""}`}
              aria-pressed={timeframe === requestedInterval}
              onClick={() => setRequestedInterval(timeframe)}
            >
              {timeframe}
            </button>
          ))}
        </nav>

        <label className="expiry-control">
          <span>Expiry</span>
          <select
            aria-label="Expiry scope"
            value={expiryScope}
            onChange={(event) =>
              setExpiryScope(
                event.target.value as (typeof EXPIRY_SCOPES)[number],
              )
            }
          >
            {EXPIRY_SCOPES.map((scope) => (
              <option key={scope}>{scope}</option>
            ))}
          </select>
        </label>

        <div className="session-cluster">
          <span className="access-status" title={accessLabel}>
            <span
              className={`status-dot feed-${feedState.toLowerCase()}`}
              aria-hidden="true"
            />
            {feedState}
          </span>
          <button
            type="button"
            className="icon-command"
            aria-label="Chart diagnostics"
            title="Chart diagnostics"
            aria-expanded={diagnosticsOpen}
            onClick={() => setDiagnosticsOpen((open) => !open)}
          >
            <Settings2 size={16} strokeWidth={1.8} />
          </button>
        </div>

        {diagnosticsOpen && diagnostics ? (
          <section
            className="diagnostics-popover"
            aria-label="Chart diagnostics"
          >
            <header>
              <strong>Chart health</strong>
              <span>{diagnostics.lastError ? "ERROR" : "HEALTHY"}</span>
            </header>
            <dl>
              <div>
                <dt>Data points</dt>
                <dd>{diagnostics.dataPointCount}</dd>
              </div>
              <div>
                <dt>Chart instances</dt>
                <dd>{diagnostics.chartCreateCount}</dd>
              </div>
              <div>
                <dt>History loads</dt>
                <dd>{diagnostics.historyReplacementCount}</dd>
              </div>
              <div>
                <dt>Live updates</dt>
                <dd>{diagnostics.realtimeUpdateCount}</dd>
              </div>
              <div>
                <dt>Max operation</dt>
                <dd>{diagnostics.maxOperationDurationMs.toFixed(2)} ms</dd>
              </div>
              <div>
                <dt>Listeners</dt>
                <dd>{diagnostics.listenerCount}</dd>
              </div>
              <div>
                <dt>Drawings</dt>
                <dd>{diagnostics.drawingCount}</dd>
              </div>
              <div>
                <dt>Conflation</dt>
                <dd>{diagnostics.conflationEnabled ? "ON" : "OFF"}</dd>
              </div>
            </dl>
          </section>
        ) : null}
      </header>

      <section className="market-strip" aria-label="Market status">
        <div>
          <span>Source</span>
          <strong>Binance Spot</strong>
        </div>
        <div>
          <span>Candles</span>
          <strong data-testid="candle-count">{candleCount || "--"}</strong>
        </div>
        <div className="market-strip-wide">
          <span>Status</span>
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
              <strong>BTC / USDT · {selectedInterval}</strong>
            </div>
            <span className="chart-adapter-label">
              Lightweight Charts 5.2.1 · Volume
            </span>
          </div>
          <div className="chart-surface-shell">
            <aside className="drawing-toolbar" aria-label="Drawing tools">
              <button
                type="button"
                className={drawingMode === "pointer" ? "active" : ""}
                aria-label="Pointer and crosshair"
                title="Pointer and crosshair"
                aria-pressed={drawingMode === "pointer"}
                onClick={() => setDrawingMode("pointer")}
              >
                <MousePointer2 size={17} />
              </button>
              <button
                type="button"
                className={drawingMode === "horizontal-line" ? "active" : ""}
                aria-label="Horizontal line"
                title="Horizontal line"
                aria-pressed={drawingMode === "horizontal-line"}
                onClick={() => setDrawingMode("horizontal-line")}
              >
                <SeparatorHorizontal size={18} />
              </button>
              <button
                type="button"
                className={drawingMode === "vertical-line" ? "active" : ""}
                aria-label="Vertical line"
                title="Vertical line"
                aria-pressed={drawingMode === "vertical-line"}
                onClick={() => setDrawingMode("vertical-line")}
              >
                <SeparatorVertical size={18} />
              </button>
              <span className="toolbar-separator" aria-hidden="true" />
              <button
                type="button"
                aria-label="Delete selected drawing"
                title="Delete selected drawing"
                onClick={() => chartAdapterRef.current?.deleteSelectedDrawing()}
              >
                <Trash2 size={17} />
              </button>
              <button
                type="button"
                aria-label="Clear drawings"
                title="Clear drawings"
                disabled={drawingCount === 0}
                onClick={() => chartAdapterRef.current?.clearDrawings()}
              >
                <Eraser size={17} />
              </button>
            </aside>
            <div
              ref={chartContainerRef}
              className="chart-stage"
              data-testid="candlestick-chart"
            />
          </div>
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
        <span>
          Read-only market analytics · {drawingCount} drawing
          {drawingCount === 1 ? "" : "s"}
        </span>
        <span>
          {accessMode === "development" ? "Local access" : accessLabel}
        </span>
      </footer>
    </main>
  );
}
