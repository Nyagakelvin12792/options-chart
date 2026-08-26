# M2 Live Exit Verification

Status: COMPLETE
Owner: Codex
Updated: 2026-08-26

Command: `npm run verify:deribit-live -- --disableConsoleIntercept`

Evidence: Live Deribit returned 956 active BTC inverse options and 956 normalized summaries containing 431,560.5 BTC total OI with IV on every contract. Five-sample clock sync selected 233 ms RTT and 1,592.5 ms accepted skew. The consolidated mark and BTC index channels reached LIVE, a forced disconnect created exactly one replacement socket, subscriptions replayed, REST reconciliation passed, and recovery returned to LIVE.
