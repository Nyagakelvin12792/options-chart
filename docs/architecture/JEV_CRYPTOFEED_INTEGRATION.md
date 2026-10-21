# JEV and Cryptofeed Integration Architecture

Status: APPROVED FOR STAGED IMPLEMENTATION
Task: M11.1
Date: 2026-09-22

## 1. Objective

Extend the read-only BTC options dashboard with a durable market-microstructure
pipeline and an optional structured decision layer without changing the
validated Binance candle, Deribit option, options-mathematics, chart, or risk
contracts.

The design borrows selected operating patterns from QuantDinger:

- long-running work is separate from request-serving web processes;
- deterministic risk checks run before any AI assessment;
- AI decisions are typed, versioned, confidence-gated, and auditable;
- exits and emergency risk actions never depend on AI availability;
- shadow and paper modes precede any execution authority.

Cryptofeed is the proposed normalized public-market-event collector. JEV is the
proposed semantic decision provider. Neither is an authoritative calculator.

## 2. Non-Goals

M11 does not:

- replace Binance Spot as the authoritative chart-candle source;
- replace Deribit as the authoritative options source;
- replace or modify GEX, wall, Gamma Flip, Max Pain, IV, AVWAP, Volume Profile,
  confluence, or risk formulas;
- send raw exchange payloads directly to React components;
- let JEV calculate prices, Greeks, position size, leverage, Entry, SL, or TP;
- let JEV bypass daily-loss, drawdown, margin, or stale-data constraints;
- place live orders or require private exchange credentials;
- run a persistent collector inside an ordinary Vercel request handler;
- treat model confidence as a historical win probability without calibration;
- import QuantDinger as an application dependency or migrate the dashboard into
  QuantDinger.

## 3. Target Topology

```text
Binance / Deribit / optional additional venues
                    |
                    v
       Cryptofeed collector service
       trades, L2 books, OI, funding,
       liquidations, receipt timestamps
                    |
                    v
       append-only normalized event store
                    |
          +---------+---------+
          |                   |
          v                   v
 deterministic flow      replay reader
 feature worker               |
 CVD / absorption /           |
 rejection / liquidity        |
          |                   |
          +---------+---------+
                    v
      versioned DecisionContext snapshot
                    |
          +---------+---------+
          |                   |
          v                   v
 deterministic rules    optional JEV provider
          |                   |
          +---------+---------+
                    v
        deterministic decision converger
                    |
                    v
        advisory result / paper simulator
                    |
                    v
         existing Vercel chart dashboard
```

The existing browser data path remains available during M11 shadow operation.
The collector cannot become authoritative until parity, gap, timestamp, stale,
and replay tests pass.

## 4. Deployment Boundary

### Vercel application

Vercel continues to own:

- authenticated dashboard delivery;
- chart interaction and local drawing tools;
- read-only risk-terminal presentation;
- bounded API facade requests;
- decision and replay visualization.

### Persistent service

A separate long-running service owns:

- Cryptofeed WebSocket sessions;
- sequence and gap monitoring;
- normalized event persistence;
- feature-window maintenance;
- replay reads;
- JEV requests and timeout handling;
- shadow and paper-trade ledgers.

The initial deployment may run locally for validation. A hosted service is not
required until the product owner accepts a recurring-cost and operations plan.

## 5. Canonical Market Event

All collector outputs must validate into a versioned envelope before storage:

```ts
interface MarketEventV1 {
  schemaVersion: "market-event-v1";
  eventId: string;
  venue: string;
  symbol: string;
  instrumentType: "spot" | "perpetual" | "future" | "option";
  channel:
    | "trade"
    | "l1-book"
    | "l2-book"
    | "open-interest"
    | "funding"
    | "liquidation"
    | "index";
  exchangeTimestampMs: number | null;
  receiptTimestampMs: number;
  sequence: number | string | null;
  payload: unknown;
  provenance: {
    collector: "cryptofeed";
    collectorVersion: string;
    connectionId: string;
    recordedAtMs: number;
  };
}
```

Channel-specific Zod schemas must validate `payload`. Missing values remain
missing; they are never converted to zero. Duplicate events are idempotently
rejected by `eventId`, and sequence gaps create explicit health events.

## 6. Deterministic Flow Features

The first feature set is deliberately small:

- venue-specific and consolidated CVD;
- aggressive buy and sell volume;
- L1 spread and L2 imbalance;
- liquidity added, removed, and replenished near price;
- price response per unit of aggressive flow;
- candidate buy-side and sell-side absorption;
- rejection or acceptance near a versioned options wall;
- cross-venue agreement and divergence;
- data coverage, gap count, venue count, and freshness.

