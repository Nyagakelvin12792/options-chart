import type { DomainEventMetadata } from "./event";

export type CandleInterval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w";

export interface Candle {
  readonly metadata: DomainEventMetadata;
  readonly symbol: "BTCUSDT";
  readonly interval: CandleInterval;
  readonly openTime: number;
  readonly closeTime: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly quoteVolume: number;
  readonly tradeCount: number;
  readonly isClosed: boolean;
}

export interface MarketPrice {
  readonly metadata: DomainEventMetadata;
  readonly symbol: "BTCUSDT" | "BTC-USD";
  readonly price: number;
}
