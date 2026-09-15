# Volume Profile Implementation Report (VP-001)

- **Task**: VP-001
- **Branch**: `feature/volume-profile`
- **Base Commit**: `9a773ffefd6ec870dbba03f6e49f35aea7e1fe3b`
- **Date**: 14 September 2026

---

## 1. Executive Summary

The Volume Profile indicator (`VP-001`) has been implemented as an independent, modular feature under `packages/chart/src/volume-profile/`. It provides pure calculation engines for normalized Binance BTCUSDT Spot candles and optional Binance aggregate trades, a debounced generation-tracking controller with LRU memo caching, and a TradingView Lightweight Charts (v5.2.1) series primitive adhering to all chart lifecycle and autoscale constraints.

---

## 2. Working Tree Isolation & Environment Rationale

1. **Dirty Worktree Avoidance**:
   - Initial inspection of `work/options-chart` revealed uncommitted edits in `apps/web/components/dashboard-client.tsx`, `risk-terminal.tsx`, `wall-confluence.tsx`, and `packages/options-engine/`.
   - In accordance with handoff instructions (*"If another agent owns the current worktree, create a sibling worktree from its committed base. Do not stash, reset, move, or commit another agent's changes"*), a sibling worktree was created at `work/options-chart-volume-profile` on branch `feature/volume-profile` branching from committed base `9a773ffefd6ec870dbba03f6e49f35aea7e1fe3b`.
2. **Exception Record for PROGRESS.md**:
   - The user's explicit instruction prohibited editing `PROGRESS.md` or running `npm run progress:build`. This directive overrides the standard repository instruction in `AGENTS.md`. Neither `PROGRESS.md` nor `PROJECT_PLAN.md` was modified.
3. **Pre-Tool Hook Resolution**:
   - An environment pre-tool hook error (`jsonhook__googlecloudtools.datacloud_telemetry_PreToolUse_0_0`) due to escaped literal quotation marks in plugin configuration was identified, reported, and cleared by the user prior to execution.

---

## 3. Scope of Edits & Protected Paths Verification

### Strictly Protected Paths (Zero Edits Confirmed):
- `apps/web/components/dashboard-client.tsx` (Unchanged)
- `apps/web/components/risk-terminal.tsx` (Unchanged)
- `apps/web/lib/risk-calculator.ts` (Unchanged)
- `apps/web/lib/wall-confluence.ts` (Unchanged)
- `packages/options-engine/**` (Unchanged)
- `PROJECT_PLAN.md` (Unchanged)
- `PROGRESS.md` (Unchanged)
- Anchored VWAP files (Unchanged)

### Modified Files:
- `packages/chart/src/chart-adapter.ts`: Added optional capability methods `setVolumeProfile?(id, renderInput)` and `removeVolumeProfile?(id)`.
- `packages/chart/src/lightweight/lightweight-chart-adapter.ts`: Implemented `setVolumeProfile`, `removeVolumeProfile`, primitive tracking, and cleanup on `destroy()`.
- `packages/chart/src/index.ts`: Re-exported Volume Profile types, calculation engines, controller, and primitive.

### Created Files under `packages/chart/src/volume-profile/`:
- `types.ts`: Discriminated union bin configs, domain types, exclusions, and render options.
- `calculate.ts`: Pure calculation engine implementing uniform overlap allocation, POC ties, contiguous value area, zero-range handling, and exclusions tracking.
- `trade-calculate.ts`: Pure calculation entry point for Binance aggregate trades (`isBuyerMaker` taker buy/sell).
- `cache.ts`: Bounded LRU memo cache keyed on source revision, symbol, timeframe, range, cutoff, bin config, and latest candle signature.
- `controller.ts`: Trailing debounce (~100ms) with bounded max delay, generation counting to discard stale results, and separate style updates without recalculation.
- `volume-profile-primitive.ts`: Lightweight Charts Series Primitive rendering bars via `useBitmapCoordinateSpace`, price axis labels for POC/VAH/VAL, and `autoscaleInfo() => null`.
- `adapter-extension.ts`: Type-safe adapter capability detection (`isVolumeProfileCapable`).
- `calculate.test.ts`: 14 comprehensive unit tests covering math, conservation, edge cases, and independent validation example.
- `performance.test.ts`: 10,000-candle performance benchmark across typical and 2,048-row worst-case configs.
- `primitive.test.ts`: 8 lifecycle and adapter integration tests.
- `fixture/fixture-data.ts`: Normalized synthetic BTCUSDT candle series including trend, range, and zero-range candles.
- `fixture/harness.html` & `harness.ts`: Standalone visual test harness running the real Lightweight Charts adapter.
- `fixture/capture-screenshots.mjs`: Automated Playwright script executing the browser harness and capturing screenshots.
- `fixture/screenshots/`: Browser-rendered screenshots at Desktop 1440x900 and Mobile 390x844.
- `INTEGRATION.md`: Exact exported API documentation and caller-owned dashboard integration guide.
- `REPORT.md`: This feature implementation report.

