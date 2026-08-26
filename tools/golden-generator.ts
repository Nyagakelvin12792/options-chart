import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import {
  calculateOptionsMetrics,
  ENGINE_VERSION,
  type OptionsCalculationInput,
  type OptionsCalculationResult,
} from "../packages/options-engine/src/index";
import type {
  OptionSnapshot,
  OptionsChainSnapshot,
  OptionType,
} from "@options-chart/domain";

export function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalJsonStringify).join(",") + "]";
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map((key) => {
    const val = (obj as Record<string, unknown>)[key];
    return JSON.stringify(key) + ":" + canonicalJsonStringify(val);
  });
  return "{" + pairs.join(",") + "}";
}

export function computeSha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function createOption(input: {
  expiry: number;
  strike: number;
  optionType: OptionType;
  openInterestBtc: number;
  markIvDecimal: number | null;
  underlyingPriceUsd: number;
  creationTimestamp?: number;
  isActive?: boolean;
}): OptionSnapshot {
  const typeLetter = input.optionType === "call" ? "C" : "P";
  const instrumentName = `BTC-${input.expiry}-${input.strike}-${typeLetter}`;
  const creationTimestamp =
    input.creationTimestamp ?? input.expiry - 30 * 86_400_000;
  const metadata = {
    source: "deribit" as const,
    sourceTimestamp: input.expiry - 3600_000,
    receivedTimestamp: input.expiry - 3600_000,
    normalizedTimestamp: input.expiry - 3600_000,
    schemaVersion: "golden-fixture-v1",
  };

  return {
    instrument: {
      metadata,
      instrumentName,
      symbol: "BTC",
      expiry: input.expiry,
      strike: input.strike,
      optionType: input.optionType,
      creationTimestamp,
      isActive: input.isActive ?? true,
      settlementAsset: "BTC",
      contractMultiplierBtc: 1,
    },
    quote: {
      metadata,
      instrumentName,
      symbol: "BTC",
      expiry: input.expiry,
      strike: input.strike,
      optionType: input.optionType,
      underlyingPriceUsd: input.underlyingPriceUsd,
      openInterestBtc: input.openInterestBtc,
      markPriceBtc: 0.05,
      markIvDecimal: input.markIvDecimal,
      interestRateDecimal: 0,
    },
  };
}

function createChain(
  instruments: readonly OptionSnapshot[],
  timestamp: number,
): OptionsChainSnapshot {
  return {
    metadata: {
      source: "deribit",
      sourceTimestamp: timestamp,
      receivedTimestamp: timestamp,
      normalizedTimestamp: timestamp,
      schemaVersion: "golden-fixture-v1",
    },
    currency: "BTC",
    instruments,
  };
}

export interface GoldenSnapshotFixture {
  readonly schemaVersion: "golden-options-snapshot-v1";
  readonly engineVersion: string;
  readonly regime:
    "normal-market" | "volatility-crush" | "zero-dte" | "strike-skew";
  readonly description: string;
  readonly input: {
    readonly underlyingPriceUsd: number;
    readonly calculatedAt: number;
    readonly expiryScope: { readonly kind: "all" };
    readonly interestRateFallbackDecimal: number;
    readonly maxPainExpiry: number | null;
    readonly secondaryLevelCount: number;
    readonly chain: OptionsChainSnapshot;
  };
  readonly outputSha256: string;
  readonly expectedOutput: OptionsCalculationResult;
}

export function buildRegimeNormalMarket(): GoldenSnapshotFixture {
  const calculatedAt = Date.UTC(2026, 7, 26, 8, 0, 0); // 2026-08-26 08:00:00 UTC
  const underlyingPriceUsd = 80_000;
  const expiries = [
    calculatedAt + 1 * 86_400_000, // 1D: 2026-08-27
    calculatedAt + 7 * 86_400_000, // 7D: 2026-09-02
    calculatedAt + 30 * 86_400_000, // 30D: 2026-09-25
    calculatedAt + 90 * 86_400_000, // 90D: 2026-11-24
  ];
  const strikes = [
    60_000, 65_000, 70_000, 75_000, 80_000, 85_000, 90_000, 95_000, 100_000,
  ];

  const instruments: OptionSnapshot[] = [];

  for (const exp of expiries) {
    for (const strike of strikes) {
      const moneyness = strike / underlyingPriceUsd;
      const callIv = 0.55 + Math.abs(moneyness - 1.0) * 0.15;
      const putIv = 0.55 + Math.abs(moneyness - 1.0) * 0.2;

      // Realistic OI profile: calls concentrated at higher strikes, puts at lower strikes
      const callOi = strike >= 80_000 ? 500 + (strike - 80_000) * 0.05 : 150;
      const putOi = strike <= 80_000 ? 500 + (80_000 - strike) * 0.05 : 150;

      instruments.push(
        createOption({
          expiry: exp,
          strike,
          optionType: "call",
          openInterestBtc: Math.round(callOi),
          markIvDecimal: Number(callIv.toFixed(4)),
          underlyingPriceUsd,
        }),
        createOption({
          expiry: exp,
          strike,
          optionType: "put",
          openInterestBtc: Math.round(putOi),
          markIvDecimal: Number(putIv.toFixed(4)),
          underlyingPriceUsd,
        }),
      );
    }
  }

  const chain = createChain(instruments, calculatedAt);
  const inputParams: OptionsCalculationInput = {
    chain,
    underlyingPriceUsd,
    calculatedAt,
    expiryScope: { kind: "all" },
    interestRateFallbackDecimal: 0,
    maxPainExpiry: expiries[1]!, // 7D expiry
    secondaryLevelCount: 3,
  };

  const expectedOutput = calculateOptionsMetrics(inputParams);
  const canonicalJson = canonicalJsonStringify(expectedOutput);
  const outputSha256 = computeSha256(canonicalJson);

  return {
    schemaVersion: "golden-options-snapshot-v1",
    engineVersion: ENGINE_VERSION,
    regime: "normal-market",
    description:
      "Normal market regime with balanced calls/puts across 4 expiries (1D, 7D, 30D, 90D) and 9 strikes",
    input: {
      underlyingPriceUsd,
      calculatedAt,
      expiryScope: { kind: "all" },
      interestRateFallbackDecimal: 0,
      maxPainExpiry: expiries[1]!,
      secondaryLevelCount: 3,
      chain,
    },
    outputSha256,
    expectedOutput,
  };
}

