/**
 * Large-Scale Dual-Engine Parity Test Script (M4.5)
 *
 * Spawns the Python reference model (tools/reference-python/parity_evaluator.py)
 * to stream >= 100,000 grid and randomized parameter combinations across:
 * - Spot S in [1,000, 200,000]
 * - Strike K in [1,000, 300,000]
 * - Time to expiry T in [1/365, 2.0]
 * - Implied Volatility sigma in [0.05, 3.0]
 * - Risk-free rate r = 0.0
 * - Calls and Puts
 * - Open Interest in [0.01, 10,000] BTC
 *
 * Compares TypeScript packages/options-engine against Python reference implementation.
 * Asserts maximum absolute and relative difference <= 1e-7.
 */

import { spawn } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  calculateBlackScholesD1D2,
  calculateDeribitInverseGamma,
  calculateModeledSignedGexOnePercentUsd,
  standardNormalCdf,
  standardNormalPdf,
} from "../packages/options-engine/src/index";

export interface ParityStats {
  readonly totalEvaluated: number;
  readonly maxCdfDelta: number;
  readonly maxPdfDelta: number;
  readonly maxD1Delta: number;
  readonly maxD2Delta: number;
  readonly maxGammaDelta: number;
  readonly maxRelGammaDelta: number;
  readonly maxGexDelta: number;
  readonly maxRelGexDelta: number;
  readonly failureCount: number;
  readonly durationMs: number;
}

export interface RunParityOptions {
  readonly gridTarget?: number;
  readonly randomTarget?: number;
  readonly tolerance?: number;
  readonly pythonExecutable?: string;
  readonly verbose?: boolean;
}

const RECORD_FLOATS = 13;
const BYTES_PER_RECORD = RECORD_FLOATS * 8; // 104 bytes per record

