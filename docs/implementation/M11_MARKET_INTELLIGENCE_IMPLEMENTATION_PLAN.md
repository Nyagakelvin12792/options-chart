# M11 Market Intelligence Implementation Plan

Status: APPROVED FOR STAGED IMPLEMENTATION
Date: 2026-09-22
Scope: CVD, absorption, compact market state, JEV, LLM narration, replay, and paper evaluation

## 1. Outcome

Build a read-only decision-support layer that improves selectivity and risk
discipline without turning the dashboard into a collection of indicators.

The primary output contains five independent layers:

1. market structure;
2. location;
3. order flow;
4. options regime;
5. trade quality.

The system may describe evidence and scenarios. It must not promise a market
outcome, infer known participant intent, place orders, or bypass deterministic
risk controls.

## 2. Authority Boundaries

- Binance BTCUSDT Spot remains the authoritative candle source.
- Deribit remains the authoritative BTC options source.
- Cryptofeed initially operates as a local shadow collector only.
- Deterministic TypeScript code owns features, levels, classifications, and risk.
- JEV may return only typed assessments over a compact decision context.
- An LLM may narrate a converged assessment but cannot alter it.
- The Risk Terminal remains the sole numeric position-sizing authority.

## 3. Planned Repository Boundaries

| Location                            | Ownership                                                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `services/cryptofeed-collector/`    | Python collector adapter, connection health, event serialization, and local shadow operation              |
| `packages/flow-engine/`             | TypeScript CVD, imbalance, absorption, rejection, structure, and feature-health calculations              |
| `packages/decision-engine/`         | TypeScript context schemas, deterministic baseline, convergence, reason codes, and stale-result rejection |
| `packages/market-data/`             | Existing Binance and Deribit authority; only shared validated contracts may be added                      |
| `apps/web/`                         | Compact read-only analysis panel and bounded API client; no raw feed calculations                         |
| `tools/replay-market-intelligence/` | Offline replay, ablation, calibration, and report generation                                              |
| `artifacts/market-intelligence/`    | Ignored local recordings and generated evaluation reports                                                 |

The Python collector must not calculate trading signals. A generated JSON
Schema and shared fixtures keep its event envelope aligned with the TypeScript
contract.

## 4. Delivery Batches

### M11.2 Shadow Collector

Deliverables:

- canonical `MarketEventV1` schema and JSON Schema export;
- Binance Spot trades and L2 book ingestion through Cryptofeed;
- exchange and receipt timestamps, connection IDs, and sequence metadata;
- deterministic event IDs and duplicate rejection;
- explicit gap, stale, reconnect, and unsupported-channel health events;
- rotating append-only NDJSON storage for zero-cost local validation;
- replay reader that preserves original event ordering and timestamps;
- runbook and sanitized configuration example.

Initial scope is one venue and one symbol. Binance perpetual and comparison
venues are added only after the Spot collector passes its observation gate.

Acceptance gate:

- schema fixtures pass in Python and TypeScript;
- duplicates do not enter the event log;
- every detected gap and reconnect is represented in health output;
- restart does not silently overwrite prior data;
- a recorded session replays deterministically;
- at least one continuous shadow observation is captured before M11.3 promotion;
- production candles, options, chart behavior, and Vercel deployment remain unchanged.

### M11.3 CVD And Absorption Engine

Deliverables:

- taker-side classification from validated exchange semantics;
- raw, rolling, and candle-bucketed CVD with explicit reset anchors;
- aggressive buy and sell quote volume;
- L1 spread and bounded L2 imbalance;
- liquidity addition, removal, and replenishment near price;
- price-response efficiency per unit of aggressive flow;
- candidate absorption, rejection, and acceptance classifications;
- feature coverage, freshness, venue, and gap confidence;
- chart series and audit values behind a feature flag.

Absorption must require a conjunction of elevated aggressive flow, limited
price progress, relevant-location proximity, and subsequent response. It is a
classification of observable behavior, not proof of a hidden participant.

Acceptance gate:

- pure calculations have fixture, property, malformed-input, gap, and replay tests;
- no future event contributes to an earlier replay cursor;
- incomplete data lowers confidence or returns unavailable instead of zero;
- cross-venue values are never combined before unit normalization;
- visible CVD matches independently calculated fixture totals;
- absorption thresholds and component scores are versioned and auditable.

### M11.4 Compact Market State

Deliverables:

- market structure states for 4h, 1h, and 15m decision contexts;
- AVWAP and Volume Profile location states;
- strongest support and resistance options zones;
- compact Gamma, volatility, and expiry-pressure states;
- trade-geometry and account-risk states;
- one versioned `MarketStateV1` snapshot containing the five primary layers.