Feature calculations must be deterministic, replayable, unit-tested, and
versioned. Absorption and rejection remain labeled classifications, not known
participant intent.

## 6.1 Compact Decision Surface

The primary interface must summarize evidence into five independent layers:

- market structure: trend, range, transition, acceptance, and invalidation;
- location: AVWAP, Volume Profile, and strongest options zones;
- order flow: CVD, aggressive volume, absorption, and rejection;
- options regime: Gamma state, volatility state, expiry pressure, and strongest zone;
- trade quality: geometry, reward:risk, account constraints, and conflicting evidence.

Detailed Greeks and diagnostics remain available in audit views. They do not
become primary signals until replay ablation demonstrates incremental value.

## 7. Decision Context

JEV receives a compact semantic snapshot, while the audit record retains the
underlying numbers:

```ts
interface DecisionContextV1 {
  schemaVersion: "decision-context-v1";
  contextId: string;
  createdAtMs: number;
  effectiveAtMs: number;
  symbol: "BTCUSDT";
  timeframe: string;
  expiryScope: string;
  mode: "live-shadow" | "replay" | "paper";
  dataHealth: {
    candles: "live" | "stale" | "unavailable";
    options: "live" | "stale" | "unavailable";
    flow: "live" | "stale" | "unavailable";
  };
  regime: {
    gamma: "positive" | "negative" | "transition" | "unavailable";
    volatility: "contracting" | "normal" | "expanding" | "unavailable";
  };
  location: {
    nearestSupportStrength: "none" | "weak" | "moderate" | "strong";
    nearestResistanceStrength: "none" | "weak" | "moderate" | "strong";
    wallInteraction: "none" | "approaching" | "testing" | "through";
    avwapState: string;
    volumeProfileState: string;
  };
  flow: {
    cvdState:
      | "strong-sell"
      | "sell"
      | "balanced"
      | "buy"
      | "strong-buy"
      | "unavailable";
    response:
      "acceptance" | "rejection" | "absorption" | "unresolved" | "unavailable";
    crossVenueAgreement: "low" | "mixed" | "high" | "unavailable";
  };
  proposedTrade: {
    side: "long" | "short";
    entrySource: string;
    stopSource: string;
    targetSource: string;
    rewardRiskBand: "below-minimum" | "acceptable" | "strong";
  } | null;
  accountRisk: {
    state: "available" | "reduced" | "prohibited";
    reasonCodes: string[];
  };
  evidence: {
    formulaVersion: string;
    flowFeatureVersion: string;
    confluenceVersion: string;
    includedVenues: string[];
    warnings: string[];
  };
}
```

Exact prices, balances, arithmetic, date comparisons, and position-size
calculations remain outside JEV.

## 8. Decision Provider Contract

```ts
type DecisionChoice =
  | "no-trade"
  | "watch-long"
  | "watch-short"
  | "confirm-long"
  | "confirm-short"
  | "insufficient-data";

interface DecisionAssessmentV1 {
  schemaVersion: "decision-assessment-v1";
  assessmentId: string;
  contextId: string;
  provider: "rules" | "jev" | "recorded";
  providerModel: string;
  promptVersion: string;
  startedAtMs: number;
  completedAtMs: number;
  stale: boolean;
  checks: {
    evidenceQuality: string;
    regimeCompatibility: string;
    wallInteraction: string;
    flowConfirmation: string;
    executionQuality: string;
    accountRisk: string;
  };
  decision: DecisionChoice;
  probabilities: Record<string, number>;
  confidence: number | null;
  warnings: string[];
}
```

Only closed answer sets are allowed. Free-form model explanations are not a
decision input. A user-facing rationale is assembled from stored check results
and deterministic reason codes.

## 9. Deterministic Convergence and Safety

The converger applies these rules in order:

1. Unavailable or stale required market data returns `insufficient-data`.
2. Prohibited account risk returns `no-trade`.
3. Invalid Entry/SL/TP geometry returns `no-trade`.
4. A stale or timed-out model result is discarded.
5. Low-confidence or contradictory assessment cannot confirm a trade.
6. JEV may reject or reduce a setup, but cannot enlarge risk.
7. Position size is always the minimum of deterministic account limits.
8. Protective exits and emergency actions never call JEV.
9. Provider failure is fail-closed when JEV is configured as required.
10. Advisory mode may continue without JEV, but must display that fact.