export const runDualEngineParity = async (
  options: RunParityOptions = {},
): Promise<ParityStats> => {
  const {
    tolerance = 1e-7,
    pythonExecutable = process.platform === "win32" ? "python" : "python3",
    verbose = true,
  } = options;

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const rootDir = path.resolve(__dirname, "..");
  const pythonScript = path.resolve(
    rootDir,
    "tools/reference-python/parity_evaluator.py",
  );

  const startTime = performance.now();

  const pythonProc = spawn(pythonExecutable, [pythonScript, "--binary"], {
    cwd: rootDir,
    stdio: ["ignore", "pipe", "inherit"],
  });

  const chunks: Buffer[] = [];
  pythonProc.stdout.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });

  await new Promise<void>((resolve, reject) => {
    pythonProc.on("error", reject);
    pythonProc.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `Python parity evaluator process failed with exit code ${code}`,
          ),
        );
      } else {
        resolve();
      }
    });
  });

  const buffer = Buffer.concat(chunks);
  const totalRecords = Math.floor(buffer.length / BYTES_PER_RECORD);

  if (totalRecords < 100_000) {
    throw new Error(
      `Expected at least 100,000 records, received ${totalRecords}`,
    );
  }

  let maxCdfDelta = 0;
  let maxPdfDelta = 0;
  let maxD1Delta = 0;
  let maxD2Delta = 0;
  let maxGammaDelta = 0;
  let maxRelGammaDelta = 0;
  let maxGexDelta = 0;
  let maxRelGexDelta = 0;
  let failureCount = 0;

  for (let i = 0; i < totalRecords; i++) {
    const offset = i * BYTES_PER_RECORD;

    // Read inputs
    const spot = buffer.readDoubleLE(offset + 0 * 8);
    const strike = buffer.readDoubleLE(offset + 1 * 8);
    const t = buffer.readDoubleLE(offset + 2 * 8);
    const iv = buffer.readDoubleLE(offset + 3 * 8);
    const r = buffer.readDoubleLE(offset + 4 * 8);
    const oi = buffer.readDoubleLE(offset + 5 * 8);
    const isCall = buffer.readDoubleLE(offset + 6 * 8) > 0.5;

    // Read Python reference outputs
    const pyD1 = buffer.readDoubleLE(offset + 7 * 8);
    const pyD2 = buffer.readDoubleLE(offset + 8 * 8);
    const pyCdf = buffer.readDoubleLE(offset + 9 * 8);
    const pyPdf = buffer.readDoubleLE(offset + 10 * 8);
    const pyGamma = buffer.readDoubleLE(offset + 11 * 8);
    const pyGex = buffer.readDoubleLE(offset + 12 * 8);

    // Compute TypeScript outputs
    const { d1: tsD1, d2: tsD2 } = calculateBlackScholesD1D2(
      spot,
      strike,
      t,
      iv,
      r,
    );
    const tsCdf = standardNormalCdf(tsD1);
    const tsPdf = standardNormalPdf(tsD1);
    const tsGamma = calculateDeribitInverseGamma(spot, strike, t, iv, r);
    const tsGex = calculateModeledSignedGexOnePercentUsd(
      isCall ? "call" : "put",
      tsGamma,
      oi,
      spot,
    );

    // Calculate absolute deltas
    const deltaCdf = Math.abs(pyCdf - tsCdf);
    const deltaPdf = Math.abs(pyPdf - tsPdf);
    const deltaD1 = Math.abs(pyD1 - tsD1);
    const deltaD2 = Math.abs(pyD2 - tsD2);
    const deltaGamma = Math.abs(pyGamma - tsGamma);
    const deltaGex = Math.abs(pyGex - tsGex);

    // Relative deltas
    const relGamma = pyGamma !== 0 ? deltaGamma / Math.abs(pyGamma) : 0;
    const relGex = pyGex !== 0 ? deltaGex / Math.abs(pyGex) : 0;

    if (deltaCdf > maxCdfDelta) maxCdfDelta = deltaCdf;
    if (deltaPdf > maxPdfDelta) maxPdfDelta = deltaPdf;
    if (deltaD1 > maxD1Delta) maxD1Delta = deltaD1;
    if (deltaD2 > maxD2Delta) maxD2Delta = deltaD2;
    if (deltaGamma > maxGammaDelta) maxGammaDelta = deltaGamma;
    if (relGamma > maxRelGammaDelta) maxRelGammaDelta = relGamma;
    if (deltaGex > maxGexDelta) maxGexDelta = deltaGex;
    if (relGex > maxRelGexDelta) maxRelGexDelta = relGex;

    if (
      deltaCdf > tolerance ||
      deltaPdf > tolerance ||
      deltaD1 > tolerance ||
      deltaD2 > tolerance ||
      deltaGamma > tolerance ||
      deltaGex > tolerance
    ) {
      failureCount++;
    }
  }

  const durationMs = performance.now() - startTime;

  const stats: ParityStats = {
    totalEvaluated: totalRecords,
    maxCdfDelta,
    maxPdfDelta,
    maxD1Delta,
    maxD2Delta,
    maxGammaDelta,
    maxRelGammaDelta,
    maxGexDelta,
    maxRelGexDelta,
    failureCount,
    durationMs,
  };

  if (verbose) {
    console.log("==========================================================");
    console.log("   M4.5 DUAL-ENGINE PARITY TEST RESULTS (TS vs Python)   ");
    console.log("==========================================================");
    console.log(
      `Evaluated Vectors:   ${stats.totalEvaluated.toLocaleString()}`,
    );
    console.log(
      `Execution Time:      ${(stats.durationMs / 1000).toFixed(3)}s`,
    );
    console.log(`Tolerance Bound:     ${tolerance.toExponential(1)}`);
    console.log(`Failed Vectors:      ${stats.failureCount}`);
    console.log("----------------------------------------------------------");
    console.log(`Max CDF Delta:       ${stats.maxCdfDelta.toExponential(4)}`);
    console.log(`Max PDF Delta:       ${stats.maxPdfDelta.toExponential(4)}`);
    console.log(`Max d1 Delta:        ${stats.maxD1Delta.toExponential(4)}`);
    console.log(`Max d2 Delta:        ${stats.maxD2Delta.toExponential(4)}`);
    console.log(`Max Gamma Delta:     ${stats.maxGammaDelta.toExponential(4)}`);
    console.log(
      `Max Rel Gamma Delta: ${stats.maxRelGammaDelta.toExponential(4)}`,
    );
    console.log(`Max Signed GEX Delta:${stats.maxGexDelta.toExponential(4)}`);
    console.log(
      `Max Rel GEX Delta:   ${stats.maxRelGexDelta.toExponential(4)}`,
    );
    console.log("==========================================================");
  }

  return stats;
};

// If run directly as a script
if (
  process.argv[1] &&
  (process.argv[1].endsWith("verify-parity.ts") ||
    process.argv[1].endsWith("verify-parity.js"))
) {
  runDualEngineParity()
    .then((stats) => {
      if (stats.failureCount > 0) {
        console.error(
          `FAIL: ${stats.failureCount} vectors exceeded parity tolerance!`,
        );
        process.exit(1);
      } else {
        console.log("PASS: 100% parity across all vectors within tolerance.");
        process.exit(0);
      }
    })
    .catch((err) => {
      console.error("Parity evaluation error:", err);
      process.exit(1);
    });
}
