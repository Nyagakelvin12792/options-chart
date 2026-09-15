# External Indicator Integration Contract

This contract keeps independently developed indicators compatible with the
dashboard and with each other.

## Ownership

- Anchored VWAP is developed on `feature/anchored-vwap`.
- Volume Profile is developed on `feature/volume-profile`.
- Indicator branches do not edit `dashboard-client.tsx`, options-engine,
  expiry, confluence, risk, replay, or each other's files.
- Indicator branches stop after a reviewed commit. Main-branch integration and
  deployment remain owned by the dashboard maintainer.

## Data

- Indicators consume normalized `Candle` values from `@options-chart/domain`.
- They do not fetch market data or create fallback candles.
- Underlying indicators use Binance candle volume and remain separate from
  Deribit options-volume signals.
- Inputs and outputs use UTC epoch milliseconds and explicit price/volume
  units.

## Chart Lifecycle

- The dashboard owns the single chart instance.
- Renderers integrate through `ChartAdapter`-compatible typed APIs.
- Adding, updating, hiding, or removing an indicator must not recreate the
  chart or reset its viewport.
- Every series, primitive, listener, worker, and animation frame must be
  cleaned up when its indicator is removed.

## Replay And Performance

- Replay calculations receive an explicit cutoff and never consume later
  candles.
- Calculations are deterministic for the same ordered candle sequence.
- Pointer movement may update coordinates, but must not trigger a full
  indicator recalculation.
- Indicators must remain responsive with 10,000 candles and discard stale
  results after rapid range, anchor, or timeframe changes.

## Evidence

- Pure calculations require hand-auditable fixtures and edge-case tests.
- Renderers require lifecycle tests proving that chart objects and listeners
  are not duplicated.
- Claims of parity with a proprietary platform require recorded numerical
  comparisons and documented data-feed differences.
