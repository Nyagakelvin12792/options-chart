import type { Candle } from "@options-chart/domain";

export function getFixtureCandles(): Candle[] {
  const candles: Candle[] = [];
  const start = 1_700_000_000_000;
  const interval = 60_000;
  let price = 65_000;

  for (let i = 0; i < 200; i++) {
    const openTime = start + i * interval;
    const closeTime = openTime + interval - 1;

    // Introduce cyclical volatility and zero-range candle
    let open = price;
    const delta = Math.sin(i / 10) * 80 + ((i % 5) - 2) * 20;
    let close = open + delta;
    let high = Math.max(open, close) + 40;
    let low = Math.min(open, close) - 40;
    let vol = 15 + Math.abs(Math.cos(i / 8)) * 50;

    // Insert an explicit zero-range candle at index 100
    if (i === 100) {
      open = price;
      close = price;
      high = price;
      low = price;
      vol = 80;
    }

    candles.push({
      metadata: {
        source: "binance",
        sourceTimestamp: closeTime,
        receivedTimestamp: closeTime,
        normalizedTimestamp: closeTime,
        schemaVersion: "fixture-v1",
      },
      symbol: "BTCUSDT",
      interval: "1m",
      openTime,
      closeTime,
      open,
      high,
      low,
      close,
      volume: vol,
      quoteVolume: vol * close,
      tradeCount: 25,
      isClosed: i < 180, // Last 20 candles forming/unclosed for replay testing
    });

    price = close;
  }

  return candles;
}
