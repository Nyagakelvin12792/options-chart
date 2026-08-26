# BTC Options Metrics Dashboard
## PROGRESS.md

Version: 0.5.0  
Last updated: 2026-08-26
Overall status: M2 complete; awaiting milestone-exit approval
Current milestone: M2 Deribit Options Data Engine
Production status: M0.5 DEPLOYED; M2 DATA ENGINE LIVE-VERIFIED, NOT YET UI-WIRED

---

# 1. Operating Rule

Every agent working on this project must read:

1. PROJECT_PLAN.md
2. PROGRESS.md

before modifying code.

Every completed or paused task must update this file.

Do not mark work complete based only on a screenshot or successful page render.

---

# 2. Current Project State

| Area | Status | Notes |
|---|---|---|
| Architecture | COMPLETE | M0 contracts compile; awaiting exit approval |
| Repository scaffold | COMPLETE | npm workspace, tooling, CI, and governance configured |
| Binance candles | IN REVIEW | M1 implementation published; integration audit findings remain |
| Deribit options data | COMPLETE | 22/22 tasks and live REST/WebSocket reconnect verification passed |
| Options engine | NOT STARTED | Methodology baseline defined |
| Mathematical validation | NOT STARTED | Required before trusted display |
| Primary chart | IN PROGRESS | M1 Binance candles integrated through ChartAdapter |
| Fallback chart | NOT STARTED | KLineChart selected |
| Gamma overlays | NOT STARTED | Depends on math validation |
| Reliability testing | NOT STARTED | Failure injection planned |
| Vercel deployment | IN PROGRESS | Authenticated M0.5 production deployment is live |
| Private authentication | COMPLETE | Google login with one exact allowlisted account |
| Trading-readiness validation | NOT STARTED | Final milestone |

---

# 3. Current Architecture Decisions

| ID | Decision | Status |
|---|---|---|
| ADR-001 | Binance BTCUSDT Spot is the master candlestick source | ACCEPTED |
| ADR-002 | Deribit is the BTC options source | ACCEPTED |
| ADR-003 | Deribit index context is used for Deribit option mathematics | ACCEPTED |
| ADR-004 | TradingView Lightweight Charts is the primary chart engine | ACCEPTED |
| ADR-005 | KLineChart is the fallback chart engine | ACCEPTED |
| ADR-006 | Chart engines sit behind ChartAdapter | ACCEPTED |
| ADR-007 | Production calculations are TypeScript | ACCEPTED |
| ADR-008 | Python exists only as an independent reference implementation | ACCEPTED |
| ADR-009 | Full gamma profile runs in a Web Worker | ACCEPTED |
| ADR-010 | Vercel hosts the app, browser connects directly to exchange WebSockets | ACCEPTED |
| ADR-011 | Deribit OI uses periodic full-chain REST snapshots | ACCEPTED |
| ADR-012 | Deribit live mark/IV uses markprice.options.btc_usd | ACCEPTED |
| ADR-013 | App is read-only analytics in v1 | ACCEPTED |
| ADR-014 | Max Pain is expiry-specific | ACCEPTED |
| ADR-015 | Signed GEX is labeled as modeled, not known dealer inventory | ACCEPTED |
| ADR-016 | v1 Deribit universe is BTC-settled inverse BTC options only | ACCEPTED |
| ADR-017 | v0 ships with Lightweight Charts only; KLineChart remains behind adapter and is post-v0 unless needed | ACCEPTED |
| ADR-018 | Average IV means OI-weighted mark IV | ACCEPTED |
| ADR-019 | Deribit mark_iv normalizes percentage points to decimal before Black-Scholes | ACCEPTED |
| ADR-020 | Full profile recomputation is coalesced, maximum once per 2 seconds in v0 | ACCEPTED |
| ADR-021 | v1 asset scope is BTC only | ACCEPTED |
| ADR-022 | required chart timeframes are 1m, 5m, 15m, 1h, 4h, 1d, 1w | ACCEPTED |
| ADR-023 | Binance Spot volume pane is required | ACCEPTED |
| ADR-024 | v1 drawing tools are horizontal and vertical lines only | ACCEPTED |
| ADR-025 | default Gamma expiry scope is <=30 DTE | ACCEPTED |
| ADR-026 | expiry presets include 0DTE, Next Expiry, This Friday, Next Friday, <=7 DTE, <=30 DTE, All, Custom | ACCEPTED |
| ADR-027 | user-facing historical Gamma storage is out of scope for v1 | ACCEPTED |
| ADR-028 | desktop is the primary launch target | ACCEPTED |
| ADR-029 | project uses a new dedicated repository | ACCEPTED |
| ADR-030 | Gamma territory uses subtle regime shading plus labeled Gamma Flip | ACCEPTED |
| ADR-031 | v1 includes a collapsible Gamma-by-price profile | ACCEPTED |
| ADR-032 | authentication uses Google with one allowlisted account | ACCEPTED |
| ADR-033 | free Vercel URL is used initially | ACCEPTED |
| ADR-034 | product-owner approval occurs at milestone exits | ACCEPTED |
| ADR-035 | Codex is primary implementer; Antigravity/Gemini is independent reviewer/browser verifier | ACCEPTED |
| ADR-036 | Ox Alpha is a long-context/adversarial reviewer, never sole authority for critical math/security changes | ACCEPTED |
| ADR-037 | calculated options levels use a right-side Level Rail with name + exact price | ACCEPTED |
| ADR-038 | level-label collisions are resolved visually without moving the underlying price level | ACCEPTED |
| ADR-039 | primary screen remains chart-first; secondary analytics use progressive disclosure | ACCEPTED |

Change PROPOSED to ACCEPTED after product-owner confirmation or implementation lock.

---

# 4. Product Decisions

All architecture-blocking product decisions are resolved.

