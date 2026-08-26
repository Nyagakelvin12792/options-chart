import type {
  DomainEventMetadata,
  MarketPrice,
  OptionInstrument,
  OptionSnapshot,
} from "@options-chart/domain";
import { NormalizationError } from "@options-chart/shared";

import type {
  DeribitBookSummaryPayload,
  DeribitIndexUpdatePayload,
  DeribitMarkPriceUpdatePayload,
  DeribitOptionInstrumentPayload,
} from "./api-schemas";
import type { DeribitMarkUpdate, DeribitSnapshotBuildResult } from "./types";

export const DERIBIT_INSTRUMENT_SCHEMA_VERSION = "deribit-instrument-v1";
export const DERIBIT_BOOK_SUMMARY_SCHEMA_VERSION = "deribit-book-summary-v1";
export const DERIBIT_MARK_STREAM_SCHEMA_VERSION = "deribit-mark-stream-v1";
export const DERIBIT_INDEX_STREAM_SCHEMA_VERSION = "deribit-index-stream-v1";

const metadata = (
  sourceTimestamp: number,
  receivedTimestamp: number,
  schemaVersion: string,
): DomainEventMetadata => ({
  source: "deribit",
  sourceTimestamp,
  receivedTimestamp,
  normalizedTimestamp: Date.now(),
  schemaVersion,
});

export const normalizeDeribitOptionInstrument = (
  instrument: DeribitOptionInstrumentPayload,
  receivedTimestamp: number,
): OptionInstrument => ({
  metadata: metadata(
    receivedTimestamp,
    receivedTimestamp,
    DERIBIT_INSTRUMENT_SCHEMA_VERSION,
  ),
  instrumentName: instrument.instrument_name,
  symbol: "BTC",
  expiry: instrument.expiration_timestamp,
  strike: instrument.strike,
  optionType: instrument.option_type,
  creationTimestamp: instrument.creation_timestamp,
  isActive: instrument.is_active && instrument.state === "open",
  settlementAsset: "BTC",
  contractMultiplierBtc: 1,
});

export const normalizeDeribitMarkUpdate = (
  update: DeribitMarkPriceUpdatePayload,
  receivedTimestamp: number,
): DeribitMarkUpdate => ({
  metadata: metadata(
    update.timestamp,
    receivedTimestamp,
    DERIBIT_MARK_STREAM_SCHEMA_VERSION,
  ),
  instrumentName: update.instrument_name,
  markPriceBtc: update.mark_price,
  // This consolidated channel publishes IV as a decimal (0.9 means 90%).
  markIvDecimal: update.iv,
});

export const normalizeDeribitIndexUpdate = (
  update: DeribitIndexUpdatePayload,
  receivedTimestamp: number,
): MarketPrice => ({
  metadata: metadata(
    update.timestamp,
    receivedTimestamp,
    DERIBIT_INDEX_STREAM_SCHEMA_VERSION,
  ),
  symbol: "BTC-USD",
  price: update.price,
});

export const normalizeDeribitRestIndex = (
  price: number,
  receivedTimestamp: number,
): MarketPrice => ({
  metadata: metadata(
    receivedTimestamp,
    receivedTimestamp,
    DERIBIT_BOOK_SUMMARY_SCHEMA_VERSION,
  ),
  symbol: "BTC-USD",
  price,
});

export const buildDeribitOptionsSnapshot = (
  catalog: readonly OptionInstrument[],
  summaries: readonly DeribitBookSummaryPayload[],
  receivedTimestamp: number,
): DeribitSnapshotBuildResult => {
  const summaryByName = new Map<string, DeribitBookSummaryPayload>();
  for (const summary of summaries) {
    if (summaryByName.has(summary.instrument_name)) {
      throw new NormalizationError(
        "Deribit book summary contains duplicate instruments",
        {
          source: "deribit",
          operation: "build-options-snapshot",
          timestamp: receivedTimestamp,
          retryable: false,
          context: { instrumentName: summary.instrument_name },
        },
      );
    }
    summaryByName.set(summary.instrument_name, summary);
  }

  const activeCatalog = catalog.filter(
    (instrument) =>
      instrument.isActive && instrument.expiry > receivedTimestamp,
  );
  const catalogNames = new Set(
    activeCatalog.map((instrument) => instrument.instrumentName),
  );
  const missingSummaryInstrumentNames: string[] = [];
  const normalized: OptionSnapshot[] = [];

  for (const instrument of activeCatalog) {
    const summary = summaryByName.get(instrument.instrumentName);
    if (summary === undefined) {
      missingSummaryInstrumentNames.push(instrument.instrumentName);
      continue;
    }
    const quoteMetadata = metadata(
      summary.creation_timestamp,
      receivedTimestamp,
      DERIBIT_BOOK_SUMMARY_SCHEMA_VERSION,
    );
    normalized.push({
      instrument,
      quote: {
        metadata: quoteMetadata,
        instrumentName: instrument.instrumentName,
        symbol: "BTC",
        expiry: instrument.expiry,
        strike: instrument.strike,
        optionType: instrument.optionType,
        underlyingPriceUsd: summary.underlying_price,
        openInterestBtc: summary.open_interest,
        markPriceBtc: summary.mark_price,
        markIvDecimal: summary.mark_iv === null ? null : summary.mark_iv / 100,
        interestRateDecimal: summary.interest_rate,
      },
    });
  }

  const unknownSummaryInstrumentNames = summaries
    .map((summary) => summary.instrument_name)
    .filter((name) => !catalogNames.has(name))
    .sort();
  const sourceTimestamp = summaries.reduce(
    (latest, summary) => Math.max(latest, summary.creation_timestamp),
    receivedTimestamp,
  );

  normalized.sort((left, right) =>
    left.instrument.expiry !== right.instrument.expiry
      ? left.instrument.expiry - right.instrument.expiry
      : left.instrument.strike !== right.instrument.strike
        ? left.instrument.strike - right.instrument.strike
        : left.instrument.optionType.localeCompare(right.instrument.optionType),
  );

  return {
    snapshot: {
      metadata: metadata(
        sourceTimestamp,
        receivedTimestamp,
        DERIBIT_BOOK_SUMMARY_SCHEMA_VERSION,
      ),
      currency: "BTC",
      instruments: normalized,
    },
    missingSummaryInstrumentNames: missingSummaryInstrumentNames.sort(),
    unknownSummaryInstrumentNames,
  };
};
