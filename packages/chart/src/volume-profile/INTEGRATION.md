# Volume Profile Integration Guide (VP-001)

## Overview

This document specifies the exact exported APIs and integration steps for connecting the Volume Profile indicator (`VP-001`) into the dashboard application (`apps/web`).

Per repository architecture guidelines:
- The indicator is fully contained under `packages/chart/src/volume-profile/`.
- Minimal extensions have been made to `ChartAdapter` and `LightweightChartsAdapter`.
- Protected dashboard files (`dashboard-client.tsx`, `risk-terminal.tsx`, etc.) were not modified by this feature branch. Main-branch integration and dashboard wiring remain owned by the dashboard maintainer (Codex).

---

## Exported APIs from `@options-chart/chart`

### 1. Pure Calculation Functions

```typescript
import {
  calculateVolumeProfile,
  calculateVolumeProfileFromTrades,
  CALCULATION_VERSION,
} from "@options-chart/chart";
```

#### `calculateVolumeProfile(input: VolumeProfileInput): VolumeProfileResult`
- **Inputs**:
  - `candles`: `readonly Candle[]` (strictly normalized domain candles from Binance BTCUSDT Spot).
  - `range`: `{ from: number; to: number }` (epoch ms in UTC).
  - `binConfig`: Discriminated union:
    - `{ mode: "rowCount", rowCount: number }` (e.g. 24, 50, 70, 100; capped at 2,048).
    - `{ mode: "binSize", binSize: number, tickOrigin?: number }` (e.g. `$25.0`, origin-aligned; capped at 2,048).
  - `replayCutoff?: number` (when set, strictly filters `candle.isClosed && candle.closeTime <= replayCutoff` before computing price bounds).
  - `volumeUnit?: "base" | "quote"` (default `"base"` using `candle.volume` in BTC; quote mode uses `candle.quoteVolume` in USDT).
  - `directionMode?: "total" | "candle-direction"` (default `"total"`; candle-direction estimates bullish $C > O$, bearish $C < O$, neutral $C = O$).
  - `valueAreaPercent?: number` (default 70, valid range $(0, 100]$).
  - `sourceMetadata`: Exchange, market, symbol, source timeframe, display timeframe, calculation version.
- **Outputs**:
  - `rows`: Array of `{ low, high, mid, totalVolume, bullishVolume, bearishVolume, neutralVolume, isValueArea, isPOC }`.
  - `pocPrice`: Midpoint price of highest-volume bin (ties broken by lower price).
  - `pocRowIndex`: Index of POC row in `rows`.
  - `vah`: Upper edge of highest bin included in the contiguous value area.
  - `val`: Lower edge of lowest bin included in the contiguous value area.
  - `targetValueAreaPercent`: e.g. 70.
  - `achievedValueAreaPercent`: Exact percentage of total volume achieved by included bins ($\ge \text{target}$).
  - `totalEligibleVolume`: Sum of volume across all eligible non-excluded candles.
  - `valueAreaVolume`: Sum of volume across bins included in the value area.
  - `exclusions`: Object tracking counts of excluded candles (out-of-range, boundary-straddling, replay-excluded, malformed OHLC, negative/nonfinite volume, duplicates, reversed timestamps).
  - `qualityMetadata`: Data quality diagnostics (`hasGaps`, `isProvisional`, `eligibleCandleCount`, etc.).
  - `version`: Calculation version (`"1.0.0"`).

---

### 2. Controller & Memo Cache

```typescript
import {
  VolumeProfileController,
  VolumeProfileCache,
  buildVolumeProfileCacheKey,
} from "@options-chart/chart";
```

#### `VolumeProfileController`
Manages calculation debouncing (~100ms), generation counting (to discard stale out-of-order results), LRU memo caching, and style updates:

```typescript
const controller = new VolumeProfileController({
  profileId: "main-volume-profile",
  debounceMs: 100, // Coalesces viewport drags/zooms
  maxDelayMs: 300, // Bounded maximum delay
  cacheCapacity: 50,
  presentation: {
    placement: "right", // "left" | "right"
    widthFraction: 0.2, // 0.05 to 0.5 of pane width
    barOpacity: 0.45,
    showPOC: true,
    showVAH: true,
    showVAL: true,
    showValueAreaShading: true,
    showLabels: true,
  },
  onRender: (renderInput: VolumeProfileRenderInput) => {
    // Forward directly to ChartAdapter
    adapter.setVolumeProfile?.("main-volume-profile", renderInput);
  },
});
```