---

## 4. Mathematical & Algorithmic Results

1. **Uniform Overlap Allocation**:
   - For candle $H > L$, row allocation is:
     $$\text{row volume} = \text{candle volume} \times \frac{\max(0, \min(H, \text{row high}) - \max(L, \text{row low}))}{H - L}$$
   - Any floating-point residual is assigned to the final intersected row, guaranteeing volume conservation within tolerance $< 10^{-9}$.
2. **Zero-Range Candles ($H = L$)**:
   - Wholly allocated to the single containing half-open bin $[ \text{low}, \text{high} )$.
3. **POC & Contiguous Value Area**:
   - POC is the highest-volume row; ties resolved with the lower-priced row. Midpoint price is displayed.
   - Contiguous value area expands outward from POC by comparing candidate rows above and below, breaking ties with the lower-priced candidate.
   - $\text{VAL} = \text{lower edge of lowest included row}$; $\text{VAH} = \text{upper edge of highest included row}$.
4. **Independent Expected Values Verification**:
   - Input rows $[10, 30, 40, 20]$ across $[100, 110), [110, 120), [120, 130), [130, 140]$.
   - Result: POC = 125, VAL = 110, VAH = 130, Achieved Value Area = 70.0%. Exact match achieved.
5. **Replay Invariant**:
   - Strict filtering requiring both `candle.isClosed` and `candle.closeTime <= replayCutoff` prior to price-bound derivation ensures no completed forming candle data is leaked into historical calculations.

---

## 5. Performance Benchmark Results (10,000 Candles)

Executed on Node.js v24.13.1 / Windows x64:
- **Typical Spanning Range (10,000 candles, 70 rows)**:
  - Execution Time: **54.00 ms**
  - Throughput: **185,199 candles/second**
  - Residual Volume Conservation: $< 10^{-6}$
- **Worst-Case Spanning Range (10,000 candles, 2,048 rows)**:
  - Execution Time: **211.74 ms**
- **LRU Memo Cache Hit**:
  - Retrieval Time: **0.044 ms**

---

## 6. Test Suite & Verification Summary

| Suite / Command | Exit Code | Result | Notes |
|---|---|---|---|
| `packages/chart/src/volume-profile/calculate.test.ts` | 0 | PASS (14/14 tests) | Pure math, conservation, edge cases, POC/VA ties, replay |
| `packages/chart/src/volume-profile/performance.test.ts` | 0 | PASS (3/3 tests) | 10,000-candle benchmarks, cache retrieval |
| `packages/chart/src/volume-profile/primitive.test.ts` | 0 | PASS (8/8 tests) | Primitive attachment, deduplication, teardown, autoscale |
| `packages/chart/src/lightweight/lightweight-chart-adapter.test.ts` | 0 | PASS (7/7 tests) | Adapter regressions check |
| Full Workspace `npm test` | 0 | PASS (48 files, 268 tests) | 100% test pass rate across all packages |
| `npm run typecheck` | 0 | PASS | Strict mode, zero type errors |
| `npm run lint` | 0 | PASS | ESLint clean across all workspaces |

---

## 7. Browser Execution & Visual Evidence

Browser execution was performed using Playwright against `fixture/harness.html`, successfully rendering real canvas geometry and capturing visual evidence:
- `fixture/screenshots/desktop-1440x900-right.png`: Desktop right-aligned volume profile with POC ray and VAH/VAL boundaries.
- `fixture/screenshots/desktop-1440x900-left.png`: Desktop left-aligned profile toggled dynamically.
- `fixture/screenshots/desktop-1440x900-replay.png`: Replay mode with cutoff filtering.
- `fixture/screenshots/mobile-390x844-right.png`: Mobile responsive layout.

---

## 8. Limitations & Hand-Off Notes

1. **Lower-Timeframe Partitioning**: The engine supports one complete, non-overlapping source partition per interval. The market-data ingestion layer must supply contiguous 1m bars without mixing parent bars.
2. **Dashboard Integration**: As specified, integration into `dashboard-client.tsx` remains owned by Codex. All APIs, contracts, and wiring instructions are documented in `INTEGRATION.md`.
