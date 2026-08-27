import { mkdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { expect, it } from "vitest";

import {
  BinanceRestClient,
  parseBinanceKlines,
} from "../../packages/market-data/src/binance";
import { parseDeribitSnapshot } from "../../packages/market-data/src/deribit";
import { captureDeribitOptionsSnapshot } from "../../tools/capture-fixtures/capture-deribit";
import {
  buildTradingReadinessAudit,
  classifySession,
  sha256Json,
} from "../../tools/trading-readiness/audit";

it("captures and validates a live multi-expiry trading-readiness audit", async () => {
  const stagingPath = resolve(
    "artifacts/trading-readiness/live-deribit-chain.json",
  );
  const capture = await captureDeribitOptionsSnapshot({
    outputPath: stagingPath,
    minInstrumentCount: 1,
  });
  const binance = new BinanceRestClient();
  const rawKlines = await binance.fetchKlines({ interval: "1h", limit: 25 });
  const candles = parseBinanceKlines(
    rawKlines,
    capture.serverTime,
    "1h",
  ).filter((candle) => candle.isClosed);
  const sessionObservation = classifySession(candles.slice(-24));
  const chain = parseDeribitSnapshot(capture.snapshot, capture.serverTime);
  const audit = buildTradingReadinessAudit({
    chain,
    underlyingPriceUsd: capture.indexPrice,
    capturedAt: capture.serverTime,
    sourceSha256: sha256Json(capture.snapshot),
  });
  const date = new Date(capture.serverTime).toISOString().slice(0, 10);
  const slug = new Date(capture.serverTime)
    .toISOString()
    .replaceAll(":", "-")
    .replace(".000Z", "Z");
  const outputDirectory = resolve(`docs/audits/M9/${date}`);
  const rawPath = resolve(outputDirectory, `${slug}-deribit-chain.json`);
  const auditPath = resolve(outputDirectory, `${slug}-audit.json`);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    rawPath,
    `${JSON.stringify(capture.snapshot, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    auditPath,
    `${JSON.stringify(
      {
        audit,
        source: {
          label: "Deribit public REST",
          rawSnapshotPath: relative(process.cwd(), rawPath).replaceAll(
            "\\",
            "/",
          ),
        },
        independentReference: {
          engine: "tools/reference-python",
          status: "VERIFIED_SEPARATELY",
          command: "npm run verify:parity",
          tolerance: 1e-7,
        },
        sessionObservation: {
          source: "Binance BTCUSDT Spot 1h closed candles",
          ...sessionObservation,
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  expect(capture.expiryCount).toBeGreaterThanOrEqual(3);
  expect(audit.expiriesCompared).toBeGreaterThanOrEqual(3);
  expect(audit.unexplainedCriticalDiscrepancyCount).toBe(0);
  expect(audit.passed).toBe(true);
  expect(sessionObservation.candleCount).toBeGreaterThanOrEqual(23);
  console.log(
    JSON.stringify({
      auditPath,
      rawPath,
      contracts: audit.contractCount,
      expiryCount: audit.expiryCount,
      expiriesCompared: audit.expiriesCompared,
      sourceTimestamp: audit.sourceTimestampIso,
      sessionRegime: sessionObservation.regime,
      sessionRangePercent: sessionObservation.rangePercent,
    }),
  );
});
