# Trading-Readiness Runbook

## Daily Audit

1. Run `npm run verify:trading-readiness-live`.
2. Confirm at least three expiries were compared.
3. Confirm `unexplainedCriticalDiscrepancyCount` is zero.
4. Commit the dated source and audit JSON under `docs/audits/M9/`.
5. Record the observed session regime without relabeling it.

## Independent Reference

Run `npm run verify:parity` or the equivalent Vitest parity target. Vendor
figures with unknown positioning assumptions must be recorded as observational.

## Expiry Rollover

Capture schema-valid raw Deribit chain snapshots before and after an actual
nearest-expiry transition, preserving both original snapshots. Run:

```text
npm run validate:expiry-rollover -- --previous=<pre-expiry.json> --current=<post-expiry.json>
```

A passing observation requires the prior nearest expiry to have elapsed,
its removal from active expiries, and a later new nearest expiry. Commit both
snapshots and the generated JSON under `docs/audits/M9/`. Also inspect the
deployed chart's rollover behavior before marking M9.6 complete.

## Full-Day Browser Run

```text
npm run test:browser-full-day
npm run certify:browser-full-day -- --input=artifacts/trading-readiness/full-day-browser-telemetry.json --output=docs/audits/M9/full-day-browser-certification.json
```

The first command must remain active for 24 elapsed hours. The certification
command exits non-zero when duration or stability requirements are not met.

## Release Gate

Freeze formulas only after rollover, high-volatility, quiet, near-expiry, and
full-day evidence are all present. Run every quality gate, update the formula
freeze record, commit, and only then create the annotated `v1.0.0` tag.
