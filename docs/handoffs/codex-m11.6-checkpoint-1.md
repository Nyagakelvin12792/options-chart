> > > COMPLETED BY: Codex
> > > STATUS: REVIEW REQUIRED
> > > BRANCH: codex/m11.6-shadow-providers
> > > COMMIT: cff6946ff201f6197b74ce952c8e81ba5fc897a4
> > > TESTS: 6 focused files / 43 tests passed; 77 repository files / 544 tests passed; typecheck, lint, build, and diff check passed
> > > NEXT AGENT: Architect
> > > ACTION REQUIRED: Review the M11.6 provider and narration boundaries, then authorize the server integration and bounded live-provider checkpoint
> > > TARGET: packages/decision-engine and docs/progress/M11/M11.6.md

# Codex M11.6 Checkpoint 1 Handoff

## Outcome

The first M11.6 checkpoint adds the provider-neutral safety boundary, a concrete
JEV typed-decision adapter, and the post-convergence narration contracts. All are
default-off and read-only. The deterministic M11.5 convergence result remains the
authority for risk and direction.

## Safety Boundary

- A provider result must match the exact decision context and configured provider.
- Superseded, timed-out, cancelled, malformed, or unavailable results publish no
  assessment and produce an auditable fail-closed run record.
- The JEV payload contains compact categorical state and one closed-choice
  decision question. It excludes raw market streams, numeric evidence, risk
  calculations, and secrets.
- Narration receives only the already converged choice, reason codes, warnings,
  source health, IDs, and evidence-version provenance. It cannot modify the
  assessment or convergence result.
- Narration is cached by material input and provider configuration, while explicit
  regeneration or a newer generation cancels and invalidates obsolete work.

## Verification Evidence

- `npm exec vitest -- run packages/decision-engine`: 6 files and 43 tests passed.
- `npm test`: 77 files and 544 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.

No live external-provider request was made. The environment contains no TypeSafe
or Minara credentials, and the implementation does not read provider credentials
from browser code or include a user-facing route.

## Review Questions

1. Confirm that `DecisionContextV1` categorical state is the complete approved JEV
   boundary and that no numeric evidence should cross it.
2. Confirm that provider run records should persist the requested adapter version
   while the assessment stores the actual returned model version.
3. Confirm whether Minara is the selected narrator gateway. If so, approve its
   URL, authentication, structured-output contract, retention policy, and cost
   limits before a concrete adapter is added.
4. Authorize a bounded server-only live JEV observation after the TypeSafe key is
   supplied through secure environment configuration.

## Excluded From This Checkpoint

No UI, deployment, production route, live execution, private exchange access,
paper ledger, calibration claim, or provider promotion is included.
