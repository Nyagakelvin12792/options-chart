# BTC Options Metrics Dashboard
## PROJECT_PLAN.md

Version: 0.5.0  
Status: Architecture converged after second technical review  
Date: 2026-08-25  
Primary deployment target: Vercel Hobby  
Primary development workflow: Antigravity + ChatGPT/Codex + GitHub  
Production scope: Read-only market analytics. No order execution. No private exchange credentials.

---

# 1. Purpose

Build a private, zero-cost BTC market dashboard that combines:

- Binance BTCUSDT spot candlesticks.
- Deribit BTC options data.
- Locally computed options metrics.
- A fast financial chart.
- Reliable fallbacks and stale-data detection.
- Repeatable mathematical validation.
- A codebase that is easy to debug, test, maintain, and extend.

The first production release must emphasize correctness and reliability before visual complexity.

The dashboard must eventually display:

- BTCUSDT candlesticks.
- Call Wall.
- Put Wall.
- Gamma Flip.
- Positive gamma territory.
- Negative gamma territory.
- Gross gamma concentration by strike.
- Modeled signed GEX by strike.
- Total modeled GEX.
- Max Pain for a selected expiry.
- Days to Expiry.
- Open Interest.
- Put/Call Open Interest.
- Average IV.
- Expiry filters.
- Data freshness and connection health.
- Calculation version and audit information.

Later releases may add Vanna, Charm, volatility surfaces, flow, and other derivatives metrics without changing the core market-data and chart architecture.

---

# 2. Hard Constraints

The project must satisfy all of the following.

1. Zero recurring cost for the first production version.
2. Deployable on Vercel Hobby.
3. No paid market-data API.
4. Public market data only.
5. No Binance or Deribit trading API keys required.
6. No order placement.
7. No private account data.
8. Version 1 supports BTC only.
9. One master BTC candlestick chart.
10. Binance BTCUSDT Spot is the authoritative chart candle source.
10. Deribit is the authoritative BTC options source.
11. Deribit pricing inputs are used for Deribit option mathematics.
12. Raw exchange data must never flow directly into UI components.
13. All external payloads must be validated before use.
14. Calculation code must be separate from UI code.
15. Chart code must be replaceable without rewriting the options engine.
16. High-frequency data must not be pushed through React state on every message.
17. Every network feed must have reconnection, stale detection, and fallback behavior.
18. The app must never silently substitute missing data with zero.
19. The app must never label stale values as live.
20. Every material calculation change must increment a calculation version.
21. Every completed development task must update PROGRESS.md.
22. No single source file should become a dumping ground for unrelated logic.

---


# 2.1 Delivery Strategy and Explicit MVP Cut

The project must produce a usable vertical slice early.

Do not wait until the mathematics engine is complete before proving that the browser, worker, chart, authentication, exchange adapters, and Vercel deployment work together.

## v0 walking skeleton

Before Milestone 1, build one deliberately plain page that proves:

```text
Binance REST candles
  -> runtime validation
  -> normalization
  -> ChartAdapter
  -> Lightweight Charts

Stubbed Deribit snapshot
  -> worker bridge
  -> one deterministic computed metric
  -> plain text display

Vercel preview
  -> application login
  -> authorized-user check
```

The walking skeleton is not a production trading dashboard.

Its purpose is to expose architectural mistakes before deeper work begins.

## v0 MVP cut

The first usable live release ends at a reduced Milestone 6.

Required:

- Binance BTCUSDT Spot candles.
- Deribit BTC options snapshot.
- validated Gamma mathematics.
- Call Wall.
- Put Wall.
- modeled Gamma Flip.
- selected-expiry Max Pain.
- DTE.
- Total OI.
- OI-weighted Average IV.
- feed health.
- audit metadata.
- horizontal drawing lines.
- vertical drawing lines.
- Vercel deployment.
- private authentication.

Not required before the first usable live release:

- Apache ECharts.
- full KLineChart fallback implementation.
- automated chaos test suite.
- historical Gamma storage.
- Vanna.
- Charm.
- advanced drawing tools beyond horizontal and vertical lines.
- multi-asset support.
- advanced mobile layout.

The interfaces for these features should exist where useful, but unfinished optional features must not block the first usable release.



# 2.2 Product Decisions Locked on 2026-08-25

The following product decisions are accepted for version 1.

## Asset scope

```text
BTC only
```

Ethereum and other assets are future extensions.

The domain model should remain asset-aware so future expansion does not require rewriting the architecture, but no ETH-specific implementation belongs in v1.

## Master price chart

Use:

```text
BINANCE BTCUSDT Spot
```

as the only authoritative candlestick source in v1.

Reason:

- clean spot price.
- no perpetual funding/basis distortion.
- direct TradingView comparison with `BINANCE:BTCUSDT`.
- deep liquidity.
- stable public REST and WebSocket interfaces.

A perpetual quote may be added later as a small secondary reference, but it must not become a second master candlestick chart.

## Launch chart timeframes

Required:

```text
1m
5m
15m
1h
4h
1d
1w
```

Use Binance exchange candle boundaries for every timeframe.

The weekly candle must remain the Binance weekly candle, not a locally reconstructed aggregation of daily bars.

## Volume

A volume pane is required at launch.

Volume source:

```text
Binance BTCUSDT Spot kline volume
```

## Drawing tools

Required at launch:

```text
Horizontal line
Vertical line
```

Not required in v1:

- trend lines.
- Fibonacci tools.
- rectangles.
- text annotations.
- complex drawing suites.

Drawing objects should be stored separately from exchange data so chart reconnects and candle refreshes do not delete user drawings.

## Gamma default scope

Default:

```text
<= 30 DTE
```

## Expiry controls

Required launch presets:

```text
0DTE
Next Expiry
This Friday
Next Friday
<= 7 DTE
<= 30 DTE
All Expiries
Custom Expiry
```

`Custom Expiry` must list actual currently active Deribit BTC expiries rather than accepting arbitrary nonexistent dates.

If a preset resolves to no active Deribit expiry, disable it or show `No matching expiry`.

Every displayed options metric must carry the selected expiry scope.

Max Pain remains tied to one specific expiry.

When the active scope contains multiple expiries, Max Pain must either:

1. use a separately selected expiry inside the Max Pain control, or
2. clearly display the nearest included expiry as `Nearest-expiry Max Pain`.

Do not calculate an unlabeled all-expiries Max Pain.

## Historical Gamma

Do not store historical:

- Gamma Flip.
- Call Wall.
- Put Wall.
- GEX profiles.

in v1.

The system is a live terminal first.

Diagnostic fixture capture remains allowed for testing and regression. That is engineering test data, not a user-facing historical Gamma feature.

## Device priority

```text
Desktop first
```

The layout should remain technically responsive, but full mobile UX is not a launch requirement.

## Repository

Create a new repository dedicated to this system.

Recommended repository name:

```text
options-chart
```

Do not merge the first implementation into an older derivatives-terminal codebase.



# 2.3 Final Product Decisions Locked on 2026-08-25

These decisions close the remaining product questions.

## Deribit option family

Version 1 uses:

```text
BTC-settled inverse Deribit BTC options only
```

Do not mix different option settlement/quantity semantics into the v1 engine.

## Gamma territory visualization

Use:

```text
subtle positive/negative Gamma background shading
+
clearly labeled Gamma Flip horizontal line
```

Shading must remain visually subordinate to price candles.

The chart must remain readable with shading disabled.

## Gamma profile

Include a:

```text
compact collapsible Gamma-by-price profile
```

The profile is closed by default if it materially reduces candle space on smaller desktop windows.

The profile must share the same price scale as the main chart where practical.

## Authentication

Use:

```text
Google login
```

Production access is restricted to:

```text
one allowlisted Google account
```

Authentication protects:

- dashboard pages.
- application API routes.
- optional proxy routes.
- diagnostics routes where applicable.

## Agent workflow

Use a multi-agent workflow with explicit roles.

### ChatGPT

Role:

```text
Architect / coordinator / specification owner
```

Responsibilities:

- maintain architecture.
- maintain project plan.
- resolve cross-agent conflicts.
- verify research.
- review mathematical assumptions.
- define milestone acceptance criteria.

### Codex

Role:

```text
Primary implementation agent
```

Responsibilities:

- implement scoped tasks.
- write tests.
- run quality gates.
- update PROGRESS.md.
- keep commits small.
- avoid unrelated refactors.

### Antigravity / Gemini

Role:

```text
Independent reviewer / browser verifier / UI reviewer
```

Responsibilities:

- review Codex changes.
- reproduce bugs.
- inspect browser behavior.
- test chart interactions.
- verify visual regressions.
- challenge implementation assumptions.

### Ox Alpha

Role:

```text
Long-context audit / adversarial code reviewer / secondary architecture reviewer
```

Current public information describes Ox Alpha as a newly surfaced reasoning/coding model with a claimed one-million-token context window, but its maker and provenance remain unclear.

Therefore:

- do not give Ox Alpha sole ownership of critical mathematical changes.
- do not treat parameter-count claims as verified.
- do not use Ox Alpha as the sole reviewer of security-sensitive code.
- use it to inspect large diffs, trace cross-file behavior, identify edge cases, and challenge architecture.
- all Ox Alpha findings must be reproduced or verified by Codex, Antigravity/Gemini, tests, or ChatGPT review before acceptance.

No production secret should be pasted into any model.

## Milestone approval

Require product-owner approval at:

```text
milestone exit
```

Do not require approval after every individual coding task.

Agents may complete tasks within an approved milestone until the milestone exit criteria are reached.

## Domain

Initial production URL:

```text
free Vercel deployment URL
```

A custom domain is deferred.


# 3. Recommended Technical Stack

## 3.1 Production application

- Next.js.
- React.
- TypeScript.
- Vercel.
- TradingView Lightweight Charts as the primary chart engine.
- ChartAdapter from day one, with KLineChart reserved as a post-v0 fallback implementation unless the primary engine fails acceptance testing.
- Zod for runtime validation of exchange payloads.
- Web Workers for options calculations.
- Vitest for unit and regression tests.
- Playwright for browser and chart integration tests.
- GitHub Actions for CI.
- GitHub for source control.
- Auth.js or an equivalent application-level login for the private production dashboard.

Use the current stable versions at implementation time. Pin exact versions in package-lock.json.

## 3.2 Independent validation tools

A small Python reference implementation is recommended under `tools/reference-python/`.

Production mathematics stays in TypeScript.

Python exists only as an independent implementation for:

- Black-Scholes cross-checks.
- Gamma cross-checks.
- GEX snapshot comparisons.
- Max Pain cross-checks.
- Regression investigation.

This reduces the chance that a shared TypeScript bug validates itself.

---

# 4. Research-Based Chart Decision

## 4.1 Primary: TradingView Lightweight Charts

Repository:
https://github.com/tradingview/lightweight-charts

Reasons:

- Purpose-built financial chart library.
- HTML5 Canvas renderer.
- TypeScript support.
- Large active open-source project.
- Current v5 API.
- Supports candlesticks, price lines, panes, primitives, markers, time scale controls, and realtime updates.
- The official project explicitly recommends `series.update()` for realtime bars instead of repeatedly replacing the full dataset.
- v5.1 introduced data conflation for large datasets.
- The repository now ships an AI coding skill that supports tools including Codex.

Important implementation rule:

- `setData()` only for initial history replacement or deliberate full reload.
- `update()` for the current candle and newly closed candles.
- Do not call `setData()` on every WebSocket message.
- Create the chart once.
- Destroy it once when the component unmounts.
- Do not recreate the chart during normal React renders.

Agent skill installation:

```bash
npx skills add https://github.com/tradingview/lightweight-charts
```

The exact API must always be checked against the installed package typings.

License/attribution requirements must be respected.

## 4.2 Fallback: KLineChart

Repository:
https://github.com/klinecharts/KLineChart

Reasons:

- Financial chart designed for k-lines/candlesticks.
- TypeScript.
- Canvas.
- Zero dependencies.
- Mobile support.
- Built-in indicators and drawing support.
- Apache-2.0.
- Active project.

KLineChart must not be tightly coupled to the rest of the application.

## 4.3 Secondary visualization library: Apache ECharts

Repository:
https://github.com/apache/echarts

Use only for secondary analytics panels if useful, for example:

- GEX histograms.
- Expiry distributions.
- IV charts.
- Open Interest charts.

Do not use ECharts as the primary BTC trading chart unless both dedicated financial chart engines fail acceptance testing.

## 4.4 Chart abstraction requirement

