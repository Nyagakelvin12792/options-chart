import type { Candle } from "@options-chart/domain";

export function createFixtureCandles(count = 250, startPrice = 62_000): readonly Candle[] {
  const baseTime = 1_700_000_000_000;
  const intervalMs = 60_000;
  const candles: Candle[] = [];

  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const openTime = baseTime + i * intervalMs;
    const closeTime = openTime + intervalMs - 1;

    // Realistic wave pattern: initial rally, local peak around candle 80, pullback to candle 150, secondary breakout
    let trend = 0;
    if (i < 80) trend = 15;
    else if (i < 150) trend = -12;
    else trend = 18;

    const noise = ((i % 13) - 6) * 8;
    const open = price;
    const close = Math.round((open + trend + noise) * 100) / 100;
    const high = Math.round((Math.max(open, close) + Math.abs((i % 7) + 2) * 12) * 100) / 100;
    const low = Math.round((Math.min(open, close) - Math.abs((i % 5) + 2) * 12) * 100) / 100;
    const volume = Math.round((15 + Math.sin(i / 10) * 8 + (i % 11) * 3) * 10) / 10;

    candles.push({
      metadata: {
        source: "binance",
        sourceTimestamp: closeTime,
        receivedTimestamp: closeTime,
        normalizedTimestamp: closeTime,
        schemaVersion: "1.0.0",
      },
      symbol: "BTCUSDT",
      interval: "1m",
      openTime,
      closeTime,
      open,
      high,
      low,
      close,
      volume,
      quoteVolume: Math.round(volume * close * 100) / 100,
      tradeCount: 45 + (i % 20),
      isClosed: true,
    });

    price = close;
  }

  return candles;
}