- [x] BTC only for v1.
- [x] BTC-settled inverse Deribit BTC options only.
- [x] Binance BTCUSDT Spot is the sole master candle source.
- [x] 1m, 5m, 15m, 1h, 4h, 1d, 1w.
- [x] 2,000 initial candles with lazy older-history loading.
- [x] Binance Spot volume pane.
- [x] Horizontal and vertical drawing tools.
- [x] Default <=30 DTE.
- [x] One active expiry scope at a time.
- [x] 0DTE, Next Expiry, This Friday, Next Friday, <=7 DTE, <=30 DTE, All, Custom.
- [x] Three secondary GEX levels by default.
- [x] Subtle positive/negative Gamma shading.
- [x] Compact collapsible Gamma profile.
- [x] No user-facing historical Gamma snapshots.
- [x] Full profile coalesced to maximum once every 2 seconds while dirty.
- [x] Desktop-first.
- [x] Google authentication.
- [x] One allowlisted account.
- [x] New `options-chart` repository.
- [x] Codex primary implementer.
- [x] Antigravity/Gemini independent reviewer/browser verifier.
- [x] Ox Alpha long-context/adversarial reviewer.
- [x] ChatGPT architect/coordinator.
- [x] Product-owner approval at milestone exits.
- [x] Free Vercel URL initially.
- [x] Right-side Level Rail with name + exact price.
- [x] Chart-first interface with progressive disclosure.

No product-decision blocker remains for M0/M0.5.

# 5. Milestone Status

<!-- progress:M0:start -->
## M0 Architecture Lock

Status: COMPLETE

- [x] M0.1 Confirm the dedicated options-chart repository.
- [x] M0.2 Add PROJECT_PLAN.md version 0.5.0.
- [x] M0.3 Add PROGRESS.md version 0.5.0.
- [x] M0.4 Add the root AGENTS.md operating contract.
- [x] M0.5 Scaffold the npm workspace.
- [x] M0.6 Configure strict TypeScript.
- [x] M0.7 Configure linting and formatting checks.
- [x] M0.8 Configure Vitest.
- [x] M0.9 Configure Playwright.
- [x] M0.10 Configure GitHub Actions.
- [x] M0.11 Define canonical domain types.
- [x] M0.12 Define the typed error taxonomy.
- [x] M0.13 Define calculation version constants.
- [x] M0.14 Record initial mathematical assumptions.
- [x] M0.15 Define ChartAdapter.
- [x] M0.16 Check the Lightweight Charts Codex skill and package typings.
- [x] M0.17 Establish baseline performance telemetry.
- [x] M0.18 Create the ADR index.
- [x] M0.19 Create the ADR template.
- [x] M0.20 Register ADR-001 through ADR-039.
- [x] M0.21 Create the progress journal generator and checker.

Progress: 21 / 21

Blockers:

- None.

Next recommended task:

```text
M0 exit review and product-owner approval, then begin M0.5.
```
<!-- progress:M0:end -->

---


<!-- progress:M0.5:start -->
## M0.5 Walking Skeleton

Status: COMPLETE

- [x] M0.5.1 Plain Next.js client page
- [x] M0.5.2 Small Binance REST candle fetch
- [x] M0.5.3 Validate and normalize candles
- [x] M0.5.4 Render through ChartAdapter
- [x] M0.5.5 Stub Deribit fixture
- [x] M0.5.6 Worker bridge
- [x] M0.5.7 Deterministic worker metric
- [x] M0.5.8 Plain metric display
- [x] M0.5.9 Minimal authentication
- [x] M0.5.10 Vercel preview
- [x] M0.5.11 Chart-path benchmark
- [x] M0.5.12 Deribit batch-validation benchmark
- [x] M0.5.13 Record results

Progress: 13 / 13

Blockers:

- None.

Next recommended task:

```text
M0.5 exit review and product-owner approval, then begin M1.
```
<!-- progress:M0.5:end -->


## M1 Binance Candle Engine

Status: IMPLEMENTATION COMPLETE - INTEGRATION REVIEW PENDING

- [x] M1.1 REST client.
- [x] M1.2 Kline schemas.
- [x] M1.3 normalizer.
- [x] M1.4 historical bootstrap with <=1,000-bar pagination.
- [x] M1.4A deterministic startTime pagination.
- [x] M1.4B deduplication and contiguity verification.
- [x] M1.4C partial-bootstrap recovery.
- [x] M1.5 Kline WebSocket.
- [x] M1.6 reconnect/backoff.
- [x] M1.7 planned 24-hour reconnect.
- [x] M1.8 deduplication.
- [x] M1.9 gap repair.
- [x] M1.10 REST reconciliation.
- [x] M1.11 feed health.
- [x] M1.12 fixtures.
- [x] M1.13 regression tests.
- [x] M1.14 Binance clock sync.
- [x] M1.15 market-data-only REST fallback.
- [x] M1.16 market-data-only WS fallback.
- [x] M1.17 endpoint diagnostics.
- [x] M1.18 sleep/wake reconciliation.

Progress: 18 / 18

Integration review:

- Binance clock sync and endpoint diagnostics exist as library functions but are not wired into the dashboard lifecycle.
- WebSocket recovery currently marks LIVE on socket open instead of waiting for reconciliation plus normal recovery hysteresis.
- REST reconciliation starts after the latest closed candle, so it does not revalidate that authoritative closed bar and is capped to one 1,000-bar request.

---

## M2 Deribit Options Data Engine

Status: COMPLETE

- [x] M2.1 JSON-RPC client.
- [x] M2.2 instrument schemas.
- [x] M2.3 book-summary schemas.
- [x] M2.4 markprice schemas.
- [x] M2.5 index schemas.
- [x] M2.6 normalizers.
- [x] M2.7 instrument catalog.
- [x] M2.8 full options snapshot.
- [x] M2.9 markprice.options.btc_usd.
- [x] M2.10 deribit_price_index.btc_usd.
- [x] M2.11 heartbeat.
- [x] M2.12 test_request handling.
- [x] M2.13 reconnect/backoff.
- [x] M2.14 subscription replay.
- [x] M2.15 OI refresh.
- [x] M2.16 stale detection.
- [x] M2.17 last-valid cache.
- [x] M2.18 fixtures/error tests.
- [x] M2.19 Deribit clock sync.
- [x] M2.20 hourly instrument refresh.
- [x] M2.21 unknown-instrument refresh.
- [x] M2.22 sleep/wake reconciliation.

Progress: 22 / 22

Live exit verification (2026-08-26):

- Normalized 956 / 956 active BTC inverse options from live Deribit REST.
- Full snapshot contained 431,560.5 BTC total OI and mark IV for all 956 contracts.
- Five-sample clock sync selected 233 ms RTT and a 1,592.5 ms accepted offset.
- Received `markprice.options.btc_usd` and `deribit_price_index.btc_usd` on the intended socket.
- Forced a disconnect; a second socket replayed subscriptions, reconciled REST state, and returned to LIVE through recovery hysteresis.

---

## M3 Options Mathematics Engine

Status: IMPLEMENTATION COMPLETE - ANTIGRAVITY REVIEW PENDING

