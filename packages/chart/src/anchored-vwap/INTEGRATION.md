# Anchored VWAP Integration Guide

## Overview

This document specifies the exported APIs and integration steps for connecting the Anchored VWAP (AVWAP) indicator into the dashboard application (`apps/web`).

Per repository architecture and indicator integration guidelines:
- The indicator is fully contained under `packages/chart/src/anchored-vwap/`.
- Minimal extensions have been made to `ChartAdapter` and `LightweightChartsAdapter`.
- Protected dashboard files (`dashboard-client.tsx`, `risk-terminal.tsx`, etc.) were not modified by this feature branch. Main-branch integration and dashboard wiring remain owned by the dashboard maintainer (Codex).

---

## Exported APIs from `@options-chart/chart`

### 1. Pure Calculation Functions

```typescript
import {
  calculateAnchoredVwap,
  extractCandlePrice,
  findAnchorIndex,
  DEFAULT_PRICE_SOURCE,
  DEFAULT_BAND_MULTIPLIERS,
} from "@options-chart/chart";
```

#### `calculateAnchoredVwap(input: AnchoredVwapInput): AnchoredVwapResult`
- **Inputs (`AnchoredVwapInput`)**:
  - `anchorTimestamp`: `number` (UTC timestamp in ms). Anchor point for accumulation.
  - `candles`: `readonly Candle[]` (normalized domain candles from Binance BTCUSDT Spot).
  - `priceSource?`: `"typical" | "hlc3" | "close" | "hl2" | "ohlc4" | "weighted"` (default: `"typical"` = $(H + L + C) / 3$).
  - `bandMultipliers?`: `readonly number[]` (e.g. `[1, 2, 3]`; produces upper/lower bands at $VWAP \pm m \cdot \sigma$).
  - `replayCutoff?`: `number` (when set, strictly excludes candles where `candle.closeTime > replayCutoff` or unclosed candles).
  - `symbol?`: string (default `"BTCUSDT"`).
  - `timeframe?`: string (default `"1m"`).
- **Outputs (`AnchoredVwapResult`)**:
  - `anchorTimestamp`: Anchored epoch ms.
  - `resolvedAnchorIndex`: Index of the anchor candle in sorted candles (`null` if anchor timestamp is after all candles).
  - `points`: Array of `AnchoredVwapPoint`:
    - `timestamp`: UTC epoch ms of candle open.
    - `vwap`: Cumulative typical price-volume divided by cumulative volume.
    - `variance`: West-Welford weighted rolling variance.
    - `standardDeviation`: $\sqrt{\text{variance}}$.
    - `cumulativeVolume`: $\sum V_i$.
    - `cumulativeTypicalPriceVolume`: $\sum (P_i \times V_i)$.
    - `bands`: Array of `{ multiplier: number; upper: number; lower: number }`.
  - `latestPoint`: Most recent `AnchoredVwapPoint` or `null`.
  - `totalCandlesConsidered`: Total candles passed in.
  - `candlesIncluded`: Count of candles accumulated after anchor.
  - `candlesExcluded`: Count of candles excluded (before anchor, after replay cutoff, zero-volume, invalid).
  - `exclusions`: Array of `{ candleOpenTime, reason, detail }`.
  - `calculationDurationMs`: Execution time in milliseconds.
  - `priceSource`: Selected price source.
  - `bandMultipliers`: Configured multipliers.

---

### 2. Controller & Memo Cache

```typescript
import {
  AnchoredVwapController,
  AnchoredVwapCache,
  buildAnchoredVwapCacheKey,
  ANCHORED_VWAP_CALCULATION_VERSION,
} from "@options-chart/chart";
```

#### `AnchoredVwapController`
- **Options**:
  - `vwapId: string`
  - `debounceMs?: number` (default 100ms)
  - `maxDelayMs?: number` (default 300ms)
  - `cacheCapacity?: number` (default 50)
  - `onRender: (renderInput: AnchoredVwapRenderInput) => void`
  - `presentation?: AnchoredVwapPresentationOptions`
- **Methods**:
  - `setInput(input: AnchoredVwapInput, immediate = false): void`
  - `setAnchorTimestamp(anchorTimestamp: number, immediate = false): void`
  - `setReplayCutoff(replayCutoff: number | undefined, immediate = false): void`
  - `setPresentation(presentation: AnchoredVwapPresentationOptions): void` (repaints without recalculating points)
  - `getCurrentResult(): AnchoredVwapResult | null`
  - `getCurrentGeneration(): number`
  - `dispose(): void` (cancels timers, clears cache, stops rendering)

---

### 3. Lightweight Charts Adapter Integration

```typescript
import {
  LightweightChartsAdapter,
  isAnchoredVwapCapable,
  type AnchoredVwapCapableChartAdapter,
} from "@options-chart/chart";

// Feature detection
if (isAnchoredVwapCapable(adapter)) {
  // Add or update anchored VWAP
  adapter.setAnchoredVwap("session-avwap", {
    vwapId: "session-avwap",
    result,
    presentation: {
      vwapColor: "#2962ff",
      vwapLineWidth: 2,
      showBands: true,
      bandColors: [
        "rgba(41, 98, 255, 0.65)",
        "rgba(41, 98, 255, 0.40)",
        "rgba(41, 98, 255, 0.20)",
      ],
      showAnchorLine: true,
      anchorLineColor: "rgba(242, 193, 78, 0.75)",
      showLabels: true,
    },
  });

  // Remove anchored VWAP
  adapter.removeAnchoredVwap("session-avwap");
}
```

---

## Chart Lifecycle & Safety Guarantees

1. **Non-Invasive Rendering**:
   - `AnchoredVwapPrimitive` implements `ISeriesPrimitive<Time>`.
   - Attaches directly to the candlestick series via `series.attachPrimitive(primitive)`.
   - `autoscaleInfo()` returns `null` so the indicator does not modify the vertical price scale bounds.
2. **Deterministic & Replay-Safe**:
   - Strictly respects `replayCutoff` by excluding candles closed after cutoff and unclosed candles during replay.
   - Calculates pure mathematical points with zero side effects.
3. **High-DPI Retina Rendering**:
   - Canvas rendering uses `target.useBitmapCoordinateSpace` for pixel-crisp lines on 1x, 2x, and 3x DPR displays.
4. **Leak-Free Destruction**:
   - When `adapter.removeAnchoredVwap(id)` or `adapter.destroy()` is called, all primitives are detached from the series and references cleared.
