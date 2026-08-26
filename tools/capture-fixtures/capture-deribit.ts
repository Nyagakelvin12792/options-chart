import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  DeribitBookSummaryPayload,
  DeribitConsolidatedSnapshot,
  DeribitOptionInstrumentPayload,
} from "../../packages/market-data/src";
import {
  DeribitConsolidatedSnapshotSchema,
  DeribitRestClient,
  parseDeribitSnapshot,
} from "../../packages/market-data/src";

export interface DeribitCaptureOptions {
  readonly endpoint?: string;
  readonly outputPath?: string;
  readonly minInstrumentCount?: number;
}

export interface DeribitCaptureResult {
  readonly snapshot: DeribitConsolidatedSnapshot;
  readonly totalInstruments: number;
  readonly callCount: number;
  readonly putCount: number;
  readonly totalOpenInterestBtc: number;
  readonly validIvCount: number;
  readonly indexPrice: number;
  readonly serverTime: number;
  readonly expiryCount: number;
  readonly strikeCount: number;
  readonly minStrike: number;
  readonly maxStrike: number;
  readonly minExpiry: number;
  readonly maxExpiry: number;
  readonly outputPath: string;
}

export const captureDeribitOptionsSnapshot = async (
  options: DeribitCaptureOptions = {},
): Promise<DeribitCaptureResult> => {
  const rest = new DeribitRestClient({
    endpoint: options.endpoint,
  });

  const [instruments, summaries, indexPrice, serverTime] = await Promise.all([
    rest.getInstruments(),
    rest.getBookSummary(),
    rest.getIndexPrice(),
    rest.getTime(),
  ]);

  const summaryMap = new Map<string, DeribitBookSummaryPayload>();
  for (const summary of summaries) {
    summaryMap.set(summary.instrument_name, summary);
  }

  // Filter to active, unexpired options
  const activeInstruments: DeribitOptionInstrumentPayload[] = instruments
    .filter(
      (inst) =>
        inst.is_active &&
        inst.state === "open" &&
        inst.expiration_timestamp > serverTime,
    )
    .sort((left, right) => {
      if (left.expiration_timestamp !== right.expiration_timestamp) {
        return left.expiration_timestamp - right.expiration_timestamp;
      }
      if (left.strike !== right.strike) {
        return left.strike - right.strike;
      }
      return left.option_type.localeCompare(right.option_type);
    });

  const consolidatedInstruments = activeInstruments.map((instrument) => {
    const summary = summaryMap.get(instrument.instrument_name);
    if (!summary) {
      throw new Error(
        `Missing book summary for instrument: ${instrument.instrument_name}`,
      );
    }
    return {
      instrument_name: instrument.instrument_name,
      creation_timestamp: instrument.creation_timestamp,
      expiration_timestamp: instrument.expiration_timestamp,
      strike: instrument.strike,
      option_type: instrument.option_type,
      underlying_price:
        summary.underlying_price > 0 ? summary.underlying_price : indexPrice,
      open_interest: summary.open_interest,
      mark_price: summary.mark_price,
      mark_iv: summary.mark_iv,
      interest_rate: summary.interest_rate,
    };
  });

  const rawSnapshot = {
    schema_version: "m0.5-deribit-snapshot-v1" as const,
    timestamp: serverTime,
    instruments: consolidatedInstruments,
  };

  // Validate schema strictly
  const validatedSnapshot =
    DeribitConsolidatedSnapshotSchema.parse(rawSnapshot);

  // Validate domain conversion
  const normalizedChain = parseDeribitSnapshot(validatedSnapshot, serverTime);

  const minCount = options.minInstrumentCount ?? 900;
  if (validatedSnapshot.instruments.length < minCount) {
    throw new Error(
      `Capture yielded ${validatedSnapshot.instruments.length} instruments, expected at least ${minCount}`,
    );
  }

  if (
    normalizedChain.instruments.length !== validatedSnapshot.instruments.length
  ) {
    throw new Error(
      `Normalized chain count (${normalizedChain.instruments.length}) does not match validated instruments (${validatedSnapshot.instruments.length})`,
    );
  }

  const calls = validatedSnapshot.instruments.filter(
    (i) => i.option_type === "call",
  );
  const puts = validatedSnapshot.instruments.filter(
    (i) => i.option_type === "put",
  );
  const totalOpenInterestBtc = validatedSnapshot.instruments.reduce(
    (sum, i) => sum + i.open_interest,
    0,
  );
  const validIvCount = validatedSnapshot.instruments.filter(
    (i) => i.mark_iv !== null && i.mark_iv > 0,
  ).length;

  const expiries = new Set(
    validatedSnapshot.instruments.map((i) => i.expiration_timestamp),
  );
  const strikes = new Set(validatedSnapshot.instruments.map((i) => i.strike));
  const sortedStrikes = Array.from(strikes).sort((a, b) => a - b);
  const sortedExpiries = Array.from(expiries).sort((a, b) => a - b);

  const defaultOutputPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../tests/fixtures/deribit/live-chain-snapshot.json",
  );
  const outputPath = options.outputPath ?? defaultOutputPath;

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    JSON.stringify(validatedSnapshot, null, 2) + "\n",
    "utf8",
  );

  return {
    snapshot: validatedSnapshot,
    totalInstruments: validatedSnapshot.instruments.length,
    callCount: calls.length,
    putCount: puts.length,
    totalOpenInterestBtc,
    validIvCount,
    indexPrice,
    serverTime,
    expiryCount: expiries.size,
    strikeCount: strikes.size,
    minStrike: sortedStrikes[0] ?? 0,
    maxStrike: sortedStrikes[sortedStrikes.length - 1] ?? 0,
    minExpiry: sortedExpiries[0] ?? 0,
    maxExpiry: sortedExpiries[sortedExpiries.length - 1] ?? 0,
    outputPath,
  };
};