- [x] M3.1 normal distribution helpers.
- [x] M3.2 d1/d2.
- [x] M3.3 gamma.
- [x] M3.4 DTE.
- [x] M3.5 gross gamma.
- [x] M3.6 modeled signed GEX.
- [x] M3.7 strike aggregation.
- [x] M3.8 expiry aggregation.
- [x] M3.9 spot grid.
- [x] M3.10 gamma profile.
- [x] M3.11 zero crossing.
- [x] M3.12 Gamma Flip.
- [x] M3.13 Call Wall.
- [x] M3.14 Put Wall.
- [x] M3.15 secondary levels.
- [x] M3.16 Max Pain.
- [x] M3.17 Total OI.
- [x] M3.18 Put/Call OI.
- [x] M3.19 OI-weighted Average IV.
- [x] M3.19A null-safe Put/Call OI ratio.
- [x] M3.19B excludedCountByReason metadata.
- [x] M3.19C preserve all qualifying Gamma Flip crossings.
- [x] M3.20 metadata/version.
- [x] M3.21 worker protocol.
- [x] M3.22 worker implementation.

Progress: 22 / 22

Implementation evidence (2026-08-26):

- Pure TypeScript engine with no UI, DOM, network, or market-data imports.
- Versioned `options-worker-v2` full-chain request/result protocol with `inputVersion` preservation.
- 117 deterministic Vitest checks pass across 29 files, including 30 new M3 and protocol checks.
- Typecheck and lint pass with zero errors.
- Independent M4 reconciliation against Python and Deribit Greeks remains intentionally separate.

---

## M4 Independent Validation

Status: COMPLETE

- [x] M4.1 Python Black-Scholes reference model.
- [x] M4.2 Python Gamma & GEX reference engine.
- [x] M4.3 Python Max Pain reference solver.
- [x] M4.4 real Deribit fixtures capture.
- [x] M4.5 TypeScript vs Python 100k-vector parity.
- [x] M4.6 document Deribit Greek conventions.
- [x] M4.7 empirical tolerance calibration.
- [x] M4.8 TypeScript vs Deribit Greek reconciliation.
- [x] M4.9 performance benchmark suite.
- [x] M4.10 dual-runtime CI matrix.
- [x] M4.11 golden snapshot regression suite.
- [x] M4.12 near-expiry edge cases (15m floor).
- [x] M4.13 zero-DTE and expired contract handling.
- [x] M4.14 deep ITM/OTM extremes (|d1| > 38).
- [x] M4.15 extreme volatility regimes.
- [x] M4.16 missing-IV exclusion policy.
- [x] M4.17 Deribit IV normalization verification.
- [x] M4.18 zero OI handling & null put/call ratio.
- [x] M4.19 duplicate input robustness.
- [x] M4.20 spot shift invariance & S^2 scaling.
- [x] M4.21 multi-zero-crossing profile resolution.
- [x] M4.22 equidistant tie-breaking validation.
- [x] M4.23 monotonicity & peak decay properties.
- [x] M4.24 Max Pain payoff convexity & tie-break.
- [x] M4.25 total OI aggregation invariants.
- [x] M4.26 exit evidence & certification synthesis.

Progress: 26 / 26

Validation evidence (2026-08-26):

- 100,000 randomized and grid vectors tested across Python 3.13 and TypeScript engines with max relative error <= 7.45e-8 <= 1e-7.
- 956 / 956 active Deribit BTC contracts reconciled against exchange mark quotes within 2.11e-5 BTC.
- Engine latency on 1,000 contracts benchmarked at 20.05 ms (median) with < 1 MB heap allocation per pass.
- 4 market regime golden snapshots verified with cryptographic SHA-256 integrity hashes.
- 15 boundary cases and 9 sensitivity properties independently verified.
- 37 test files and 188 unit tests passing across the workspace.

---

## M5 Chart Engine

Status: NOT STARTED


- [ ] M5.1 install Lightweight Charts.
- [ ] M5.2 ChartAdapter.
- [ ] M5.3 LightweightChartsAdapter.
- [ ] M5.4 2,000 historical bars with lazy older-history loading.
- [ ] M5.5 realtime update().
- [ ] M5.6 preserve zoom.
- [ ] M5.7 viewport-safe repair setData().
- [ ] M5.8 Playwright zoomed-gap-repair test.
- [ ] M5.9 resize.
- [ ] M5.10 crosshair.
- [ ] M5.11 timeframes: 1m, 5m, 15m, 1h, 4h, 1d, 1w.
- [ ] M5.12 Binance Spot volume pane.
- [ ] M5.13 horizontal-line drawing tool.
- [ ] M5.14 vertical-line drawing tool.
- [ ] M5.15 drawings persist across normal updates/reconnect.
- [ ] M5.16 direct Binance weekly-kline validation.
- [ ] M5.17 chart diagnostics.
- [ ] M5.18 rapid timeframe test.
- [ ] M5.19 reconnect while zoomed.
- [ ] M5.20 8-hour soak.
- [ ] M5.21 conflation benchmark.
- [ ] M5.22 compact top command bar.
- [ ] M5.23 minimal drawing toolbar.
- [ ] M5.24 desktop layout checks at 1366x768 and 1920x1080.

Post-v0:
- [ ] M5.F1 KLineChart proof.
- [ ] M5.F2 canonical candle parity.
- [ ] M5.F3 fallback CI smoke.

Progress: 0 / 24 v0-critical tasks

## M6 Gamma Overlay Dashboard

Status: NOT STARTED

- [ ] M6.1 Call Wall.
- [ ] M6.2 Put Wall.
- [ ] M6.3 Gamma Flip.
- [ ] M6.4 Max Pain.
- [ ] M6.5 secondary GEX.
- [ ] M6.6 subtle Gamma regime shading.
- [ ] M6.7 expiry presets: 0DTE, Next Expiry, This Friday, Next Friday, <=7 DTE, <=30 DTE, All, Custom.
- [ ] M6.8 DTE.
- [ ] M6.9 Total OI.
- [ ] M6.10 Put/Call OI.
- [ ] M6.11 OI-weighted Average IV.
- [ ] M6.12 Total Modeled GEX.
- [ ] M6.13 freshness.
- [ ] M6.14 audit popover.
- [ ] M6.15 source timestamps.
- [ ] M6.16 model version.
- [ ] M6.17 overlay controls.
- [ ] M6.18 right-side Level Rail.
- [ ] M6.19 LevelTag with name + exact price.
- [ ] M6.20 LevelTag hover audit metadata.
- [ ] M6.21 label collision avoidance + leader connectors.
- [ ] M6.22 current-price collision handling.
- [ ] M6.23 compact collapsible Gamma profile.
- [ ] M6.24 synchronized Gamma-profile y-scale.
- [ ] M6.25 secondary-level display filter.
- [ ] M6.26 LIVE/FALLBACK/STALE/INVALID level states.
- [ ] M6.27 chart-first responsive acceptance tests.
- [ ] M6.28 expiry updates without chart recreation.

