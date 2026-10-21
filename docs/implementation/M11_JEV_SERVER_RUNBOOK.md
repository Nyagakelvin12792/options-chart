# M11.6 Jev Shadow Provider Runbook

## Scope

This runbook configures the read-only Jev shadow provider. It does not enable
live execution, change deterministic risk, or expose the TypeSafe credential to
browser code. The provider remains disabled unless both its explicit enable flag
and kill-switch release are configured.

## Local Key Location

Create this ignored file:

```text
apps/web/.env.local
```

Add the secret there. Never add it to `.env.example`, source code, a commit,
browser-prefixed variables, screenshots, logs, or chat messages.

```text
TYPESAFE_API_KEY=replace_with_your_real_key
JEV_SHADOW_ENABLED=false
JEV_KILL_SWITCH=true
JEV_MODEL=jev-latest
JEV_AUDIT_DIR=.data/jev-audit
JEV_TIMEOUT_MS=2000
JEV_MAX_CALLS_PER_HOUR=12
JEV_MAX_CALLS_PER_DAY=50
JEV_MAX_REQUEST_BYTES=65536
```

The first validation starts with `JEV_SHADOW_ENABLED=false` and
`JEV_KILL_SWITCH=true`. After local tests and the authenticated health endpoint
pass, enable a single bounded observation by setting:

```text
JEV_SHADOW_ENABLED=true
JEV_KILL_SWITCH=false
JEV_MAX_CALLS_PER_HOUR=1
JEV_MAX_CALLS_PER_DAY=1
```

Restart the local Next.js server after changing environment variables. Restore
the kill switch immediately after the observation.

## Health And Assessment Endpoints

Both endpoints require the existing dashboard access check.

```text
GET  /api/intelligence/jev
POST /api/intelligence/jev
```

`GET` exposes only readiness, feature flags, persistence type, model, timeout,
and request budgets. It never returns the key. `POST` accepts one validated
`DecisionContextV1`, performs one default-off Jev shadow assessment, persists
the immutable provider-run record, and returns the stored record. Identical
successful contexts reuse their prior record without another provider call.

## Audit Storage

Local audit records are appended and flushed to:

```text
apps/web/.data/jev-audit/provider-runs.ndjson
```

The directory is ignored by Git. Corrupt audit data, failed writes, exhausted
request budgets, disabled state, missing credentials, and active kill switch all
fail closed.

Vercel's function filesystem is temporary and is not accepted as durable audit
storage. The endpoint reports `JEV_DURABLE_STORE_UNAVAILABLE` when `VERCEL=true`.
Do not enable Jev in a Vercel environment until a shared durable-store adapter is
implemented and reviewed.

## Vercel Credential Placement

When shared durable storage is ready, add `TYPESAFE_API_KEY` in the Vercel
project's Settings, under Environment Variables. Scope it to Preview first. Do
not prefix it with `NEXT_PUBLIC_`. Keep `JEV_SHADOW_ENABLED=false` and
`JEV_KILL_SWITCH=true` in Production until the preview observation is reviewed.

## Emergency Stop

Set either of these and restart/redeploy:

```text
JEV_KILL_SWITCH=true
JEV_SHADOW_ENABLED=false
```

No provider request is attempted while either safety condition blocks readiness.
