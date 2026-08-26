import type { DomainEventMetadata } from "./event";

export type OptionType = "call" | "put";

export interface OptionInstrument {
  readonly metadata: DomainEventMetadata;
  readonly instrumentName: string;
  readonly symbol: "BTC";
  readonly expiry: number;
  readonly strike: number;
  readonly optionType: OptionType;
  readonly creationTimestamp: number;
  readonly isActive: boolean;
  readonly settlementAsset: "BTC";
  readonly contractMultiplierBtc: 1;
}

export interface OptionQuote {
  readonly metadata: DomainEventMetadata;
  readonly instrumentName: string;
  readonly symbol: "BTC";
  readonly expiry: number;
  readonly strike: number;
  readonly optionType: OptionType;
  readonly underlyingPriceUsd: number;
  readonly openInterestBtc: number;
  readonly markPriceBtc: number | null;
  readonly markIvDecimal: number | null;
  readonly interestRateDecimal: number | null;
}

export interface OptionSnapshot {
  readonly instrument: OptionInstrument;
  readonly quote: OptionQuote;
}

export interface OptionsChainSnapshot {
  readonly metadata: DomainEventMetadata;
  readonly currency: "BTC";
  readonly instruments: readonly OptionSnapshot[];
}

export interface ExpiryBucket {
  readonly expiry: number;
  readonly daysToExpiry: number;
  readonly contracts: readonly OptionSnapshot[];
}