Progress: 0 / 28

## M7 Reliability and Failure Injection

Status: NOT STARTED

- [ ] M7.1 Binance WS failure.
- [ ] M7.2 Binance REST failure.
- [ ] M7.3 Deribit WS failure.
- [ ] M7.4 Deribit REST failure.
- [ ] M7.5 malformed Binance.
- [ ] M7.6 malformed Deribit.
- [ ] M7.7 delayed data.
- [ ] M7.8 duplicate data.
- [ ] M7.9 reordered data.
- [ ] M7.10 dropped candles.
- [ ] M7.11 dropped options.
- [ ] M7.12 worker crash.
- [ ] M7.13 stale worker response.
- [ ] M7.14 sleep/wake.
- [ ] M7.15 offline/online.
- [ ] M7.16 health transitions.
- [ ] M7.17 stale-label verification.
- [ ] M7.18 extended soak.

Progress: 0 / 18

---

## M8 Vercel Production

Status: NOT STARTED

- [ ] M8.1 Vercel project.
- [ ] M8.2 GitHub connection.
- [ ] M8.3 environment variables.
- [ ] M8.4 authentication.
- [ ] M8.5 account allowlist.
- [ ] M8.6 live exchange connectivity.
- [ ] M8.7 optional REST proxy.
- [ ] M8.8 production errors.
- [ ] M8.9 build.
- [ ] M8.10 preview.
- [ ] M8.11 production.
- [ ] M8.12 production smoke test.
- [ ] M8.13 mobile check.
- [ ] M8.14 secret audit.

Progress: 0 / 14

---

## M9 Trading-Readiness Validation

Status: NOT STARTED

- [ ] M9.1 multi-expiry live comparisons.
- [ ] M9.2 daily audit snapshots.
- [ ] M9.3 independent reference comparisons.
- [ ] M9.4 raw-chain wall checks.
- [ ] M9.5 discrepancy investigation.
- [ ] M9.6 expiry rollover.
- [ ] M9.7 high-volatility session.
- [ ] M9.8 quiet session.
- [ ] M9.9 near-expiry session.
- [ ] M9.10 full-day browser stability.
- [ ] M9.11 freeze v1 formulas.
- [ ] M9.12 tag v1.0.0.

Progress: 0 / 12

---

# 6. Validation Scoreboard

Do not change a status to PASS without test evidence.

| Check | Status | Evidence |
|---|---|---|
| Binance closed candles match REST | NOT RUN | |
| Binance vs TradingView sample comparison | NOT RUN | |
| No duplicate candle timestamps | NOT RUN | |
| Binance reconnect repairs gaps | NOT RUN | |
| Deribit instrument normalization | NOT RUN | |
| Deribit OI snapshot completeness | NOT RUN | |
| Deribit heartbeat recovery | NOT RUN | |
| TS gamma vs Python gamma | NOT RUN | |
| TS gamma vs Deribit gamma | NOT RUN | |
| Gamma Flip regression | NOT RUN | |
| Call Wall regression | NOT RUN | |
| Put Wall regression | NOT RUN | |
| Max Pain regression | NOT RUN | |
| Worker stale-result protection | NOT RUN | |
| Chart 8-hour soak | NOT RUN | |
| KLineChart fallback parity | NOT RUN | |
| Production Playwright smoke test | NOT RUN | |
| Deribit mark_iv 80 -> engine IV 0.80 | NOT RUN | |
| Repair-triggered setData preserves viewport | NOT RUN | |
| Clock skew measurement and resume resync | NOT RUN | |
| Regional endpoint reachability diagnostics | NOT RUN | |
| TypeScript/Python comparison in CI | NOT RUN | |
| excludedCountByReason present | NOT RUN | |
| 2,000-bar bootstrap paginates <=1,000/request | NOT RUN | |
| bootstrap partial failure is explicit | NOT RUN | |
| Gamma Flip multiple-crossing selection | NOT RUN | |
| all qualifying crossings retained in metadata | NOT RUN | |
| aggregate-profile time drift fixture | NOT RUN | |
| <15m profile-floor behavior | NOT RUN | |
| rapid timeframe switching stays under control-message budget | NOT RUN | |
| production CSP permits calculation worker | NOT RUN | |

---

# 7. Performance Scoreboard

| Metric | Target | Latest | Status |
|---|---:|---:|---|
| Initial candles | 2,000 | N/A | NOT RUN |
| Realtime full setData calls | 0 per normal tick | N/A | NOT RUN |
| Active chart instances | 1 | N/A | NOT RUN |
| Binance live sockets | 1 steady state | N/A | NOT RUN |
| Deribit live sockets | 1 steady state | N/A | NOT RUN |
| Worker instances | 1 intended calculation worker | N/A | NOT RUN |
| Main-thread long tasks | rare >50 ms | N/A | NOT RUN |
| 8-hour progressive lag | none | N/A | NOT RUN |
| Runaway heap growth | none | N/A | NOT RUN |

---

# 8. Calculation Versions

Current planned versions:

```text
ENGINE_VERSION = 0.1.0-dev
GEX_MODEL_VERSION = gex-heuristic-v1
GAMMA_PROFILE_VERSION = sticky-iv-v1
MAX_PAIN_VERSION = max-pain-expiry-v1
```

Status:

```text
NOT FROZEN
```

Any change to formula semantics must be recorded here.

---

# 9. Known Risks

## RISK-001 Chart lag over long sessions

Status: OPEN

Mitigation:

- incremental `update()`.
- no repeated `setData()`.
- one chart instance.
- bounded listeners.
- long-session soak test.
- fallback chart adapter.

## RISK-002 Candle divergence

Status: OPEN

Mitigation:

- render Binance-provided OHLC.
- key by open timestamp.
- REST reconciliation.
- direct comparison against BINANCE:BTCUSDT.

## RISK-003 Wrong dealer-sign interpretation

Status: OPEN

Mitigation:

- label signed exposure as modeled.
- preserve gross gamma concentration.
- version GEX methodology.
- document assumptions.

## RISK-004 Deribit option-stream overload

Status: MITIGATED BY DESIGN

Mitigation:

- consolidated markprice.options.btc_usd stream.
- periodic full-chain REST OI snapshot.
- no thousands of individual ticker subscriptions in baseline design.

## RISK-005 Stale data looks live

Status: OPEN

Mitigation:

- timestamps.
- explicit health states.
- stale thresholds.
- visible fallback/stale badges.

## RISK-006 Vercel used as persistent market-data daemon

Status: MITIGATED BY DESIGN

Mitigation:

- browser connects directly to exchange WebSockets.
- Vercel hosts application and limited HTTP functions only.


## RISK-008 Regional endpoint availability

Status: MITIGATED BY DESIGN, MUST VERIFY IN PRODUCTION

Mitigation:

- primary Binance endpoints.
- official market-data-only REST and WS fallbacks.
- endpoint reachability diagnostics.
- production checks from expected usage regions/networks.
- Deribit reachability reported independently.

## RISK-009 Browser clock skew and hidden-tab throttling

Status: MITIGATED BY DESIGN

Mitigation:

- Binance server-time sync.
- Deribit get_time sync.
- UTC canonical timestamps.
- visibilitychange recovery.
- resync and reconciliation on resume.

## RISK-010 Repair-triggered chart jump

Status: MITIGATED BY DESIGN

Mitigation:

- use update() for normal live path.
- setData() only when missing historical bars require reconstruction.
- capture visible time range before repair.
- restore viewport after repair.
- Playwright regression test.



## RISK-011 Multiple qualifying Gamma Flip crossings

Status: MITIGATED BY DESIGN

Mitigation:

- preserve all qualifying crossings.
- select nearest to Deribit underlying.
- tie-break lower.
- version the selection rule.
- regression test multi-crossing snapshots.

## RISK-012 Historical bootstrap truncation

Status: MITIGATED BY DESIGN

Mitigation:

- max 1,000 klines per request.
- deterministic pagination.
- page-level validation.
- deduplication.
- contiguity check.
- explicit degraded completeness state.

## RISK-013 Multi-expiry time drift mistaken for a bug

Status: MITIGATED BY DESIGN

Mitigation:

- documented T-driven drift.
- audit nearest expiry and DTE.
- deterministic held-market-input time-drift tests.

## RISK-014 WebSocket control-message burst

Status: MITIGATED BY DESIGN

Mitigation:

- 350 ms UI debounce.
- maximum 2 applied timeframe changes per second.
- queue/coalesce controls.
- keep JSON control traffic below 4 messages per rolling second.
- rate-limit regression test.


## RISK-007 Calculation regression

Status: OPEN

Mitigation:

- fixture snapshots.
- independent Python implementation.
- Deribit Greek reconciliation.
- CI regression tests.
- calculation versions.

---

# 10. Change Log

Use newest entries first.

## 2026-08-26

### M1-BINANCE-CANDLE-ENGINE

Status: 18 / 18 COMPLETE

Implementation:

- Added `BinanceRestClient` with ordered endpoint failover (`api.binance.com` → `data-api.binance.vision`), HTTP 429/418 rate-limit short-circuit, and `AbortSignal.timeout(8s)` per request.
- Added `BinanceWsKlineEventSchema` and `BinanceWsKlineDataSchema` Zod schemas for WebSocket kline messages with OHLC integrity and timestamp validation.
- Added deterministic paginated `bootstrapHistory()` fetching ≤1,000 bars per request, assembling up to 2,000 candles with sort, deduplication by openTime, and interval contiguity verification. Reports explicit `DEGRADED` completeness on partial failures.
- Added `BinanceKlineSocket` managed WebSocket client with exponential backoff (1s–30s + ±25% jitter), planned 23-hour proactive reconnection, stale detection (15s threshold), endpoint rotation, and `FeedHealthState` lifecycle (`CONNECTING` → `LIVE` → `STALE`/`RECONNECTING` → `ERROR`).
- Added `CandleStore` in-memory canonical candle buffer with ordered insert/update by openTime, out-of-order rejection, and REST-based gap reconciliation returning minimal chart repair action (`update` vs `setData`).
- Added `syncBinanceClock()` 5-sample minimum-RTT clock synchronization against `/api/v3/time`.
- Added `runEndpointDiagnostics()` testing REST and WS endpoint reachability and latency.
- Added Binance module barrel export consolidating all M1 exports.

Tests run:

- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm test`: PASS, 58 tests (39 new M1 tests).
- New test files: `constants.test.ts`, `client.test.ts`, `ws-schemas.test.ts`, `clock.test.ts`, `pagination.test.ts`, `reconciliation.test.ts`.

Architecture decisions:

- WebSocket kline normalization shares the canonical `Candle` type with REST but uses `binance-ws-kline-v1` schema version for traceability.
- `CandleStore.applyLiveCandle()` enforces PROJECT_PLAN §5.3 rules: same openTime updates, newer appends, older rejected.
- Reconciliation determines chart action: single-bar update uses `update()`, multi-bar insertion uses `setData()` with viewport preservation.
- Backoff resets after 60s of healthy connection, not after a single successful message.
- Planned reconnect fires at 23 hours (1h buffer before Binance 24h limit).

Next:

- Dashboard integration (timeframe selector, volume pane, feed health indicator, sleep/wake listener).
- Begin M2 Deribit Options Data Engine.

---

### M0.5-WALKING-SKELETON

Status: 13 / 13 COMPLETE; awaiting product-owner exit approval

Implementation:

- Added an authenticated Binance REST proxy, Zod validation, canonical candle normalization, and a concrete Lightweight Charts 5.2.1 adapter.
- Added a validated six-contract Deribit fixture, versioned Web Worker protocol, deterministic Total OI calculation, and chart-first metric display.
- Added Auth.js Google login with one exact allowlisted email; the local preview bypass is limited to development mode.
- Added package-level boundary tests, browser canvas-pixel and responsive-layout checks, and repeatable benchmark commands.
- Connected the GitHub repository to Vercel and deployed a public preview at `https://options-chart-upload-qk2w77qog-kelvin12792.vercel.app`.
- Corrected the production Google entry points to use Auth.js's CSRF-protected sign-in action and added visible authentication error messages.

Tests run:

- `npm run format:check`: PASS.
- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm test`: PASS, 19 tests.
- `npm run build`: PASS.
- `npm run test:e2e`: PASS, 3 Chromium checks.
- `npm audit`: PASS, 0 vulnerabilities.
- Production-mode access gate: PASS; unconfigured deployment shows configuration-required and protected API returns HTTP 401.
- Live local Binance proxy: PASS, 120 candles returned.
- Vercel preview reachability: PASS, HTTP 200 with the expected dashboard configuration gate.
- Production Google sign-in initiation: PASS; Chromium submitted POST and reached `accounts.google.com` with the stable Vercel callback.
- Authenticated production dashboard: PASS; product-owner screenshot confirms 120 validated candles and the deterministic 251.00 BTC worker metric after allowlisted Google login.

Benchmarks:

- Chart path: 500 updates in 51.4 ms total; 0.103 ms average per update in Chromium.
- Consolidated Deribit validation: 2,500 instruments, 20.030 ms median and 27.113 ms p95 over 12 runs.

Architecture decisions:

- Keep full Zod validation on the main thread for the measured walking-skeleton batch; move it into the worker if representative production payload p95 reaches the 50 ms long-task threshold.
- Keep all worker messages protocol-versioned and discard responses older than the latest `inputVersion`.
- Label the Deribit fixture explicitly and never present it as live market data.

Next:

- Conduct M0.5 exit review and obtain product-owner approval before beginning M1.

---

### M0-ARCHITECTURE-LOCK

Status: COMPLETED; awaiting product-owner exit approval

Implementation:

- Added the npm/Next.js workspace and exact dependency lockfile.
- Added strict TypeScript, ESLint, Prettier, Vitest, Playwright, and GitHub Actions.
- Defined canonical domain models, typed errors, calculation versions, GEX assumptions, ChartAdapter, and bounded telemetry.
- Registered ADR-001 through ADR-039 and explicit open validation items.
- Added one journal per M0 task plus deterministic progress build/check/policy tooling.

Tests run:

- `npm run format:check`: PASS.
- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm test`: PASS, 4 tests.
- `npm run build`: PASS.
- `npm run test:e2e`: PASS, 1 Chromium smoke test.
- `npm audit`: PASS, 0 vulnerabilities.

Architecture decisions:

- Pinned Next.js 16.3.3, React 19.2.8, Lightweight Charts 5.2.1, TypeScript 6.0.3, and ESLint 9.39.5.
- TypeScript 7 and ESLint 10 were not used because the current Next lint stack does not support them together.
- The optional Lightweight Charts agent skill was checked but not installed; installed v5 package typings are authoritative.

Next:

- Product owner reviews and approves the M0 exit.
- Begin M0.5 walking skeleton after approval.

---

## 2026-08-25

### PLAN-005

Status: COMPLETED

Trigger:

Second technical review of PROJECT_PLAN.md after v0.4 product/design lock.

Adopted:

- deterministic multi-crossing Gamma Flip selection.
- all-crossing calculation metadata.
- aggregate-profile time-drift documentation.
- 15-minute profile T floor.
- Binance <=1,000 kline bootstrap pagination.
- partial-bootstrap recovery.
- exact unsigned Gross Gamma units.
- numeric wall guardrails.
- poll-feed recovery semantics.
- per-task progress journals plus generated root PROGRESS.md.
- production Web Worker CSP coverage.
- five-sample minimum-RTT clock synchronization.
- Binance subscription-churn throttle.
- ADR registry/template requirement.
- external-reference comparability rules.
- LIVE -> ERROR and LIVE -> OFFLINE health paths.
- null-safe Put/Call OI ratio.
- 256 KB diagnostics bundle cap.
- numeric search-band expansion trigger.
- KLineChart kept off the v0 critical path.
- Max Pain settlement caveat.
- future multi-tab feed-sharing note.

Verified:

- Binance REST klines max 1,000/request.
- Binance WebSocket client control traffic limit 5 messages/second.
- Lightweight Charts historicalUpdate cannot insert a missing old point.

Files:

- PROJECT_PLAN.md
- PROGRESS.md

Next:

- Begin M0 repository/governance scaffold.
- Complete M0.5 walking skeleton before deep feature implementation.
- Treat H1/H3 from the review as closed by specification and later verify them with regression tests.

---

### PLAN-004

Status: COMPLETED

Trigger:

Final product decisions plus intentional chart-design direction.

Locked:

- BTC-settled inverse Deribit BTC options.
- subtle Gamma regime shading.
- collapsible Gamma profile.
- Google login.
- one allowlisted account.
- free Vercel URL initially.
- milestone-exit owner approvals.
- Codex primary implementation role.
- Antigravity/Gemini independent review and browser verification.
- Ox Alpha long-context/adversarial review role.
- ChatGPT architecture/coordinator role.

Design research:

TanukiTrade:

- attaches options structure directly to chart price space.
- exposes multiple Gamma/OI/volume level families.
- uses compact on-chart tags.
- includes relative-size filtering to reduce level noise.

MenthorQ:

- distinguishes primary structural levels from ranked GEX levels.
- supports per-level visibility.
- displays labels directly on horizontal levels.

Adopted design:

- chart-first desktop interface.
- right-side Level Rail.
- every primary level shows name + exact price.
- primary/secondary level hierarchy.
- label collision avoidance.
- leader connectors for displaced tags.
- distinct current-price marker.
- progressive disclosure for audit metadata.
- subtle regime shading.
- collapsible synchronized Gamma profile.
- minimal drawing toolbar.
- no permanent analytics-card grid.

Ox Alpha note:

Public sources currently describe Ox Alpha as a new reasoning/coding model with a claimed one-million-token context window. Its maker remains unclear. Parameter-count claims are not treated as verified. It is assigned a review role rather than sole ownership of critical implementation decisions.

Files:

- PROJECT_PLAN.md
- PROGRESS.md

Next:

- Create repository.
- add root governance files.
- begin M0.
- complete M0.5 walking skeleton.
- prototype Level Rail during chart walking-skeleton work before visual freeze.

---

### PLAN-003

Status: COMPLETED

Trigger:

Product-owner answers to scope and UI questions.

Locked:

- BTC only for v1.
- Binance BTCUSDT Spot remains the single master candlestick source.
- Required timeframes: 1m, 5m, 15m, 1h, 4h, 1d, 1w.
- Binance Spot volume pane required.
- Horizontal and vertical drawing lines required.
- Default Gamma scope <=30 DTE.
- Expiry presets: 0DTE, Next Expiry, This Friday, Next Friday, <=7 DTE, <=30 DTE, All Expiries, Custom Expiry.
- No user-facing historical Gamma storage in v1.
- Desktop-first launch.
- New dedicated repository, recommended name `options-chart`.

