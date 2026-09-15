import { LightweightChartsAdapter } from "../../lightweight/lightweight-chart-adapter";
import { AnchoredVwapController } from "../controller";
import type {
  AnchoredVwapInput,
  AnchoredVwapPresentationOptions,
  AnchoredVwapPriceSource,
  AnchoredVwapRenderInput,
} from "../types";
import { createFixtureCandles } from "./fixture-data";

const candles = createFixtureCandles(250, 62_000);
const container = document.getElementById("chart-container") as HTMLElement;
const chartFrame = document.getElementById("chart-frame") as HTMLElement;

const adapter = new LightweightChartsAdapter();
adapter.initialize(container, {
  symbol: "BTCUSDT",
  width: chartFrame.clientWidth,
  height: chartFrame.clientHeight,
  backgroundColor: "#0d1117",
  textColor: "#c9d1d9",
  showVolumePane: true,
});

adapter.setHistory(candles, { fitContent: true });

let currentAnchorTime = candles[0]!.openTime;
let currentSource: AnchoredVwapPriceSource = "typical";
let showBands = true;
let showFill = false;
let showAnchorLine = true;
let isReplay = false;

const presentation: AnchoredVwapPresentationOptions = {
  vwapColor: "#2962ff",
  vwapLineWidth: 2,
  showBands: true,
  bandColors: [
    "rgba(41, 98, 255, 0.65)",
    "rgba(41, 98, 255, 0.40)",
    "rgba(41, 98, 255, 0.20)",
  ],
  bandLineWidth: 1,
  showFill: false,
  bandFillColor: "rgba(41, 98, 255, 0.08)",
  showAnchorLine: true,
  anchorLineColor: "rgba(242, 193, 78, 0.75)",
  showLabels: true,
};

const controller = new AnchoredVwapController({
  vwapId: "harness-avwap",
  presentation,
  onRender: (renderInput) => {
    adapter.setAnchoredVwap("harness-avwap", renderInput);
    updateStats(renderInput);
  },
});

function updateStats(renderInput: AnchoredVwapRenderInput): void {
  const res = renderInput.result;
  const p = res.latestPoint;

  const statAnchor = document.getElementById("stat-anchor");
  const statVwap = document.getElementById("stat-vwap");
  const statStddev = document.getElementById("stat-stddev");
  const statUpper = document.getElementById("stat-upper");
  const statLower = document.getElementById("stat-lower");
  const statVol = document.getElementById("stat-vol");
  const statPoints = document.getElementById("stat-points");

  if (statAnchor) {
    const d = new Date(res.anchorTimestamp);
    statAnchor.textContent = `${d.toISOString().slice(11, 19)} UTC`;
  }
  if (statVwap && p) {
    statVwap.textContent = `$${p.vwap.toFixed(2)}`;
  }
  if (statStddev && p) {
    statStddev.textContent = `$${p.standardDeviation.toFixed(2)}`;
  }
  if (statUpper && p && p.bands[0]) {
    statUpper.textContent = `$${p.bands[0].upper.toFixed(2)}`;
  }
  if (statLower && p && p.bands[0]) {
    statLower.textContent = `$${p.bands[0].lower.toFixed(2)}`;
  }
  if (statVol && p) {
    statVol.textContent = p.cumulativeVolume.toLocaleString();
  }
  if (statPoints) {
    statPoints.textContent = `${res.candlesIncluded} / ${res.totalCandlesConsidered}`;
  }
}

function recompute(): void {
  const replayCutoff = isReplay ? candles[120]?.closeTime : undefined;
  const input: AnchoredVwapInput = {
    anchorTimestamp: currentAnchorTime,
    candles,
    priceSource: currentSource,
    bandMultipliers: [1, 2, 3],
    replayCutoff,
  };
  controller.setInput(input, true);
}

// Initial calculation
recompute();

// UI Controls
const btnDesktop = document.getElementById("btn-desktop");
const btnMobile = document.getElementById("btn-mobile");
const selAnchor = document.getElementById("sel-anchor") as HTMLSelectElement | null;
const selSource = document.getElementById("sel-source") as HTMLSelectElement | null;
const btnBands = document.getElementById("btn-bands");
const btnFill = document.getElementById("btn-fill");
const btnAnchorLine = document.getElementById("btn-anchor-line");
const btnReplay = document.getElementById("btn-replay");

btnDesktop?.addEventListener("click", () => {
  btnDesktop.classList.add("active");
  btnMobile?.classList.remove("active");
  chartFrame.style.width = "1440px";
  chartFrame.style.height = "800px";
  adapter.resize(1440, 800);
});

btnMobile?.addEventListener("click", () => {
  btnMobile.classList.add("active");
  btnDesktop?.classList.remove("active");
  chartFrame.style.width = "370px";
  chartFrame.style.height = "700px";
  adapter.resize(370, 700);
});

selAnchor?.addEventListener("change", () => {
  const idx = parseInt(selAnchor.value, 10);
  currentAnchorTime = candles[idx]?.openTime ?? candles[0]!.openTime;
  recompute();
});

selSource?.addEventListener("change", () => {
  currentSource = selSource.value as AnchoredVwapPriceSource;
  recompute();
});

btnBands?.addEventListener("click", () => {
  showBands = !showBands;
  btnBands.classList.toggle("active", showBands);
  controller.setPresentation({ showBands });
});

btnFill?.addEventListener("click", () => {
  showFill = !showFill;
  btnFill.textContent = `Band Fill: ${showFill ? "On" : "Off"}`;
  btnFill.classList.toggle("active", showFill);
  controller.setPresentation({ showFill });
});

btnAnchorLine?.addEventListener("click", () => {
  showAnchorLine = !showAnchorLine;
  btnAnchorLine.classList.toggle("active", showAnchorLine);
  controller.setPresentation({ showAnchorLine });
});

btnReplay?.addEventListener("click", () => {
  isReplay = !isReplay;
  btnReplay.textContent = `Mode: ${isReplay ? "Replay (Cutoff: Bar 120)" : "Live"}`;
  btnReplay.classList.toggle("active", isReplay);
  recompute();
});
