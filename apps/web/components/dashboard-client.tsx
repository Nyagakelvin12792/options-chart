"use client";

import {
  AnchoredVwapController,
  CALCULATION_VERSION as VOLUME_PROFILE_CALCULATION_VERSION,
  LightweightChartsAdapter,
  VolumeProfileController,
  type ChartAdapter,
  type ChartAdapterDiagnostics,
  type ChartDrawing,
  type ChartDrawingMode,
  type ChartVisibleRange,
  type LevelSegment,
} from "@options-chart/chart";
import type {
  Candle,
  CandleInterval,
  FeedHealthState,
  GammaLevelKind,
  OptionsChainSnapshot,
} from "@options-chart/domain";
import { LevelShiftTracker } from "@options-chart/shared";
import { TimeframeManager } from "../lib/timeframe-manager";
import {
  BinanceKlineSocket,
  BinanceRestClient,
  CandleStore,
  DeribitOptionsDataEngine,
  DeribitRestClient,
  fetchOlderHistory,
  syncBinanceClock,
  TIMEFRAME_DEBOUNCE_MS,
  type DeribitRecentOptionTradePayload,
} from "@options-chart/market-data";
import {
  aggregateExposureByStrike,
  calculateCallPutOpenInterestWeightedMarkIv,
  calculateContractExposure,
  calculateDeribitInverseGamma,
  calculateIvTermStructure,
  calculateNearForwardAtmIv,
  calculateStaticWallSignals,
  filterOptionsByExpiryScope,
  millisecondsPerYear,
  resolveExpiryScopeExpiries,
  type ExpiryScope,
  type OptionsCalculationResult,
} from "@options-chart/options-engine";
import {
  isOptionsMetricResponse,
  OPTIONS_WORKER_PROTOCOL_VERSION,
  type OptionsCalculationRequest,
} from "@options-chart/worker-protocol";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Eye,
  EyeOff,
  Eraser,
  History,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
  RotateCcw,
  SeparatorHorizontal,
  SeparatorVertical,
  Settings2,
  StepForward,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  GammaChartOverlay,
  LevelRail,
  OptionsSummaryBar,
  type LevelDisplayState,
  type PositionedLevel,
  type PositionedProfileBar,
  type ProfileMetric,
} from "@/components/gamma-overlay";
import { RiskTerminal } from "@/components/risk-terminal";
import { IndicatorControls } from "@/components/indicator-controls";
import {
  ANCHORED_VWAP_SETTINGS_STORAGE_KEY,
  DEFAULT_ANCHORED_VWAP_SETTINGS,
  getEnabledBandMultipliers,
  normalizeAnchoredVwapSettings,
  parseAnchoredVwapSettings,
  resolveAnchoredVwapAnchor,
  serializeAnchoredVwapSettings,
} from "@/lib/anchored-vwap-settings";
import {
  ConfluenceZoneOverlay,
  type PositionedWallConfluenceZone,
  type WallConfluenceZone as WallConfluenceDisplayZone,
} from "@/components/wall-confluence";
import {
  buildUnavailableOptionsChain,
  createExactExpiryScope,
  createExpiryScope,
  EXPIRY_SCOPE_OPTIONS,
  formatDeribitExpiryDate,
  listActiveExpiries,
  selectMaxPainExpiry,
  type ExpiryScopeKind,
} from "@/lib/options-overlay";
import {
  createReplaySnapshotStorage,
  createReplayState,
  createReplayTimeline,
  reduceReplay,
  REPLAY_SPEEDS,
  selectReplayFrame,
  type BoundedReplaySnapshotStorage,
  type ReplaySpeed,
  type ReplayState,
} from "@/lib/replay";
import {
  calculateWallZoneTolerance,
  createWallConfluenceZones,
  estimateDealerFlowWall,
  updateWallSignalHistory,
  type WallSignalHistory,
  type WallSignalInput,
} from "@/lib/wall-confluence";
import {
  DEFAULT_VOLUME_PROFILE_SETTINGS,
  normalizeVolumeProfileSettings,
  parseVolumeProfileSettings,
  serializeVolumeProfileSettings,
  VOLUME_PROFILE_SETTINGS_STORAGE_KEY,
} from "@/lib/volume-profile-settings";

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