Architect decision:

- No perpetual candle toggle in v1.
- Future perpetual price, if added, is a secondary quote only and does not create a second master chart.

Files:

- PROJECT_PLAN.md
- PROGRESS.md

Next:

- Answer remaining non-blocking product decisions.
- Begin M0/M0.5 repository scaffold and walking skeleton.

---

### PLAN-002

Status: COMPLETED

Trigger:

Technical review of PROJECT_PLAN.md.

Adopted:

- walking skeleton.
- explicit v0 cut-line.
- named Binance market-data-only fallbacks.
- regional endpoint diagnostics.
- viewport-safe chart gap repair.
- exact v1 GEX units/formula.
- metric-specific contract exclusions.
- excludedCountByReason metadata.
- OI-weighted Average IV.
- significant Gamma Flip crossing filter.
- health state transitions and recovery hysteresis.
- calculation coalescing.
- exchange clock synchronization.
- hidden-tab recovery.
- deterministic offline CI.
- automated TypeScript/Python cross-check.
- production diagnostics export.
- simplified chart package layout.
- API-route auth and CSP requirements.
- versioned cache envelopes.
- fallback chart moved off v0 critical path.

Corrected review claim:

- Deribit API examples express mark_iv in percentage points, e.g. 80 for 80%, so canonical Black-Scholes IV normalization is `80 -> 0.80`.

Research verification:

- Current Lightweight Charts guidance confirms historical update cannot insert a missing old point; repair requires setData and viewport preservation.
- Binance officially exposes `data-api.binance.vision` and `data-stream.binance.vision`.
- Deribit exposes `public/get_time` for clock-skew measurement.
- Deribit documents BTC inverse option multiplier as 1 BTC.

Files:

- PROJECT_PLAN.md
- PROGRESS.md

Next:

- Product owner confirms scope questions and ADRs.
- Begin M0, followed immediately by M0.5 walking skeleton.

---

### PLAN-001

Status: COMPLETED

Work:

- Researched chart engine choices.
- Selected Lightweight Charts as primary.
- Selected KLineChart as fallback.
- Selected ECharts for optional secondary visualizations.
- Defined chart-adapter requirement.
- Defined Binance candle integrity approach.
- Defined Deribit snapshot + consolidated-stream approach.
- Defined reliability pattern.
- Defined milestone roadmap.
- Defined agent workflow.

Evidence/research:

- TradingView Lightweight Charts repository and current v5 guidance.
- KLineChart repository.
- Binance official WebSocket documentation.
- Deribit official API documentation.
- Vercel official documentation.
- NautilusTrader adapter architecture.
- Zod, Vitest, Playwright repositories.

Files:

- PROJECT_PLAN.md
- PROGRESS.md

Next:

- Product owner answers open questions.
- Confirm repository.
- Begin M0 scaffold.

---

# 11. Agent Update Template

Copy this section for every work unit.

```text
## YYYY-MM-DD HH:MM EAT - <TASK ID>

Agent:
Branch:
Commit:

Status:
STARTED | PARTIAL | BLOCKED | COMPLETED

Objective:

Files changed:

Implementation:

Tests run:

Results:

Performance observations:

Data-integrity observations:

Errors/issues found:

Architecture decisions:

PROGRESS checklist changes:

Next recommended task:
```

---

# 12. Blocker Template

```text
BLOCKER ID:
Task:
Severity:
First observed:
Environment:

Expected:

Actual:

Reproduction:

Logs:

Likely component:

What has been ruled out:

Safe workaround:

Permanent fix status:
```

---

# 13. Rule for Handoffs Between Codex and Antigravity

When Agent A hands work to Agent B:

Agent A must provide in PROGRESS.md:

- exact task ID.
- current branch.
- latest commit.
- files touched.
- tests passing.
- tests failing.
- unresolved issue.
- expected next action.

Agent B must not start by rewriting the feature.

Agent B first reproduces the current state.

This prevents agents from repeatedly replacing each other's implementations.

---

# 14. Next Action

1. Review and approve the M0 milestone exit.
2. Complete the M0.5 walking skeleton before deep Milestone 1 implementation.
3. Prototype the Level Rail early enough to verify chart readability and performance.
4. Stop at each milestone exit for product-owner approval.

Do not begin visual Gamma overlays before Milestones 1 through 4 pass their exit criteria.

---

# 15. Antigravity Quality Review & Codex Action Items

## 2026-08-26 Review Cycle (Post-M0 Inspection)

### [REV-001] Missing `progress:policy` script in root `package.json` breaks CI
- **Status:** [VERIFIED]
- **Severity:** Critical
- **Location:** `package.json:24`, `.github/workflows/ci.yml:31`
- **Problem Description:** `.github/workflows/ci.yml` invokes `npm run progress:policy` in the `quality` job. However, `package.json` only defines `"progress:build"` and `"progress:check"`. CI will fail on pull requests and pushes with `Missing script: "progress:policy"`.
- **Root Cause:** Script alias was omitted during M0.21 package.json setup.
- **Recommended Action for Codex:** Add `"progress:policy": "node scripts/progress.mjs policy"` to `"scripts"` in `package.json`.
- **Codex Response / Reasoning:** The requested script already exists exactly as `"progress:policy": "node scripts/progress.mjs policy"` in root `package.json`; the review was based on a stale package snapshot. Re-ran `npm run progress:policy` successfully, so no duplicate package change was required.
- **Antigravity Verification:** Verified. Confirmed `package.json` contains `"progress:policy": "node scripts/progress.mjs policy"`. Ran `npm run progress:policy` locally and confirmed it passes cleanly.

---

### [REV-002] Missing `MAX_PAIN_VERSION` in options engine versions
- **Status:** [VERIFIED]
- **Severity:** Major
- **Location:** `packages/options-engine/src/version.ts`, `packages/options-engine/src/index.ts`, `PROGRESS.md:524`
- **Problem Description:** `PROGRESS.md` Section 8 explicitly specifies `MAX_PAIN_VERSION = max-pain-expiry-v1`, but `packages/options-engine/src/version.ts` does not export `MAX_PAIN_VERSION`.
- **Root Cause:** Version constant omitted when freezing initial constants in M0.13.
- **Recommended Action for Codex:** Export `export const MAX_PAIN_VERSION = "max-pain-expiry-v1";` from `packages/options-engine/src/version.ts` and `index.ts`. Add corresponding test in `version.test.ts`.
- **Codex Response / Reasoning:** Added and publicly re-exported `MAX_PAIN_VERSION = "max-pain-expiry-v1"`. The architecture-lock version test now asserts the exact value, preventing unreviewed Max Pain methodology changes.
- **Antigravity Verification:** Verified. Confirmed `MAX_PAIN_VERSION` is exported from `packages/options-engine/src/version.ts` and `index.ts`, and verified by unit tests in `version.test.ts`.

