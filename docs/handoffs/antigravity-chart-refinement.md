# Antigravity Chart Refinements Handoff

## Summary

This engineering handoff documents the implementation of three coordinated chart refinements for the BTC Options Metrics Dashboard:

1. **Shift-Aware Level Segments**: Options levels (Call/Put Walls, Max Pain, Gamma Flip, Secondary GEX) and confluence zones begin strictly at their most recent genuine shift timestamp and extend only toward the right edge of the chart (with anchor pips), terminating horizontal bleed into past unrelated price history.
2. **Professional Level Rail**: A sleek, collision-managed level rail embedded inside chart boundaries with tabular monospace prices, non-overlapping label layout, subtle leader connector lines, priority ordering (`SPOT` > `Walls` > `Gamma Flip`/`Max Pain` > `Secondary GEX`), and boundary clamping.
3. **Fast Staged Timeframe Loading**: Immediate (~200ms) rendering of the initial 1,000 candles and live WebSocket connection, while streaming remaining history toward 10,000 candles in the background with cooperative cancellation and per-timeframe viewport restoration.

> Integration note: shift timestamps represent the earliest locally observed and persisted activation. The dashboard does not reconstruct options-level history from before tracking began. Codex integration also added candle-time snapping, expiry-scoped confluence persistence, cache refresh/resumption, viewport writes, and duplicate-band prevention.

---

## Architectural Changes

### 1. Shift Tracking (`packages/shared/src/level-shift-tracker.ts`)
- **Discrete Level Tracking**: Tracks Call Wall, Put Wall, Max Pain, and Secondary GEX strikes. Resets activation timestamp only when the strike level changes or after an explicit expiry scope / chain transition.
- **Continuous Level Anti-Jitter**: For Gamma Flip (continuous metric), applies `DEFAULT_GAMMA_FLIP_TOLERANCE_FRACTION = 0.0025` (0.25%, ~$150-$200 on BTC) to prevent micro-fluctuations from constantly resetting the segment origin.
- **Confluence Shift Tracking**: Tracks active confluence zones by boundary and score changes; preserves activation timestamps across stable consecutive observations.

### 2. Right-Extending Level Segments (`packages/chart/src/level-segments/`)
- **Primitive Architecture**: Implemented `LevelSegmentsPrimitive` conforming to Lightweight Charts v5.2.1 `ISeriesPrimitive<Time>`.
- **Canvas Rendering**:
  - `ConfluenceBandsPaneView` rendered at `zOrder: "bottom"` behind candlesticks with subtle opacity.
  - `LevelLinesPaneView` rendered at `zOrder: "normal"` with crisp pixel alignment (`devicePixelRatio`), drawing rightward segments from `activationTimestamp` to `bitmapSize.width`.
  - Shift anchor dot/pip rendered at the activation timestamp coordinate with small radius.
  - `autoscaleInfo()` returns `null` to avoid interfering with primary candle autoscaling.
- **Adapter Integration**: Added `setLevelSegments` and `clearLevelSegments` to `ChartAdapter` and `LightweightChartAdapter`, with full cleanup on chart destruction.

### 3. Collision-Managed Level Rail (`apps/web/lib/level-rail-layout.ts`, `apps/web/components/gamma-overlay.tsx`)
- **Priority-Driven Layout**: Strict priority resolution:
  - Priority 0: `SPOT`
  - Priority 1: `CALL_WALL` / `PUT_WALL`
  - Priority 2: `GAMMA_FLIP` / `MAX_PAIN`
  - Priority 3: Secondary GEX (`G1`, `G2`, `G3`, `G10`)
- **Collision Resolution**: Iterative boundary-clamped relaxation preventing overlapping label chips, with subtle leader lines connecting the price tick to the resolved label chip.
- **Responsive Geometry**: Sits cleanly within chart viewport margins (`railRight <= chartRight`, width <= 82px) on mobile (390px) and desktop (1366px, 1920px).