export function buildRegimeVolatilityCrush(): GoldenSnapshotFixture {
  const calculatedAt = Date.UTC(2026, 7, 26, 8, 0, 0);
  const underlyingPriceUsd = 85_000;
  const expiries = [
    calculatedAt + 2 * 86_400_000,
    calculatedAt + 14 * 86_400_000,
  ];
  const strikes = [
    65_000, 70_000, 75_000, 80_000, 85_000, 90_000, 95_000, 100_000, 105_000,
  ];

  const instruments: OptionSnapshot[] = [];

  for (const exp of expiries) {
    for (const strike of strikes) {
      // Extreme IV regime: 180% to 350% IV
      const callIv = 1.8 + (strike === 85_000 ? 1.5 : 0.8);
      const putIv = 2.0 + (strike < 85_000 ? 1.2 : 0.6);

      const callOi = strike >= 85_000 ? 1200 : 400;
      const putOi = strike <= 85_000 ? 1800 : 350;

      instruments.push(
        createOption({
          expiry: exp,
          strike,
          optionType: "call",
          openInterestBtc: callOi,
          markIvDecimal: Number(callIv.toFixed(4)),
          underlyingPriceUsd,
        }),
        createOption({
          expiry: exp,
          strike,
          optionType: "put",
          openInterestBtc: putOi,
          markIvDecimal: Number(putIv.toFixed(4)),
          underlyingPriceUsd,
        }),
      );
    }
  }

  const chain = createChain(instruments, calculatedAt);
  const inputParams: OptionsCalculationInput = {
    chain,
    underlyingPriceUsd,
    calculatedAt,
    expiryScope: { kind: "all" },
    interestRateFallbackDecimal: 0,
    maxPainExpiry: expiries[0]!,
    secondaryLevelCount: 3,
  };

  const expectedOutput = calculateOptionsMetrics(inputParams);
  const canonicalJson = canonicalJsonStringify(expectedOutput);
  const outputSha256 = computeSha256(canonicalJson);

  return {
    schemaVersion: "golden-options-snapshot-v1",
    engineVersion: ENGINE_VERSION,
    regime: "volatility-crush",
    description:
      "Volatility crush and extreme IV spike regime with IV values up to 330% and severe skew",
    input: {
      underlyingPriceUsd,
      calculatedAt,
      expiryScope: { kind: "all" },
      interestRateFallbackDecimal: 0,
      maxPainExpiry: expiries[0]!,
      secondaryLevelCount: 3,
      chain,
    },
    outputSha256,
    expectedOutput,
  };
}