Create a chart interface similar to:

```text
ChartAdapter
  initialize(container, options)
  setHistory(candles)
  updateCandle(candle)
  setLevels(levels)
  removeLevel(id)
  setVisibleRange(range)
  getVisibleRange()
  resize(width, height)
  destroy()
```

Implement for the v0 critical path:

```text
LightweightChartsAdapter
```

Preserve the interface for:

```text
KLineChartAdapter
```

The KLineChart implementation is a post-v0 task unless Lightweight Charts fails acceptance testing.

When KLineChart is implemented, give it one permanent CI smoke-render test so fallback code does not silently rot.

UI components talk only to `ChartAdapter`.

This prevents vendor lock-in without forcing a second chart engine onto the first-release critical path.

---

# 5. Candlestick Integrity Strategy

This is a critical requirement.

The dashboard does not calculate Binance candles from individual trades.

Binance calculates the candles.

The dashboard renders those exchange OHLC values.

## 5.1 Authoritative pair

Primary chart symbol:

```text
BINANCE BTCUSDT Spot
```

The TradingView comparison chart must also use:

```text
BINANCE:BTCUSDT
```

Do not compare Binance Spot candles against:

- Binance perpetual.
- Bybit perpetual.
- Coinbase BTCUSD.
- Deribit perpetual.
- another exchange.

Small price differences between different venues are expected.

## 5.2 Historical candles

Binance `GET /api/v3/klines` returns a maximum of 1,000 candles per request.

The default 2,000-candle bootstrap therefore uses deterministic pagination.

Historical bootstrap:

```text
desired bar count
  -> calculate desired start/end range
  -> request <= 1,000 klines
  -> validate page
  -> normalize page
  -> next startTime = last openTime + interval
  -> repeat until desired range is complete
  -> concatenate
  -> sort by openTime
  -> deduplicate by openTime
  -> verify contiguity
  -> canonical Candle[]
  -> chart setHistory()
```

Rules:

1. Never request `limit > 1000`.
2. Each page must be independently validated.
3. Pagination advances from the last accepted `openTime`.
4. Assembly deduplicates by `openTime`.
5. The final array must be strictly increasing by `openTime`.
6. Verify the expected interval between adjacent closed bars.
7. If a page fails, retry with bounded backoff.
8. If bootstrap remains incomplete after retry, expose `historyCompleteness = DEGRADED`.
9. Do not silently present a truncated dataset as the requested 2,000-bar history.
10. A contiguous recent suffix may render in degraded mode if explicitly labeled.
11. Bootstrap gaps use the same canonical reconciliation machinery as reconnect gaps.
12. Add fixtures for a page boundary containing a duplicate candle and for a failed middle page.

Historical bootstrap:

```text
Browser
  -> Binance REST klines
  -> paginated fetch
  -> Zod validation
  -> Binance normalizer
  -> reconciliation/contiguity check
  -> canonical Candle[]
  -> chart setHistory()
```

Canonical candle:

```text
openTime
closeTime
open
high
low
close
volume
isClosed
source
symbol
interval
```

Use decimal strings at the exchange boundary.

Convert deliberately inside the normalization layer.

## 5.3 Live candles

Live path:

```text
Binance Kline WebSocket
  -> validate
  -> normalize
  -> candle reconciliation
  -> ChartAdapter.updateCandle()
```

Binance Kline messages contain exchange-calculated:

- Open.
- High.
- Low.
- Close.
- Volume.
- Candle start time.
- Candle close time.
- Closed-candle flag.

The chart must key candles by candle open timestamp.

Rules:

1. If incoming `openTime` equals current candle `openTime`, update the current candle.
2. If incoming `openTime` is greater, close the previous bar and append the new one.
3. Never create two bars with the same `openTime`.
4. Never accept an older out-of-order candle into the live end without reconciliation.
5. When a candle reports closed, store the exchange value as authoritative.
6. Periodically compare recent closed bars against Binance REST.
7. If a mismatch exists, repair from REST and log the event.

## 5.4 Planned Binance reconnection

Binance documents a finite WebSocket connection lifetime.

Implement:

- Proactive reconnect before the 24-hour connection limit.
- Ping/pong handling as required.
- Exponential backoff with jitter after unexpected failure.
- Subscription replay after reconnect.
- REST reconciliation after reconnect.

Recommended reconnect delays:

```text
1s
2s
4s
8s
16s
30s maximum
+ randomized jitter
```

Reset delay after a healthy connection period.

## 5.5 Gap repair

After WebSocket reconnect:

```text
lastKnownClosedCandleTime
  -> fetch Binance REST candles from that time
  -> compare
  -> repair local canonical candle store
  -> update chart safely
  -> resume live stream
```

Chart repair rule:

1. If only the latest existing bar needs replacement, use `update()`.
2. If an existing older point needs replacement and the installed Lightweight Charts API supports `historicalUpdate`, use it only for that replacement.
3. If one or more missing historical bars must be inserted, rebuild the canonical candle array and use `setData()`.
4. Before repair-triggered `setData()`, capture `chart.timeScale().getVisibleRange()`.
5. After `setData()`, restore the same time bounds with `setVisibleRange()` where valid.
6. If the user is following realtime at the right edge, preserve that follow mode instead of forcing an old viewport.
7. Add a Playwright case: `gap repair while zoomed preserves viewport`.

Never assume the stream remained gap-free while disconnected.

Never use repeated `setData()` as the normal realtime update path.

---

# 6. Deribit Data Architecture

Do not subscribe individually to thousands of option tickers unless profiling proves a need.

Use a hybrid snapshot + consolidated stream model.

## 6.1 Instrument catalog

Use Deribit public instrument discovery for:

- instrument name.
- strike.
- expiry timestamp.
- option type.
- contract size.
- state.

Refresh:

- on startup.
- every 60 minutes while the dashboard is active.
- after reconnect if the catalog is older than the refresh interval.
- immediately when a valid stream message references an unknown instrument.

Do not rely on a public Deribit push event for new instrument listings.

Normalize to:

```text
OptionInstrument
  instrumentName
  currency
  strike
  expiryTimestamp
  optionType
  contractSize
  settlementCurrency
  isActive
```

## 6.2 Full options snapshot

Use:

`public/get_book_summary_by_currency`

with BTC and option kind.

Purpose:

- Open Interest.
- Mark IV.
- Mark price.
- Underlying price.
- Underlying index.
- interest rate where available.
- volume and summary fields.

Recommended first production cadence while dashboard is open:

```text
30 seconds
```

This is adjustable after profiling.

Open Interest does not need a sub-second refresh for this dashboard.

## 6.3 Consolidated live options mark/IV stream

Subscribe to Deribit:

```text
markprice.options.btc_usd
```

This is a consolidated channel that emits mark-price and IV updates across BTC options.

Use this to avoid one WebSocket ticker subscription per option.

## 6.4 Deribit index stream

Subscribe to:

```text
deribit_price_index.btc_usd
```

The options engine uses Deribit's underlying/index context for Deribit option mathematics.

The visible candlestick chart still uses Binance BTCUSDT Spot.

## 6.5 Deribit heartbeat

Enable Deribit heartbeat.

Handle:

- heartbeat.
- test_request.
- disconnect.
- malformed frame.
- reconnect.
- subscription replay.

A feed that is connected but no longer delivering valid data must be treated as stale.

---

# 7. Canonical Data Model

External APIs must terminate at adapter boundaries.

Suggested internal domain types:

```text
Candle
MarketPrice
OptionInstrument
OptionQuote
OptionSnapshot
OptionsChainSnapshot
ExpiryBucket
GammaPoint
StrikeExposure
GammaProfilePoint
GammaLevel
MaxPainResult
DataFreshness
FeedHealth
CalculationMetadata
```

Every domain event carries:

```text
source
sourceTimestamp
receivedTimestamp
normalizedTimestamp
schemaVersion
```

Where applicable, also carry:

```text
instrumentName
symbol
expiry
strike
optionType
```

---

# 8. Validation Layer

Use Zod schemas for all public payloads.

Repository:
https://github.com/colinhacks/zod

Validation occurs before normalization.

REST snapshots use full Zod validation.

High-volume consolidated WebSocket batches must be benchmarked during the walking skeleton. If full Zod parsing on the main thread creates long tasks, move batch validation and normalization off the main thread. Do not weaken schema checks merely to improve frame rate.

The performance decision and benchmark result must be recorded in PROGRESS.md.

Flow:

```text
unknown external JSON
  -> schema.safeParse()
  -> valid?
      yes -> normalize
      no  -> reject + error counter + structured log
```

Never use unchecked:

```text
response as SomeType
```

for exchange data.

Validation rules include:

- required fields exist.
- timestamps are finite.
- strike > 0.
- expiry > instrument creation time.
- option type is call or put.
- OI >= 0.
- IV >= 0.
- prices are finite and positive where required.
- no duplicate instrument IDs in a normalized snapshot.

---

# 9. Options Mathematics Engine

The engine must be a pure package.

No DOM.

No React.

No chart imports.

No WebSocket code.

No fetch calls.

Suggested modules:

```text
packages/options-engine/
  src/
    black-scholes/
      normal.ts
      d1d2.ts
      gamma.ts
    exposure/
      gross-gamma.ts
      signed-gex.ts
      aggregate-by-strike.ts
      aggregate-by-expiry.ts
    profile/
      spot-grid.ts
      gamma-profile.ts
      zero-crossing.ts
      gamma-flip.ts
    levels/
      call-wall.ts
      put-wall.ts
      secondary-gex-levels.ts
    max-pain/
      payoff.ts
      max-pain.ts
    expiry/
      dte.ts
      filters.ts
    iv/
      average-iv.ts
    validation/
      sanity.ts
    version.ts
    index.ts
```

---

# 10. Critical GEX Terminology

Open Interest does not reveal the identity and side of every end holder.

Therefore the dashboard must distinguish measured inputs from modeled positioning.

## 10.0 v1 BTC option universe and units

Proposed v1 product scope:

```text
Deribit BTC inverse options, BTC-settled, contract multiplier 1 BTC
```

This scope must be confirmed in ADR-016 before formula freeze.

Do not silently combine BTC-settled inverse options with a different option family that has different settlement or amount semantics.

Deribit documents that one inverse BTC option contract represents 1 BTC. Deribit also documents options open interest in underlying base-currency coin units.

For the v1 BTC inverse-option model, define:

```text
S      = Deribit option underlying price in USD/BTC
Gamma  = option gamma, delta change per $1 move in BTC spot
OI_BTC = Deribit open interest in BTC-equivalent underlying amount
sign   = +1 for call, -1 for put under gex-heuristic-v1
```

Modeled dollar gamma exposure for a 1% BTC move:

```text
GEX_1pct_USD = sign × Gamma × OI_BTC × S² × 0.01
```

Interpretation:

```text
Gamma × OI_BTC
```

estimates the change in BTC delta per $1 spot move.

Multiplying by:

```text
S × 0.01
```

converts a 1% spot move into dollars of spot movement.

Multiplying by another:

```text
S
```

converts the resulting BTC delta change into USD hedge notional.

Therefore:

```text
GEX_1pct_USD
```

is modeled USD hedge-notional sensitivity for a 1% move in the underlying under the selected sign convention.

Worked example:

```text
S = $100,000
Gamma = 0.00002 per $1
OI_BTC = 500 BTC
sign = +1

GEX = 0.00002 × 500 × 100,000² × 0.01
    = $1,000,000 per 1% move
```

Do not multiply OI by a 1 BTC multiplier again if the normalized Deribit OI field is already expressed in BTC underlying units.

Add an explicit fixture and unit test for this rule.

If a future product family reports quantity rather than underlying amount, normalize it into `OI_BTC` before the options engine sees it.

## 10.1 Gross Gamma Concentration

Gross Gamma Concentration is the unsigned counterpart of the pinned v1 GEX unit.

For one eligible contract:

```text
GrossGamma_1pct_USD = abs(Gamma) × OI_BTC × S² × 0.01
```

Units:

```text
USD hedge-notional sensitivity per 1% BTC move
```

This uses the same normalized inputs and units as modeled signed GEX, but removes the sign heuristic.

Use for:

- raw concentration.
- prominent strikes.
- call-side concentration.
- put-side concentration.
- wall candidate ranking.
- secondary GEX level ranking.

## 10.2 Modeled Signed GEX

A signed convention is required to generate a positive/negative aggregate profile.

The first release should implement a documented heuristic model.

Example baseline convention:

- call exposure assigned positive.
- put exposure assigned negative.

This is a model.

It must be labeled:

```text
Modeled GEX
Modeled Gamma Flip
Modeled Positive Gamma
Modeled Negative Gamma
```

Do not label it as known dealer inventory.


## 10.3 Input quality and metric-specific exclusion policy

A bad contract is not automatically excluded from every metric.

Use metric-specific eligibility.

For Gamma, GEX, walls, and Gamma Flip:

Exclude a contract when any required field is invalid, including:

- missing or non-finite IV.
- IV <= 0.
- invalid strike.
- invalid expiry.
- missing underlying.
- invalid OI.
- expired contract outside the intended expiry-handling path.

For Max Pain:

IV and Gamma are irrelevant.

A contract with valid:

- strike.
- option type.
- selected expiry.
- OI.

may still participate in Max Pain even if IV is unavailable.

Every calculation result must include:

```text
contractsSeen
contractsIncluded
excludedCountByReason
```

Example:

```json
{
  "contractsSeen": 2862,
  "contractsIncluded": 2847,
  "excludedCountByReason": {
    "missingIv": 12,
    "invalidStrike": 1,
    "invalidOi": 2
  }
}
```

The audit UI must expose these counts.

## 10.4 Deribit IV normalization

Do not assume Deribit `mark_iv` arrives as a Black-Scholes decimal.

Current Deribit API examples show values such as:

```text
mark_iv = 80
```

representing 80% implied volatility.

Canonical engine IV must always be a decimal:

```text
80 -> 0.80
55.2 -> 0.552
```

Add a normalizer fixture that fails if this convention is reversed.

Never divide IV by 100 twice.

## 10.5 Average IV definition

The dashboard summary metric `Average IV` means:

```text
OI-weighted average Deribit mark IV
```

over contracts eligible for the selected expiry scope.

Formula:

```text
AverageIV = Σ(IV_decimal × OI_BTC) / Σ(OI_BTC)
```

Exclude contracts with invalid IV.

Do not use an unweighted mean across the full option universe.

Display the final dashboard value as a percentage.

## 10.5 Put/Call OI ratio

Define:

```text
PutCallOiRatio = totalPutOi / totalCallOi
```

If:

```text
totalCallOi = 0
```

return:

```text
null
```

and display:

```text
—
```

Do not return Infinity.




## 10.7 Version the methodology

Example:

```text
CALCULATION_ENGINE_VERSION = "1.0.0"
GEX_MODEL_VERSION = "gex-heuristic-v1"
GAMMA_PROFILE_VERSION = "sticky-iv-v1"
```

Every displayed result includes these versions in audit metadata.

---

# 11. Black-Scholes Gamma

Use an independently tested Black-Scholes implementation.

Inputs per option:

- Deribit underlying price.
- strike.
- exact time to expiry.
- mark IV.
- Deribit interest rate or documented fallback.
- option contract terms.

Deribit publishes option gamma calculated with standard Black-Scholes.

Use Deribit gamma as a validation benchmark.

Do not simply copy Deribit's gamma as the production answer.

Why:

- We want independent calculation.
- We need gamma at hypothetical spot values for the Gamma Flip profile.
- We need regression control over our own methodology.

---

# 12. Gamma Profile and Gamma Flip

Gamma Flip is not calculated by selecting a strike with a negative or positive bar.

Algorithm:

1. Choose the active option universe based on expiry filter.
2. Build a hypothetical BTC spot grid around the current Deribit underlying.
3. Recalculate each option's gamma at every hypothetical spot.
4. Convert gamma to modeled signed exposure.
5. Sum across all included options at every hypothetical spot.
6. Find a zero crossing in total modeled exposure.
7. Interpolate between adjacent grid points.
8. Apply the pinned crossing-selection rule below.

Initial spot search range:

```text
current Deribit underlying × 0.70
to
current Deribit underlying × 1.30
```

If no valid crossing exists, the engine may perform one bounded expansion pass only when eligible outside-band contracts exist beyond 2% of either search bound and their combined GrossGamma_1pct_USD is at least 1% of total eligible gross gamma concentration.

Initial coarse step:

```text
max($100, 0.5% of current spot)
```

For each candidate crossing, refine inside the surrounding coarse interval using:

```text
max($10, 0.025% of current spot)
```

Then linearly interpolate the zero crossing between the nearest valid positive and negative profile points.

## 12.1 Crossing significance

A sign change alone is not enough.

Define:

```text
profilePeak = max(abs(totalModeledGexAtEachGridPoint))
crossingFloor = profilePeak × 0.005
```

A candidate zero crossing qualifies only if the absolute modeled GEX on both bracketing sides reaches at least:

```text
0.5% of profilePeak
```

before interpolation.

This threshold is provisional and versioned.

Milestone 4 must run sensitivity checks at:

```text
0.25%
0.50%
1.00%
```

If no candidate qualifies:

```text
Gamma Flip = NO_VALID_CROSSING
```

Do not force a flip level into existence.

## 12.1.1 Crossing selection when several crossings qualify

The engine must preserve every qualifying crossing.

Calculation metadata includes:

```text
qualifyingCrossings[]
```

Each entry records at minimum:

```text
price
distanceFromUnderlying
lowerBracketPrice
upperBracketPrice
lowerBracketGex
upperBracketGex
significanceThreshold
```

Headline Gamma Flip rule:

1. Filter to qualifying crossings.
2. Select the crossing with the smallest absolute distance from the current Deribit underlying.
3. If two crossings are exactly equidistant, select the lower-price crossing.
4. Do not prefer a below-spot crossing merely because it is below spot.
5. Preserve all other qualifying crossings in metadata for diagnostics and research.

This selection rule is part of:

```text
GAMMA_PROFILE_VERSION
```

Changing it requires a version change and regression update.



Avoid an unnecessarily dense grid across the entire range.

## 12.2 Initial volatility assumption

Version 1:

```text
sticky IV per contract during spot sweep
```

Meaning each contract retains the snapshot IV while spot changes in the hypothetical gamma calculation.

Document this clearly.

Later research release:

- sticky delta.
- skew-aware profile.
- smile interpolation.

Do not silently change the v1 profile methodology.

## 12.3 Aggregate-profile time drift

A multi-expiry Gamma profile changes as wall-clock time passes even when:

- BTC spot is unchanged.
- IV is unchanged.
- OI is unchanged.

Reason:

```text
T = time remaining to each expiry
```

changes continuously.

Front-expiry contracts therefore change gamma faster than back-expiry contracts as expiry approaches.

Consequences:

- `<= 7 DTE` and `<= 30 DTE` aggregate Gamma Flip may drift with time alone.
- the nearest expiry may dominate an aggregate profile near settlement.
- a changing aggregate Gamma Flip is not automatically a data or calculation bug.

The audit popover must expose:

```text
calculatedAt
expiryScope
nearestIncludedExpiry
nearestIncludedDte
```

Per-expiry Gamma Flip panels are reserved for a later release unless product scope changes.

## 12.4 Minimum time-to-expiry for Gamma profile

To prevent unstable mathematical behavior immediately before settlement, v1 uses:

```text
MIN_PROFILE_TIME_TO_EXPIRY = 15 minutes
```

Contracts with less than 15 minutes remaining are excluded from:

- modeled signed GEX.
- Gamma profile.
- Gamma Flip.
- Call Wall and Put Wall gamma ranking.
- secondary gamma ranking.

They remain eligible, where inputs are valid, for:

- Open Interest summaries.
- selected-expiry Max Pain.

The exclusion must appear in:

```text
excludedCountByReason.nearExpiryProfileFloor
```

The dashboard must show a near-expiry notice when contracts are excluded by this floor.

Milestone 4 must test sensitivity to this 15-minute value before v1 formula freeze.


---

# 13. Call Wall and Put Wall

The project should preserve both raw and stabilized interpretations.

Initial raw definitions:

```text
Call Wall:
largest qualifying call-side gamma concentration above or near spot.

Put Wall:
largest qualifying put-side gamma concentration below or near spot.
```

Avoid choosing an absurd distant strike solely because of stale or unusual OI.

Wall selection uses these provisional v1 guardrails:

```text
eligible strike band: current underlying × 0.75 to × 1.25
minimum same-side gross exposure share: 1%
minimum OI_BTC at strike: 1 BTC
active instruments only: yes
respect active expiry filter: yes
```

Definitions:

```text
sameSideGrossExposureShare =
strikeSideGrossGamma / totalEligibleSameSideGrossGamma
```

A strike must pass every applicable guardrail.

If no strike qualifies:

```text
Call Wall = NO_QUALIFYING_WALL
```

or:

```text
Put Wall = NO_QUALIFYING_WALL
```

Do not select an arbitrarily distant strike merely to display a wall.

These defaults are provisional and must be sensitivity-tested in Milestone 4 before formula freeze.

Do not add hysteresis in the first mathematical baseline.

After baseline validation, an optional stabilized wall may use persistence/hysteresis to reduce one-snapshot flip-flopping.

If implemented, display separately:

```text
Raw Call Wall
Stable Call Wall
```

Never replace raw data invisibly.

The open-source `haus-edge/gex-levels` project is useful as research inspiration for wall stabilization and gamma-profile methodology, but its assumptions are for other markets and must not be copied blindly into BTC.

Repository:
https://github.com/haus-edge/gex-levels

---

# 14. Secondary GEX Levels

MenthorQ's presentation hierarchy is useful as a display concept.

We may rank remaining significant concentrations after the primary walls.

Example:

```text
GEX 1
GEX 2
GEX 3
...
```

Do not duplicate a vendor's proprietary methodology.

Our ranking must be based on our documented exposure values.

Suggested display default:

- primary Call Wall.
- primary Put Wall.
- Gamma Flip.
- Max Pain.
- top 3 secondary GEX levels.

Allow user to increase the number later.

---

# 15. Max Pain

Max Pain must be expiry-specific.

Do not calculate one misleading all-expiry Max Pain number.

If the user selects:

```text
28 AUG 2026
```

calculate Max Pain using the call and put OI for that expiry.

If the dashboard is in:

```text
ALL EXPIRIES
```

show:

```text
Max Pain: Select an expiry
```

or separately show nearest-expiry Max Pain with an explicit label.

Algorithm:

1. Build candidate settlement prices from strikes.
2. At each candidate price, calculate aggregate intrinsic payoff to call and put holders.
3. Sum payoff.
4. Select the strike with minimum aggregate holder payoff.
5. Return expiry, strike, and calculation metadata.

Max Pain is a theoretical open-interest payoff heuristic.

Candidate settlement prices are evaluated at listed strikes for computational convenience.

Do not imply that Deribit's actual delivery price must equal a listed strike. Actual option settlement uses Deribit's delivery-price/index methodology.



---

# 16. Expiry Filters

First production filters:

```text
0DTE
Next Expiry
This Friday
Next Friday
<= 7 DTE
<= 30 DTE
All Expiries
Custom Expiry
```

Default:

```text
<= 30 DTE
```

Definitions:

```text
0DTE
  active BTC options expiring on the current Deribit trading date.

Next Expiry
  the nearest active BTC option expiry after the current time.

This Friday
  the nearest active Friday expiry in the current calendar week.

Next Friday
  the active Friday expiry in the following calendar week.

<= 7 DTE
  all active BTC option expiries with time-to-expiry <= 7 days.

<= 30 DTE
  all active BTC option expiries with time-to-expiry <= 30 days.

All Expiries
  all active BTC option expiries included by the v1 product universe.

Custom Expiry
  one actual active Deribit BTC expiry chosen from the instrument catalog.
```

Future filters may add:

```text
monthly
quarterly
custom multi-select
```

Every gamma metric must carry the active expiry scope.

---

# 17. Web Worker Calculation Architecture

Run expensive profile calculations outside the main UI thread.

```text
main thread
  -> receives normalized options snapshot
  -> sends compact immutable calculation input to worker

worker
  -> gamma
  -> GEX
  -> gamma profile
  -> flip
  -> walls
  -> max pain
  -> summary

main thread
  -> receives result
  -> updates display and chart levels
```

Do not send giant redundant objects to the worker on every underlying-price tick.

Separate:

- mostly static chain fields.
- slowly changing OI/IV.
- fast underlying price.

Use message version IDs so an old worker response never overwrites a newer calculation.

---


# 17.1 Recompute and Coalescing Policy

The options engine must calculate from one internally consistent snapshot version.

Do not recompute the full gamma profile on every mark-IV message.

Maintain:

```text
latestInstrumentCatalog
latestOiSnapshot
latestMarkIvMap
latestDeribitUnderlying
inputVersion
dirtyFlag
```

Rules:

1. OI snapshot arrival marks calculations dirty immediately.
2. Mark/IV stream updates merge into the current map and mark dirty.
3. Underlying-price updates mark dirty.
4. Full profile calculations run no more often than once every 2 seconds in v0.
5. If several updates arrive during the 2-second window, coalesce them into one calculation using the latest complete inputs.
6. Never mix half of one OI snapshot with half of another.
7. Every worker request carries `inputVersion`.
8. Main thread discards worker responses older than the latest accepted input version.
9. Lightweight summary values may update separately where mathematically safe.
10. Profile cadence is configurable and benchmarked before production freeze.

This prevents walls and Gamma Flip from oscillating because thousands of stream records arrive separately.


# 18. React Performance Rules

High-frequency market data must not trigger broad React rerenders.

Rules:

1. Chart instance lives in a ref.
2. Candle series instance lives in a ref.
3. WebSocket messages update chart through an imperative service.
4. React state contains low-frequency UI state.
5. Do not store every market tick in global React state.
6. Do not recreate arrays of thousands of candles on every live message.
7. Do not rerender the full dashboard for a candle price update.
8. Batch UI summary updates where useful.
9. Use selectors if Zustand is adopted.
10. Profile before introducing memoization everywhere.
11. Financial chart components are client-only in Next.js App Router. Do not SSR the chart instance.
12. Do not enable Lightweight Charts data conflation by default. Benchmark first. At the planned initial 2,000-bar history, incremental updates are the primary optimization.
13. Store all canonical timestamps in UTC. Render local timezone only at the presentation boundary.

Suggested state split:

```text
Realtime transport state
  -> service objects / event bus

Chart data
  -> chart adapter

Options calculation input
  -> worker bridge

User settings
  -> Zustand or React state

Low-frequency dashboard summaries
  -> Zustand or React state
```

Zustand repository:
https://github.com/pmndrs/zustand

---


# 18.1 Binance Subscription-Churn Control

Binance limits incoming client control traffic on one WebSocket connection.

Timeframe switching must not issue uncontrolled subscribe/unsubscribe bursts.

v0 policy:

```text
timeframe UI debounce: 350 ms
maximum applied timeframe changes: 2 per second
coalesce intermediate selections: yes
```

For one settled timeframe change:

1. Keep only the user's latest selected interval.
2. Queue the unsubscribe/subscribe operation.
3. Do not send more than 4 JSON control messages in any rolling second.
4. Leave headroom for protocol ping/pong traffic.
5. If a control operation is already pending, replace the pending target with the latest timeframe rather than appending another full pair.
6. Confirm the intended subscription state before labeling the feed LIVE.

The WebSocket client owns this policy, not the chart component.


# 19. Performance Budgets

These are acceptance targets, not marketing promises.

## 19.1 Chart

- Initial candle load: start with 2,000 bars.
- No full `setData()` on each live update.
- Normal live candle update should not create a visible freeze.
- Main-thread long tasks over 50 ms during steady live operation should be rare and investigated.
- No repeated chart recreation.
- No unbounded duplicate listener growth.
- No unbounded duplicate WebSocket growth.

## 19.2 Long-session soak test

Run dashboard for at least 8 continuous hours.

Track:

- heap usage.
- DOM node count.
- active WebSocket count.
- event listener count.
- worker count.
- chart latency.
- CPU use.
- reconnect count.

Acceptance:

- one intended Binance live connection.
- one intended Deribit live connection, unless a documented temporary reconnect overlap occurs.
- stable listener count.
- stable worker count.
- no monotonic runaway memory trend.
- no progressive chart lag.

## 19.3 Calculation cadence

Initial target:

```text
lightweight summary recompute: up to 1 Hz
full gamma profile recompute: 1-5 seconds, adaptive
OI full snapshot: every 30 seconds
```

Profile and tune.

A gamma wall does not need a 100 ms recomputation loop.

---

# 20. Data Freshness and Health

Health is a state machine, not a badge derived from one timestamp comparison.

## 20.0 Allowed state transitions

Primary transitions:

```text
CONNECTING -> LIVE
CONNECTING -> ERROR
LIVE -> DEGRADED
LIVE -> RECONNECTING
LIVE -> ERROR
LIVE -> OFFLINE
DEGRADED -> LIVE
DEGRADED -> STALE
DEGRADED -> RECONNECTING
STALE -> RECONNECTING
STALE -> FALLBACK
RECONNECTING -> LIVE
RECONNECTING -> FALLBACK
RECONNECTING -> OFFLINE
FALLBACK -> LIVE
FALLBACK -> DEGRADED
FALLBACK -> OFFLINE
OFFLINE -> CONNECTING
ERROR -> CONNECTING
```

`ERROR -> CONNECTING` uses the same bounded exponential-backoff-with-jitter policy as transport reconnection.

Fatal protocol/schema conditions may move a nominally LIVE feed directly to ERROR.

A verified browser/network offline event may move LIVE directly to OFFLINE.

Do not jump from a stale or reconnecting state directly to LIVE after a single good packet.

## 20.0.1 Recovery hysteresis

To return to LIVE after DEGRADED, STALE, RECONNECTING, or FALLBACK:

- transport must be connected.
- required subscriptions must be confirmed.
- a reconciliation snapshot must pass validation when a data gap was possible.
- at least 3 consecutive valid expected messages must arrive.
- the feed must remain healthy for at least 5 seconds.

Only then mark LIVE.

## 20.0.2 Anti-flap behavior

Soft stale threshold crossings move:

```text
LIVE -> DEGRADED
```

A second brief good message does not instantly restore LIVE.

Use the recovery hysteresis above.

Hard stale thresholds move:

```text
DEGRADED -> STALE
```

where appropriate.

Record:

```text
stateEnteredAt
lastValidMessageAt
lastReconciliationAt
consecutiveValidMessages
```


## 20.0.3 Poll-feed recovery semantics

Polling feeds use different recovery counting from high-frequency WebSockets.

For the 30-second Deribit OI snapshot:

Startup:

```text
one successful validated snapshot
+ valid freshness
-> LIVE
```

Recovery after STALE, ERROR, or FALLBACK:

1. Enter recovery mode.
2. Perform one validated poll.
3. Perform a second validated recovery poll approximately 5 seconds later.
4. Require both to succeed.
5. Require the feed to remain healthy for at least 5 seconds.
6. Return to the normal 30-second cadence.
7. Mark LIVE.

Do not wait 90 seconds for three ordinary 30-second polls before recovery.

The 90-second threshold remains a stale-data threshold, not a recovery dwell requirement.

## 20.0.3 Page visibility

Browser background-tab throttling must not be interpreted as exchange failure.

On `document.visibilitychange` to hidden:

- record hidden time.
- do not escalate health solely because browser timers were throttled.

On return to visible:

1. mark affected feeds RECONNECTING or DEGRADED.
2. resync exchange clocks.
3. verify sockets.
4. fetch authoritative REST reconciliation where a gap is possible.
5. resume calculations.
6. return to LIVE only through normal recovery hysteresis.


Every feed gets a health state.

```text
CONNECTING
LIVE
DEGRADED
STALE
RECONNECTING
FALLBACK
OFFLINE
ERROR
```

## 20.1 Binance

Example soft stale threshold:

```text
10 seconds without expected market messages
```

Actions:

- mark degraded.
- attempt reconnect.
- REST health check.
- reconcile candles.

## 20.2 Deribit live mark/IV

Example soft stale threshold:

```text
15 seconds
```

## 20.3 Deribit OI snapshot

Expected cadence:

```text
30 seconds
```

Example stale threshold:

```text
90 seconds
```

Do not display a green "LIVE" badge if OI is 10 minutes old.

## 20.4 Display provenance

Example audit popover:

```text
Gamma Flip
$110,842

Status: LIVE
Calculated: 04:21:03 EAT
Underlying: Deribit BTC Index
Options snapshot age: 18s
IV stream age: 1.2s
Contracts included: 2,847
Expiry scope: <= 30 DTE
Engine: 1.0.0
GEX model: gex-heuristic-v1
Profile: sticky-iv-v1
```

---


# 20.5 Time and Clock Discipline

DTE, expiry, stale thresholds, and reconciliation depend on trustworthy time.

Do not use the raw browser clock as the only authority.

On startup and after reconnect/resume:

1. Take 5 time-sync samples from Binance.
2. Take 5 time-sync samples from Deribit.
3. For each sample record:
   - local request start.
   - venue server time.
   - local response end.
   - round-trip time.
4. Estimate offset against the local midpoint:
   `serverTime - ((requestStart + responseEnd) / 2)`.
5. For each venue, choose the valid sample with the smallest RTT.
6. Store:
   - selected offset.
   - selected RTT.
   - sample timestamp.
7. If absolute offset > 60 seconds:
   - reject the sample set.
   - mark clock health ERROR.
   - retry with backoff.
8. If absolute offset > 5 seconds and <= 60 seconds:
   - accept provisionally.
   - mark clock health DEGRADED.
   - display a clock-skew warning.
9. Re-sync periodically and after browser resume.

Canonical internal timestamps are UTC epoch milliseconds.

Display timestamps may be rendered in the user's local timezone.

Never store local wall-clock strings as canonical market timestamps.

For Black-Scholes time-to-expiry:

```text
T = max(expiryTimestamp - venueAdjustedNow, 0) / YEAR_BASIS
```

`YEAR_BASIS` must be part of the documented Greek-convention validation work.

Browser sleep/wake and hidden-tab recovery must force:

- clock resync.
- REST reconciliation.
- options snapshot refresh if stale.
- worker recalculation.


# 21. Fallback Matrix

| Component | Primary | Fallback | UI behavior |
|---|---|---|---|
| Binance candles history | `api.binance.com` REST | `data-api.binance.vision` market-data-only REST | Show degraded until reconciled |
| Binance live candles | Binance Kline WS | `data-stream.binance.vision` market-data-only WS, then REST polling temporarily | Label FALLBACK |
| Regional endpoint availability | direct browser access to primary venue endpoint | official market-data-only endpoint where reachable | Explicit endpoint/region diagnostic, never silent |
| Deribit instruments | Deribit REST | cached last valid catalog | Mark age |
| Deribit OI snapshot | Deribit REST | last valid snapshot | STALE after threshold |
| Deribit mark/IV | consolidated WS | latest REST book-summary snapshot | FALLBACK |
| Deribit index | Deribit index WS | underlying price from current valid Deribit snapshot | FALLBACK |
| options calculations | Web Worker | synchronous reduced-frequency calculation only if worker unavailable | DEGRADED |
| primary chart | Lightweight Charts | KLineChart adapter | Same normalized candles and levels |

Fallback must never silently change the meaning of a metric.

Because exchange connections originate in the user's browser, endpoint availability depends on the browser's current network region and policy environment.

Production acceptance must verify direct access from every region where the dashboard is expected to be used.

A VPN or travel location may change endpoint availability. The diagnostics screen must report endpoint reachability separately for Binance and Deribit.

---

# 22. Local Cache

Phase 1:

- `localStorage` for simple user settings.
- IndexedDB for optional warm cache of:
  - recent Binance candles.
  - latest valid Deribit snapshot.
  - latest calculated levels.

Every cache entry uses a versioned envelope:

```text
cacheSchemaVersion
createdAt
source
payload
```

When `cacheSchemaVersion` changes:

- migrate deterministically if a migration exists.
- otherwise discard the incompatible cache.
- never reinterpret an old schema as the new schema.

The exchange remains authoritative.

Cache exists for:

- quicker startup.
- graceful temporary outages.
- debugging.

Never treat local cache as more authoritative than a fresh valid exchange response.

Add a storage adapter:

```text
SnapshotRepository
  getLatest()
  save(snapshot)
  prune()
```

This allows a later switch from IndexedDB to a remote database without changing the engine.

---

# 23. Historical Options Data

Historical GEX storage is explicitly out of scope for v1.

Design the interface now.

Possible future implementation:

```text
Local IndexedDB
or
free-tier remote database
```

Store snapshots in normalized, versioned form.

Never store only the final Gamma Flip.

Store enough source inputs to reproduce it.

Suggested snapshot metadata:

```text
timestamp
calculationVersion
gexModelVersion
profileVersion
underlying
expiryScope
instrumentCount
sourceSnapshotHash
```

---

# 24. Vercel Architecture

