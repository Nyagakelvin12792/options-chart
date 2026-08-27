# Known V1 Limitations

- Signed GEX uses the documented calls-positive, puts-negative heuristic. It is
  not observed dealer inventory.
- Sticky IV is held per contract during Gamma-profile spot sweeps; skew and
  smile dynamics are not modeled.
- The headline Gamma Flip is the nearest qualifying crossing. Other crossings
  remain audit metadata but are not all shown as primary chart levels.
- Call and Put Walls are raw snapshot concentrations without persistence or
  hysteresis.
- Max Pain is expiry-specific and is not a directional forecast.
- Contracts with less than 15 minutes to expiry remain in OI and Max Pain but
  are excluded from Gamma profiles and wall rankings.
- Public exchange feeds can be delayed, unavailable, or regionally restricted.
- Historical Gamma levels are not retained outside explicit audit snapshots.
- No high-volatility, quiet, rollover, near-expiry, or literal 24-hour M9
  certification may be inferred from accelerated tests.