interface GammaReconciliationState {
  readonly state: "CONNECTING" | "PASS" | "DIVERGED" | "STALE";
  readonly samples: number;
  readonly maxDeviation: number | null;
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
const HISTORY_TARGET_BARS = 10_000;
const HISTORY_TARGET_LABEL = HISTORY_TARGET_BARS.toLocaleString("en-US");
const LAZY_HISTORY_PAGE_BARS = 1_000;
const LAZY_HISTORY_THRESHOLD_BARS = 80;
const INITIAL_VISIBLE_BARS = 180;
const DRAWING_STORAGE_KEY = "options-chart:user-drawings:v1";
const LEVEL_SHIFT_STORAGE_KEY = "options-chart:level-shifts:v1";
const DAY_MS = 86_400_000;
const OPTIONS_STALE_AFTER_MS = 90_000;
const DEALER_FLOW_LOOKBACK_MS = 60 * 60_000;
const DEALER_FLOW_REFRESH_MS = 30_000;
const REPLAY_SNAPSHOT_INTERVAL_MS = 5 * 60_000;
const REPLAY_SNAPSHOT_CAPACITY = 288;
const GAMMA_RECONCILIATION_REFRESH_MS = 60_000;
const BINANCE_CLOCK_SYNC_STALE_MS = 5 * 60_000;
const PROFILE_METRICS: readonly {
  readonly value: ProfileMetric;
  readonly label: string;
  readonly title: string;
}[] = [
  { value: "gex", label: "GEX", title: "Gross Gamma concentration" },
  { value: "open-interest", label: "OI", title: "Open Interest concentration" },
];
const DASHBOARD_EXPIRY_SCOPES = EXPIRY_SCOPE_OPTIONS.filter(
  ({ kind }) => kind !== "custom",
);

const LEVEL_COLORS: Readonly<Record<string, string>> = {
  "call-wall": "#29b57a",
  "put-wall": "#e05263",
  "gamma-flip": "#f0b44d",
  "max-pain": "#65a9ff",
  "secondary-gex": "#9aa7b6",
};

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
  if (candidate.type === "position") {
    return (
      (candidate.direction === "long" || candidate.direction === "short") &&
      typeof candidate.entry === "number" &&
      Number.isFinite(candidate.entry) &&
      typeof candidate.stopLoss === "number" &&
      Number.isFinite(candidate.stopLoss) &&
      typeof candidate.takeProfit === "number" &&
      Number.isFinite(candidate.takeProfit)
    );
  }
  if (candidate.type === "volume-profile-range") {
    return (
      typeof candidate.fromTimestamp === "number" &&
      Number.isFinite(candidate.fromTimestamp) &&
      typeof candidate.toTimestamp === "number" &&
      Number.isFinite(candidate.toTimestamp) &&
      candidate.fromTimestamp !== candidate.toTimestamp
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

const snapTimestampToCandle = (
  timestamp: number,
  candles: readonly Candle[],
): number | null => {
  if (candles.length === 0 || !Number.isFinite(timestamp)) return null;
  let low = 0;
  let high = candles.length - 1;
  let nearest = candles[0]?.openTime ?? null;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candle = candles[middle];
    if (!candle) break;
    if (candle.openTime <= timestamp) {
      nearest = candle.openTime;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return nearest;
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
  const volumeProfileControllerRef = useRef<VolumeProfileController | null>(
    null,
  );
  const anchoredVwapControllerRef = useRef<AnchoredVwapController | null>(null);
  const candleStoreRef = useRef<CandleStore | null>(null);
  const timeframeHistoryCacheRef = useRef(
    new Map<CandleInterval, readonly Candle[]>(),
  );
  const timeframeManagerRef = useRef<TimeframeManager>(new TimeframeManager());
  const levelShiftTrackerRef = useRef<LevelShiftTracker>(
    new LevelShiftTracker(),
  );
  const binanceSocketRef = useRef<BinanceKlineSocket | null>(null);
  const restClientRef = useRef<BinanceRestClient | null>(null);
  const latestCandleRef = useRef<Candle | null>(null);
  const replayStorageRef = useRef<BoundedReplaySnapshotStorage | null>(null);
  const replayActiveRef = useRef(false);
  const replayRenderedIndexRef = useRef(-1);
  const lastReplaySnapshotBucketRef = useRef<number | null>(null);
  const latestInputVersionRef = useRef(0);
  const optionsWorkerRef = useRef<Worker | null>(null);
  const deribitEngineRef = useRef<DeribitOptionsDataEngine | null>(null);
  const deribitFlowClientRef = useRef<DeribitRestClient | null>(null);
  const previousOptionsChainRef = useRef<OptionsChainSnapshot | null>(null);
  const wallHistoryRef = useRef<ReadonlyMap<string, WallSignalHistory>>(
    new Map(),
  );
  const lastWallObservationRef = useRef("");
  const activeWorkerCountRef = useRef(0);
  const activeIntervalRef = useRef<CandleInterval>("1h");
  const binanceClockRef = useRef<{
    readonly offsetMs: number;
    readonly syncedAt: number;
  } | null>(null);
  const feedGenerationRef = useRef(0);
  const olderHistoryLoadingRef = useRef(false);
  const reachedHistoryBeginningRef = useRef(false);
  const viewportReadyRef = useRef(false);
  const loadOlderHistoryRef = useRef<() => void>(() => undefined);
  const refreshOverlayCoordinatesRef = useRef<() => void>(() => undefined);
  const overlayAnimationFrameRef = useRef<number | null>(null);
  const diagnosticsTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const overlayGeometrySignatureRef = useRef("");
  const confluenceGeometrySignatureRef = useRef("");

  const [requestedInterval, setRequestedInterval] =
    useState<CandleInterval>("1h");
  const [selectedInterval, setSelectedInterval] =
    useState<CandleInterval>("1h");
  const [expirySelection, setExpirySelection] = useState("scope:next-expiry");
  const [feedState, setFeedState] = useState<FeedHealthState>("CONNECTING");
  const [candleStatus, setCandleStatus] = useState("Initializing");
  const [candleCount, setCandleCount] = useState(0);
  const [volumeProfileRevision, setVolumeProfileRevision] = useState(0);
  const [liveLastPrice, setLastPrice] = useState<number | null>(null);
  const [dayChange, setDayChange] = useState<number | null>(null);
  const [drawingMode, setDrawingModeState] =
    useState<ChartDrawingMode>("pointer");
  const [drawingCount, setDrawingCount] = useState(0);
  const [drawings, setDrawings] = useState<readonly ChartDrawing[]>([]);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [diagnostics, setDiagnostics] =
    useState<ChartAdapterDiagnostics | null>(null);
  const [liveOptionsChain, setLiveOptionsChain] =
    useState<OptionsChainSnapshot>(() =>
      buildUnavailableOptionsChain(Date.now()),
    );
  const [replayState, setReplayState] = useState<ReplayState | null>(null);
  const [replayStorageStatus, setReplayStorageStatus] = useState(
    "OPTIONS HISTORY RECORDING",
  );
  const [optionsState, setOptionsState] =
    useState<LevelDisplayState>("FALLBACK");
  const [deribitIndexPrice, setDeribitIndexPrice] = useState<number | null>(
    null,
  );
  const [previousOptionsChain, setPreviousOptionsChain] =
    useState<OptionsChainSnapshot | null>(null);
  const [recentOptionTrades, setRecentOptionTrades] = useState<
    readonly DeribitRecentOptionTradePayload[]
  >([]);
  const [dealerFlowUpdatedAt, setDealerFlowUpdatedAt] = useState(0);
  const [dealerFlowHasMore, setDealerFlowHasMore] = useState(false);
  const [dealerFlowState, setDealerFlowState] = useState<
    "CONNECTING" | "LIVE" | "STALE"
  >("CONNECTING");
  const [gammaReconciliation, setGammaReconciliation] =
    useState<GammaReconciliationState>({
      state: "CONNECTING",
      samples: 0,
      maxDeviation: null,
    });
  const [wallHistoryVersion, setWallHistoryVersion] = useState(0);
  const [optionsResult, setOptionsResult] =
    useState<OptionsCalculationResult | null>(null);
  const [metricStatus, setMetricStatus] = useState(
    "Waiting for live Deribit data",
  );
  const [workerDuration, setWorkerDuration] = useState<number | null>(null);
  const [overlaysVisible, setOverlaysVisible] = useState(true);
  const [secondaryVisible, setSecondaryVisible] = useState(true);
  const [shadingEnabled, setShadingEnabled] = useState(true);
  const [profileExpanded, setProfileExpanded] = useState(true);
  const [profileMetric, setProfileMetric] = useState<ProfileMetric>("gex");
  const [volumeProfileSettings, setVolumeProfileSettings] = useState(
    DEFAULT_VOLUME_PROFILE_SETTINGS,
  );
  const [volumeProfileSettingsReady, setVolumeProfileSettingsReady] =
    useState(false);
  const [anchoredVwapSettings, setAnchoredVwapSettings] = useState(
    DEFAULT_ANCHORED_VWAP_SETTINGS,
  );
  const [anchoredVwapSettingsReady, setAnchoredVwapSettingsReady] =
    useState(false);
  const [chartHeight, setChartHeight] = useState(1);
  const [liveAuditNow, setAuditNow] = useState(() => Date.now());
  const [positionedLevels, setPositionedLevels] = useState<
    readonly PositionedLevel[]
  >([]);
  const [positionedProfileBars, setPositionedProfileBars] = useState<
    readonly PositionedProfileBar[]
  >([]);
  const [currentPriceY, setCurrentPriceY] = useState<number | null>(null);
  const [gammaFlipY, setGammaFlipY] = useState<number | null>(null);
  const [positionedConfluenceZones, setPositionedConfluenceZones] = useState<
    readonly PositionedWallConfluenceZone[]
  >([]);

  const replayFrame = useMemo(
    () => (replayState ? selectReplayFrame(replayState) : null),
    [replayState],
  );
  const replayActive = replayState !== null;
  const replayPlayback = replayState?.playback ?? "paused";
  const replayTimeline = replayState?.timeline ?? null;
  const replayIndex = replayFrame?.index ?? -1;
  const optionsChain = useMemo(() => {
    if (!replayState) return liveOptionsChain;
    return replayFrame?.options.status === "available"
      ? replayFrame.options.snapshot.chain
      : buildUnavailableOptionsChain(replayFrame?.replayTime ?? liveAuditNow);
  }, [liveAuditNow, liveOptionsChain, replayFrame, replayState]);
  const auditNow = replayFrame?.replayTime ?? liveAuditNow;
  const optionsCalculationNow =
    replayFrame?.options.status === "available"
      ? replayFrame.options.snapshot.capturedAt
      : auditNow;
  const lastPrice = replayFrame?.candle.close ?? liveLastPrice;
  const anchoredVwapAnchor = useMemo(() => {
    const latestTimestamp = replayFrame?.candle.openTime ?? auditNow;
    return resolveAnchoredVwapAnchor(anchoredVwapSettings, latestTimestamp);
  }, [anchoredVwapSettings, auditNow, replayFrame?.candle.openTime]);
  const anchoredVwapAnchorLabel = anchoredVwapAnchor
    ? new Date(anchoredVwapAnchor)
        .toISOString()
        .slice(0, 16)
        .replace("T", " ") + " UTC"
    : "Pick a candle on the chart";

  if (replayStorageRef.current === null) {
    replayStorageRef.current = createReplaySnapshotStorage(
      REPLAY_SNAPSHOT_CAPACITY,
    );
  }

  if (restClientRef.current == null) {
    restClientRef.current = new BinanceRestClient({
      endpoints: ["/api/binance"],
    });
  }

  useEffect(() => {
    try {
      levelShiftTrackerRef.current.loadPersisted(
        localStorage.getItem(LEVEL_SHIFT_STORAGE_KEY),
      );
    } catch {
      // Shift tracking remains session-local when storage is unavailable.
    }
    try {
      setVolumeProfileSettings(
        parseVolumeProfileSettings(
          localStorage.getItem(VOLUME_PROFILE_SETTINGS_STORAGE_KEY),
        ),
      );
    } catch {
      setVolumeProfileSettings(DEFAULT_VOLUME_PROFILE_SETTINGS);
    }
    setVolumeProfileSettingsReady(true);
    try {
      setAnchoredVwapSettings(
        parseAnchoredVwapSettings(
          localStorage.getItem(ANCHORED_VWAP_SETTINGS_STORAGE_KEY),
        ),
      );
    } catch {
      setAnchoredVwapSettings(DEFAULT_ANCHORED_VWAP_SETTINGS);
    }
    setAnchoredVwapSettingsReady(true);
  }, []);

  useEffect(() => {
    if (!volumeProfileSettingsReady) return;
    try {
      localStorage.setItem(
        VOLUME_PROFILE_SETTINGS_STORAGE_KEY,
        serializeVolumeProfileSettings(volumeProfileSettings),
      );
    } catch {
      // The chart remains usable when browser storage is unavailable.
    }
  }, [volumeProfileSettings, volumeProfileSettingsReady]);

  useEffect(() => {
    if (!anchoredVwapSettingsReady) return;
    try {
      localStorage.setItem(
        ANCHORED_VWAP_SETTINGS_STORAGE_KEY,
        serializeAnchoredVwapSettings(anchoredVwapSettings),
      );
    } catch {
      // The chart remains usable when browser storage is unavailable.
    }
  }, [anchoredVwapSettings, anchoredVwapSettingsReady]);
  if (deribitFlowClientRef.current == null) {
    deribitFlowClientRef.current = new DeribitRestClient({
      endpoint: "/api/deribit",
    });
  }

  const getBinanceNow = useCallback(async (client: BinanceRestClient) => {
    const cached = binanceClockRef.current;
    if (cached && Date.now() - cached.syncedAt < BINANCE_CLOCK_SYNC_STALE_MS) {
      return Math.round(Date.now() + cached.offsetMs);
    }

    try {
      const clock = await syncBinanceClock(client);
      binanceClockRef.current = {
        offsetMs: clock.offsetMs,
        syncedAt: clock.syncedAt,
      };
      return Math.round(Date.now() + clock.offsetMs);
    } catch {
      return null;
    }
  }, []);

  const activeExpiries = useMemo(
    () => listActiveExpiries(optionsChain, optionsCalculationNow),
    [optionsChain, optionsCalculationNow],
  );
  const expiryScope = useMemo<ExpiryScope>(() => {
    if (expirySelection.startsWith("expiry:")) {
      return createExactExpiryScope(Number(expirySelection.slice(7)));
    }
    const selectedKind = DASHBOARD_EXPIRY_SCOPES.find(
      ({ kind }) => `scope:${kind}` === expirySelection,
    )?.kind;
    return createExpiryScope(
      (selectedKind ?? "next-expiry") as ExpiryScopeKind,
      null,
    );
  }, [expirySelection]);
  const resolvedExpiries = useMemo(
    () =>
      resolveExpiryScopeExpiries(
        optionsChain.instruments,
        expiryScope,
        optionsCalculationNow,
      ),
    [expiryScope, optionsCalculationNow, optionsChain.instruments],
  );
  const selectedExpiry =
    selectMaxPainExpiry(optionsChain, expiryScope, optionsCalculationNow) ?? 0;
  const scopedContracts = useMemo(
    () =>
      filterOptionsByExpiryScope(
        optionsChain.instruments,
        expiryScope,
        optionsCalculationNow,
      ),
    [expiryScope, optionsCalculationNow, optionsChain.instruments],
  );
  const ivSummary = useMemo(() => {
    const callPut = calculateCallPutOpenInterestWeightedMarkIv(scopedContracts);
    const atm =
      selectedExpiry > 0
        ? calculateNearForwardAtmIv(scopedContracts, selectedExpiry)
        : null;
    const termStructure = calculateIvTermStructure(
      scopedContracts,
      optionsCalculationNow,
    );
    return {
      callMarkIvDecimal: callPut.call.averageMarkIvDecimal,
      putMarkIvDecimal: callPut.put.averageMarkIvDecimal,
      atmMarkIvDecimal: atm?.averageMarkIvDecimal ?? null,
      expiryCount: resolvedExpiries.length,
      termStructureLabel:
        termStructure.length === 0
          ? "No eligible IV term structure"
          : termStructure
              .map((point) => {
                const iv =
                  point.nearForwardAtmIv.averageMarkIvDecimal ??
                  point.openInterestWeightedMarkIv.averageMarkIvDecimal;
                return `${formatDeribitExpiryDate(point.expiry)} ${iv === null ? "--" : `${(iv * 100).toFixed(1)}%`}`;
              })
              .join(" | "),
    };
  }, [
    optionsCalculationNow,
    resolvedExpiries.length,
    scopedContracts,
    selectedExpiry,
  ]);
  const optionsUnderlyingPrice = useMemo(() => {
    if (!replayActive && deribitIndexPrice !== null) return deribitIndexPrice;
    const expiryReference = optionsChain.instruments.find(
      ({ instrument }) => instrument.expiry === selectedExpiry,
    )?.quote.underlyingPriceUsd;
    return expiryReference ?? lastPrice;
  }, [
    deribitIndexPrice,
    lastPrice,
    optionsChain.instruments,
    replayActive,
    selectedExpiry,
  ]);
  const gammaReconciliationInstruments = useMemo(
    () =>
      optionsUnderlyingPrice === null
        ? []
        : optionsChain.instruments
            .filter(({ instrument }) => instrument.expiry === selectedExpiry)
            .sort(
              (left, right) =>
                Math.abs(left.instrument.strike - optionsUnderlyingPrice) -
                  Math.abs(right.instrument.strike - optionsUnderlyingPrice) ||
                left.instrument.instrumentName.localeCompare(
                  right.instrument.instrumentName,
                ),
            )
            .slice(0, 6)
            .map(({ instrument }) => instrument.instrumentName),
    [optionsChain.instruments, optionsUnderlyingPrice, selectedExpiry],
  );
  const gammaReconciliationInstrumentKey =
    gammaReconciliationInstruments.join(",");
  const effectiveOptionsState = useMemo<LevelDisplayState>(() => {
    if (replayActive) {
      if (replayFrame?.options.status !== "available") return "FALLBACK";
      return replayFrame.options.ageMs > OPTIONS_STALE_AFTER_MS
        ? "STALE"
        : "LIVE";
    }
    if (
      optionsState === "LIVE" &&
      auditNow - optionsChain.metadata.sourceTimestamp > OPTIONS_STALE_AFTER_MS
    ) {
      return "STALE";
    }
    return optionsState;
  }, [
    auditNow,
    optionsChain.metadata.sourceTimestamp,
    optionsState,
    replayFrame,
    replayActive,
  ]);
  const dealerFlowWall = useMemo(() => {
    if (
      replayActive ||
      optionsUnderlyingPrice === null ||
      selectedExpiry <= auditNow ||
      recentOptionTrades.length === 0
    ) {
      return null;
    }
    const result = estimateDealerFlowWall({
      trades: recentOptionTrades
        .filter(
          (trade) => trade.timestamp >= auditNow - DEALER_FLOW_LOOKBACK_MS,
        )
        .map((trade) => ({
          tradeId: trade.trade_id,
          instrumentName: trade.instrument_name,
          direction: trade.direction,
          amountBtc: trade.amount,
          timestamp: trade.timestamp,
        })),
      chain: optionsChain,
      previousChain: previousOptionsChain,
      expiry: selectedExpiry,
      spotPrice: optionsUnderlyingPrice,
      now: auditNow,
    });
    if (!result.signal) return null;
    return {
      ...result.signal,
      confidence: result.signal.confidence * (dealerFlowHasMore ? 0.8 : 1),
      detail: `${result.signal.detail}; 60m inventory proxy ${result.netDealerGammaOnePercentUsd >= 0 ? "+" : "-"}$${Math.abs(result.netDealerGammaOnePercentUsd).toLocaleString(undefined, { maximumFractionDigits: 0 })}; estimated open ${result.openingPressure.toFixed(2)} BTC / close ${result.closingPressure.toFixed(2)} BTC; ${result.tradesIncluded} trades${dealerFlowHasMore ? "; capped at 1,000" : ""}`,
    } satisfies WallSignalInput;
  }, [
    auditNow,
    dealerFlowHasMore,
    optionsChain,
    optionsUnderlyingPrice,
    previousOptionsChain,
    recentOptionTrades,
    replayActive,
    selectedExpiry,
  ]);
  const staticWallSignals = useMemo(() => {
    if (!optionsResult || optionsUnderlyingPrice === null) return [];
    return calculateStaticWallSignals({
      strikeExposures: optionsResult.strikeExposures,
      contracts: filterOptionsByExpiryScope(
        optionsChain.instruments,
        expiryScope,
        optionsCalculationNow,
      ),
      currentSpotPrice: optionsUnderlyingPrice,
      maxPainPrice: optionsResult.maxPain?.price ?? null,
      gammaFlipPrice: optionsResult.gammaFlipPrice,
    });
  }, [
    optionsCalculationNow,
    expiryScope,
    optionsChain.instruments,
    optionsResult,
    optionsUnderlyingPrice,
  ]);
  const expiryWallSignals = useMemo(() => {
    if (
      !optionsResult ||
      optionsUnderlyingPrice === null ||
      resolvedExpiries.length <= 1
    ) {
      return [];
    }
    const calculatedAt = optionsResult.summary.metadata.calculatedAt;
    return resolvedExpiries.flatMap((expiry) => {
      const contracts = scopedContracts.filter(
        ({ instrument }) => instrument.expiry === expiry,
      );
      const exposures = contracts.flatMap((contract) => {
        try {
          return [
            calculateContractExposure(
              contract,
              optionsUnderlyingPrice,
              calculatedAt,
              0.01,
            ),
          ];
        } catch {
          return [];
        }
      });
      return calculateStaticWallSignals({
        strikeExposures: aggregateExposureByStrike(exposures),
        contracts,
        currentSpotPrice: optionsUnderlyingPrice,
        maxPainPrice: null,
        gammaFlipPrice: null,
      }).map((signal) => ({ signal, expiry }));
    });
  }, [
    optionsResult,
    optionsUnderlyingPrice,
    resolvedExpiries,
    scopedContracts,
  ]);
  const confluenceSignals = useMemo<readonly WallSignalInput[]>(() => {
    const confidenceByKind = {
      gamma: 0.95,
      "open-interest": 0.95,
      volume: 0.85,
      "max-pain": 0.9,
      "gamma-flip": 0.75,
    } as const;
    const sourceSignals =
      expiryWallSignals.length === 0
        ? staticWallSignals.map((signal) => ({
            signal,
            expiry: selectedExpiry > 0 ? selectedExpiry : null,
          }))
        : [
            ...expiryWallSignals,
            ...staticWallSignals
              .filter(
                ({ kind }) => kind === "max-pain" || kind === "gamma-flip",
              )
              .map((signal) => ({
                signal,
                expiry: selectedExpiry > 0 ? selectedExpiry : null,
              })),
          ];
    const staticSignals = sourceSignals.map(
      ({ signal, expiry }): WallSignalInput => ({
        id: `${signal.id}:${expiry ?? "scope"}`,
        kind: signal.kind,
        label: signal.label,
        price: signal.price,
        normalizedConcentration: signal.concentration,
        confidence: confidenceByKind[signal.kind],
        expiry,
        direction:
          signal.optionType === "put"
            ? "support"
            : signal.optionType === "call"
              ? "resistance"
              : "neutral",
        detail: `${(signal.concentration * 100).toFixed(1)}% of ${signal.normalizationGroup}`,
      }),
    );
    return dealerFlowWall ? [...staticSignals, dealerFlowWall] : staticSignals;
  }, [dealerFlowWall, expiryWallSignals, selectedExpiry, staticWallSignals]);
  const confluenceZones = useMemo(() => {
    if (lastPrice === null || confluenceSignals.length === 0) return [];
    return createWallConfluenceZones({
      signals: confluenceSignals,
      spotPrice: lastPrice,
      now: auditNow,
      candles: candleStoreRef.current?.getSorted() ?? [],
      history: wallHistoryRef.current,
    });
  }, [auditNow, confluenceSignals, lastPrice, wallHistoryVersion]);
  const displayedConfluenceZones = useMemo<
    readonly WallConfluenceDisplayZone[]
  >(
    () =>
      confluenceZones.map((zone) => ({
        id: zone.id,
        priceLow: zone.lowerPrice,
        priceHigh: zone.upperPrice,
        score: zone.score,
        confidence: zone.confidence * 100,
        bias:
          lastPrice !== null && zone.upperPrice < lastPrice
            ? "support"
            : lastPrice !== null && zone.lowerPrice > lastPrice
              ? "resistance"
              : "pivot",
        signals: zone.signals.map((signal) => ({
          kind:
            signal.kind === "dealer-flow"
              ? "flow-informed-dealer"
              : signal.kind,
          confidence: signal.confidence * 100,
          detail: signal.detail ?? signal.label,
        })),
        contributions: zone.components,
        expiryBreadth: zone.expiryBreadth,
        reactionClassification: zone.reactionClassification,
      })),
    [confluenceZones, lastPrice],
  );
  const displayedLevels = useMemo(
    () =>
      (optionsResult?.summary.keyLevels ?? []).filter(
        (level) => secondaryVisible || level.importance === "primary",
      ),
    [optionsResult, secondaryVisible],
  );
  const invalidLevelKinds = useMemo<readonly GammaLevelKind[]>(() => {
    const present = new Set(displayedLevels.map(({ kind }) => kind));
    return (
      ["call-wall", "put-wall", "gamma-flip", "max-pain"] as const
    ).filter((kind) => !present.has(kind));
  }, [displayedLevels]);

  const refreshOverlayCoordinates = useCallback(() => {
    const adapter = chartAdapterRef.current;
    if (!adapter || !optionsResult || !overlaysVisible) {
      overlayGeometrySignatureRef.current = "";
      confluenceGeometrySignatureRef.current = "";
      setPositionedLevels([]);
      setPositionedProfileBars([]);
      setPositionedConfluenceZones([]);
      setCurrentPriceY(null);
      setGammaFlipY(null);
      return;
    }

    type Concentration = {
      strike: number;
      optionType: "call" | "put";
      openInterestBtc: number;
      volumeBtc: number;
      volumeUsd: number;
      grossGammaOnePercentUsd: number;
    };
    const concentrationBySide = new Map<string, Concentration>();
    const scopedContracts = filterOptionsByExpiryScope(
      optionsChain.instruments,
      expiryScope,
      auditNow,
    );
    for (const { instrument, quote } of scopedContracts) {
      const key = `${instrument.strike}:${instrument.optionType}`;
      const current = concentrationBySide.get(key);
      const volumeBtc =
        quote.volumeBtc !== null &&
        quote.volumeBtc !== undefined &&
        Number.isFinite(quote.volumeBtc) &&
        quote.volumeBtc >= 0
          ? quote.volumeBtc
          : 0;
      const volumeUsd =
        quote.volumeUsd !== null &&
        quote.volumeUsd !== undefined &&
        Number.isFinite(quote.volumeUsd) &&
        quote.volumeUsd >= 0
          ? quote.volumeUsd
          : 0;
      concentrationBySide.set(key, {
        strike: instrument.strike,
        optionType: instrument.optionType,
        openInterestBtc:
          (current?.openInterestBtc ?? 0) + quote.openInterestBtc,
        volumeBtc: (current?.volumeBtc ?? 0) + volumeBtc,
        volumeUsd: (current?.volumeUsd ?? 0) + volumeUsd,
        grossGammaOnePercentUsd: current?.grossGammaOnePercentUsd ?? 0,
      });
    }
    for (const exposure of optionsResult.strikeExposures) {
      const key = `${exposure.strike}:${exposure.optionType}`;
      const current = concentrationBySide.get(key);
      concentrationBySide.set(key, {
        strike: exposure.strike,
        optionType: exposure.optionType,
        openInterestBtc: current?.openInterestBtc ?? exposure.openInterestBtc,
        volumeBtc: current?.volumeBtc ?? 0,
        volumeUsd: current?.volumeUsd ?? 0,
        grossGammaOnePercentUsd: exposure.grossGammaOnePercentUsd,
      });
    }
    const concentrations = [...concentrationBySide.values()];
    const largestGrossGamma = Math.max(
      1,
      ...concentrations.map(({ grossGammaOnePercentUsd }) =>
        Math.abs(grossGammaOnePercentUsd),
      ),
    );
    const totalGrossBySide = new Map<"call" | "put", number>([
      ["call", 0],
      ["put", 0],
    ]);
    for (const concentration of concentrations) {
      totalGrossBySide.set(
        concentration.optionType,
        (totalGrossBySide.get(concentration.optionType) ?? 0) +
          concentration.grossGammaOnePercentUsd,
      );
    }
    const levels = displayedLevels.flatMap((level) => {
      const trueY = adapter.priceToCoordinate(level.price);
      if (trueY === null) return [];
      const wallSide =
        level.kind === "call-wall"
          ? "call"
          : level.kind === "put-wall"
            ? "put"
            : null;
      const matchingConcentrations = concentrations.filter(
        (concentration) =>
          concentration.strike === level.price &&
          (wallSide === null || concentration.optionType === wallSide),
      );
      const concentration =
        level.kind === "gamma-flip" ||
        level.kind === "max-pain" ||
        matchingConcentrations.length === 0
          ? null
          : {
              openInterestBtc: matchingConcentrations.reduce(
                (total, item) => total + item.openInterestBtc,
                0,
              ),
              volumeBtc: matchingConcentrations.reduce(
                (total, item) => total + item.volumeBtc,
                0,
              ),
              volumeUsd: matchingConcentrations.reduce(
                (total, item) => total + item.volumeUsd,
                0,
              ),
              grossGammaOnePercentUsd: matchingConcentrations.reduce(
                (total, item) => total + item.grossGammaOnePercentUsd,
                0,
              ),
              sameSideGrossShare:
                wallSide === null
                  ? null
                  : matchingConcentrations[0]!.grossGammaOnePercentUsd /
                    Math.max(1, totalGrossBySide.get(wallSide) ?? 0),
            };
      return [
        {
          level,
          trueY,
          state: effectiveOptionsState,
          displayStrength: Math.min(
            1,
            (concentration?.grossGammaOnePercentUsd ?? largestGrossGamma) /
              largestGrossGamma,
          ),
          concentration,
        },
      ];
    });
    const profileValues = concentrations.map((concentration) => ({
      ...concentration,
      value:
        profileMetric === "gex"
          ? concentration.grossGammaOnePercentUsd
          : concentration.openInterestBtc,
    }));
    const largestProfileValue = Math.max(
      1,
      ...profileValues.map(({ value }) => Math.abs(value)),
    );
    const profileBars = profileValues.flatMap((concentration) => {
      const y = adapter.priceToCoordinate(concentration.strike);
      if (y === null) return [];
      if (concentration.value <= 0) return [];
      return [
        {
          id: `${profileMetric}:${concentration.strike}:${concentration.optionType}`,
          strike: concentration.strike,
          optionType: concentration.optionType,
          value: concentration.value,
          y,
          strength: concentration.value / largestProfileValue,
        },
      ];
    });
    const confluenceZoneBands = displayedConfluenceZones.flatMap((zone) => {
      const top = adapter.priceToCoordinate(zone.priceHigh);
      const bottom = adapter.priceToCoordinate(zone.priceLow);
      if (top === null || bottom === null) return [];
      return [{ ...zone, top, bottom }];
    });
    const nextCurrentPriceY =
      lastPrice === null ? null : adapter.priceToCoordinate(lastPrice);
    const nextGammaFlipY =
      optionsResult.gammaFlipPrice === null
        ? null
        : adapter.priceToCoordinate(optionsResult.gammaFlipPrice);
    const confluenceSignature = JSON.stringify(
      confluenceZoneBands.map(({ id, top, bottom, score }) => [
        id,
        Math.round(top),
        Math.round(bottom),
        score,
      ]),
    );
    if (confluenceSignature !== confluenceGeometrySignatureRef.current) {
      confluenceGeometrySignatureRef.current = confluenceSignature;
      setPositionedConfluenceZones(
        chartAdapterRef.current?.setLevelSegments ? [] : confluenceZoneBands,
      );
    }
    const signature = JSON.stringify({
      levels: levels.map(({ level, trueY, displayStrength, concentration }) => [
        level.id,
        Math.round(trueY),
        displayStrength.toFixed(4),
        concentration?.volumeBtc ?? null,
      ]),
      profileMetric,
      profile: profileBars.map(({ id, y, strength }) => [
        id,
        Math.round(y),
        strength.toFixed(4),
      ]),
      current:
        nextCurrentPriceY === null ? null : Math.round(nextCurrentPriceY),
      flip: nextGammaFlipY === null ? null : Math.round(nextGammaFlipY),
      state: effectiveOptionsState,
    });
    if (signature === overlayGeometrySignatureRef.current) return;
    overlayGeometrySignatureRef.current = signature;
    setPositionedLevels(levels);
    setPositionedProfileBars(profileBars);
    setCurrentPriceY(nextCurrentPriceY);
    setGammaFlipY(nextGammaFlipY);
  }, [
    auditNow,
    displayedConfluenceZones,
    displayedLevels,
    effectiveOptionsState,
    expiryScope,
    lastPrice,
    optionsChain,
    optionsResult,
    overlaysVisible,
    profileMetric,
  ]);

  useEffect(() => {
    refreshOverlayCoordinatesRef.current = refreshOverlayCoordinates;
  }, [refreshOverlayCoordinates]);

  const refreshDiagnostics = useCallback(() => {
    const adapter = chartAdapterRef.current;
    if (adapter) setDiagnostics(adapter.getDiagnostics());
  }, []);

  const handleReconcile = useCallback(async () => {
    if (replayActiveRef.current) return;
    const store = candleStoreRef.current;
    const client = restClientRef.current;
    const adapter = chartAdapterRef.current;
    if (!store || !client || !adapter) return;

    const now = await getBinanceNow(client);
    if (now === null) return;

    const result = await store.reconcile(client, now);
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
    setVolumeProfileRevision((revision) => revision + 1);
    timeframeHistoryCacheRef.current.set(
      activeIntervalRef.current,
      store.getSorted(),
    );
    setCandleStatus(
      `Reconciled ${result.barsRepaired} bar${result.barsRepaired === 1 ? "" : "s"}`,
    );
    refreshDiagnostics();
  }, [getBinanceNow, refreshDiagnostics]);

  const loadOlderHistory = useCallback(async () => {
    if (replayActiveRef.current) return;
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
      timeframeHistoryCacheRef.current.set(intervalAtStart, store.getSorted());
      reachedHistoryBeginningRef.current = result.reachedBeginning;
      adapter.setHistory(store.getSorted(), {
        preserveVisibleRange: true,
        fitContent: false,
      });
      setVolumeProfileRevision((revision) => revision + 1);
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
  useEffect(() => {
    loadOlderHistoryRef.current = () => {
      void loadOlderHistory();
    };
  }, [loadOlderHistory]);

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
      showVolumePane: false,
    });
    chartAdapterRef.current = adapter;
    const volumeProfileController = new VolumeProfileController({
      profileId: "dashboard-volume-profile",
      debounceMs: 120,
      maxDelayMs: 400,
      cacheCapacity: 40,
      presentation: {
        placement: "right",
        widthFraction: 0.16,
        barOpacity: 0.38,
        showPOC: true,
        showVAH: true,
        showVAL: true,
        showValueAreaShading: true,
        showLabels: true,
      },
      onRender: (renderInput) => {
        adapter.setVolumeProfile?.("dashboard-volume-profile", renderInput);
      },
    });
    volumeProfileControllerRef.current = volumeProfileController;
    const anchoredVwapController = new AnchoredVwapController({
      vwapId: "dashboard-anchored-vwap",
      debounceMs: 80,
      maxDelayMs: 250,
      cacheCapacity: 40,
      onRender: (renderInput) => {
        adapter.setAnchoredVwap?.("dashboard-anchored-vwap", renderInput);
      },
    });
    anchoredVwapControllerRef.current = anchoredVwapController;

    for (const drawing of readStoredDrawings()) adapter.addDrawing(drawing);
    setDrawingCount(adapter.getDrawings().length);
    setDrawings(adapter.getDrawings());

    const unsubscribeDrawings = adapter.subscribeDrawingsChange((drawings) => {
      localStorage.setItem(DRAWING_STORAGE_KEY, JSON.stringify(drawings));
      setDrawingCount(drawings.length);
      setDrawings(drawings);
      setDiagnostics(adapter.getDiagnostics());
    });

    const unsubscribeDrawingMode = adapter.subscribeDrawingModeChange?.((mode) => {
      setDrawingModeState(mode);
    });

    const unsubscribeTimeSelection = adapter.subscribeTimeSelection(
      (timestamp) => {
        setAnchoredVwapSettings((current) =>
          normalizeAnchoredVwapSettings({
            ...current,
            enabled: true,
            anchorMode: "manual",
            manualTimestamp: timestamp,
          }),
        );
        adapter.setDrawingMode("pointer");
      },
    );
    const scheduleOverlayRefresh = () => {
      if (overlayAnimationFrameRef.current !== null) return;
      overlayAnimationFrameRef.current = requestAnimationFrame(() => {
        overlayAnimationFrameRef.current = null;
        refreshOverlayCoordinatesRef.current();
      });
    };
    const unsubscribeViewport = adapter.subscribeViewportChange((viewport) => {
      scheduleOverlayRefresh();
      if (viewportReadyRef.current && viewport.visibleRange) {
        timeframeManagerRef.current.setCachedViewport(
          activeIntervalRef.current,
          viewport.visibleRange,
        );
      }
      if (
        viewportReadyRef.current &&
        viewport.barsBefore < LAZY_HISTORY_THRESHOLD_BARS
      ) {
        loadOlderHistoryRef.current();
      }
    });
    const handlePointerMove = (event: PointerEvent) => {
      if (event.buttons !== 0) scheduleOverlayRefresh();
    };
    const handleWheel = () => scheduleOverlayRefresh();
    container.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    container.addEventListener("wheel", handleWheel, { passive: true });
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setChartHeight(Math.max(Math.floor(entry.contentRect.height), 1));
      adapter.resize(
        Math.max(Math.floor(entry.contentRect.width), 1),
        Math.max(Math.floor(entry.contentRect.height), 1),
      );
      scheduleOverlayRefresh();
    });
    observer.observe(container);
    setDiagnostics(adapter.getDiagnostics());

    return () => {
      observer.disconnect();
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("wheel", handleWheel);
      if (overlayAnimationFrameRef.current !== null) {
        cancelAnimationFrame(overlayAnimationFrameRef.current);
        overlayAnimationFrameRef.current = null;
      }
      unsubscribeViewport();
      unsubscribeDrawings();
      unsubscribeDrawingMode?.();
      unsubscribeTimeSelection();
      volumeProfileController.dispose();
      adapter.removeVolumeProfile?.("dashboard-volume-profile");
      anchoredVwapController.dispose();
      adapter.removeAnchoredVwap?.("dashboard-anchored-vwap");
      adapter.destroy();
      chartAdapterRef.current = null;
      volumeProfileControllerRef.current = null;
      anchoredVwapControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const adapter = chartAdapterRef.current;
    const controller = volumeProfileControllerRef.current;
    if (!adapter || !controller) return;
    if (!volumeProfileSettings.enabled) {
      adapter.removeVolumeProfile?.("dashboard-volume-profile");
      return;
    }

    const candles =
      replayTimeline && replayIndex >= 0
        ? replayTimeline.candles.slice(0, replayIndex + 1)
        : (candleStoreRef.current?.getSorted() ?? []);
    const first = candles[0];
    const last = candles.at(-1);
    if (!first || !last) return;
    const selectedRange = drawings
      .filter(
        (
          drawing,
        ): drawing is Extract<ChartDrawing, { type: "volume-profile-range" }> =>
          drawing.type === "volume-profile-range",
      )
      .sort((left, right) => right.createdAt - left.createdAt)[0];
    const visibleRange = adapter.getVisibleRange();
    const range = selectedRange
      ? {
          from: Math.min(
            selectedRange.fromTimestamp,
            selectedRange.toTimestamp,
          ),
          to: Math.max(selectedRange.fromTimestamp, selectedRange.toTimestamp),
        }
      : visibleRange
        ? {
            from: visibleRange.fromTimestamp,
            to: visibleRange.toTimestamp,
          }
        : { from: first.openTime, to: last.closeTime };

    const opacity = volumeProfileSettings.opacityPercent / 100;
    controller.setPresentation({
      placement: volumeProfileSettings.placement,
      widthFraction: volumeProfileSettings.widthPercent / 100,
      valueAreaOpacity: opacity,
      nonValueAreaOpacity: Math.max(0.05, opacity * 0.35),
      showLabels: volumeProfileSettings.showLabels,
      showPOC: volumeProfileSettings.showPOC,
      showVAH: volumeProfileSettings.showVAH,
      showVAL: volumeProfileSettings.showVAL,
      showValueAreaShading: volumeProfileSettings.showValueAreaShading,
    });
    controller.setInput({
      candles,
      range,
      replayCutoff:
        replayTimeline && replayIndex >= 0 ? last.closeTime : undefined,
      binConfig: {
        mode: "rowCount",
        rowCount: volumeProfileSettings.rowCount,
      },
      volumeUnit: volumeProfileSettings.volumeUnit,
      directionMode: volumeProfileSettings.directionMode,
      valueAreaPercent: volumeProfileSettings.valueAreaPercent,
      sourceMetadata: {
        exchange: "binance",
        market: "spot",
        symbol: "BTCUSDT",
        sourceTimeframe: selectedInterval,
        displayTimeframe: selectedInterval,
        volumeUnit: volumeProfileSettings.volumeUnit,
        calculationVersion: VOLUME_PROFILE_CALCULATION_VERSION,
        sourceRevision: `${selectedInterval}:${volumeProfileRevision}:${replayIndex}`,
      },
    });
  }, [
    replayIndex,
    replayTimeline,
    drawings,
    selectedInterval,
    volumeProfileSettings,
    volumeProfileRevision,
  ]);

  useEffect(() => {
    const adapter = chartAdapterRef.current;
    const controller = anchoredVwapControllerRef.current;
    if (!adapter || !controller) return;
    if (!anchoredVwapSettings.enabled) {
      adapter.removeAnchoredVwap?.("dashboard-anchored-vwap");
      return;
    }

    const candles =
      replayTimeline && replayIndex >= 0
        ? replayTimeline.candles.slice(0, replayIndex + 1)
        : (candleStoreRef.current?.getSorted() ?? []);
    const latest = candles.at(-1);
    if (!latest) return;
    const anchorTimestamp = resolveAnchoredVwapAnchor(
      anchoredVwapSettings,
      latest.openTime,
    );
    if (anchorTimestamp === null) {
      adapter.removeAnchoredVwap?.("dashboard-anchored-vwap");
      return;
    }

    const multipliers = getEnabledBandMultipliers(anchoredVwapSettings);
    const fillAlpha = anchoredVwapSettings.fillOpacityPercent / 100;
    controller.setPresentation({
      vwapColor: anchoredVwapSettings.vwapColor,
      vwapLineWidth: anchoredVwapSettings.lineWidth,
      showBands: multipliers.length > 0,
      bandColors: [
        `${anchoredVwapSettings.bandColor}b8`,
        `${anchoredVwapSettings.bandColor}80`,
        `${anchoredVwapSettings.bandColor}52`,
      ],
      bandLineWidth: 1,
      bandFillColor: `${anchoredVwapSettings.bandColor}${Math.round(
        fillAlpha * 255,
      )
        .toString(16)
        .padStart(2, "0")}`,
      showFill: anchoredVwapSettings.showFill && multipliers.length > 0,
      showAnchorLine: anchoredVwapSettings.showAnchorLine,
      anchorLineColor: `${anchoredVwapSettings.vwapColor}8f`,
      showLabels: anchoredVwapSettings.showLabel,
      labelPrecision: 2,
    });
    controller.setInput({
      anchorTimestamp,
      candles,
      priceSource: anchoredVwapSettings.priceSource,
      bandMultipliers: multipliers,
      replayCutoff:
        replayTimeline && replayIndex >= 0 ? latest.closeTime : undefined,
      symbol: "BTCUSDT",
      timeframe: selectedInterval,
    });
  }, [
    anchoredVwapSettings,
    replayIndex,
    replayTimeline,
    selectedInterval,
    volumeProfileRevision,
  ]);

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
    const cachedHistory =
      timeframeHistoryCacheRef.current.get(selectedInterval);

    let socket: BinanceKlineSocket | null = null;
    setFeedState("CONNECTING");
    setCandleStatus(
      cachedHistory?.length
        ? `Cached ${selectedInterval} bars · refreshing`
        : `Loading ${HISTORY_TARGET_LABEL} ${selectedInterval} bars`,
    );

    const applyHistory = (
      historyCandles: readonly Candle[],
      status: string,
      preserveVisibleRange = false,
    ) => {
      store.setHistory(historyCandles);
      setVolumeProfileRevision((revision) => revision + 1);
      timeframeHistoryCacheRef.current.set(selectedInterval, historyCandles);
      timeframeManagerRef.current.setCachedCandles(
        selectedInterval,
        historyCandles,
      );
      const adapter = chartAdapterRef.current;
      if (!replayActiveRef.current) {
        adapter?.setHistory(historyCandles, {
          preserveVisibleRange,
          fitContent: false,
        });
      }
      const visibleTo = historyCandles.at(-1);
      const cachedViewport =
        timeframeManagerRef.current.getCachedViewport(selectedInterval);
      if (!preserveVisibleRange && adapter && cachedViewport) {
        adapter.setVisibleRange(cachedViewport);
      } else {
        const visibleBarCount =
          (chartContainerRef.current?.clientWidth ?? 1_000) < 600
            ? 64
            : INITIAL_VISIBLE_BARS;
        const visibleFrom =
          historyCandles[Math.max(historyCandles.length - visibleBarCount, 0)];
        if (!preserveVisibleRange && adapter && visibleFrom && visibleTo) {
          adapter.setVisibleRange({
            fromTimestamp: visibleFrom.openTime,
            toTimestamp: visibleTo.openTime,
          });
        }
      }
      const latest = visibleTo ?? null;
      latestCandleRef.current = latest;
      setCandleCount(historyCandles.length);
      setLastPrice(latest?.close ?? null);
      setDayChange(calculateDayChange(historyCandles));
      setCandleStatus(status);
      requestAnimationFrame(() => {
        if (feedGenerationRef.current === generation) {
          viewportReadyRef.current = true;
        }
      });
      refreshDiagnostics();
    };

    if (cachedHistory?.length) {
      applyHistory(
        cachedHistory,
        `Cached ${selectedInterval} bars · refreshing`,
      );
    }

    const startSocket = () => {
      if (socket || feedGenerationRef.current !== generation) return;
      socket = new BinanceKlineSocket({
        interval: selectedInterval,
        onCandle: (candle) => {
          if (feedGenerationRef.current !== generation) return;
          const startsNewBar =
            latestCandleRef.current?.openTime !== candle.openTime;
          if (store.applyLiveCandle(candle) === null) return;
          if (!replayActiveRef.current) {
            chartAdapterRef.current?.updateCandle(candle);
          }
          latestCandleRef.current = candle;
          setLastPrice(candle.close);
          setCandleCount(store.size);
          if (startsNewBar) {
            setVolumeProfileRevision((revision) => revision + 1);
          }
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
    };

    void (async () => {
      try {
        await timeframeManagerRef.current.switchTimeframe({
          interval: selectedInterval,
          client,
          targetBars: HISTORY_TARGET_BARS,
          onInitialReady: (initialCandles, { fromCache }) => {
            if (feedGenerationRef.current !== generation) return;
            applyHistory(
              initialCandles,
              fromCache
                ? `Cached ${selectedInterval} bars · live`
                : `Binance REST (initial ${initialCandles.length}) + live ${selectedInterval}`,
              Boolean(cachedHistory?.length) || fromCache,
            );
            if (initialCandles.length > 0) {
              startSocket();
            }
          },
          onBackgroundProgress: (accumulatedCandles, meta) => {
            if (feedGenerationRef.current !== generation) return;
            store.setHistory(accumulatedCandles);
            timeframeHistoryCacheRef.current.set(
              selectedInterval,
              accumulatedCandles,
            );
            timeframeManagerRef.current.setCachedCandles(
              selectedInterval,
              accumulatedCandles,
            );
            const adapter = chartAdapterRef.current;
            if (!replayActiveRef.current) {
              adapter?.setHistory(accumulatedCandles, {
                preserveVisibleRange: true,
                fitContent: false,
              });
            }
            setCandleCount(accumulatedCandles.length);
            setVolumeProfileRevision((revision) => revision + 1);
            setCandleStatus(
              accumulatedCandles.length >= meta.targetBars
                ? `Binance REST + live ${selectedInterval}`
                : `Binance streaming ${selectedInterval} (${accumulatedCandles.length}/${meta.targetBars})`,
            );
            refreshDiagnostics();
          },
          onError: (error) => {
            if (feedGenerationRef.current !== generation) return;
            if (store.size === 0) {
              applyHistory([], "Binance candle data unavailable");
            }
            setFeedState("DEGRADED");
            setCandleStatus(
              error instanceof Error ? error.message : "History load failed",
            );
          },
        });
      } catch (error) {
        if (feedGenerationRef.current !== generation) return;
        if (store.size === 0) {
          applyHistory([], "Binance candle data unavailable");
        }
        setFeedState("DEGRADED");
        setCandleStatus(
          error instanceof Error ? error.message : "History load failed",
        );
      }
    })();

    return () => {
      timeframeManagerRef.current.cancelActiveLoads();
      socket?.destroy();
      if (store.size > 0) {
        timeframeHistoryCacheRef.current.set(
          selectedInterval,
          store.getSorted(),
        );
      }
      if (binanceSocketRef.current === socket) binanceSocketRef.current = null;
      if (candleStoreRef.current === store) candleStoreRef.current = null;
    };
  }, [selectedInterval, getBinanceNow, handleReconcile, refreshDiagnostics]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void handleReconcile();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [handleReconcile]);

  useEffect(() => {
    const timer = setInterval(() => setAuditNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const client = deribitFlowClientRef.current;
    if (!client) return;
    let disposed = false;
    const refresh = async () => {
      const endTimestamp = Date.now();
      try {
        const result = await client.getRecentOptionTrades({
          startTimestamp: endTimestamp - DEALER_FLOW_LOOKBACK_MS,
          endTimestamp,
          count: 1_000,
          sorting: "asc",
        });
        if (disposed) return;
        setRecentOptionTrades(result.trades);
        setDealerFlowHasMore(result.has_more);
        setDealerFlowUpdatedAt(endTimestamp);
        setDealerFlowState("LIVE");
      } catch {
        if (!disposed) setDealerFlowState("STALE");
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), DEALER_FLOW_REFRESH_MS);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const client = deribitFlowClientRef.current;
    const instruments = gammaReconciliationInstrumentKey
      .split(",")
      .filter(Boolean);
    if (!client || instruments.length === 0) return;
    let disposed = false;
    const reconcile = async () => {
      try {
        const tickers = await Promise.all(
          instruments.map((instrumentName) =>
            client.getOptionTicker(instrumentName),
          ),
        );
        if (disposed) return;
        const deviations = tickers.flatMap((ticker) => {
          const timeToExpiryYears =
            (selectedExpiry - ticker.timestamp) / millisecondsPerYear;
          if (timeToExpiryYears <= 0 || ticker.greeks.gamma <= 0) return [];
          const calculated = calculateDeribitInverseGamma(
            ticker.underlying_price,
            Number(ticker.instrument_name.split("-").at(-2)),
            timeToExpiryYears,
            ticker.mark_iv / 100,
            ticker.interest_rate,
          );
          const absoluteDifference = Math.abs(calculated - ticker.greeks.gamma);
          return [
            {
              relative: absoluteDifference / ticker.greeks.gamma,
              divergent:
                absoluteDifference > 0.000005 &&
                absoluteDifference / ticker.greeks.gamma > 0.1,
            },
          ];
        });
        setGammaReconciliation({
          state:
            deviations.length === 0
              ? "STALE"
              : deviations.some(({ divergent }) => divergent)
                ? "DIVERGED"
                : "PASS",
          samples: deviations.length,
          maxDeviation:
            deviations.length === 0
              ? null
              : Math.max(...deviations.map(({ relative }) => relative)),
        });
      } catch {
        if (!disposed) {
          setGammaReconciliation((current) => ({
            ...current,
            state: "STALE",
          }));
        }
      }
    };
    void reconcile();
    const timer = setInterval(
      () => void reconcile(),
      GAMMA_RECONCILIATION_REFRESH_MS,
    );
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [gammaReconciliationInstrumentKey, selectedExpiry]);

  useEffect(() => {
    wallHistoryRef.current = new Map();
    lastWallObservationRef.current = "";
    setWallHistoryVersion((version) => version + 1);
  }, [selectedExpiry]);

  useEffect(() => {
    if (confluenceSignals.length === 0 || lastPrice === null) return;
    const observation = `${optionsChain.metadata.sourceTimestamp}:${dealerFlowUpdatedAt}`;
    if (lastWallObservationRef.current === observation) return;
    lastWallObservationRef.current = observation;
    wallHistoryRef.current = updateWallSignalHistory(
      wallHistoryRef.current,
      confluenceSignals,
      auditNow,
      calculateWallZoneTolerance(
        lastPrice,
        candleStoreRef.current?.getSorted() ?? [],
      ),
    );
    setWallHistoryVersion((version) => version + 1);
  }, [
    auditNow,
    confluenceSignals,
    dealerFlowUpdatedAt,
    lastPrice,
    optionsChain.metadata.sourceTimestamp,
  ]);

  useEffect(() => {
    const engine = new DeribitOptionsDataEngine({
      restClient: new DeribitRestClient(),
      visibilityDocument: document,
      onSnapshot: (snapshot) => {
        setPreviousOptionsChain(previousOptionsChainRef.current);
        previousOptionsChainRef.current = snapshot;
        setLiveOptionsChain(snapshot);
        setOptionsState("LIVE");
        setMetricStatus("Live Deribit chain calculated in worker");
      },
      onIndexPrice: (price) => setDeribitIndexPrice(price.price),
      onHealthChange: (feed, state) => {
        if (feed !== "options") return;
        if (state === "LIVE") setOptionsState("LIVE");
        else if (state === "STALE" || state === "RECONNECTING") {
          setOptionsState("STALE");
        } else if (
          state === "FALLBACK" ||
          state === "OFFLINE" ||
          state === "ERROR"
        ) {
          setOptionsState((current) =>
            current === "LIVE" || current === "STALE" ? "STALE" : "FALLBACK",
          );
        }
      },
      onError: () => {
        setMetricStatus("Deribit options data unavailable");
      },
    });
    deribitEngineRef.current = engine;
    void engine.start().catch(() => {
      setOptionsState("FALLBACK");
      setMetricStatus("Deribit options data unavailable");
    });
    return () => {
      engine.stop();
      if (deribitEngineRef.current === engine) deribitEngineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (
      optionsState !== "LIVE" ||
      liveOptionsChain.instruments.length === 0 ||
      !Number.isSafeInteger(liveOptionsChain.metadata.sourceTimestamp)
    ) {
      return;
    }
    const capturedAt = liveOptionsChain.metadata.sourceTimestamp;
    const bucket = Math.floor(capturedAt / REPLAY_SNAPSHOT_INTERVAL_MS);
    if (lastReplaySnapshotBucketRef.current === bucket) return;
    lastReplaySnapshotBucketRef.current = bucket;
    const storage = replayStorageRef.current;
    if (!storage) return;
    void storage
      .write({
        schemaVersion: "options-replay-snapshot-v1",
        snapshotId: `deribit-${bucket}`,
        capturedAt,
        chain: liveOptionsChain,
      })
      .then(({ size }) =>
        setReplayStorageStatus(`OPTIONS HISTORY ${size}/${storage.capacity}`),
      )
      .catch(() => setReplayStorageStatus("OPTIONS HISTORY UNAVAILABLE"));
  }, [liveOptionsChain, optionsState]);

  useEffect(() => {
    const worker = new Worker(
      new URL("../workers/options-metric.worker.ts", import.meta.url),
      { type: "module", name: "options-metric" },
    );
    optionsWorkerRef.current = worker;
    activeWorkerCountRef.current = 1;
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
      if (event.data.type !== "options-metrics-result") return;
      setOptionsResult(event.data.result);
      setWorkerDuration(event.data.durationMs);
      setMetricStatus("Options chain calculated in worker");
    });
    return () => {
      worker.terminate();
      if (optionsWorkerRef.current === worker) optionsWorkerRef.current = null;
      activeWorkerCountRef.current = 0;
    };
  }, []);

  useEffect(() => {
    if (optionsUnderlyingPrice === null || !optionsWorkerRef.current) return;
    if (
      (!replayActive && optionsState === "FALLBACK") ||
      optionsChain.instruments.length === 0
    ) {
      const timer = setTimeout(() => {
        setOptionsResult(null);
        setWorkerDuration(null);
      }, 0);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => {
      const calculatedAt = optionsCalculationNow;
      const inputVersion = latestInputVersionRef.current + 1;
      latestInputVersionRef.current = inputVersion;
      const request: OptionsCalculationRequest = {
        protocolVersion: OPTIONS_WORKER_PROTOCOL_VERSION,
        type: "calculate-options-metrics",
        inputVersion,
        input: {
          chain: optionsChain,
          underlyingPriceUsd: optionsUnderlyingPrice,
          calculatedAt,
          expiryScope,
          interestRateFallbackDecimal: 0.01,
          maxPainExpiry: selectMaxPainExpiry(
            optionsChain,
            expiryScope,
            calculatedAt,
          ),
          secondaryLevelCount: 3,
        },
      };
      optionsWorkerRef.current?.postMessage(request);
    }, 100);
    return () => clearTimeout(timer);
  }, [
    expiryScope,
    optionsChain,
    optionsState,
    optionsUnderlyingPrice,
    optionsCalculationNow,
    replayActive,
  ]);

  useEffect(() => {
    const adapter = chartAdapterRef.current;
    if (!adapter) return;

    if (!overlaysVisible) {
      adapter.setLevels([]);
      adapter.clearLevelSegments?.();
      refreshOverlayCoordinates();
      refreshDiagnostics();
      return;
    }

    const tracker = levelShiftTrackerRef.current;
    const observationTs =
      replayFrame?.candle.openTime ??
      latestCandleRef.current?.openTime ??
      optionsCalculationNow ??
      Date.now();
    const expiryKey =
      typeof expiryScope === "string"
        ? expiryScope
        : JSON.stringify(expiryScope);

    const levelRecords = tracker.updateLevels(
      displayedLevels,
      expiryKey,
      observationTs,
    );
    const zoneInputs = displayedConfluenceZones.map((z) => ({
      id: z.id,
      priceLow: z.priceLow,
      priceHigh: z.priceHigh,
      score: z.score,
      bias: z.bias,
      signalKinds: z.signals.map((s) => s.kind),
    }));
    const zoneRecords = tracker.updateConfluenceZones(
      zoneInputs,
      expiryKey,
      observationTs,
    );

    const levelRecordsMap = new Map(levelRecords.map((r) => [r.id, r]));
    const zoneRecordsMap = new Map(zoneRecords.map((r) => [r.id, r]));
    const segmentCandles =
      replayTimeline && replayIndex >= 0
        ? replayTimeline.candles.slice(0, replayIndex + 1)
        : (candleStoreRef.current?.getSorted() ?? []);
    const segmentStart = (timestamp: number | undefined): number | null =>
      timestamp === undefined
        ? null
        : snapTimestampToCandle(timestamp, segmentCandles);

    const segments: LevelSegment[] = [];

    for (const level of displayedLevels) {
      const semanticId =
        level.kind === "call-wall" ||
        level.kind === "put-wall" ||
        level.kind === "gamma-flip" ||
        level.kind === "max-pain"
          ? `${level.kind}-${expiryKey}`
          : `${level.kind}-${level.id}-${expiryKey}`;

      const record = levelRecordsMap.get(semanticId);

      segments.push({
        id: level.id,
        kind: level.kind,
        label: level.label,
        price: level.price,
        activationTimestamp: segmentStart(record?.activationTimestamp),
        importance: level.importance,
        color: LEVEL_COLORS[level.kind],
      });
    }

    for (const zone of displayedConfluenceZones) {
      const record = zoneRecordsMap.get(`confluence-${zone.id}-${expiryKey}`);
      segments.push({
        id: zone.id,
        kind: "confluence-zone",
        label: "Confluence Zone",
        price: (zone.priceLow + zone.priceHigh) / 2,
        priceLow: zone.priceLow,
        priceHigh: zone.priceHigh,
        activationTimestamp: segmentStart(record?.activationTimestamp),
        bias: zone.bias,
        score: zone.score,
      });
    }

    if (adapter.setLevelSegments) {
      adapter.setLevelSegments(segments, { showPips: true });
      adapter.setLevels([]);
    } else {
      adapter.setLevels(displayedLevels);
    }

    try {
      localStorage.setItem(LEVEL_SHIFT_STORAGE_KEY, tracker.serialize());
    } catch {
      // Shift tracking remains available for the current session.
    }

    refreshOverlayCoordinates();
    refreshDiagnostics();
  }, [
    displayedConfluenceZones,
    displayedLevels,
    expiryScope,
    optionsCalculationNow,
    overlaysVisible,
    replayFrame?.candle.openTime,
    replayIndex,
    replayTimeline,
    refreshDiagnostics,
    refreshOverlayCoordinates,
  ]);

  useEffect(() => {
    refreshOverlayCoordinates();
  }, [refreshOverlayCoordinates]);

  useEffect(() => {
    replayActiveRef.current = replayState !== null;
  }, [replayState]);

  useEffect(() => {
    const adapter = chartAdapterRef.current;
    if (!adapter) return;
    if (!replayState || !replayFrame) {
      if (replayRenderedIndexRef.current >= 0) {
        const candles = candleStoreRef.current?.getSorted() ?? [];
        adapter.setHistory(candles, { fitContent: false });
        const from =
          candles[Math.max(0, candles.length - INITIAL_VISIBLE_BARS)];
        const to = candles.at(-1);
        if (from && to) {
          adapter.setVisibleRange({
            fromTimestamp: from.openTime,
            toTimestamp: to.openTime,
          });
        }
        replayRenderedIndexRef.current = -1;
      }
      return;
    }

    const previousIndex = replayRenderedIndexRef.current;
    if (previousIndex < 0 || replayFrame.index <= previousIndex) {
      adapter.setHistory(
        replayState.timeline.candles.slice(0, replayFrame.index + 1),
        { fitContent: false },
      );
    } else {
      for (
        let index = previousIndex + 1;
        index <= replayFrame.index;
        index += 1
      ) {
        const candle = replayState.timeline.candles[index];
        if (candle) adapter.updateCandle(candle);
      }
    }
    replayRenderedIndexRef.current = replayFrame.index;
    const from =
      replayState.timeline.candles[
        Math.max(0, replayFrame.index - INITIAL_VISIBLE_BARS + 1)
      ];
    if (from) {
      adapter.setVisibleRange({
        fromTimestamp: from.openTime,
        toTimestamp: replayFrame.candle.openTime,
      });
    }
    refreshOverlayCoordinatesRef.current();
  }, [replayFrame, replayState]);

  useEffect(() => {
    if (replayPlayback !== "playing") return;
    let animationFrame = 0;
    let previousTime = performance.now();
    const tick = (time: number) => {
      const elapsedMs = time - previousTime;
      previousTime = time;
      setReplayState((current) =>
        current ? reduceReplay(current, { type: "tick", elapsedMs }) : null,
      );
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [replayPlayback]);

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

  const toggleReplay = async () => {
    if (replayState) {
      setReplayState(null);
      setReplayStorageStatus("OPTIONS HISTORY RECORDING");
      return;
    }
    const candles = candleStoreRef.current?.getSorted() ?? [];
    const storage = replayStorageRef.current;
    if (candles.length === 0 || !storage) {
      setReplayStorageStatus("REPLAY DATA UNAVAILABLE");
      return;
    }
    try {
      const optionsSnapshots = await storage.readRange({
        limit: storage.capacity,
      });
      const timeline = createReplayTimeline({
        candles,
        optionsSnapshots,
        frameDurationMs: 500,
      });
      setReplayState(createReplayState(timeline, 5));
      setReplayStorageStatus(
        optionsSnapshots.length === 0
          ? "OPTIONS HISTORY UNAVAILABLE"
          : `OPTIONS SNAPSHOTS ${optionsSnapshots.length}`,
      );
    } catch {
      setReplayStorageStatus("REPLAY DATA UNAVAILABLE");
    }
  };

  const sendReplayCommand = (
    command:
      | { readonly type: "play" | "pause" | "step" | "reset" }
      | { readonly type: "set-speed"; readonly speed: ReplaySpeed },
  ) => {
    setReplayState((current) =>
      current ? reduceReplay(current, command) : null,
    );
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
              disabled={replayState !== null}
              onClick={() => setRequestedInterval(timeframe)}
            >
              {timeframe}
            </button>
          ))}
        </nav>

        <label className="expiry-control">
          <span>Expiry</span>
          <select
            aria-label="Expiry date"
            value={expirySelection}
            onChange={(event) => setExpirySelection(event.target.value)}
          >
            {activeExpiries.length === 0 ? (
              <option value="">No active expiries</option>
            ) : null}
            <optgroup label="Scopes">
              {DASHBOARD_EXPIRY_SCOPES.map(({ kind, label }) => (
                <option key={kind} value={`scope:${kind}`}>
                  {label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Exact Deribit expiries">
              {activeExpiries.map((expiry) => (
                <option key={expiry} value={`expiry:${expiry}`}>
                  {formatDeribitExpiryDate(expiry)}
                </option>
              ))}
            </optgroup>
          </select>
        </label>

        <div className="overlay-controls" aria-label="Gamma overlay controls">
          <button
            type="button"
            className={overlaysVisible ? "active" : ""}
            aria-label={
              overlaysVisible
                ? "Hide options overlays"
                : "Show options overlays"
            }
            title={
              overlaysVisible
                ? "Hide options overlays"
                : "Show options overlays"
            }
            aria-pressed={overlaysVisible}
            onClick={() => setOverlaysVisible((visible) => !visible)}
          >
            {overlaysVisible ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
          <button
            type="button"
            className={shadingEnabled ? "active" : ""}
            aria-label="Toggle Gamma regime shading"
            title="Toggle Gamma regime shading"
            aria-pressed={shadingEnabled}
            onClick={() => setShadingEnabled((enabled) => !enabled)}
          >
            <span className="regime-swatch" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={profileExpanded ? "active" : ""}
            aria-label={
              profileExpanded
                ? "Collapse Gamma profile"
                : "Expand Gamma profile"
            }
            title={
              profileExpanded
                ? "Collapse Gamma profile"
                : "Expand Gamma profile"
            }
            aria-pressed={profileExpanded}
            onClick={() => setProfileExpanded((expanded) => !expanded)}
          >
            {profileExpanded ? (
              <PanelLeftClose size={16} />
            ) : (
              <PanelLeftOpen size={16} />
            )}
          </button>
          {profileExpanded ? (
            <div
              className="profile-metric-control"
              role="group"
              aria-label="Options concentration profile"
            >
              {PROFILE_METRICS.map((metric) => (
                <button
                  key={metric.value}
                  type="button"
                  className={profileMetric === metric.value ? "active" : ""}
                  aria-label={metric.title}
                  title={metric.title}
                  aria-pressed={profileMetric === metric.value}
                  onClick={() => setProfileMetric(metric.value)}
                >
                  {metric.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

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

      <OptionsSummaryBar
        summary={optionsResult?.summary ?? null}
        state={effectiveOptionsState}
        workerDurationMs={workerDuration}
        now={auditNow}
        ivSummary={ivSummary}
      />

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
            <div className="chart-heading-actions">
              <IndicatorControls
                volumeProfile={volumeProfileSettings}
                anchoredVwap={anchoredVwapSettings}
                anchorLabel={anchoredVwapAnchorLabel}
                anchorPicking={drawingMode === "anchored-vwap"}
                onVolumeProfileChange={(settings) =>
                  setVolumeProfileSettings(
                    normalizeVolumeProfileSettings(settings),
                  )
                }
                onAnchoredVwapChange={(settings) =>
                  setAnchoredVwapSettings(
                    normalizeAnchoredVwapSettings(settings),
                  )
                }
                onStartAnchorPick={() => setDrawingMode("anchored-vwap")}
              />
              <button
                type="button"
                className={
                  replayState ? "active replay-toggle" : "replay-toggle"
                }
                aria-pressed={replayState !== null}
                onClick={() => void toggleReplay()}
              >
                <History size={14} />
                {replayState ? "LIVE" : "REPLAY"}
              </button>
              {replayState ? (
                <div
                  className="replay-controls"
                  aria-label="Chart replay controls"
                >
                  <button
                    type="button"
                    aria-label={
                      replayState.playback === "playing"
                        ? "Pause replay"
                        : "Play replay"
                    }
                    title={
                      replayState.playback === "playing"
                        ? "Pause replay"
                        : "Play replay"
                    }
                    onClick={() =>
                      sendReplayCommand({
                        type:
                          replayState.playback === "playing" ? "pause" : "play",
                      })
                    }
                  >
                    {replayState.playback === "playing" ? (
                      <Pause size={14} />
                    ) : (
                      <Play size={14} />
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label="Step replay"
                    title="Step replay"
                    onClick={() => sendReplayCommand({ type: "step" })}
                  >
                    <StepForward size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label="Reset replay"
                    title="Reset replay"
                    onClick={() => sendReplayCommand({ type: "reset" })}
                  >
                    <RotateCcw size={14} />
                  </button>
                  <select
                    aria-label="Replay speed"
                    value={replayState.speed}
                    onChange={(event) =>
                      sendReplayCommand({
                        type: "set-speed",
                        speed: Number(event.target.value) as ReplaySpeed,
                      })
                    }
                  >
                    {REPLAY_SPEEDS.map((speed) => (
                      <option key={speed} value={speed}>
                        {speed}x
                      </option>
                    ))}
                  </select>
                  <span>
                    {replayFrame ? replayFrame.index + 1 : 0}/
                    {replayState.timeline.candles.length} ·{" "}
                    {replayStorageStatus}
                  </span>
                </div>
              ) : null}
              <span
                className={`options-source state-${effectiveOptionsState.toLowerCase()}`}
              >
                {effectiveOptionsState === "FALLBACK"
                  ? "OPTIONS DATA UNAVAILABLE"
                  : `${effectiveOptionsState} · ${optionsResult?.summary.metadata.contractsIncluded ?? 0} OF ${optionsChain.instruments.length} DERIBIT CONTRACTS`}
              </span>
              <button
                type="button"
                className={secondaryVisible ? "active" : ""}
                aria-label="Toggle secondary GEX levels"
                title="Toggle secondary GEX levels"
                aria-pressed={secondaryVisible}
                onClick={() => setSecondaryVisible((visible) => !visible)}
              >
                GEX 1–3
              </button>
            </div>
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
                className={
                  drawingMode === "fixed-range-volume-profile" ? "active" : ""
                }
                aria-label="Fixed range Volume Profile"
                title="Fixed range Volume Profile"
                aria-pressed={drawingMode === "fixed-range-volume-profile"}
                onClick={() => setDrawingMode("fixed-range-volume-profile")}
              >
                <BarChart3 size={18} />
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
              <button
                type="button"
                className={drawingMode === "long-position" ? "active" : ""}
                aria-label="Long position"
                title="Long position"
                aria-pressed={drawingMode === "long-position"}
                onClick={() => setDrawingMode("long-position")}
              >
                <ArrowUpRight size={18} />
              </button>
              <button
                type="button"
                className={drawingMode === "short-position" ? "active" : ""}
                aria-label="Short position"
                title="Short position"
                aria-pressed={drawingMode === "short-position"}
                onClick={() => setDrawingMode("short-position")}
              >
                <ArrowDownRight size={18} />
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
              className={`chart-stack ${profileExpanded ? "profile-expanded" : "profile-collapsed"}`}
            >
              <div
                ref={chartContainerRef}
                className="chart-stage"
                data-testid="candlestick-chart"
              />
              {overlaysVisible ? (
                <ConfluenceZoneOverlay zones={positionedConfluenceZones} />
              ) : null}
              {overlaysVisible ? (
                <GammaChartOverlay
                  flipY={gammaFlipY}
                  shadingEnabled={shadingEnabled}
                  profileExpanded={profileExpanded}
                  profileBars={positionedProfileBars}
                  profileMetric={profileMetric}
                  confluenceZones={displayedConfluenceZones}
                  flowState={dealerFlowState}
                  gammaState={gammaReconciliation.state}
                  gammaSamples={gammaReconciliation.samples}
                  gammaMaxDeviation={gammaReconciliation.maxDeviation}
                />
              ) : null}
              {overlaysVisible ? (
                <LevelRail
                  levels={positionedLevels}
                  currentPrice={lastPrice}
                  currentPriceY={currentPriceY}
                  chartHeight={chartHeight}
                  now={auditNow}
                  invalidKinds={invalidLevelKinds}
                />
              ) : null}
            </div>
          </div>
        </section>
        <RiskTerminal drawings={drawings} />
      </div>

      <footer className="status-bar">
        <span>
          Read-only market analytics · {metricStatus} · {drawingCount} drawing
          {drawingCount === 1 ? "" : "s"}
        </span>
        <span>
          {accessMode === "development" ? "Local access" : accessLabel}
        </span>
      </footer>
    </main>
  );
}
