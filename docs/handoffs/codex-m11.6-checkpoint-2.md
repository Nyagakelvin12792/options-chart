> > > COMPLETED BY: Codex
> > > STATUS: REVIEW REQUIRED
> > > BRANCH: codex/m11.6-checkpoint-2
> > > COMMIT: b48ffa84e5a50bca5183e99b389b791dea66d87c
> > > TESTS: 3 focused files / 10 tests passed; 80 repository files / 554 tests passed; typecheck, lint, production build, and diff check passed
> > > NEXT AGENT: Architect
> > > ACTION REQUIRED: Review the server boundary and authorize one budget-capped local live JEV observation; select shared persistence before Vercel activation
> > > TARGET: apps/web/app/api/intelligence/jev, apps/web/lib/market-intelligence, and docs/implementation/M11_JEV_SERVER_RUNBOOK.md

# Codex M11.6 Checkpoint 2 Handoff

## Outcome

Checkpoint 2 connects the previously verified JEV adapter to an authenticated,
server-only Next.js route. It remains disabled by default, has a default-active
kill switch, and cannot return an assessment unless the immutable provider-run
record is durably flushed to the configured local audit file.

## Controls Delivered

- Server-only `TYPESAFE_API_KEY`; health output never includes the key.
- Existing dashboard authorization on both health and assessment requests.
- Strict context schema plus content-addressed identity validation.
- Request-body limit, timeout, cancellation, sanitized errors, and no-store
  responses.
- Rolling hourly and daily request budgets.
- Same-context single-flight behavior, stored-success reuse, and serialized local
  provider calls to prevent budget races.
- Append-only NDJSON records with runtime validation, hash verification, duplicate
  suppression, corrupt-data rejection, and explicit flush before success.
- Production guard that rejects filesystem durability when `VERCEL=1`.
- Runbook covering secret placement, one-call observation settings, Vercel
  placement, and emergency stop.

## Verification Evidence

- Focused server suite: 3 files and 10 tests passed.
- Full repository suite: 80 files and 554 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed and emitted `/api/intelligence/jev` as a dynamic route.
- `git diff --check`: passed.

Tests use a recorded JEV response; no external provider call was made. No secret,
provider output, route, or audit record was deployed.

## Live Observation Gate

The product owner must place the key only in `apps/web/.env.local`. Begin with
the provider disabled and the kill switch active. After the authenticated health
check, set both request budgets to one, enable the provider, release the kill
switch, send one valid current `DecisionContextV1`, inspect the persisted record,
and immediately restore the kill switch.

## Remaining Architecture Decision

The NDJSON store is durable for the local long-lived process and bounded local
observation. It is intentionally rejected on Vercel because function-local files
are temporary. A shared durable-store adapter must be selected, implemented, and
reviewed before preview or production provider activation.

Minara remains outside this checkpoint. A concrete narrator adapter still
requires an approved endpoint, authentication, retention, structured-output, and
cost-control contract.
