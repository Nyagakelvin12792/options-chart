# M9 Daily Audit Snapshots

Each dated directory contains an immutable Deribit source snapshot and its
versioned trading-readiness audit. The audit records the SHA-256 hash of the
source JSON, formula versions, per-expiry metrics, raw OI reconciliation,
raw-wall ranking checks, and unexplained discrepancies.

The latest daily run also records a session classification from the most
recent 24 closed Binance BTCUSDT 1-hour candles. Session labels are assigned by
the pinned rules in `tools/trading-readiness/audit.ts`; they are not selected
manually after observing the result.

Generate a live audit:

```text
npm run verify:trading-readiness-live
```

Generate from a saved Deribit snapshot:

```text
npm run validate:trading-readiness -- --input=<snapshot.json>
```
