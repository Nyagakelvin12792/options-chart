# M11 Orchestration Ledger

Last updated: 2026-10-20
Goal status: ACTIVE - M11.6 CHECKPOINT 1 VERIFIED
Automation: no automation is running; M11.6 work is manual, local, and default-off

## Resume Protocol

1. Read `PROJECT_PLAN.md`, `PROGRESS.md`, and
   `docs/implementation/M11_MARKET_INTELLIGENCE_IMPLEMENTATION_PLAN.md`.
2. Read this ledger and the current `docs/progress/M11/M11.*.md` file.
3. Inspect `git status`, current branches, and completed agent reports.
4. Reconcile existing work before creating another agent or editing overlapping files.
5. Run the narrowest relevant tests, then the repository gates required by the batch.
6. Update this ledger and the progress documents before ending a run.

If usage is unavailable, record the exact unfinished command, file, failing test,
and next action here. The next heartbeat must resume that action rather than
starting the batch again.

## Model Routing

- Antigravity: bounded implementation worker for approved code, fixtures, tests, and
  task-specific documentation under the root `ANTIGRAVITY.md` contract.
- GPT-5.5 medium: implementation, fixtures, focused tests, and documentation.
- GPT-5.6 high: final financial-math, security, architecture, and integration review.
- Do not duplicate the same task across agents merely to increase concurrency.
- Do not allow Antigravity and another agent to edit the same file concurrently.

## Active Batch

M11.6 JEV And LLM Shadow Providers

### Current Assignment

| Worker    | Write scope                                                                                 | Status                |
| --------- | ------------------------------------------------------------------------------------------- | --------------------- |
| Codex     | `packages/decision-engine/**`, M11.6 progress, orchestration ledger, and Codex handoff      | CHECKPOINT 1 VERIFIED |
| Architect | Provider-boundary review, milestone acceptance, and authorization of live/server checkpoint | REVIEW REQUIRED       |

The active branch is `codex/m11.6-shadow-providers`, based on the corrected
M11.4/M11.5 branch. Checkpoint 1 implementation commit is
`cff6946ff201f6197b74ce952c8e81ba5fc897a4`.

## Current Checkpoint

- The M11.4/M11.5 corrective implementation is preserved in this branch history.
- M11.6 checkpoint 1 adds a default-off provider runner, typed JEV adapter,
  immutable run records, and post-convergence narration contracts and coordinator.
- Focused tests passed 6 files and 43 tests. Full gates passed 77 files and 544
  tests plus typecheck, lint, build, and diff check.
- No live provider call was made because TypeSafe and Minara credentials are not
  configured. No UI, route, deployment, risk-authority, or execution change is
  authorized by this checkpoint.

## Historical M11.2 Workstreams

### Workstreams

| Workstream                 | Owner                                        | Write scope                                                                  | Status   |
| -------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------- | -------- |
| TypeScript event contracts | Agent `01a0c863-1366-7321-aa55-82d3721b16a4` | market-event package, schema export/check, shared fixtures                   | COMPLETE |
| Python shadow collector    | Agent `01a0c863-1614-7c70-a925-893e441d770f` | `services/cryptofeed-collector/**`, shared fixtures                          | COMPLETE |
| Integration and governance | Parent thread                                | root configuration, cross-language parity, review, full gates, plan/progress | PAUSED   |

## Historical M11.2 Checkpoint (Superseded 2026-10-15)

- M11.1 architecture is approved.
- ADR-057 through ADR-059 are accepted.
- The M11.2-M11.8 implementation plan is written.
- Documentation formatting, progress check, progress policy, and diff check pass.
- M11.2 workers were started with disjoint write scopes.
- Initial focused tests passed independently, but integration found divergent
  payload, health-record, and event-identity contracts.
- Both workers were reassigned a single canonical contract. Event IDs exclude
  receipt/provenance and use prefixed UTF-8 FNV-1a 64 canonical hashes.
- The Python worker hit a usage limit with a reported reset at 15:28 local time.
  The reset had passed when checked at 16:37, so the same agent was resumed from
  its parity checkpoint without restarting the task.
