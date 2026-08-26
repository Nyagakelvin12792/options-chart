# BTC Options Metrics Dashboard

Private BTC market analytics dashboard for combining Binance BTCUSDT spot candlesticks with Deribit BTC options structure.

The first production release is intentionally read-only. It uses public market data only, requires no exchange trading keys, and must prioritize correctness, validation, and stale-data handling before visual complexity.

## Planned Scope

- Binance BTCUSDT spot candlesticks as the master chart source.
- Deribit BTC options data as the options source.
- Locally computed options metrics including Call Wall, Put Wall, Gamma Flip, Max Pain, open interest, put/call open interest, average IV, and modeled GEX.
- TradingView Lightweight Charts as the primary chart engine.
- Chart-first desktop interface with a right-side level rail.
- Vercel Hobby deployment target.
- Google authentication with one allowlisted account.

## Current Status

M0 architecture lock is complete and awaiting milestone-exit approval.

- Current plan version: `0.5.0`
- Current milestone: M0 exit review
- Production status: Not ready

See [PROJECT_PLAN.md](PROJECT_PLAN.md) for the architecture and roadmap.
See [PROGRESS.md](PROGRESS.md) for current milestone progress and validation status.

## Development Notes

Implementation should stay focused on reliability:

- validate external exchange payloads before use.
- keep calculation code separate from UI code.
- avoid silently substituting missing data with zero.
- never label stale values as live.
- version material calculation changes.
