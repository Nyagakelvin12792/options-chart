# Anchored VWAP Implementation Report

- **Feature**: Anchored VWAP (AVWAP)
- **Branch**: `feature/anchored-vwap`
- **Base Commit**: `9a773ffefd6ec870dbba03f6e49f35aea7e1fe3b`
- **Date**: 15 September 2026

---

## 1. Executive Summary

The Anchored Volume Weighted Average Price (AVWAP) indicator has been implemented as an isolated, modular feature under `packages/chart/src/anchored-vwap/`. It provides:
- A pure calculation engine supporting multiple price sources (`typical`, `close`, `hl2`, `ohlc4`, `weighted`), West-Welford numerically stable weighted variance, standard deviation bands, and strict replay cutoff filtering.
- An LRU memoization cache and debounced generation-tracking controller.
- A Lightweight Charts (v5.2.1) series primitive (`AnchoredVwapPrimitive`) rendering crisp high-DPI canvas lines, optional band fills, vertical anchor lines, anchor origin bullseyes, and price axis badges without altering chart autoscale.
- Clean adapter extension (`isAnchoredVwapCapable`) and seamless lifecycle handling in `LightweightChartsAdapter`.
- Comprehensive automated test coverage (27 tests across pure calculation, performance benchmarks, and adapter integration).
- An isolated interactive fixture harness with visual screenshot validation across desktop (1440x900 default, swing-high anchor, replay cutoff) and mobile (390x844).

---

## 2. Working Tree Isolation & Environment Rationale

1. **Worktree Isolation**:
   - The main checkout `work/options-chart` contains dirty, uncommitted changes from another agent (`PositionDrawing` breaking typecheck).
   - In accordance with handoff instructions (*"If another agent owns the current worktree, create a sibling worktree from its committed base. Do not stash, reset, move, or commit another agent's changes"*), an isolated sibling worktree was created at `work/options-chart-anchored-vwap` on branch `feature/anchored-vwap` branched from `9a773ffefd6ec870dbba03f6e49f35aea7e1fe3b`.
2. **Node Modules Junctions**:
   - `npm install` was not run across worktrees. Directory junctions were linked from `work/options-chart/node_modules` into `work/options-chart-anchored-vwap/node_modules`, with `@options-chart/*` scoped packages junctioned directly to the local packages of the worktree.
3. **Protected Files Compliance**:
   - No protected files were edited: `dashboard-client.tsx`, `risk-terminal.tsx`, `risk-calculator.ts`, `wall-confluence.ts`, `packages/options-engine/**`, `PROJECT_PLAN.md`, `PROGRESS.md`.
   - `npm run progress:build` was not invoked per user constraint.

---

## 3. Scope of Edits

### Protected Files (Zero Edits Confirmed):
- `apps/web/components/dashboard-client.tsx` (Unchanged)
- `apps/web/components/risk-terminal.tsx` (Unchanged)
- `apps/web/lib/risk-calculator.ts` (Unchanged)
- `apps/web/lib/wall-confluence.ts` (Unchanged)
- `packages/options-engine/**` (Unchanged)
- `PROJECT_PLAN.md` (Unchanged)
- `PROGRESS.md` (Unchanged)
- Volume Profile files on `feature/volume-profile` (Unchanged)

### Modified Files:
- `packages/chart/src/chart-adapter.ts`: Added optional capability methods `setAnchoredVwap?(id, renderInput)` and `removeAnchoredVwap?(id)`.
- `packages/chart/src/lightweight/lightweight-chart-adapter.ts`: Implemented `setAnchoredVwap`, `removeAnchoredVwap`, primitive tracking, and cleanup on `destroy()`.
- `packages/chart/src/index.ts`: Re-exported Anchored VWAP types, calculations, cache, controller, primitive, and adapter extension.

### Created Files under `packages/chart/src/anchored-vwap/`:
- `types.ts`: Domain types, inputs, results, band points, exclusions, presentation options, and render inputs.
- `calculate.ts`: Pure calculation engine implementing West-Welford running variance, standard deviation bands, price source extraction, anchor binary search, and replay cutoff filtering.
- `cache.ts`: Bounded LRU memo cache keyed on symbol, timeframe, anchor timestamp, price source, band multipliers, replay cutoff, and latest candle signature.
- `controller.ts`: Trailing debounce controller (~100ms) with generation counting to discard stale results and instant presentation updates without recalculation.
- `anchored-vwap-primitive.ts`: Lightweight Charts series primitive implementing `ISeriesPrimitive<Time>` with high-DPI canvas rendering and price axis badge.
- `adapter-extension.ts`: `isAnchoredVwapCapable` type guard and `AnchoredVwapCapableChartAdapter` interface.
- `calculate.test.ts`: Mathematical tests (single candle anchor, multi-candle accumulation, price sources, replay cutoff, zero-volume fallback, LRU cache eviction).
- `performance.test.ts`: 10,000 candle benchmark verifying throughput (>100,000 candles/sec) and sub-millisecond cache hits.
- `primitive.test.ts`: Primitive lifecycle tests (attach, update in-place, detach, adapter destroy cleanup, price axis views).
- `fixture/fixture-data.ts`: Realistic 250-candle BTC dataset.
- `fixture/harness.html`: Standalone fixture HTML UI with controls.
- `fixture/harness.ts`: Interactive test harness.
- `fixture/bundle.js`: Bundled client application.
- `fixture/capture-screenshots.mjs`: Automated Playwright screenshot script.
- `fixture/screenshots/`:
  - `desktop-1440x900-default.png`: Default view with 1σ, 2σ, 3σ bands and anchor at origin.
  - `desktop-1440x900-swing-high.png`: Anchor relocated to swing-high peak (Candle 80).
  - `desktop-1440x900-replay.png`: Replay mode with cutoff at Candle 120 (zero future candle leakage).
  - `mobile-390x844-default.png`: Mobile view with 2x DPR high-resolution canvas.
- `INTEGRATION.md`: Complete API documentation and integration guide for Codex.
- `REPORT.md`: This report.

---

## 4. Verification & Test Results

1. **TypeScript Build**:
   ```bash
   npx tsc -b packages/chart
   # Exit code: 0 (0 errors)
   ```
2. **ESLint**:
   ```bash
   npx eslint packages/chart
   # Exit code: 0 (0 errors)
   ```
3. **Vitest Suite**:
   ```bash
   npx vitest run packages/chart
   # Test Files: 4 passed (4)
   # Tests: 27 passed (27)
   ```
4. **Visual Evidence**:
   Screenshots captured in `fixture/screenshots/` and copied to artifact directory, confirming crisp rendering and correct math across desktop and mobile.