export function buildRegimeZeroDte(): GoldenSnapshotFixture {
  const calculatedAt = Date.UTC(2026, 7, 26, 7, 40, 0); // 20 minutes before 08:00 UTC
  const underlyingPriceUsd = 80_000;

  const expUnderFloor10m = calculatedAt + 10 * 60_000;
  const expUnderFloor14m = calculatedAt + 14 * 60_000;
  const expValid20m = calculatedAt + 20 * 60_000;
  const expValid45m = calculatedAt + 45 * 60_000;
  const expNextDay = calculatedAt + 24 * 3600_000 + 20 * 60_000;

  const strikes = [78_000, 79_000, 80_000, 81_000, 82_000];
  const instruments: OptionSnapshot[] = [];

  const allExpiries = [
    expUnderFloor10m,
    expUnderFloor14m,
    expValid20m,
    expValid45m,
    expNextDay,
  ];

  for (const exp of allExpiries) {
    for (const strike of strikes) {
      instruments.push(
        createOption({
          expiry: exp,
          strike,
          optionType: "call",
          openInterestBtc: 100 + (strike - 78_000) * 0.05,
          markIvDecimal: 0.6,
          underlyingPriceUsd,
        }),
        createOption({
          expiry: exp,
          strike,
          optionType: "put",
          openInterestBtc: 100 + (82_000 - strike) * 0.05,
          markIvDecimal: 0.62,
          underlyingPriceUsd,
        }),
      );
    }
  }

  const chain = createChain(instruments, calculatedAt);
  const inputParams: OptionsCalculationInput = {
    chain,
    underlyingPriceUsd,
    calculatedAt,
    expiryScope: { kind: "all" },
    interestRateFallbackDecimal: 0,
    maxPainExpiry: expValid20m,
    secondaryLevelCount: 3,
  };

  const expectedOutput = calculateOptionsMetrics(inputParams);
  const canonicalJson = canonicalJsonStringify(expectedOutput);
  const outputSha256 = computeSha256(canonicalJson);

  return {
    schemaVersion: "golden-options-snapshot-v1",
    engineVersion: ENGINE_VERSION,
    regime: "zero-dte",
    description:
      "0DTE near-expiry regime exercising the 15-minute gamma profile floor and near-expiration Max Pain",
    input: {
      underlyingPriceUsd,
      calculatedAt,
      expiryScope: { kind: "all" },
      interestRateFallbackDecimal: 0,
      maxPainExpiry: expValid20m,
      secondaryLevelCount: 3,
      chain,
    },
    outputSha256,
    expectedOutput,
  };
}

export function buildRegimeStrikeSkew(): GoldenSnapshotFixture {
  const calculatedAt = Date.UTC(2026, 7, 26, 8, 0, 0);
  const underlyingPriceUsd = 80_000;
  const expiry = calculatedAt + 15 * 86_400_000;
  const strikes = [
    20_000, 30_000, 40_000, 50_000, 60_000, 70_000, 80_000, 90_000, 100_000,
    150_000, 200_000, 250_000, 300_000,
  ];

  const instruments: OptionSnapshot[] = [];

  for (const strike of strikes) {
    const callOi = strike === 200_000 ? 6_500 : strike >= 100_000 ? 1_500 : 200;
    const putOi = strike === 40_000 ? 8_000 : strike <= 60_000 ? 2_000 : 250;

    const moneyness = strike / underlyingPriceUsd;
    const callIv = 0.5 + Math.abs(Math.log(moneyness)) * 0.35;
    const putIv = 0.5 + Math.abs(Math.log(moneyness)) * 0.4;

    instruments.push(
      createOption({
        expiry,
        strike,
        optionType: "call",
        openInterestBtc: callOi,
        markIvDecimal: Number(callIv.toFixed(4)),
        underlyingPriceUsd,
      }),
      createOption({
        expiry,
        strike,
        optionType: "put",
        openInterestBtc: putOi,
        markIvDecimal: Number(putIv.toFixed(4)),
        underlyingPriceUsd,
      }),
    );
  }

  const chain = createChain(instruments, calculatedAt);
  const inputParams: OptionsCalculationInput = {
    chain,
    underlyingPriceUsd,
    calculatedAt,
    expiryScope: { kind: "all" },
    interestRateFallbackDecimal: 0,
    maxPainExpiry: expiry,
    secondaryLevelCount: 3,
  };

  const expectedOutput = calculateOptionsMetrics(inputParams);
  const canonicalJson = canonicalJsonStringify(expectedOutput);
  const outputSha256 = computeSha256(canonicalJson);

  return {
    schemaVersion: "golden-options-snapshot-v1",
    engineVersion: ENGINE_VERSION,
    regime: "strike-skew",
    description:
      "Deep ITM/OTM strike skew regime with strikes spanning $20,000 to $300,000 and heavy wing OI concentration",
    input: {
      underlyingPriceUsd,
      calculatedAt,
      expiryScope: { kind: "all" },
      interestRateFallbackDecimal: 0,
      maxPainExpiry: expiry,
      secondaryLevelCount: 3,
      chain,
    },
    outputSha256,
    expectedOutput,
  };
}

export function generateAllGoldenFixtures(outputDir: string): void {
  mkdirSync(outputDir, { recursive: true });

  const fixtures = [
    buildRegimeNormalMarket(),
    buildRegimeVolatilityCrush(),
    buildRegimeZeroDte(),
    buildRegimeStrikeSkew(),
  ];

  for (const fixture of fixtures) {
    const filePath = resolve(outputDir, `${fixture.regime}.json`);
    writeFileSync(filePath, JSON.stringify(fixture, null, 2), "utf8");
    console.log(
      `Generated golden fixture: ${fixture.regime} (SHA-256: ${fixture.outputSha256}) -> ${filePath}`,
    );
  }
}