Vercel hosts the web application.

Do not rely on Vercel Functions as a permanent market-data daemon.

Primary live path:

```text
Binance WebSocket ------\
                         -> Browser -> adapters -> engine -> chart
Deribit WebSocket ------/
```

Vercel serves:

- application bundle.
- authentication routes.
- optional small REST proxy endpoints if browser CORS or reliability requires them.
- static documentation.
- lightweight health/config endpoints.

Vercel Functions have finite execution duration.

The browser should connect directly to public exchange WebSockets.

The initial zero-cost deployment assumes personal, non-commercial use under the Vercel Hobby plan. If the dashboard is later monetized or used in a commercial product, re-evaluate the hosting plan and terms before deployment.

## 24.1 Private access

A hidden URL is not authentication.

Use application-level authentication.

Allow only the intended account.

Important Vercel note:

Vercel Hobby deployment protection does not provide full protection of the production custom domain in the same way as higher paid tiers.

Therefore production privacy should not rely solely on the Vercel deployment URL being hard to guess.

---


# 24.1 Product UI and Chart Design Specification

The dashboard must be intentionally chart-first.

The visual reference points are TanukiTrade and MenthorQ, especially their practice of attaching options-derived levels directly to the price chart.

Do not copy their proprietary visual design.

Borrow the interaction principle:

```text
price first
structure attached directly to price
minimal permanent chrome
progressive disclosure for secondary information
```

## 24.1.1 Main desktop layout

Default desktop composition:

```text
┌──────────────────────────────────────────────────────────────┐
│ BTCUSDT   price/change   timeframe   expiry scope   health  │
├──────────────────────────────────────────────────────────────┤
│ drawing tools │                                              │
│               │                                              │
│               │            CANDLE CHART                      │
│               │                                              │
│               │                                LEVEL RAIL    │
│               │                                              │
├──────────────────────────────────────────────────────────────┤
│ VOLUME                                                       │
└──────────────────────────────────────────────────────────────┘
```

Optional collapsible surfaces:

```text
Gamma profile
Level details
Data diagnostics
Chart settings
```

No permanent large dashboard cards above the chart.

No permanent multi-column analytics grid in v1.

The primary screen must feel like a trading chart, not a business dashboard.

## 24.1.2 Top command bar

Keep one compact top bar.

Required controls:

```text
BTCUSDT
live price
session/24h change
timeframe
expiry scope
Gamma regime
feed health
settings
```

Timeframes:

```text
1m  5m  15m  1h  4h  1d  1w
```

Expiry control opens:

```text
0DTE
Next Expiry
This Friday
Next Friday
<= 7 DTE
<= 30 DTE
All Expiries
Custom Expiry
```

Do not use a second permanent toolbar for expiry.

## 24.1.3 Left drawing toolbar

Keep the launch toolbar small.

Required:

```text
Pointer/Crosshair
Horizontal Line
Vertical Line
Delete selected drawing
Clear drawings
```

Do not imitate a full TradingView drawing palette in v1.

## 24.1.4 Level Rail

This is a signature v1 feature.

Every primary options level is attached to its exact y-axis price.

Instead of displaying a bare horizontal line, display:

```text
[LEVEL NAME]  [PRICE]
```

Examples:

```text
CALL WALL   118,000
GEX 1       115,500
GAMMA FLIP  111,820
MAX PAIN    110,000
PUT WALL    105,000
```

The label should sit near the right price axis, inside a dedicated `Level Rail`, while the horizontal line extends left into the candles.

This improves on a simple centered label because:

- the price and label are read together.
- labels remain aligned with the price scale.
- candle space stays clean.
- users do not need to trace a line to the price-axis tick.
- levels remain readable when the chart is zoomed.

## 24.1.5 Level label information hierarchy

Default compact tag:

```text
CALL WALL  118,000
```

Optional expanded hover/focus state:

```text
CALL WALL
118,000
Strength: 27.4%
Scope: <=30 DTE
OI: 8,240 BTC
Updated: 1.4s ago
```

Do not permanently show all metadata.

Use progressive disclosure.

## 24.1.6 Primary vs secondary levels

Primary levels:

```text
Call Wall
Put Wall
Gamma Flip
Selected-expiry Max Pain
```

These receive:

- stronger line prominence.
- full text labels.
- higher z-order.

Secondary levels:

```text
GEX 1
GEX 2
GEX 3
```

These receive:

- lighter lines.
- compact labels.
- lower z-order.

The user can hide secondary levels.

## 24.1.7 Level importance

Every level output should include normalized display strength:

```text
0.0 to 1.0
```

The UI may map that to restrained visual emphasis.

Do not make display strength alter the calculated price.

For GEX concentrations:

```text
displayStrength =
abs(levelExposure) / abs(largestEligibleExposure)
```

Primary semantic levels remain visually important regardless of this ratio.

## 24.1.8 Label collision handling

Several levels may sit within a few dollars of each other.

Do not allow overlapping unreadable tags.

Collision algorithm:

1. Place each label at its true y-coordinate.
2. Detect tag bounding-box overlap.
3. Keep the highest-priority label at the true coordinate.
4. Shift lower-priority tags by the minimum vertical offset required.
5. Draw a thin leader connector from shifted tag to the true price coordinate.
6. Never alter the horizontal level itself.
7. Restore the tag to its true coordinate when collision disappears.

Priority:

```text
Gamma Flip
Call Wall / Put Wall
Max Pain
GEX 1
GEX 2
GEX 3
user drawings
```

User drawing labels should never be mistaken for calculated options levels.

## 24.1.9 Current-price interaction

The current-price marker must remain visually distinct from Gamma labels.

When price sits directly on a level:

- do not hide the calculated level.
- stack current price and the options tag cleanly.
- keep exact prices visible.
- use a connector if required.

## 24.1.10 Gamma regime background

When a valid Gamma Flip exists:

```text
above/below the flip
```

may receive subtle regime shading according to the active modeled Gamma regime.

Rules:

- low opacity.
- no saturated full-screen fill.
- candles remain dominant.
- grid remains readable.
- drawing lines remain readable.
- user can disable shading.
- invalid/no-crossing state disables regime shading rather than guessing.

## 24.1.11 Gamma profile

Provide a collapsible Gamma-by-price profile aligned to the chart's vertical price scale.

Concept:

```text
main candles | gamma profile | price/level rail
```

or:

```text
gamma profile | main candles | price/level rail
```

Choose the side during the walking-skeleton UI test based on readability.

The profile must:

- aggregate modeled GEX by strike/price.
- use the same active expiry scope.
- show the zero line.
- visually distinguish positive and negative modeled exposure.
- highlight the strongest concentrations.
- stay synchronized during vertical zoom/scale changes.
- be collapsible in one action.

Do not let the profile reduce the candle chart below the minimum usable width.

## 24.1.12 Tanuki-inspired improvements

TanukiTrade demonstrates useful concepts such as:

- level labels attached to the chart.
- compact level settings.
- gamma classification.
- relative-size filtering to reduce noise.
- left-side exposure profiles.

Our improvements:

1. Put exact price inside every primary level tag by default.
2. Use one consistent right-side Level Rail.
3. Add collision avoidance.
4. Keep primary and secondary level hierarchy explicit.
5. Expose exact provenance on hover rather than cluttering the chart.
6. Keep expiry scope visible in the top bar.
7. Keep stale/fallback states visible on each affected level.
8. Synchronize the collapsible Gamma profile to the same price scale.
9. Separate user drawings from calculated levels.
10. Keep the chart usable even when all optional panels are closed.

TanukiTrade currently presents multiple Gamma/OI/volume level families and offers relative-size filtering. That reinforces the need for filtering and hierarchy, but v1 should remain simpler.

## 24.1.13 MenthorQ-inspired improvements

MenthorQ demonstrates:

- primary structural levels.
- ranked secondary GEX levels.
- per-level visibility controls.
- labels directly on horizontal chart lines.

Our improvements:

1. Keep only 3 secondary GEX levels by default rather than 10.
2. Put exact price in each label.
3. Pin labels to the Level Rail rather than floating in candle space.
4. Use the same label component for all calculated levels.
5. Add source age and calculation status on hover.
6. Keep modeled terminology explicit.

## 24.1.14 Noise filter

Add a display-only significance filter.

Default:

```text
show primary semantic levels always
show top 3 secondary GEX levels
```

Optional advanced control later:

```text
minimum relative exposure %
```

This filter changes what is drawn, not what is calculated.

The full calculation remains available for audit.

## 24.1.15 Visual state semantics

Every calculated level has one state:

```text
LIVE
FALLBACK
STALE
INVALID
```

The level tag must convey state without relying only on color.

Examples:

```text
CALL WALL 118,000
CALL WALL 118,000 · FALLBACK
CALL WALL 118,000 · STALE
GAMMA FLIP · NO VALID CROSSING
```

## 24.1.16 Design acceptance tests

The UI milestone does not pass until:

- primary tags remain readable at 1366x768.
- primary tags remain readable at 1920x1080.
- level labels do not overlap after collision resolution.
- price marker remains readable beside a nearby options level.
- zoom does not detach a tag from its price.
- pan does not shift horizontal options levels.
- timeframe changes preserve drawings where semantically appropriate.
- expiry changes update options levels without recreating the chart.
- hiding the Gamma profile expands the candle area.
- Gamma profile y-scale remains aligned when visible.
- stale state appears on the affected level.
- the chart remains usable with all optional panels collapsed.

## 24.1.17 Design principle

If a proposed feature requires a permanent card that reduces the chart without materially improving execution context, move it into:

```text
hover
popover
drawer
collapsible panel
```

The candle chart remains the dominant surface.


# 25. Repository Structure

Recommended monorepo structure:

```text
options-chart/
  apps/
    web/
      app/
      components/
        chart/
          LevelRail/
          LevelTag/
          GammaProfile/
          DrawingToolbar/
        dashboard/
        health/
        metrics/
        controls/
      hooks/
      workers/
      styles/
      public/

  packages/
    domain/
      src/
        candle.ts
        options.ts
        metrics.ts
        health.ts

    market-data/
      src/
        binance/
          schemas.ts
          normalizers.ts
          rest-client.ts
          ws-client.ts
          candle-reconciler.ts
          health.ts
        deribit/
          schemas.ts
          normalizers.ts
          rest-client.ts
          ws-client.ts
          subscriptions.ts
          snapshot-builder.ts
          health.ts
        common/
          reconnect.ts
          backoff.ts
          clock.ts
          errors.ts

    options-engine/
      src/
        black-scholes/
        exposure/
        profile/
        levels/
        max-pain/
        expiry/
        iv/
        validation/
        version.ts

    chart/
      src/
        chart-adapter.ts
        level-model.ts
        formatting.ts
        lightweight/
          lightweight-chart-adapter.ts
          primitives/
        kline/
          kline-chart-adapter.ts   # post-v0 unless primary chart fails

    worker-protocol/
      src/
        messages.ts
        versions.ts

    shared/
      src/
        constants/
        logger/
        result/
        time/

  tools/
    reference-python/
      black_scholes.py
      gamma_reference.py
      max_pain_reference.py

    capture-fixtures/
      capture-binance.ts
      capture-deribit.ts
      # Node-targeted capture tools use an explicit Node WebSocket implementation
      # rather than assuming the browser WebSocket global.

  tests/
    fixtures/
      binance/
      deribit/
    integration/
    regression/
    performance/
    e2e/

  docs/
    research/
    decisions/

  .github/
    workflows/

  PROJECT_PLAN.md
  PROGRESS.md
  AGENTS.md
  README.md
  package.json
  package-lock.json
  tsconfig.json
```

---

# 26. File and Module Rules

Use these rules to prevent giant files.

1. One module owns one clear responsibility.
2. Prefer source files under roughly 250 lines.
3. A file over 400 lines requires a reason or refactor review.
4. Avoid files over 600 lines.
5. UI components should stay focused.
6. Pure math functions should be small and composable.
7. Network schemas stay beside their venue adapter.
8. Shared domain models do not import exchange clients.
9. Chart packages do not import Deribit or Binance clients.
10. Options engine does not import React.
11. Venue clients do not import chart code.
12. Worker protocol must be typed and versioned.
13. No `any` for normalized market data.
14. Avoid giant `utils.ts` files.
15. Name files after the responsibility they own.

These are maintainability guides, not arbitrary line-count laws.

---

# 27. Error Model

Do not reduce every problem to:

```text
Error: failed
```

Create typed error categories.

Example:

```text
TransportError
TimeoutError
RateLimitError
SchemaValidationError
NormalizationError
StaleDataError
ReconciliationError
CalculationError
ChartError
WorkerError
```

Each error records:

```text
source
operation
timestamp
retryable
context
cause
```

Do not log secrets.

There should be no private exchange secrets in v1.

---

# 28. Reconnection Pattern

Borrow the proven adapter pattern used in mature trading systems.

For each WebSocket:

1. Connect.
2. Confirm open.
3. Establish heartbeat.
4. Subscribe.
5. Record confirmed subscription state.
6. Process messages.
7. Detect stale state.
8. On failure, close cleanly.
9. Reconnect using exponential backoff + jitter.
10. Replay intended subscriptions.
11. Fetch authoritative snapshot if a gap is possible.
12. Reconcile.
13. Mark LIVE only after recovery is complete.

Never treat "socket connected" as equal to "data healthy".

Reference architecture:
https://github.com/nautechsystems/nautilus_trader

---

# 29. Logging

Use structured logs.

Example:

```json
{
  "level": "warn",
  "event": "binance_ws_reconnect",
  "attempt": 3,
  "lastMessageAgeMs": 12200,
  "timestamp": "..."
}
```

Core event categories:

```text
feed.connect
feed.disconnect
feed.reconnect
feed.stale
feed.recovered
schema.reject
candle.mismatch
candle.repaired
snapshot.loaded
snapshot.rejected
calculation.started
calculation.completed
calculation.failed
worker.stale_result_dropped
chart.error
```

Browser logging should be bounded.

Avoid building an unbounded in-memory log array.

---


# 29.1 Production Diagnostics Bundle

The v0 production app must provide an `Export diagnostics` action.

The exported JSON must contain only non-secret operational data:

- app version.
- calculation versions.
- browser user agent.
- current feed states.
- endpoint reachability results.
- clock offsets.
- last valid message timestamps.
- last reconciliation timestamps.
- recent bounded structured errors.
- active expiry scope.
- contract included/excluded counts.
- latest calculation durations.
- chart adapter name/version.
- worker status.

Do not include authentication tokens, cookies, or private credentials.

Diagnostics bundle limits:

```text
maximum serialized size: 256 KB
maximum recent structured errors: 100
```

If the bundle would exceed 256 KB, truncate oldest diagnostic events first and record:

```text
diagnosticsTruncated = true
```

This provides zero-cost debugging for production-only failures without requiring an external logging service.


# 30. Testing Strategy

## 30.1 Unit tests

Vitest:
https://github.com/vitest-dev/vitest

Test:

- normal distribution helpers.
- d1/d2.
- gamma.
- DTE.
- gross exposure.
- signed exposure.
- strike aggregation.
- expiry aggregation.
- zero crossing.
- gamma flip.
- call wall.
- put wall.
- Max Pain.
- IV aggregation.
- normalizers.
- reconnection backoff.
- stale detection.
- candle reconciliation.

## 30.2 Schema fixture tests

Save real sanitized public payload fixtures.

Example:

```text
tests/fixtures/binance/kline-open.json
tests/fixtures/binance/kline-closed.json
tests/fixtures/deribit/book-summary-btc-options.json
tests/fixtures/deribit/markprice-options-btc-usd.json
tests/fixtures/deribit/index-btc-usd.json
```

Tests must fail when external schemas change in an incompatible way.

## 30.3 Regression tests

Capture known Deribit snapshots.

For each fixture, store expected outputs:

```text
contract count
expiry count
total OI
selected expiry Max Pain
Call Wall
Put Wall
Gamma Flip
top GEX levels
```

When unrelated code changes move these values, CI should fail.

## 30.4 Deribit Greek reconciliation

Select a sample of liquid options.

Calculate gamma independently using:

- Deribit underlying.
- Deribit mark IV.
- Deribit interest rate.
- exact time to expiry.

Compare to Deribit-published gamma.

Initial acceptance targets to calibrate:

```text
median relative error <= 0.5%
95th percentile relative error <= 2%
```

Investigate outliers.

Do not relax tolerances without documenting why.

## 30.5 Candle comparison tests

For closed candles:

```text
our normalized OHLC
==
Binance REST OHLC
```

Also manually compare sample bars with TradingView BINANCE:BTCUSDT.

## 30.6 Browser tests

Playwright:
https://github.com/microsoft/playwright

Test:

- chart mounts once.
- timeframe switch.
- reconnect simulation.
- stale badge.
- fallback badge.
- chart preserves zoom during normal live updates.
- price lines appear.
- level removal.
- expiry switch.
- worker response ordering.
- no crash on malformed exchange response.

## 30.7 Soak test

8-hour local/browser test.

Automate telemetry capture.

Fail the milestone if performance degrades over time.

---

# 31. CI Pipeline

Every pull request must run:

```text
install
lint
typecheck
unit tests
schema fixture tests
regression tests
TypeScript <-> Python reference comparisons
production build
selected Playwright smoke tests
PROGRESS.md policy check
```

CI tests must not depend on live Binance or Deribit network access.

Use committed public-data fixtures for deterministic CI.

Live-exchange verification belongs in explicit local/manual or scheduled diagnostic runs, never as a required pull-request gate.

Main branch should deploy only after green CI.

Add a pull-request template requiring:

- task ID.
- test evidence.
- PROGRESS.md update.
- formula-impact declaration.
- data-contract-impact declaration.

Add a CI policy check so code changes under `apps/`, `packages/`, or `tools/` fail when PROGRESS.md was not changed, unless the PR is explicitly labeled/documented as a non-project-code maintenance change.

Recommended GitHub Actions jobs:

```text
quality
unit
regression
e2e-smoke
build
```

Use dependency caching.

---

# 32. Agent Operating Contract

This project will be worked on using Antigravity and ChatGPT/Codex.

Every agent must follow this sequence.

## Before changing code

1. Read PROJECT_PLAN.md.
2. Read PROGRESS.md.
3. Read the task ID.
4. Inspect current code.
5. Inspect current package versions and typings.
6. Check existing tests.
7. State the intended files to change.
8. Do not change unrelated modules.

## While changing code

1. Keep changes scoped.
2. Add or update tests with the implementation.
3. Preserve public interfaces unless the task explicitly changes them.
4. Do not silently change formulas.
5. Do not silently change data-source meaning.
6. Do not disable failing tests to get green CI.
7. Do not hide errors with empty catch blocks.
8. Do not use mocks where a deterministic fixture is more appropriate.
9. Do not introduce a paid dependency.
10. Do not introduce private exchange credentials.

## Before declaring completion

Run:

```text
lint
typecheck
unit tests
relevant regression tests
production build
relevant browser tests
```

Then update PROGRESS.md with:

- task ID.
- status.
- files changed.
- tests run.
- test result.
- commit SHA if committed.
- issues found.
- next task.
- any architecture decision made.

No task is "done" until PROGRESS.md is updated.

---


# 32.1 Parallel-Agent Progress Strategy

`PROGRESS.md` is the human-readable project summary.

To avoid merge conflicts between Codex and Antigravity, agents do not directly compete over the same root progress file during implementation.

Source-of-truth task journals:

```text
docs/progress/
  M0/
    M0.5.1.md
  M1/
    M1.1.md
    M1.2.md
  ...
```

Each task owner updates only its own task journal.

At the branch-final commit:

```text
npm run progress:build
```

regenerates the task-status portions of `PROGRESS.md` deterministically.

Rules:

1. One task journal per task ID.
2. One active owner per task ID.
3. Task journals are append-oriented.
4. Agents never edit another active task's journal.
5. `PROGRESS.md` generated sections are not hand-edited.
6. Architecture decisions and product questions remain in clearly marked manual sections.
7. CI runs `npm run progress:check` and fails if generated PROGRESS.md differs from committed output.
8. Every completed or paused task still produces an updated root PROGRESS.md in its branch-final commit.

This preserves the user's single progress file while reducing parallel merge conflicts.


# 33. Git Workflow

Recommended:

```text
main
```

is protected conceptually as production-ready.

Feature branches:

```text
m0/architecture
m1/binance-candles
m2/deribit-data
m3/options-engine
m4/validation
m5-chart
m6-gamma-dashboard
m7-reliability
m8-vercel
```

Agent branches, when agents work in parallel:

```text
agent/codex/<task-id>
agent/antigravity/<task-id>
```

One task should have one owner at a time unless explicitly split by files.

Avoid two agents editing the same files simultaneously.

Use small commits.

Commit examples:

```text
M1.2 add Binance kline normalizer
M1.3 add candle reconciliation tests
M3.4 implement gamma profile zero crossing
```

---

# 34. Milestone Roadmap

# Milestone 0: Architecture Lock

Goal:
Freeze the initial technical and mathematical contracts before production implementation.

Tasks:

- [ ] M0.1 Create repository or confirm target repository.
- [ ] M0.2 Add PROJECT_PLAN.md.
- [ ] M0.3 Add PROGRESS.md.
- [ ] M0.4 Add AGENTS.md from the operating contract.
- [ ] M0.5 Scaffold npm workspace.
- [ ] M0.6 Configure TypeScript strict mode.
- [ ] M0.7 Configure linting.
- [ ] M0.8 Configure Vitest.
- [ ] M0.9 Configure Playwright.
- [ ] M0.10 Configure GitHub Actions.
- [ ] M0.11 Define canonical domain types.
- [ ] M0.12 Define error taxonomy.
- [ ] M0.13 Define calculation versions.
- [ ] M0.14 Record unresolved mathematical assumptions.
- [ ] M0.15 Record chart adapter interface.
- [ ] M0.16 Install/check Lightweight Charts agent skill for Codex if desired.
- [ ] M0.17 Establish baseline performance telemetry.
- [ ] M0.18 Create `docs/decisions/ADR-000-index.md`.
- [ ] M0.19 Create `docs/decisions/ADR-template.md`.
- [ ] M0.20 Register ADR-001 through current proposed ADRs.
- [ ] M0.21 Create progress journal generator/checker.


Exit criteria:

- Repository builds.
- CI runs.
- No production features yet.
- Architecture compiles.
- Open decisions are explicitly recorded.

---


# Milestone 0.5: Walking Skeleton

Goal:
Prove the complete deployment path before investing in deep implementation.

Tasks:

- [ ] M0.5.1 Create one plain Next.js client page.
- [ ] M0.5.2 Fetch a small Binance REST candle history.
- [ ] M0.5.3 Validate and normalize the candle payload.
- [ ] M0.5.4 Render candles through ChartAdapter and Lightweight Charts.
- [ ] M0.5.5 Create a stubbed Deribit options snapshot fixture.
- [ ] M0.5.6 Send the stub snapshot through the Web Worker.
- [ ] M0.5.7 Return one deterministic computed metric.
- [ ] M0.5.8 Display the metric as plain text.
- [ ] M0.5.9 Add minimal application authentication.
- [ ] M0.5.10 Deploy a Vercel preview.
- [ ] M0.5.11 Benchmark chart update path.
- [ ] M0.5.12 Benchmark validation of a representative consolidated Deribit batch.
- [ ] M0.5.13 Record benchmark results and architecture changes in PROGRESS.md.

Exit criteria:

- Browser, worker, chart, auth, and Vercel preview work together.
- No architectural blocker remains hidden behind later milestones.
- Hot-path validation strategy is chosen from measured results.

---

# Milestone 1: Binance Candle Engine

Goal:
Prove candle consistency and chart-independent price data.

Tasks:

- [ ] M1.1 Build Binance REST client.
- [ ] M1.2 Build Binance Kline schemas.
- [ ] M1.3 Build Binance normalizer.
- [ ] M1.4 Load historical BTCUSDT candles with <=1,000-bar pagination.
- [ ] M1.4A Add deterministic startTime pagination for 2,000+ bars.
- [ ] M1.4B Add bootstrap deduplication and contiguity verification.
- [ ] M1.4C Add partial-bootstrap recovery and degraded-state handling.
- [ ] M1.5 Build Kline WebSocket client.
- [ ] M1.6 Implement reconnect/backoff.
- [ ] M1.7 Implement planned reconnect before 24-hour limit.
- [ ] M1.8 Implement candle deduplication.
- [ ] M1.9 Implement candle gap repair.
- [ ] M1.10 Implement closed-bar REST reconciliation.
- [ ] M1.11 Add Binance feed health.
- [ ] M1.12 Add fixtures.
- [ ] M1.13 Add candle regression tests.
- [ ] M1.14 Add Binance server-time synchronization.
- [ ] M1.15 Add `data-api.binance.vision` REST fallback.
- [ ] M1.16 Add `data-stream.binance.vision` WS fallback.
- [ ] M1.17 Add endpoint reachability diagnostics.
- [ ] M1.18 Add visibilitychange sleep/wake reconciliation.

