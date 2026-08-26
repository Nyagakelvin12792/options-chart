import type { OptionsChainSnapshot } from "@options-chart/domain";

import { DeribitConsolidatedSnapshotSchema } from "./schemas";

export const DERIBIT_SNAPSHOT_SCHEMA_VERSION = "m0.5-deribit-snapshot-v1";

export const parseDeribitSnapshot = (
  payload: unknown,
  receivedTimestamp: number,
): OptionsChainSnapshot => {
  const snapshot = DeribitConsolidatedSnapshotSchema.parse(payload);
  const normalizedTimestamp = Date.now();
  const metadata = {
    source: "deribit" as const,
    sourceTimestamp: snapshot.timestamp,
    receivedTimestamp,
    normalizedTimestamp,
    schemaVersion: DERIBIT_SNAPSHOT_SCHEMA_VERSION,
  };

  return {
    metadata,
    currency: "BTC",
    instruments: snapshot.instruments.map((item) => ({
      instrument: {
        metadata,
        instrumentName: item.instrument_name,
        symbol: "BTC",
        expiry: item.expiration_timestamp,
        strike: item.strike,
        optionType: item.option_type,
        creationTimestamp: item.creation_timestamp,
        isActive: item.expiration_timestamp > receivedTimestamp,
        settlementAsset: "BTC",
        contractMultiplierBtc: 1,
      },
      quote: {
        metadata,
        instrumentName: item.instrument_name,
        symbol: "BTC",
        expiry: item.expiration_timestamp,
        strike: item.strike,
        optionType: item.option_type,
        underlyingPriceUsd: item.underlying_price,
        openInterestBtc: item.open_interest,
        markPriceBtc: item.mark_price,
        markIvDecimal: item.mark_iv === null ? null : item.mark_iv / 100,
        interestRateDecimal: item.interest_rate,
      },
    })),
  };
};
