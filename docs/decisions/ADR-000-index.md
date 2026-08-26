# Architecture Decision Register

Registered for the M0 architecture lock on 2026-08-26. ACCEPTED entries are implementation contracts; changing one requires an ADR update, affected tests, and a calculation version change when formulas or metric meaning move.

| ID      | Status   | Decision                                                                                            |
| ------- | -------- | --------------------------------------------------------------------------------------------------- |
| ADR-001 | ACCEPTED | Binance BTCUSDT Spot is the master candlestick source.                                              |
| ADR-002 | ACCEPTED | Deribit is the BTC options source.                                                                  |
| ADR-003 | ACCEPTED | Deribit index context is used for Deribit option mathematics.                                       |
| ADR-004 | ACCEPTED | TradingView Lightweight Charts is the primary chart engine.                                         |
| ADR-005 | ACCEPTED | KLineChart is the fallback chart engine.                                                            |
| ADR-006 | ACCEPTED | Chart engines sit behind `ChartAdapter`.                                                            |
| ADR-007 | ACCEPTED | Production calculations are TypeScript.                                                             |
| ADR-008 | ACCEPTED | Python exists only as an independent reference implementation.                                      |
| ADR-009 | ACCEPTED | Full Gamma profile calculations run in a Web Worker.                                                |
| ADR-010 | ACCEPTED | Vercel hosts the app and browsers connect directly to exchange WebSockets.                          |
| ADR-011 | ACCEPTED | Deribit OI uses periodic full-chain REST snapshots.                                                 |
| ADR-012 | ACCEPTED | Deribit live mark/IV uses `markprice.options.btc_usd`.                                              |
| ADR-013 | ACCEPTED | The v1 app is read-only analytics.                                                                  |
| ADR-014 | ACCEPTED | Max Pain is expiry-specific.                                                                        |
| ADR-015 | ACCEPTED | Signed GEX is labeled modeled, not known dealer inventory.                                          |
| ADR-016 | ACCEPTED | The v1 universe is BTC-settled inverse Deribit BTC options only.                                    |
| ADR-017 | ACCEPTED | v0 ships Lightweight Charts only; KLineChart stays behind the adapter as a post-v0 fallback.        |
| ADR-018 | ACCEPTED | Average IV is OI-weighted Deribit mark IV.                                                          |
| ADR-019 | ACCEPTED | Deribit `mark_iv` percentage points normalize to decimals before Black-Scholes.                     |
| ADR-020 | ACCEPTED | Full profile recomputation is coalesced to at most once per two seconds in v0.                      |
| ADR-021 | ACCEPTED | v1 asset scope is BTC only.                                                                         |
| ADR-022 | ACCEPTED | Required chart timeframes are 1m, 5m, 15m, 1h, 4h, 1d, and 1w.                                      |
| ADR-023 | ACCEPTED | Binance Spot volume is a required pane.                                                             |
| ADR-024 | ACCEPTED | v1 drawing tools are horizontal and vertical lines only.                                            |
| ADR-025 | ACCEPTED | Default Gamma expiry scope is at most 30 DTE.                                                       |
| ADR-026 | ACCEPTED | Expiry presets are 0DTE, Next Expiry, This Friday, Next Friday, <=7 DTE, <=30 DTE, All, and Custom. |
| ADR-027 | ACCEPTED | User-facing historical Gamma storage is out of v1 scope.                                            |
| ADR-028 | ACCEPTED | Desktop is the primary launch target.                                                               |
| ADR-029 | ACCEPTED | The project uses the dedicated `options-chart` repository.                                          |
| ADR-030 | ACCEPTED | Gamma territory uses subtle regime shading and a labeled Gamma Flip.                                |
| ADR-031 | ACCEPTED | v1 includes a collapsible Gamma-by-price profile.                                                   |
| ADR-032 | ACCEPTED | Authentication uses Google with one allowlisted account.                                            |
| ADR-033 | ACCEPTED | The initial deployment uses a free Vercel URL.                                                      |
| ADR-034 | ACCEPTED | Product-owner approval occurs at milestone exits.                                                   |
| ADR-035 | ACCEPTED | Codex is primary implementer; Antigravity/Gemini is independent reviewer and browser verifier.      |
| ADR-036 | ACCEPTED | Ox Alpha is an adversarial reviewer, not sole authority for critical math or security changes.      |
| ADR-037 | ACCEPTED | Calculated levels use a right-side Level Rail with name and exact price.                            |
| ADR-038 | ACCEPTED | Label collisions are resolved visually without moving the underlying price level.                   |
| ADR-039 | ACCEPTED | The primary screen is chart-first; secondary analytics use progressive disclosure.                  |

## Open Validation Items

The following are explicit research items, not M0 architecture blockers:

- Calibrate the interest-rate fallback against Deribit-published Greeks in M4.
- Test Gamma crossing significance at 0.25%, 0.50%, and 1.00% in M4.
- Test the 15-minute profile floor and wall guardrails in M4.
- Benchmark full Deribit batch validation and chart updates in M0.5.
- Confirm browser-direct endpoint reachability from the deployed Vercel environment in M0.5.
