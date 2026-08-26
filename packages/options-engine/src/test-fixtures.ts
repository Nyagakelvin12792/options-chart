import type {
  OptionSnapshot,
  OptionsChainSnapshot,
  OptionType,
} from "@options-chart/domain";

interface OptionFixtureInput {
  readonly expiry: number;
  readonly strike: number;
  readonly optionType: OptionType;
  readonly openInterestBtc: number;
  readonly instrumentName?: string;
  readonly markIvDecimal?: number | null;
  readonly underlyingPriceUsd?: number;
  readonly interestRateDecimal?: number | null;
  readonly isActive?: boolean;
}

const metadata = (timestamp: number) => ({
  source: "deribit" as const,
  sourceTimestamp: timestamp,
  receivedTimestamp: timestamp,
  normalizedTimestamp: timestamp,
  schemaVersion: "test-v1",
});

export const createOptionFixture = (
  input: OptionFixtureInput,
): OptionSnapshot => {
  const instrumentName =
    input.instrumentName ??
    `BTC-${input.expiry}-${input.strike}-${input.optionType === "call" ? "C" : "P"}`;
  const markIvDecimal = Object.hasOwn(input, "markIvDecimal")
    ? (input.markIvDecimal ?? null)
    : 0.5;
  const interestRateDecimal = Object.hasOwn(input, "interestRateDecimal")
    ? (input.interestRateDecimal ?? null)
    : 0;
  return {
    instrument: {
      metadata: metadata(input.expiry - 1_000),
      instrumentName,
      symbol: "BTC",
      expiry: input.expiry,
      strike: input.strike,
      optionType: input.optionType,
      creationTimestamp: input.expiry - 30 * 86_400_000,
      isActive: input.isActive ?? true,
      settlementAsset: "BTC",
      contractMultiplierBtc: 1,
    },
    quote: {
      metadata: metadata(input.expiry - 1_000),
      instrumentName,
      symbol: "BTC",
      expiry: input.expiry,
      strike: input.strike,
      optionType: input.optionType,
      underlyingPriceUsd: input.underlyingPriceUsd ?? 100,
      openInterestBtc: input.openInterestBtc,
      markPriceBtc: 0.01,
      markIvDecimal,
      interestRateDecimal,
    },
  };
};

export const createChainFixture = (
  instruments: readonly OptionSnapshot[],
  timestamp: number,
): OptionsChainSnapshot => ({
  metadata: metadata(timestamp),
  currency: "BTC",
  instruments,
});
