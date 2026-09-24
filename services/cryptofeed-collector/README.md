# Cryptofeed Shadow Collector

Local-only M11.2 scaffold for Binance BTC-USDT Spot trades and L2 book events.

The collector writes normalized append-only NDJSON records. Live collection is
opt-in and uses public market data only. No credentials are required.

```bash
python -m pip install -e ".[test]"
python -m pytest
python -m cryptofeed_collector.cli --config config.example.json --live
```

Without `--live`, the CLI validates configuration and exits. The example config
keeps live collection disabled.

## Health and lifecycle limits

The live runner records callback receipt timestamps and runs a local stale
monitor while `FeedHandler.run()` is active. If the Cryptofeed run loop exits
with an exception, the collector stops the stale monitor, waits for it to join,
emits a canonical `collector-error` health record, and re-raises the terminal
exception.

Cryptofeed 2.4 owns Binance depth range validation before it emits a normalized
`OrderBook`. The normalized callback does not expose Binance raw `U..u`
missing-range evidence or internal reconnect attempts. This collector therefore
does not infer `previous + 1` gaps, does not classify sequence regressions as
gaps, and does not fabricate internal reconnect health. It records only local
observable evidence: stale callbacks, unsupported configured channels,
duplicate suppression, terminal collector errors, and startup `observability`
records for the Cryptofeed-owned signals that are not visible through normalized
callbacks.

## Duplicate suppression

The writer keeps a bounded in-memory LRU of recent market event IDs for the hot
path and a stdlib SQLite index for exact persistent duplicate detection. The
index stores the original `firstSeenAtMs` and is rebuilt from strict
`<prefix>-*.ndjson` archive files on startup, so restart and LRU eviction do not
silently admit older duplicates.
