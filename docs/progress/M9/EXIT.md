# Milestone 9 Exit Evidence

## Status: IN PROGRESS

- Date opened: 2026-08-27
- Owner: Codex
- Progress: 5 / 12 tasks complete

Completed evidence:

- A fresh 1,066-contract Deribit snapshot spans 13 active expiries; three expiries pass OI and raw-wall reconciliation with no unexplained critical discrepancy.
- Daily source and audit artifacts are hashed and versioned under docs/audits/M9/2026-08-27/.
- Independent TypeScript/Python comparison passes at least 100,000 vectors within 1e-7.
- Session classification and discrepancy rules are deterministic and unit tested.
- Full-day browser telemetry can be persisted, and certification rejects observations shorter than 24 elapsed hours.

Open exit evidence:

- Actual expiry rollover observation.
- Actual high-volatility session observation.
- Actual quiet session observation.
- Actual near-expiry session observation.
- Literal 24-hour browser stability certification.

Formula versions remain NOT FROZEN and the v1.0.0 tag has not been created. M9 cannot be approved until the open evidence is collected and no critical data-integrity issue remains.
