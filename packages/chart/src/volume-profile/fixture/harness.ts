import { LightweightChartsAdapter } from "../../lightweight/lightweight-chart-adapter";
import { VolumeProfileController } from "../controller";
import type {
  VolumeProfileBinConfig,
  VolumeProfileDirectionMode,
  VolumeProfileInput,
  VolumeProfilePlacement,
  VolumeProfilePresentationOptions,
  VolumeProfileRenderInput,
} from "../types";
import { getFixtureCandles } from "./fixture-data";

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("chart-container") as HTMLDivElement;
  const frame = document.getElementById("chart-frame") as HTMLDivElement;

  if (!container || !frame) return;

  const candles = getFixtureCandles();
  const adapter = new LightweightChartsAdapter();

  let currentWidth = 1440;
  let currentHeight = 800;

  adapter.initialize(container, {
    symbol: "BTCUSDT",
    width: currentWidth,
    height: currentHeight,
    backgroundColor: "#0d1117",
    textColor: "#c9d1d9",
    showVolumePane: false,
  });

  adapter.setHistory(candles, { fitContent: true });

  let placement: VolumeProfilePlacement = "right";
  let widthFraction = 0.25;
  let showPOC = true;
  let showVAH = true;
  let showVAL = true;
  let showValueAreaShading = true;
  let directionMode: VolumeProfileDirectionMode = "total";
  let binConfig: VolumeProfileBinConfig = { mode: "rowCount", rowCount: 50 };
  let isReplay = false;

  const replayCutoff = candles[140]?.closeTime;

  const statVol = document.getElementById("stat-vol")!;
  const statPoc = document.getElementById("stat-poc")!;
  const statVah = document.getElementById("stat-vah")!;
  const statValEl = document.getElementById("stat-val-el")!;
  const statVa = document.getElementById("stat-va")!;
  const statCandles = document.getElementById("stat-candles")!;

  const controller = new VolumeProfileController({
    profileId: "vp-fixture",
    debounceMs: 50,
    onRender: (renderInput: VolumeProfileRenderInput) => {
      adapter.setVolumeProfile("vp-fixture", renderInput);

      const res = renderInput.result;
      statVol.textContent = res.totalEligibleVolume.toFixed(1) + " BTC";
      statPoc.textContent = res.pocPrice ? res.pocPrice.toFixed(1) : "N/A";
      statVah.textContent = res.vah ? res.vah.toFixed(1) : "N/A";
      statValEl.textContent = res.val ? res.val.toFixed(1) : "N/A";
      statVa.textContent = res.achievedValueAreaPercent.toFixed(1) + "%";
      statCandles.textContent = res.qualityMetadata.eligibleCandleCount.toString();
    },
  });

  function updateInput(): void {
    const range = adapter.getVisibleRange() ?? {
      fromTimestamp: candles[0]!.openTime,
      toTimestamp: candles[candles.length - 1]!.closeTime,
    };

    const input: VolumeProfileInput = {
      candles,
      range: { from: range.fromTimestamp, to: range.toTimestamp },
      replayCutoff: isReplay ? replayCutoff : undefined,
      binConfig,
      directionMode,
      valueAreaPercent: 70,
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

    const presentation: VolumeProfilePresentationOptions = {
      placement,
      widthFraction,
      showPOC,
      showVAH,
      showVAL,
      showValueAreaShading,
      showLabels: true,
    };

    controller.setPresentation(presentation);
    controller.setInput(input, true);
  }

  // Subscribe to chart viewport updates
  adapter.subscribeViewportChange(() => {
    updateInput();
  });

  // Buttons & Controls
  const btnDesktop = document.getElementById("btn-desktop")!;
  const btnMobile = document.getElementById("btn-mobile")!;

  btnDesktop.addEventListener("click", () => {
    btnDesktop.classList.add("active");
    btnMobile.classList.remove("active");
    currentWidth = 1440;
    currentHeight = 800;
    frame.style.width = "1440px";
    frame.style.height = "800px";
    adapter.resize(currentWidth, currentHeight);
    updateInput();
  });

  btnMobile.addEventListener("click", () => {
    btnMobile.classList.add("active");
    btnDesktop.classList.remove("active");
    currentWidth = 390;
    currentHeight = 740;
    frame.style.width = "390px";
    frame.style.height = "740px";
    adapter.resize(currentWidth, currentHeight);
    updateInput();
  });

  const btnPlacement = document.getElementById("btn-placement")!;
  btnPlacement.addEventListener("click", () => {
    placement = placement === "right" ? "left" : "right";
    btnPlacement.textContent = `Align: ${placement === "right" ? "Right" : "Left"}`;
    updateInput();
  });

  const btnWidth = document.getElementById("btn-width")!;
  btnWidth.addEventListener("click", () => {
    widthFraction = widthFraction === 0.25 ? 0.35 : widthFraction === 0.35 ? 0.15 : 0.25;
    btnWidth.textContent = `Width: ${(widthFraction * 100).toFixed(0)}%`;
    updateInput();
  });

  const btnPoc = document.getElementById("btn-poc")!;
  btnPoc.addEventListener("click", () => {
    showPOC = !showPOC;
    btnPoc.classList.toggle("active", showPOC);
    updateInput();
  });

  const btnVahVal = document.getElementById("btn-vah-val")!;
  btnVahVal.addEventListener("click", () => {
    showVAH = !showVAH;
    showVAL = showVAH;
    btnVahVal.classList.toggle("active", showVAH);
    updateInput();
  });

  const btnVaShade = document.getElementById("btn-va-shade")!;
  btnVaShade.addEventListener("click", () => {
    showValueAreaShading = !showValueAreaShading;
    btnVaShade.classList.toggle("active", showValueAreaShading);
    updateInput();
  });

  const btnDirection = document.getElementById("btn-direction")!;
  btnDirection.addEventListener("click", () => {
    directionMode = directionMode === "total" ? "candle-direction" : "total";
    btnDirection.classList.toggle("active", directionMode === "candle-direction");
    btnDirection.textContent =
      directionMode === "candle-direction" ? "Direction: Candle" : "Direction: Total";
    updateInput();
  });

  const selBins = document.getElementById("sel-bins") as HTMLSelectElement;
  selBins.addEventListener("change", () => {
    const val = selBins.value;
    if (val === "rowCount-24") binConfig = { mode: "rowCount", rowCount: 24 };
    else if (val === "rowCount-50") binConfig = { mode: "rowCount", rowCount: 50 };
    else if (val === "rowCount-100") binConfig = { mode: "rowCount", rowCount: 100 };
    else if (val === "binSize-25") binConfig = { mode: "binSize", binSize: 25 };
    updateInput();
  });

  const btnReplay = document.getElementById("btn-replay")!;
  btnReplay.addEventListener("click", () => {
    isReplay = !isReplay;
    btnReplay.classList.toggle("active", isReplay);
    btnReplay.textContent = isReplay ? "Mode: Replay (Cutoff)" : "Mode: Live";
    updateInput();
  });

  // Initial calculation and render
  updateInput();
});