Exit criteria:

- Exact match against Binance REST for tested closed candles.
- Continuous live updates.
- Reconnect recovers missing candles.
- No duplicate bars.
- No chart code required to pass this milestone.

---

# Milestone 2: Deribit Options Data Engine

Goal:
Build a reliable normalized BTC options chain.

Tasks:

- [ ] M2.1 Build Deribit JSON-RPC client.
- [ ] M2.2 Build instrument schemas.
- [ ] M2.3 Build book-summary schemas.
- [ ] M2.4 Build markprice options schemas.
- [ ] M2.5 Build index-price schemas.
- [ ] M2.6 Build normalizers.
- [ ] M2.7 Build initial instrument catalog.
- [ ] M2.8 Build full BTC options snapshot.
- [ ] M2.9 Subscribe to markprice.options.btc_usd.
- [ ] M2.10 Subscribe to deribit_price_index.btc_usd.
- [ ] M2.11 Enable heartbeat.
- [ ] M2.12 Handle test_request.
- [ ] M2.13 Implement reconnect/backoff.
- [ ] M2.14 Replay subscriptions.
- [ ] M2.15 Refresh OI snapshot every configured interval.
- [ ] M2.16 Implement stale detection.
- [ ] M2.17 Add cached last-valid snapshot.
- [ ] M2.18 Add fixtures and malformed-message tests.
- [ ] M2.19 Add Deribit `public/get_time` synchronization.
- [ ] M2.20 Add hourly instrument-catalog refresh.
- [ ] M2.21 Trigger catalog refresh when a valid stream item references an unknown instrument.
- [ ] M2.22 Add visibilitychange resume reconciliation.

Exit criteria:

- Complete active BTC option universe normalized.
- OI available.
- IV available.
- live Deribit index available.
- stale state is detectable.
- reconnect recovers automatically.

---

# Milestone 3: Options Mathematics Engine

Goal:
Calculate metrics without UI.

Tasks:

- [ ] M3.1 Implement normal CDF/PDF.
- [ ] M3.2 Implement d1/d2.
- [ ] M3.3 Implement Black-Scholes gamma.
- [ ] M3.4 Implement exact DTE.
- [ ] M3.5 Implement gross gamma concentration.
- [ ] M3.6 Implement modeled signed GEX.
- [ ] M3.7 Aggregate by strike.
- [ ] M3.8 Aggregate by expiry.
- [ ] M3.9 Implement spot-grid generator.
- [ ] M3.10 Implement gamma profile.
- [ ] M3.11 Implement zero-crossing interpolation.
- [ ] M3.12 Implement modeled Gamma Flip.
- [ ] M3.13 Implement raw Call Wall.
- [ ] M3.14 Implement raw Put Wall.
- [ ] M3.15 Implement secondary GEX ranking.
- [ ] M3.16 Implement expiry-specific Max Pain.
- [ ] M3.17 Implement total OI.
- [ ] M3.18 Implement put/call OI.
- [ ] M3.19 Implement OI-weighted average IV.
- [ ] M3.19A Implement null-safe Put/Call OI ratio.
- [ ] M3.19B Implement excludedCountByReason metadata.
- [ ] M3.19C Preserve all qualifying Gamma Flip crossings in calculation metadata.
- [ ] M3.20 Add engine metadata/version output.
- [ ] M3.21 Build Web Worker protocol.
- [ ] M3.22 Move profile calculations into worker.

Exit criteria:

- Pure engine.
- Deterministic outputs for saved snapshots.
- No UI imports.
- No network imports.
- Full unit test coverage of critical formulas.

---

# Milestone 4: Independent Validation

Goal:
Earn confidence in the math before displaying it as production data.

Tasks:

- [ ] M4.1 Build Python reference Black-Scholes implementation.
- [ ] M4.2 Build Python reference gamma.
- [ ] M4.3 Build Python reference Max Pain.
- [x] M4.4 Capture real Deribit fixtures.
- [ ] M4.5 Compare TypeScript gamma to Python.
- [x] M4.6 Reverse-engineer and document Deribit's Greek conventions: IV unit, rate unit, exact expiry clock, time basis/year convention, underlying input, and rounding behavior.
- [ ] M4.7 Set reconciliation tolerances only after M4.6.
- [x] M4.8 Compare TypeScript gamma to Deribit-published gamma.
- [ ] M4.9 Investigate tolerance failures.
- [ ] M4.10 Automate TypeScript <-> Python reference comparisons in CI.
- [x] M4.11 Create known-output regression snapshots.
- [ ] M4.12 Test near-expiry edge cases.
- [ ] M4.13 Test zero-DTE handling.
- [ ] M4.14 Test deep ITM/OTM options.
- [ ] M4.15 Test extreme IV.
- [ ] M4.16 Test missing IV and verify metric-specific exclusion behavior.
- [ ] M4.17 Test Deribit IV unit normalization, for example `80 -> 0.80`.
- [ ] M4.18 Test zero OI.
- [ ] M4.19 Test duplicate contract input.
- [ ] M4.20 Test gamma profile with no zero crossing.
- [ ] M4.21 Test 0.25%, 0.50%, and 1.00% crossing-significance thresholds.
- [ ] M4.22 Test multi-crossing Gamma Flip selection and tie-break rule.
- [ ] M4.23 Test multi-expiry time-drift behavior with market inputs held constant.
- [ ] M4.24 Sensitivity-test 15-minute profile time floor.
- [ ] M4.25 Sensitivity-test wall guardrails.
- [ ] M4.26 Document validated assumptions.

Initial reconciliation tolerances are intentionally NOT frozen until M4.6 is complete.

Exit criteria:

- Deribit Greek conventions are documented.
- Gamma reconciliation is within the tolerance justified by M4.6.
- Regression fixtures are frozen.
- TypeScript <-> Python comparisons run in CI.
- Known edge cases fail safely.
- Mathematical assumptions are explicit.

DO NOT proceed to trading-readiness status if this milestone is incomplete.

---

# Milestone 5: Chart Engine

Goal:
Build a fast, stable BTC chart before adding options overlays.

Tasks:

- [ ] M5.1 Install Lightweight Charts.
- [ ] M5.2 Implement ChartAdapter.
- [ ] M5.3 Implement LightweightChartsAdapter.
- [ ] M5.4 Render 2,000 historical candles.
- [ ] M5.5 Incrementally update active candle.
- [ ] M5.6 Preserve zoom during normal live updates.
- [ ] M5.7 Preserve visible time range across repair-triggered `setData()`.
- [ ] M5.8 Add Playwright test: gap repair while zoomed preserves viewport.
- [ ] M5.9 Add resize handling.
- [ ] M5.10 Add crosshair.
- [ ] M5.11 Add timeframe selector: 1m, 5m, 15m, 1h, 4h, 1d, 1w.
- [ ] M5.12 Add required Binance Spot volume pane.
- [ ] M5.13 Add horizontal-line drawing tool.
- [ ] M5.14 Add vertical-line drawing tool.
- [ ] M5.15 Preserve user drawings across normal candle updates and reconnect reconciliation.
- [ ] M5.16 Verify Binance 1w candles directly against Binance weekly klines.
- [ ] M5.17 Add chart health diagnostics.
- [ ] M5.18 Test rapid timeframe switching.
- [ ] M5.19 Test reconnect while zoomed.
- [ ] M5.20 Run 8-hour soak test.
- [ ] M5.21 Benchmark optional data conflation; keep disabled unless evidence supports enabling it.
- [ ] M5.22 Build compact top command bar.
- [ ] M5.23 Build minimal left drawing toolbar.
- [ ] M5.24 Verify chart-first layout at 1366x768 and 1920x1080.

Post-v0 fallback tasks:

- [ ] M5.F1 Implement minimal KLineChartAdapter proof.
- [ ] M5.F2 Verify the same canonical Candle[] renders in KLineChart.
- [ ] M5.F3 Add permanent CI smoke render for KLineChart.

Exit criteria:

- No progressive lag.
- No repeated chart recreation.
- No visible chart reset on normal candle updates.
- Repair-triggered history replacement preserves the user's viewport.
- Candles match Binance.
- Fallback interface remains intact even if fallback implementation is deferred.

---

# Milestone 6: Gamma Overlay Dashboard

Goal:
Put validated options levels on the stable BTC chart.

Tasks:

- [ ] M6.1 Add Call Wall price line.
- [ ] M6.2 Add Put Wall price line.
- [ ] M6.3 Add Gamma Flip price line.
- [ ] M6.4 Add selected-expiry Max Pain.
- [ ] M6.5 Add top secondary GEX levels.
- [ ] M6.6 Add positive/negative modeled gamma zone visualization.
- [ ] M6.7 Add expiry presets: 0DTE, Next Expiry, This Friday, Next Friday, <=7 DTE, <=30 DTE, All Expiries, Custom Expiry.
- [ ] M6.8 Add DTE.
- [ ] M6.9 Add Total OI.
- [ ] M6.10 Add Put/Call OI.
- [ ] M6.11 Add Average IV.
- [ ] M6.12 Add Total Modeled GEX.
- [ ] M6.13 Add feed freshness indicators.
- [ ] M6.14 Add calculation audit popover.
- [ ] M6.15 Add source timestamps.
- [ ] M6.16 Add engine/model version.
- [ ] M6.17 Add show/hide overlays.
- [ ] M6.18 Build right-side Level Rail.
- [ ] M6.19 Build compact LevelTag with name + exact price.
- [ ] M6.20 Add LevelTag hover audit metadata.
- [ ] M6.21 Implement label collision avoidance and leader connectors.
- [ ] M6.22 Keep current-price label distinct during collisions.
- [ ] M6.23 Add compact collapsible Gamma profile.
- [ ] M6.24 Synchronize Gamma profile vertical scale with chart.
- [ ] M6.25 Add display-only secondary-level filtering.
- [ ] M6.26 Add LIVE/FALLBACK/STALE/INVALID semantics to level tags.
- [ ] M6.27 Add responsive chart-first layout acceptance tests.
- [ ] M6.28 Verify expiry change updates levels without chart recreation.

Exit criteria:

- Every line has provenance.
- Every line follows active expiry scope.
- Max Pain never appears as an unlabeled all-expiry number.
- stale levels are visually distinguishable from live levels.

---

# Milestone 7: Reliability and Failure Injection

Goal:
Prove the system behaves correctly when dependencies fail.

Tasks:

- [ ] M7.1 Force Binance WS disconnect.
- [ ] M7.2 Force Binance REST failure.
- [ ] M7.3 Force Deribit WS disconnect.
- [ ] M7.4 Force Deribit REST failure.
- [ ] M7.5 Inject malformed Binance payload.
- [ ] M7.6 Inject malformed Deribit payload.
- [ ] M7.7 Delay market messages.
- [ ] M7.8 Duplicate messages.
- [ ] M7.9 Reorder messages.
- [ ] M7.10 Drop candle messages.
- [ ] M7.11 Drop option updates.
- [ ] M7.12 Kill Web Worker.
- [ ] M7.13 Force stale worker result.
- [ ] M7.14 Simulate device sleep/wake.
- [ ] M7.15 Simulate offline/online browser events.
- [ ] M7.16 Verify all health-state transitions.
- [ ] M7.17 Verify no stale metric is labeled LIVE.
- [ ] M7.18 Run extended soak test.

Exit criteria:

- Recovery is automatic where safe.
- fallback is visible.
- stale states are visible.
- no silent incorrect data.

---

# Milestone 8: Vercel Production Deployment

Goal:
Deploy the read-only terminal privately.

Tasks:

- [ ] M8.1 Create Vercel project.
- [ ] M8.2 Connect GitHub repository.
- [ ] M8.3 Configure environment variables.
- [ ] M8.4 Add application login.
- [ ] M8.5 Restrict access to intended account.
- [ ] M8.6 Verify public exchange calls from production browser.
- [ ] M8.7 Add optional REST proxy only if required.
- [ ] M8.8 Configure production error handling.
- [ ] M8.9 Verify production build.
- [ ] M8.10 Verify preview deployment.
- [ ] M8.11 Verify production deployment.
- [ ] M8.12 Run Playwright smoke test against production.
- [ ] M8.13 Verify mobile behavior if mobile is in scope.
- [ ] M8.14 Verify no secret market-data key exists.
- [ ] M8.15 Verify production access from each expected usage region/network.
- [ ] M8.16 Protect every application API/proxy route with the same authentication policy as pages.
- [ ] M8.17 Add and test production CSP:
  - `connect-src` allowlist for required HTTPS/WSS exchange endpoints.
  - `worker-src 'self' blob:` where required by the selected worker bundling path.
  - Next.js-compatible `script-src` nonce/hash strategy.
  - explicit Playwright test that the calculation worker starts under production CSP.