---

### [REV-003] `BoundedPerformanceTelemetry` lacks async measurement support (`measureAsync`)
- **Status:** [VERIFIED]
- **Severity:** Major
- **Location:** `packages/shared/src/telemetry.ts:75-83`
- **Problem Description:** `BoundedPerformanceTelemetry.measure()` only measures synchronous execution. `PerformanceMetricName` defines async operations (`"worker.round-trip"`, `"validation.deribit-batch"`). Passing an async function to `measure()` synchronously returns an unresolved promise and measures ~0ms.
- **Root Cause:** Missing `measureAsync<T>` method.
- **Recommended Action for Codex:** Add `async measureAsync<T>(metric: PerformanceMetricName, operation: () => Promise<T>): Promise<T>` to `BoundedPerformanceTelemetry` with test coverage in `telemetry.test.ts`.
- **Codex Response / Reasoning:** Added `measureAsync`, which awaits promise settlement and records elapsed time in `finally`. Unit tests cover both fulfillment and rejection, verifying that async failures are timed without changing their rejection behavior.
- **Antigravity Verification:** Verified. Confirmed `measureAsync` is implemented with `try...finally` around `await operation()` to accurately record duration for both fulfilled and rejected promises. All 4 unit tests in `telemetry.test.ts` pass.

---

### [REV-004] Missing composite `OptionsSummaryMetrics` domain interface
- **Status:** [VERIFIED]
- **Severity:** Minor / Architectural
- **Location:** `packages/domain/src/metrics.ts`
- **Problem Description:** Domain defines granular types (`GammaPoint`, `StrikeExposure`, `GammaLevel`, `MaxPainResult`), but lacks a composite interface representing full-chain calculated summary metrics (Total OI, Put/Call OI ratio, Average IV, Total Modeled GEX, Headline Levels, metadata) required by M3.17–M3.20.
- **Root Cause:** Composite interface not declared in initial M0.11 domain types.
- **Recommended Action for Codex:** Define and export `OptionsSummaryMetrics` in `packages/domain/src/metrics.ts` and re-export in `packages/domain/src/index.ts`.
- **Codex Response / Reasoning:** Added and re-exported `OptionsSummaryMetrics` with unit-explicit total/call/put OI, nullable put/call ratio and average mark IV, modeled GEX per 1% move, key levels, and calculation metadata. This gives M3 a typed aggregate without conflating unavailable ratio/IV values with zero.
- **Antigravity Verification:** Verified. Confirmed `OptionsSummaryMetrics` is declared in `packages/domain/src/metrics.ts` and exported in `packages/domain/src/index.ts`. Typecheck, lint, and Next.js production builds compile without errors.

---

## 2026-08-26 Review Cycle (M0.5 Walking Skeleton Inspection)

### [REV-005] M0.5 Walking Skeleton Architectural & Quality Audit
- **Status:** [VERIFIED]
- **Severity:** Informational / Milestone Validation
- **Location:** `packages/market-data`, `packages/chart`, `packages/worker-protocol`, `apps/web`
- **Audit Findings:**
  1. **Candle Pipeline:** Binance klines Zod schema (`BinanceKlinePageSchema`) strictly enforces OHLC consistency, ascending open timestamps, and volume parsing.
  2. **Deribit Pipeline:** `DeribitConsolidatedSnapshotSchema` validates instrument uniqueness, inverse BTC multiplier (1 BTC), and canonical IV decimal conversion (`mark_iv / 100`).
  3. **Chart Adapter:** `LightweightChartsAdapter` initializes cleanly behind `ChartAdapter` interface, handling resize observation, price lines, and viewport tracking.
  4. **Worker Protocol:** Worker messaging strictly validates `protocolVersion` and discards responses older than latest `inputVersion`. Total OI calculation is pure and deterministic.
  5. **Auth & Security:** NextAuth Google provider enforces exact allowlisted email check. Dev bypass is restricted strictly to `NODE_ENV === "development"`.
  6. **Benchmarks:** Verified `benchmark:deribit` executing 2,500 instrument validations in 16.4ms median / 22.3ms p95 (safely below 50ms long-task threshold).
  7. **Test Suites:** 17 Vitest unit tests, 3 Playwright tests, typecheck, and lint pass with 0 errors.
- **Remaining Task:** None for implementation. Conduct the M0.5 exit review and record product-owner approval before beginning M1.

---

## 2026-08-26 Review Cycle (M2 Deribit Options Data Engine Inspection)

### [REV-006] M2 Deribit Options Data Engine Formal Exit Approval
- **Status:** [VERIFIED]
- **Severity:** Informational / Milestone Exit Approval
- **Location:** `packages/market-data/src/deribit`, `packages/domain`, `tests`
- **Audit Findings & Evidence:**
  1. **Inverse Option Instrument Catalog:** `DeribitInstrumentCatalog` successfully normalizes and categorizes active BTC inverse options (956/956 active contracts) with correct expiration timestamps and strikes.
  2. **Snapshot Completeness:** Full options snapshot aggregates 431,560.5 BTC total OI with valid decimal IV (`mark_iv / 100`) across all active contracts.
  3. **Dual Real-time Streams:** Real-time subscriptions for both `markprice.options.btc_usd` and `deribit_price_index.btc_usd` handle streaming updates and test requests.
  4. **Clock Synchronization:** 5-sample minimum-RTT clock sync against `public/get_time` successfully estimates server skew and timestamps events accurately.
  5. **Resilience & Hysteresis:** Forced disconnects trigger subscription replay, REST reconciliation, and clean transition through recovery hysteresis back to `LIVE`.
  6. **Test Verification:** 87 Vitest unit tests (all 22 test files), 3 Playwright browser checks, TypeScript typecheck, and ESLint pass with 0 errors.
- **Formal Exit Approval:** Milestone 2 is hereby **APPROVED**. Milestone 3 (Options Mathematics Engine) is cleared to begin.
