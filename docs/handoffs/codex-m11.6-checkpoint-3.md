> > > COMPLETED BY: Codex
> > > STATUS: REVIEW REQUIRED
> > > BRANCH: codex/m11.6-checkpoint-3
> > > COMMIT: 834643c
> > > TESTS: 4 focused files / 17 tests passed; 81 repository files / 561 tests passed; typecheck, lint, production build, progress gates, formatting, and diff check passed
> > > NEXT AGENT: Architect
> > > ACTION REQUIRED: Review the Postgres schema and atomic budget reservation; provision Neon in Vercel Preview before authorizing one live Jev call
> > > TARGET: apps/web/lib/market-intelligence, apps/web/app/api/intelligence/jev/route.ts, and docs/implementation/M11_JEV_SERVER_RUNBOOK.md

# Codex M11.6 Checkpoint 3 Handoff

## Outcome

Checkpoint 3 removes the Vercel filesystem blocker at the code level by adding
a Neon-compatible Postgres audit store. Jev remains default-off, read-only, and
unable to affect deterministic classifications, numeric levels, chart state,
risk, credentials, or execution.

## Controls Delivered

- Explicit `filesystem` or `postgres` persistence selection.
- Server-only `DATABASE_URL` and `TYPESAFE_API_KEY`; health output exposes only
  presence and persistence type, never either value.
- Pre-call durable reservations so failed or crashed calls still consume budget.
- One atomic Postgres statement with a provider-scoped advisory lock, preventing
  concurrent Vercel functions from racing past hourly or daily limits.
- Immutable JSONB run records with runtime schema and content-hash validation.
- Unique reservation-to-record linkage, stored-success reuse, and fail-closed
  behavior for schema, reservation, read, write, conflict, and corruption errors.
- Local NDJSON reservations are append-only and flushed before provider access.
- Preview-first Neon setup and one-call shutdown procedure in the runbook.

## Verification Evidence

- Focused suite: 4 files and 17 tests passed.
- Full repository suite: 81 files and 561 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed and emitted `/api/intelligence/jev` as a dynamic route.
- Progress build/check/policy, focused Prettier check, and `git diff --check`:
  passed.

No live Jev request was made. No Vercel storage integration was created, no
environment was enabled, and nothing was deployed. The product owner reports
that the TypeSafe key is already in Vercel; its Secret classification and Preview
scope still require verification. The current Production URL returned 404 for
`/api/intelligence/jev`, confirming this branch is not on Production.

## Remaining Activation Gate

1. Review commit `834643c`.
2. Provision or attach Neon Postgres to the Vercel project.
3. Confirm Preview receives `DATABASE_URL`, `JEV_AUDIT_STORE=postgres`, the
   server-only TypeSafe key, disabled provider state, active kill switch, and
   one-call hourly/daily budgets.
4. Deploy this branch to Preview and inspect the authenticated health response.
5. Enable Preview for one sanitized call, verify its persisted record and reuse,
   confirm a different second context is budget-blocked, then immediately restore
   the kill switch and redeploy.

## Security Note

`npm audit` reports existing advisories for Next.js `16.3.3`, including a
critical `next/og` advisory fixed in `16.4.2`. This checkpoint does not use
`next/og` or `ImageResponse`, and Neon is not named in the audit findings. Apply
the Next.js upgrade as a separate reviewed security patch before Production.