---

### 3. ChartAdapter Capability Extension

`ChartAdapter` has been extended with optional capability methods:

```typescript
export interface ChartAdapter {
  // ... existing methods ...
  setVolumeProfile?(id: string, renderInput: VolumeProfileRenderInput): void;
  removeVolumeProfile?(id: string): void;
}
```

And helper guard:
```typescript
import { isVolumeProfileCapable } from "@options-chart/chart";

if (isVolumeProfileCapable(adapter)) {
  adapter.setVolumeProfile(id, renderInput);
}
```

`LightweightChartsAdapter` implements these methods natively using `VolumeProfilePrimitive`, which:
1. Attaches to the main candlestick series.
2. Renders pixel-crisp canvas bars respecting device pixel ratio via `useBitmapCoordinateSpace`.
3. Displays POC, VAH, and VAL price axis labels on the right price scale.
4. Returns `null` from `autoscaleInfo()` so fixed or offscreen profiles do not stretch the price scale.
5. Cleans up all primitives on `adapter.destroy()`.

---

## Caller-Owned Dashboard Wiring Example (`dashboard-client.tsx`)

In `apps/web/components/dashboard-client.tsx` (when Codex is ready to integrate):

```tsx
import { useEffect, useRef } from "react";
import {
  VolumeProfileController,
  type VolumeProfileRenderInput,
} from "@options-chart/chart";

// Inside Dashboard component:
const vpControllerRef = useRef<VolumeProfileController | null>(null);

useEffect(() => {
  if (!adapter) return;

  const controller = new VolumeProfileController({
    profileId: "dashboard-vp",
    debounceMs: 100,
    presentation: {
      placement: "right",
      widthFraction: 0.22,
      showPOC: true,
      showVAH: true,
      showVAL: true,
      showValueAreaShading: true,
      showLabels: true,
    },
    onRender: (renderInput: VolumeProfileRenderInput) => {
      adapter.setVolumeProfile?.("dashboard-vp", renderInput);
    },
  });

  vpControllerRef.current = controller;

  // Viewport change listener
  const unsubscribe = adapter.subscribeViewportChange((state) => {
    if (!state.visibleRange) return;
    controller.updateViewportRange(
      state.visibleRange.fromTimestamp,
      state.visibleRange.toTimestamp,
    );
  });

  return () => {
    unsubscribe();
    controller.dispose();
    adapter.removeVolumeProfile?.("dashboard-vp");
    vpControllerRef.current = null;
  };
}, [adapter]);

// When new candles or replay cutoff change:
useEffect(() => {
  if (!vpControllerRef.current || candles.length === 0) return;
  const range = adapter?.getVisibleRange() ?? {
    fromTimestamp: candles[0].openTime,
    toTimestamp: candles[candles.length - 1].closeTime,
  };

  vpControllerRef.current.setInput({
    candles,
    range: { from: range.fromTimestamp, to: range.toTimestamp },
    replayCutoff: isReplayActive ? replayCutoffMs : undefined,
    binConfig: { mode: "rowCount", rowCount: 50 },
    volumeUnit: "base",
    directionMode: "candle-direction",
    valueAreaPercent: 70,
    sourceMetadata: {
      exchange: "binance",
      market: "spot",
      symbol: "BTCUSDT",
      sourceTimeframe: "1m",
      displayTimeframe: activeTimeframe,
      volumeUnit: "base",
      calculationVersion: "1.0.0",
    },
  });
}, [candles, isReplayActive, replayCutoffMs, activeTimeframe]);
```

---

## Important Architectural Notes

1. **Spot vs. Derivatives Isolation**:
   - Volume Profile strictly consumes Binance BTCUSDT Spot `Candle.volume` (BTC) or `Candle.quoteVolume` (USDT).
   - Never mix with Deribit options volume or perpetual contract volumes.
2. **Replay Invariant**:
   - Replay requires `candle.isClosed && candle.closeTime <= replayCutoff`.
   - Never use `openTime` for replay cutoff, as that would leak the completed high, low, close, and volume of a forming candle.
3. **Paint Invariant**:
   - Calculation never runs during canvas paint / animation frames.
   - Pointer movement re-positions crosshairs only; coordinates are cached in `VolumeProfilePrimitive`.
