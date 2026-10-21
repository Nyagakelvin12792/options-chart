# Antigravity Assignment Packet - M11.3

Status: AUTHORIZED TO START
Date: 2026-10-19
Coordinator: Codex
Implementation worker: Antigravity

## Start Authorization

```text
M11_2_EXIT_APPROVED=true
ACCEPTED_M11_2_COMMIT=d536eba623114325661480f07dc458c21f619af3
BRANCH=handoff/antigravity-m11
LIVE_OBSERVATION_RUN=38793141169
```

The live gate is complete. The accepted artifact contains 599 trades, 866
L2-book events, 1,465 unique market-event IDs, no duplicate IDs, no validation
errors, and no collector-error records.

## Task And Objective

Task: M11.3 Deterministic CVD And Absorption Engine.

Implement `@options-chart/flow-engine` exactly within
`docs/implementation/M11.3_ANTIGRAVITY_MULTI_AGENT_WORK_PACKAGE.md`. Produce pure,
deterministic, auditable order-flow features from validated `MarketEventV1`
records. This is a shadow decision-support feature package, not an execution
engine.

## Allowed Write Scope

- `packages/flow-engine/**`;
- root `package.json` scripts only when required for the new package;
- root `tsconfig.json` project references only when required;
- package entrypoints required to consume existing validated contracts;
- `docs/handoffs/antigravity-m11.3-worklog.md`.

Checkpoint commits are allowed on `handoff/antigravity-m11` after their focused gates
pass. Every commit must include the attribution required by `AGENTS.md`.

## Antigravity Execution Mode

Use the Antigravity Agent Manager only if it is available. Open this exact
repository path in both the Antigravity IDE and Agent Manager so file watchers
observe the same checkout. Freeze disjoint file ownership before parallel work.

Use no more than five implementation agents plus one read-only adversarial
reviewer, following the Agent A-F ownership map in the work package. The
orchestrator alone owns `src/index.ts`, root workspace references, integration,
and the worklog. If Agent Manager is unavailable, execute the same checkpoints
sequentially in the Antigravity IDE.

## Protected Scope

Do not edit:

- the pre-existing user-owned `.gitignore` modification;
- `PROJECT_PLAN.md`, `PROGRESS.md`, orchestration ledgers, milestone status, or
  files under `docs/progress/`;
- collector signal logic or Python signal calculations;
- production Binance or Deribit feed authority;
- GEX, wall, IV, confluence, Volume Profile, AVWAP, chart, or risk formulas;
- UI, authentication, deployment, environment, CI, or credential files;
- JEV, LLM providers, narration, prompts, or M11.4 and later work;
- any live or private execution path.

Do not push, merge, deploy, rewrite history, or begin the next milestone without
explicit product-owner or coordinator approval.

## Required Invariants

- Replay eligibility is `receiptTimestampMs <= replayCutoffMs`; no future data.
- Opaque sequence strings are equality-only and never numerically ordered.
- Missing, stale, gapped, malformed, or incomplete inputs degrade confidence or
  become unavailable; they never become zero silently.
- Deterministic code owns all features and classifications.
- Absorption describes observed flow and price response, never hidden intent.
- Binance candles and Deribit options remain authoritative.
- The Risk Terminal remains the sole numeric sizing authority.
- No live execution.

## Required Verification

Follow every checkpoint in the work package. Final verification must include:

```powershell
npm exec vitest run packages/flow-engine
npm run schemas:market-events:check
npm exec vitest run packages/market-data/src/market-events
python -m pytest -p no:cacheprovider services/cryptofeed-collector -q
npm run test
npm run typecheck
npm run lint
npm run build
npm run progress:check
npm run progress:policy
npm run format:check
git diff --check
```

Also run the required deterministic benchmark over at least 100,000 events and
record elapsed time, throughput, retained state, and environment. Benchmark
results are evidence, not a universal performance guarantee.

## Repository State At Handoff

- Local HEAD and remote `origin/handoff/antigravity-m11` both point to the accepted
  handoff history before this assignment commit.
- The only pre-existing working-tree modification is `.gitignore`, owned by the
  user. Preserve it exactly and keep it out of every Antigravity commit.
- M11.2 final gates passed 33 Python collector tests, 65 Vitest files with 451
  tests, typecheck, lint, production build, progress gates, and diff check.

Before editing, Antigravity must read all context required by `ANTIGRAVITY.md`, run
`git status --short --branch`, report the observed state and planned narrow
checks, then record checkpoint 0 in the worklog.

## Required Final Handoff

Use the exact format in `ANTIGRAVITY.md` plus the additions required by section 17 of
the M11.3 work package. Report partial work honestly and stop at the current
checkpoint if blocked. Do not self-approve the milestone.