### 4. Staged Timeframe Pagination (`packages/market-data/src/binance/staged-pagination.ts`, `apps/web/lib/timeframe-manager.ts`)
- **Two-Stage Loading**:
  - Phase 1: `fetchInitialHistoryPage` fetches 1,000 candles immediately (~200ms), sets chart history, and connects the live WebSocket.
  - Phase 2: `streamOlderHistoryPages` progressively queries older historical pages in the background backwards in time toward `BOOTSTRAP_TARGET_BARS` (10,000 bars) without freezing the UI or chart interaction.
- **Race Condition Immunity**: Generation token pattern (`currentGeneration`) cancels in-flight background requests immediately when the user switches timeframes.
- **Viewport Cache**: Caches the last user viewport per timeframe interval so switching between intervals restores exact pan/zoom positions.

---

## Verification & Test Results

### 1. Unit & Parity Tests
- Command: `npx vitest run`
- Status: **58 passed (58 files), 341 passed (341 tests)**
- Coverage:
  - `packages/shared/src/level-shift-tracker.test.ts`: 7/7 tests passed.
  - `packages/chart/src/level-segments/level-segments.test.ts`: 3/3 tests passed.
  - `apps/web/lib/level-rail-layout.test.ts`: 5/5 tests passed.
  - `packages/market-data/src/binance/staged-pagination.test.ts`: 3/3 tests passed.
  - `apps/web/lib/timeframe-manager.test.ts`: 3/3 tests passed.
  - Parity & reconciliation suites: all 341 tests green.

### 2. End-to-End Tests (Playwright)
- Command: `npx playwright test`
- Status: **20/20 standard e2e tests passed**
  - `tests/e2e/gamma-overlay.spec.ts`: 5/5 passed (including dragging synchronization, target viewports, and volume profile retention).
  - `tests/e2e/chart-engine.spec.ts`: 4/4 passed (including timeframe debounce, weekly candles direct request, and 8-hour soak).
  - `tests/e2e/walking-skeleton.spec.ts`: 3/3 passed.
  - `tests/e2e/production-deployment.spec.ts`: 4/4 passed.
  - `tests/e2e/reliability-chaos.spec.ts`: 3/3 passed.
  - `tests/e2e/architecture.spec.ts`: 1/1 passed.

### 3. Typecheck & Lint
- `npm run typecheck`: **0 errors**
- `npm run lint`: **0 warnings, 0 errors**
- `npm run build`: **Compiled successfully with zero errors**

---

## Visual Artifacts

The following visual artifacts were captured at target viewports confirming layout stability and collision management:
- `1366x768` (Standard Laptop Viewport)
- `1920x1080` (Full HD Desktop Viewport)
- `390x844` (Mobile Viewport)

---

## Files Touched

- `packages/shared/src/level-shift-tracker.ts` (New)
- `packages/shared/src/level-shift-tracker.test.ts` (New)
- `packages/shared/src/index.ts` (Modified)
- `packages/chart/src/level-segments/types.ts` (New)
- `packages/chart/src/level-segments/level-segments-primitive.ts` (New)
- `packages/chart/src/level-segments/level-segments.test.ts` (New)
- `packages/chart/src/chart-adapter.ts` (Modified)
- `packages/chart/src/lightweight/lightweight-chart-adapter.ts` (Modified)
- `packages/chart/src/index.ts` (Modified)
- `packages/market-data/src/binance/staged-pagination.ts` (New)
- `packages/market-data/src/binance/staged-pagination.test.ts` (New)
- `packages/market-data/src/binance/index.ts` (Modified)
- `packages/market-data/src/index.ts` (Modified)
- `apps/web/lib/level-rail-layout.ts` (New)
- `apps/web/lib/level-rail-layout.test.ts` (New)
- `apps/web/lib/timeframe-manager.ts` (New)
- `apps/web/lib/timeframe-manager.test.ts` (New)
- `apps/web/components/gamma-overlay-layout.ts` (Modified)
- `apps/web/components/gamma-overlay.tsx` (Modified)
- `apps/web/components/wall-confluence.tsx` (Modified)
- `apps/web/components/dashboard-client.tsx` (Modified)
- `apps/web/package.json` (Modified: Next.js webpack build)
- `playwright.config.ts` (Modified: dev server flag)
- `tests/e2e/support/binance-kline-mock.ts` (Modified: weekly mock epoch offset)