- [ ] M8.18 Verify primary and market-data-only Binance endpoints from production.
- [ ] M8.19 Add/export production diagnostics bundle.

Exit criteria:

- Private login works.
- Dashboard loads from Vercel.
- live Binance candles work.
- Deribit metrics work.
- fallbacks work.
- no recurring infrastructure bill.

---

# Milestone 9: Trading-Readiness Validation

Goal:
Validate the analytics terminal over live market sessions before treating the levels as dependable inputs.

Tasks:

- [ ] M9.1 Run daily comparisons for at least multiple expiries.
- [ ] M9.2 Save daily audit snapshots.
- [ ] M9.3 Compare against external references only when methodology is sufficiently comparable.
  - Raw OI/gross-gamma concentration may be compared when strike, expiry, and unit definitions align.
  - Signed Total GEX and Gamma Flip are pass/fail comparable only when the external sign convention and profile assumptions are documented and materially equivalent.
  - Vendor dashboards using unknown or dealer-position-informed sign assumptions are observational references, not regression or acceptance-test oracles.
- [ ] M9.4 Compare walls against raw chain concentrations.
- [ ] M9.5 Investigate every large unexplained discrepancy.
- [ ] M9.6 Verify expiry rollover.
- [ ] M9.7 Verify high-volatility session.
- [ ] M9.8 Verify quiet session.
- [ ] M9.9 Verify near-expiry session.
- [ ] M9.10 Verify browser remains stable during a full trading day.
- [ ] M9.11 Freeze v1 formula definitions.
- [ ] M9.12 Tag release v1.0.0.

Exit criteria:

- No unresolved critical data-integrity defects.
- No progressive chart lag.
- No unexplained candle divergence.
- Calculation versions frozen.
- Known limitations documented.

---

# 35. Future Milestones

After v1:

```text
Vanna
Charm
expiry-specific comparison panels
historical gamma snapshots
gamma level change tracking
volatility surface
trade-flow inference
multi-asset support
optional perpetual execution-reference quote
additional visualization engines
multi-tab feed sharing using Web Locks/BroadcastChannel if duplicate browser tabs become a material rate-limit or compute issue
```

Each new metric must use the same principles:

```text
source
-> validate
-> normalize
-> calculate
-> independently test
-> version
-> display with provenance
```

---

# 36. Popular Open-Source Repositories to Borrow Concepts From

## TradingView Lightweight Charts
https://github.com/tradingview/lightweight-charts

Borrow:

- incremental realtime rendering.
- chart lifecycle.
- panes/primitives.
- time-scale handling.
- v5 API conventions.
- large-data performance ideas.

Do not copy stale v4 code.

## KLineChart
https://github.com/klinecharts/KLineChart

Borrow:

- financial chart abstraction concepts.
- mobile-conscious chart interaction.
- indicator/drawing extensibility.

## Apache ECharts
https://github.com/apache/echarts

Borrow:

- secondary analytics visualization patterns.
- large general-purpose visualization architecture.

## NautilusTrader
https://github.com/nautechsystems/nautilus_trader

Borrow concepts, not the full engine:

- venue adapter boundaries.
- normalized domain events.
- explicit error semantics.
- heartbeat.
- reconnect.
- subscription replay.
- retry classification.
- snapshot reconciliation.
- typed configuration.
- deterministic testing.

## Binance official JavaScript connector
https://github.com/binance/binance-connector-js

Use as a current official implementation reference.

Do not use deprecated Binance connector repositories.

## Binance official Spot API docs
https://github.com/binance/binance-spot-api-docs

Use as a source of truth for:

- Kline stream format.
- connection lifetime.
- stream behavior.
- rate limits.
- official endpoints.

## Zod
https://github.com/colinhacks/zod

Borrow:

- runtime validation boundary.

## Vitest
https://github.com/vitest-dev/vitest

Use for:

- unit tests.
- regression tests.
- benchmarks where useful.

## Playwright
https://github.com/microsoft/playwright

Use for:

- end-to-end browser tests.
- chart interaction tests.
- long-session automation support.

## GEX Levels research example
https://github.com/haus-edge/gex-levels

Use only as research inspiration for:

- gamma-profile zero crossing.
- wall ranking.
- wall stabilization/hysteresis.

Do not copy assumptions blindly across markets.

---

# 37. Official Technical References

TradingView Lightweight Charts:
https://github.com/tradingview/lightweight-charts

Binance official API documentation:
https://developers.binance.com/en/docs/introduction

Binance Spot WebSocket streams:
https://github.com/binance/binance-spot-api-docs/blob/master/web-socket-streams.md

Binance market-data-only endpoints:
https://github.com/binance/binance-spot-api-docs/blob/master/faqs/market_data_only.md

Deribit API:
https://docs.deribit.com/

Deribit full book summary:
https://docs.deribit.com/api-reference/market-data/public-get_book_summary_by_currency

Deribit options mark-price stream:
https://docs.deribit.com/subscriptions/market-data/markpriceoptionsindex_name

Deribit index stream:
https://docs.deribit.com/subscriptions/market-data/deribit_price_indexindex_name

Deribit ticker and Greeks:
https://docs.deribit.com/api-reference/market-data/public-ticker

Deribit heartbeat:
https://docs.deribit.com/api-reference/session-management/public-set_heartbeat

Vercel Hobby:
https://vercel.com/docs/plans/hobby

Vercel Function limits:
https://vercel.com/docs/functions/limitations

Vercel Deployment Protection:
https://vercel.com/docs/deployment-protection

NautilusTrader adapters:
https://github.com/nautechsystems/nautilus_trader/blob/develop/docs/developer_guide/adapters.md

MenthorQ GEX-level presentation reference:
https://menthorq.com/academy/gamma-levels/lessons/trade-gex-levels-1-to-10/

---

# 37.1 Review Decisions Adopted in v0.2

The following technical-review changes are adopted:

- explicit walking skeleton.
- explicit v0 MVP cut.
- regional endpoint risk.
- named Binance market-data-only fallbacks.
- viewport-safe gap repair.
- exact v1 GEX units and formula.
- metric-specific exclusion policy.
- OI-weighted Average IV.
- Deribit IV normalization fixture.
- significant-zero-crossing filter.
- health state transitions and anti-flap behavior.
- calculation coalescing.
- server-time synchronization.
- hidden-tab recovery.
- CI prohibition on live exchange dependencies.
- automated TypeScript/Python reference checks.
- exportable diagnostics bundle.
- simplified chart package layout.
- application API auth coverage.
- CSP endpoint requirements.
- excluded-data accounting.
- versioned cache envelopes.
- fallback-chart implementation removed from v0 critical path.

One review claim was corrected:

```text
Deribit mark_iv is not normalized as 0.55 = 55% in the current API examples.
Current examples use percentage-point values such as 80 = 80%.
The normalizer converts percentage points to a decimal for Black-Scholes.
```

---


# 37.2 Second Technical Review Decisions Adopted in v0.5

The following second-pass review changes are now part of the build contract:

- Gamma Flip selection is deterministic when several qualifying crossings exist.
- The displayed Gamma Flip is the qualifying crossing closest to the current Deribit underlying.
- Exact-distance ties resolve to the lower-price crossing.
- All qualifying crossings remain in calculation metadata.
- Aggregate multi-expiry Gamma profiles explicitly acknowledge time-driven drift.
- v1 Gamma profiles use a provisional 15-minute minimum time-to-expiry floor, subject to Milestone 4 sensitivity testing.
- Binance historical candle bootstrap paginates at no more than 1,000 klines per request.
- A 2,000-bar bootstrap is a multi-request operation with validation, deduplication, contiguity checks, and partial-failure handling.
- Gross Gamma Concentration uses the same pinned USD-per-1%-move units as signed GEX, without the sign heuristic.
- Provisional wall guardrails are numeric rather than agent-defined.
- Polling feeds have their own recovery semantics rather than inheriting high-frequency WebSocket message counts.
- Parallel agents write per-task progress journals; root PROGRESS.md is regenerated and checked in CI.
- Production CSP explicitly accounts for the calculation Web Worker.
- Venue clock synchronization uses five samples and selects the valid sample with minimum round-trip time.
- Binance timeframe subscription changes are debounced and coalesced to preserve control-message budget.
- ADR numbering has a registry and template.
- External vendor comparisons are acceptance-test evidence only when methodology is materially comparable.
- Health transitions include fatal LIVE -> ERROR and verified LIVE -> OFFLINE paths.
- Put/Call OI ratio returns null rather than Infinity when call OI is zero.
- Diagnostics export is bounded to 256 KB.
- Gamma-profile search-band expansion has a numeric relevance trigger.
- KLineChart remains post-v0 unless the primary chart fails acceptance testing.
- Max Pain is documented as a theoretical strike-based payoff heuristic rather than a prediction of Deribit's actual delivery price.
- Multi-tab feed sharing is reserved as a future optimization.

Current API facts verified during this review:

```text
Binance REST klines: maximum 1,000 bars per request.
Binance WebSocket client control traffic: five messages per second per connection.
Lightweight Charts historicalUpdate: replaces an existing historical point but does not insert a missing historical point.
```


# 38. Product Questions Status

All architecture-blocking product questions are resolved.

Accepted:

```text
BTC only
BTC-settled inverse Deribit BTC options
Binance BTCUSDT Spot master candles
1m, 5m, 15m, 1h, 4h, 1d, 1w
volume pane
horizontal/vertical drawing tools
<=30 DTE default
custom expiry presets
no historical Gamma storage
desktop first
new repository
subtle Gamma regime shading
collapsible Gamma profile
Google login
one allowlisted account
Codex primary implementer
Antigravity/Gemini reviewer
Ox Alpha long-context/adversarial reviewer
ChatGPT architect/coordinator
milestone-exit owner approvals
free Vercel URL initially
```

No remaining product decision blocks Milestone 0 or Milestone 0.5.

Design details should now be resolved through implementation prototypes and milestone acceptance tests rather than reopening the architecture.

# 39. Current Product Defaults

These defaults are active unless the product owner changes them.

```text
Asset: BTC only
Master chart: Binance BTCUSDT Spot
Perpetual candles: no
Timeframes: 1m, 5m, 15m, 1h, 4h, 1d, 1w
Initial history: 2,000 candles
Older history: lazy load
Volume pane: yes
Drawing tools: horizontal line + vertical line
Chart engine: Lightweight Charts
Fallback chart interface: retained
Fallback implementation: post-v0 unless required
Default gamma scope: <= 30 DTE
Expiry presets: 0DTE, Next Expiry, This Friday, Next Friday, <=7 DTE, <=30 DTE, All Expiries, Custom Expiry
Secondary GEX levels: 3
Max Pain: specific expiry only
Gamma refresh: no more than one full profile calculation every 2 seconds while dirty
OI snapshot: 30 seconds
Historical gamma persistence: no
Desktop: primary launch target
Mobile: responsive where practical, not a launch gate
Theme: dark first
Execution: out of scope
Vanna/Charm: v2
Repository: new options-chart repository
Agent workflow: ChatGPT architect; Codex implementer; Antigravity/Gemini reviewer; Ox Alpha long-context/adversarial reviewer
Milestone approval: product-owner approval at milestone exit
Production URL: free Vercel URL initially
```

---

# 40. Definition of Done

A task is done only when all applicable items are true.

- Code compiles.
- TypeScript typecheck passes.
- Lint passes.
- Unit tests pass.
- Relevant regression tests pass.
- Relevant browser tests pass.
- Production build passes.
- No new unexplained warnings.
- No unrelated files changed.
- New external payloads have schemas.
- New calculations have tests.
- New calculations have metadata/version handling where applicable.
- New aggregate calculations report included/excluded contract counts by reason.
- New realtime feed behavior has stale/reconnect handling.
- PROGRESS.md is updated.
- Commit is small enough to understand.
- Known limitations are recorded.

A milestone is done only when its exit criteria pass.

A visual feature is never allowed to declare a data milestone complete.
