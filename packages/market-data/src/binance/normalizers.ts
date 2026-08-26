import type { Candle, CandleInterval } from "@options-chart/domain";

import { BinanceKlinePageSchema } from "./schemas";

export const BINANCE_KLINE_SCHEMA_VERSION = "binance-rest-kline-v1";

export const parseBinanceKlines = (
  payload: unknown,
  receivedTimestamp: number,
  interval: CandleInterval = "1h",
): readonly Candle[] => {
  const klines = BinanceKlinePageSchema.parse(payload);

  return klines.map((kline) => ({
    metadata: {
      source: "binance",
      sourceTimestamp: kline[6],
      receivedTimestamp,
      normalizedTimestamp: Date.now(),
      schemaVersion: BINANCE_KLINE_SCHEMA_VERSION,
    },
    symbol: "BTCUSDT",
    interval,
    openTime: kline[0],
    closeTime: kline[6],
    open: Number(kline[1]),
    high: Number(kline[2]),
    low: Number(kline[3]),
    close: Number(kline[4]),
    volume: Number(kline[5]),
    quoteVolume: Number(kline[7]),
    tradeCount: kline[8],
    isClosed: kline[6] <= receivedTimestamp,
  }));
};
