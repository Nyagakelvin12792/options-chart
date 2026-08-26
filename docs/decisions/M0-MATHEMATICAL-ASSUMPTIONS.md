# M0 Mathematical Assumptions

These contracts are frozen for implementation version `1.0.0`. They remain explicitly provisional where M4 sensitivity testing is named.

## Frozen Contracts

- Universe: active BTC-settled inverse Deribit BTC options only.
- One normalized contract represents one BTC; normalized OI is already measured in BTC.
- Canonical IV is decimal; Deribit `mark_iv` percentage points are divided by 100 exactly once.
- Modeled sign convention: calls positive, puts negative.
- GEX unit: USD hedge-notional sensitivity for a 1% BTC move.
- GEX formula: `sign * gamma * openInterestBtc * spotUsd^2 * 0.01`.
- Average IV: OI-weighted mark IV over eligible contracts.
- Put/call OI ratio returns `null` when call OI is zero.
- Gamma profile uses sticky IV per contract during the spot sweep.
- Headline Gamma Flip is the qualifying crossing nearest spot; exact ties select the lower crossing.
- Profile contracts below 15 minutes to expiry are excluded from Gamma metrics but remain eligible for OI and valid Max Pain calculations.
- Default expiry scope is at most 30 DTE.
- Full profile recomputation is coalesced to at most once every two seconds while dirty.

## Provisional Guardrails

- Gamma profile search band: 70% to 130% of current Deribit underlying.
- Crossing significance: 0.5% of profile peak on both bracketing sides.
- Wall strike band: 75% to 125% of current underlying.
- Minimum wall same-side gross share: 1%.
- Minimum wall OI at strike: 1 BTC.

## Open Validation

- Select and document an interest-rate fallback only after Greek reconciliation evidence.
- Run the planned crossing-threshold and near-expiry sensitivity tests in M4.
- Record any change to these contracts in the ADR register and bump the affected calculation version.

The executable constants live in `packages/options-engine/src/assumptions.ts` and `packages/options-engine/src/version.ts`.