Charm, Vanna, Speed, Color, and other detailed Greeks remain audit-only research
features until an ablation report shows incremental value.

Acceptance gate:

- every state maps to stored numeric evidence and formula versions;
- timeframe and expiry changes cancel stale state generations;
- no composite score hides conflicting primary layers;
- unavailable inputs remain visible in the final state.

### M11.5 Deterministic Decision Baseline

Deliverables:

- `DecisionContextV1` and `DecisionAssessmentV1` schemas;
- closed choices: no-trade, watch-long, watch-short, confirm-long,
  confirm-short, and insufficient-data;
- deterministic rules provider and human-readable reason codes;
- convergence rules for stale data, invalid geometry, account prohibition,
  contradiction, and confidence;
- immutable shadow-decision records.

This baseline is mandatory. JEV is not evaluated against an empty comparator.

### M11.6 JEV And LLM Shadow Providers

JEV deliverables:

- server-side provider adapter with timeout, cancellation, and schema validation;
- compact typed questions over `DecisionContextV1`;
- recorded probability distribution, model confidence, latency, and errors;
- default-off shadow mode with no effect on risk or chart state.

LLM narrator deliverables:

- post-convergence input containing only evidence, reasons, warnings, and state IDs;
- concise structured output: thesis, evidence, conflict, trigger, invalidation,
  and no-trade reasons;
- cache by context and assessment IDs;
- regeneration only after material state change or explicit request;
- stale-response cancellation and visible analysis age.

Model routing for implementation:

- GPT-5.5 medium for routine implementation, tests, and documentation;
- GPT-5.6 for architecture, financial-math, security, and final integration review.

Runtime model selection remains configurable and must be benchmarked before it
is locked. The narrator target is at most 1,000 input tokens and 250 output
tokens per material update. Raw ticks, books, chains, and chat history are never
sent to either model.

### M11.7 Replay, Calibration, And Paper Ledger

Deliverables:

- walk-forward replay with strict effective-time cutoffs;
- rules-only versus rules-plus-JEV comparison;
- LLM narration-quality review separate from decision performance;
- forward return, MFE, MAE, drawdown, coverage, and stale-decision reports;
- probability calibration and class-frequency reports;
- ablation by structure, flow, options regime, timeframe, and expiry scope;
- conservative paper fills, fees, partial fills, and account-ledger updates.

No provider confidence is presented as a win probability until calibrated on
held-out observations. LLM prose is never counted as an independent signal.

### M11.8 User-Facing Promotion

Promotion requires:

- M9 reliability evidence complete;
- collector health and replay gates passing;
- deterministic baseline published;
- JEV and rules compared on held-out data;
- no material degradation in dashboard performance;
- the dashboard remains usable when the collector and AI providers are offline;
- product-owner review of costs, evidence, failure modes, and UI screenshots.

## 5. Analysis Panel Contract

The panel is compact and progressive. Its default view shows:

- regime and directional bias;
- strongest support and resistance with evidence strength;
- flow response at the active level;
- options-regime state;
- trigger, invalidation, and no-trade condition;
- data freshness, provider, analysis age, and warnings.

Detailed numeric inputs, formulas, model responses, and history remain in an
audit drawer. The panel must distinguish observed fact, deterministic
classification, model assessment, and generated narration.

## 6. Token And Cost Controls

- Use deterministic code for continuous calculations.
- Trigger AI only on material state changes or explicit requests.
- Debounce repeated changes and cancel stale work.
- Keep fixed prompts cache-friendly and versioned.
- Send compact state changes rather than raw history.
- Cap input, output, calls per hour, and spend per day.
- Store and reuse assessments and narration by content hash.
- Use asynchronous batch processing for offline evaluations where supported.
- Escalate from the routine model only after schema failure, contradiction, or
  a specifically identified high-risk review.

## 7. Verification Commands

Every TypeScript batch must pass the relevant focused tests followed by:

```text
npm run test
npm run typecheck
npm run lint
npm run build
npm run progress:check
npm run progress:policy
```

Collector batches also require Python unit tests, schema parity tests, and a
bounded live shadow run. User-facing batches require Playwright desktop and
mobile screenshots plus interaction and non-overlap checks.

## 8. Immediate Next Task

Prepare M11.2 as a standalone branch. Implement only the event contracts,
single-venue collector, health reporting, rotating local storage, replay reader,
fixtures, and tests. Do not add CVD, JEV, LLM dependencies, dashboard UI, or
production deployment behavior in the same branch.