const isDirectExecution = (): boolean => {
  const currentPath = fileURLToPath(import.meta.url);
  const executedScript = process.argv[1];
  return (
    executedScript !== undefined &&
    (resolve(executedScript) === resolve(currentPath) ||
      executedScript.includes("capture-deribit"))
  );
};

if (isDirectExecution()) {
  captureDeribitOptionsSnapshot()
    .then((result) => {
      console.log("=== Deribit Real Fixture Capture Summary ===");
      console.log(`Output File: ${result.outputPath}`);
      console.log(
        `Server Time: ${result.serverTime} (${new Date(result.serverTime).toISOString()})`,
      );
      console.log(
        `Index Price (BTC-USD): $${result.indexPrice.toLocaleString()}`,
      );
      console.log(`Total Active Instruments: ${result.totalInstruments}`);
      console.log(`  - Calls: ${result.callCount}`);
      console.log(`  - Puts: ${result.putCount}`);
      console.log(
        `Distinct Expiries: ${result.expiryCount} (range: ${new Date(result.minExpiry).toISOString().slice(0, 10)} to ${new Date(result.maxExpiry).toISOString().slice(0, 10)})`,
      );
      console.log(
        `Distinct Strikes: ${result.strikeCount} (range: $${result.minStrike.toLocaleString()} to $${result.maxStrike.toLocaleString()})`,
      );
      console.log(
        `Total Open Interest: ${result.totalOpenInterestBtc.toFixed(4)} BTC`,
      );
      console.log(
        `Valid Mark IV Coverage: ${result.validIvCount} / ${result.totalInstruments} (${((result.validIvCount / result.totalInstruments) * 100).toFixed(2)}%)`,
      );
      console.log("============================================");
    })
    .catch((error: unknown) => {
      console.error("Failed to capture Deribit fixture:", error);
      process.exitCode = 1;
    });
}