- Focused parity tests and full repository tests, lint, typecheck, and build
  passed before independent review.
- GPT-5.6 review found M11.2 blockers in live-loop startup, real Cryptofeed L2
  handling, health parity, false sequence-gap assumptions, stale/reconnect
  wiring, schema equivalence, receipt time, Unicode identity, archive dedupe,
  replay cutoffs, and strict configuration validation.
- Corrections were reassigned to the existing workers. M11.2 remains in progress
  regardless of the earlier green tests.
- Audit-correction verification reached 13 focused TypeScript tests, 20 Python
  tests, 446 repository tests, lint, typecheck, and production build passing.
- The resumed GPT-5.6 review closed nested-loop startup, real L2 object handling,
  health-envelope shape, receipt timestamps, Unicode identity, and strict config.
- Remaining blockers are lowercase venue enforcement, schema equivalence,
  thread-safe writer rotation, honest gap/reconnect observability, startup stale
  coverage, receipt-time replay cutoff, indexed exact dedupe, strict prefix
  isolation, and corrupt-tail restart recovery. Final corrections are assigned.
- A live observation remains pending because this environment cannot reach PyPI
  to install Cryptofeed. Do not claim live verification from static tests.
- The final GPT-5.6 review cleared receipt-time replay, exact indexed dedupe,
  prefix isolation, corrupt-tail restart, startup stale detection, and ordinary
  concurrent rotation. It found divergent checked schemas, permissive Python
  deserialization, a stale-thread shutdown race, and misleading terminal-error
  reconnect labeling.
- Closure corrections now generate/check Python-service schema artifacts from
  TypeScript, make Python parsing strict, join the stale monitor before writer
  close, and replace fabricated lifecycle signals with collector-error and
  explicit observability records.
- Final local gates on 2026-09-23 passed: schema sync, 17 focused TypeScript
  tests, 29 Python tests, 65 repository files and 450 tests, typecheck, lint,
  production build, progress check, progress policy, and diff check.
- Final independent integration review was requested from agent
  `01a0c95c-ebca-7392-bf06-b9332fcdf9b7` after the green gates.
- Final review cleared exact schema artifacts, lifecycle observability,
  collector-error labeling, stale-monitor shutdown, writer close, replay cutoff,
  prefix isolation, corrupt-tail recovery, and indexed dedupe. It found Python
  value validation still accepts empty identifiers, an unknown instrument type,
  and booleans as integer timestamps or sequences; correction is assigned.
- The correction closes those value checks, adds malformed-record coverage, and
  passes 31 Python tests, 17 focused TypeScript tests, and schema synchronization.
  Independent re-review found one remaining medium mismatch: TypeScript accepts
  any sequence string, including empty and nonnumeric strings, while Python
  rejects them. All other strict-parser probes now agree.
- The user paused all work. All agents were closed and the six-hour automation
  was paused. No further command should run until the user explicitly resumes.
- Existing unrelated `.gitignore` changes must be preserved.

## Next Actions

1. Architect reviews the inherited M11.4/M11.5 correction and M11.6 checkpoint 1
   safety boundaries.
2. Product owner supplies a TypeSafe API key through secure server-side environment
   configuration if a bounded live JEV shadow observation is approved.
3. Decide whether Minara is the narrator provider and approve its endpoint,
   authentication, retention, structured-output, and cost-limit contract.
4. Add the server-only integration entry point and durable audit storage as a separate
   reviewed checkpoint; keep browser code and chart/risk state isolated.
5. Do not begin M11.7 calibration until recorded shadow decisions exist and M11.6
   review gates are accepted.

## Blockers

- A live JEV verification requires `TYPESAFE_API_KEY`; it is not configured.
- A concrete Minara narrator adapter requires an approved gateway URL,
  authentication method, structured-output behavior, retention policy, and cost
  limits. No Minara environment configuration is present.
- Review and merge authorization remain required before server integration,
  deployment, UI work, or M11.7 begins.
