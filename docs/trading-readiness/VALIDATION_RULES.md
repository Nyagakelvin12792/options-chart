# Trading-Readiness Validation Rules

## Comparable References

Raw open interest and gross-gamma concentration are pass/fail comparable only
when currency, contract universe, expiry, strike, and unit definitions match.
Signed GEX and Gamma Flip are pass/fail comparable only when call/put sign,
sticky-IV behavior, time floor, spot grid, and crossing-selection rules match.
Unknown vendor methodology is observational and cannot fail or approve the
engine.

## Discrepancies

- `CRITICAL`: equivalent calculations exceed tolerance, source reconciliation
  fails, or a selected wall differs from the qualifying raw concentration.
- `WARNING`: incomplete or degraded evidence that does not prove an incorrect
  result.
- `INFO`: expected differences or observational comparisons with non-equivalent
  methodology.

A critical discrepancy remains unexplained until its cause, affected scope,
and resolution are recorded. M9 cannot exit with an unexplained critical item.

## Session Classification

Using 24 closed Binance BTCUSDT 1-hour candles:

- `HIGH_VOLATILITY`: session range is at least 5% or one hourly close-to-close
  move is at least 2%.
- `QUIET`: session range is at most 1.5% and every hourly close-to-close move is
  at most 0.75%.
- `NORMAL`: neither rule applies.

These thresholds are versioned by `trading-readiness-audit-v1`.

## Full-Day Certification

Certification requires at least 24 elapsed hours between persisted browser
telemetry samples. Accelerated update tests and eight-hour runs cannot satisfy
M9.10. The chart instance, listener count, Binance socket, calculation worker,
DOM growth, and heap growth must remain within their pinned bounds.