No generic LLM may replace JEV or the deterministic provider because its output
and confidence are not comparable to the typed decision contract.

An optional LLM narrator may run after deterministic convergence. It receives
only the versioned context, converged assessment, reason codes, and data-health
warnings. Its concise prose may explain regime, evidence, conflict, trigger,
invalidation, and no-trade reasons, but it cannot alter stored classifications,
numeric levels, position size, or execution state. Narration is cached and
regenerated only after a material state change or explicit user request.

## 10. Replay and Calibration

Every assessment must be evaluated against future observations that were not
available at decision time. Replay must use only events and options snapshots
whose effective timestamp is at or before the replay cursor.

Required reports include:

- coverage and stale-decision rate;
- latency and timeout distribution;
- class frequency, including `no-trade`;
- forward return and maximum adverse/favorable excursion by horizon;
- wall acceptance/rejection outcome by gamma regime;
- outcome by expiry scope and confluence-strength band;
- Brier score or equivalent probability calibration for each closed choice;
- deterministic-baseline comparison;
- fees and conservative fill assumptions for paper trades.

JEV confidence must be labeled `model confidence` until these reports support a
separate empirically calibrated probability.

## 11. Storage

The durable model should contain append-only records for:

- normalized market events;
- options snapshots and formula versions;
- derived flow-feature snapshots;
- decision contexts;
- provider assessments;
- converged outcomes;
- simulated orders, fills, positions, fees, and account ledger changes;
- provider latency, errors, and stale-result rejection.

Raw retention and aggregation windows must be configurable. Destructive
retention jobs require explicit tests and backups before hosted deployment.

## 12. Delivery Batches

### M11.1 Architecture and contracts

- Freeze this architecture proposal after product-owner review.
- Add ADRs for the collector boundary and AI decision authority.
- Define data-retention and zero-cost validation constraints.

### M11.2 Cryptofeed shadow collector

- Run locally against Binance and selected comparison venues.
- Store normalized trades and L2 events.
- Measure sequence gaps, latency, duplicates, and uptime.
- Do not change the production chart source.

### M11.3 CVD and absorption engine

- Implement deterministic versioned features.
- Add fixture, property, gap, stale, and replay tests.
- Display only after provenance and health states are available.

### M11.4 Decision contracts and rules baseline

- Add `DecisionContextV1`, `DecisionAssessmentV1`, and schemas.
- Implement a deterministic provider and stale-result cancellation.
- Record shadow decisions without changing risk-terminal behavior.

### M11.5 JEV shadow provider

- Add server-side credentials and typed questions.
- Keep JEV off by default.
- Record probabilities, confidence, latency, and errors.
- Never expose API credentials to the browser.

### M11.5a LLM narrator

- Generate concise explanations only after deterministic convergence.
- Use compact feature JSON rather than raw trades, books, candles, or chains.
- Cache by context and assessment IDs and cancel stale generations.
- Keep narration outside decision, risk, and execution contracts.

### M11.6 Historical evaluation

- Run walk-forward and replay comparisons against deterministic baselines.
- Publish calibration and failure reports.
- Revise prompts and thresholds only through version increments.

### M11.7 Paper-trade ledger

- Connect confirmed chart drawings to a durable simulated account.
- Model conservative fills, fees, partial fills, and invalidation.
- Keep live exchange execution out of scope.

## 13. Promotion Gates

No batch advances from shadow to user-facing status until:

- schemas reject malformed and incomplete events;
- timestamps and replay cutoffs pass future-leakage tests;
- collector gaps and stale states are visible;
- deterministic outputs are reproducible;
- JEV timeouts and stale results cannot alter current state;
- baseline comparisons and calibration reports exist;
- the dashboard remains usable when the new service is offline;
- the product owner approves any recurring infrastructure cost.

## 14. Reuse Policy

QuantDinger and `jev-trader` are references, not runtime dependencies.

Patterns approved for adaptation:

- provider-neutral decision interfaces;
- deterministic pre-checks and result convergence;
- worker ownership, leases, heartbeats, and idempotency;
- shadow, paper, and live mode separation;
- immutable decision timelines;
- explicit provider, latency, confidence, and failure display.

Patterns explicitly rejected for direct copying:

- forced buy/sell decisions;
- AI-generated numeric risk or trade levels;
- provider failure silently allowing required-gate entries;
- generic-LLM fallback under the same confidence policy;
- simplistic touch-fill simulation;
- unversioned consensus overrides.
