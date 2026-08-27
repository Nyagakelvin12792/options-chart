import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

import {
  DeribitConsolidatedSnapshotSchema,
  parseDeribitSnapshot,
} from "../packages/market-data/src/index";
import { runDualEngineParity } from "./verify-parity";
import { captureDeribitOptionsSnapshot } from "../tools/capture-fixtures/capture-deribit";
import {
  buildTradingReadinessAudit,
  certifyFullDayBrowserStability,
  sha256Json,
  type BrowserStabilitySample,
} from "../tools/trading-readiness/audit";

interface SoakTelemetry {
  readonly durationMs: number;
  readonly samples: readonly BrowserStabilitySample[];
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const writeJson = async (path: string, value: unknown): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, json(value), "utf8");
};

const dateDirectory = (timestamp: number): string =>
  new Date(timestamp).toISOString().slice(0, 10);

const timestampSlug = (timestamp: number): string =>
  new Date(timestamp).toISOString().replaceAll(":", "-").replace(".000Z", "Z");

const runAudit = async (values: {
  readonly input?: string;
  readonly outputDir?: string;
  readonly spot?: string;
  readonly parity?: boolean;
}): Promise<void> => {
  let rawSnapshot: unknown;
  let underlyingPriceUsd: number;
  let sourceLabel: string;

  if (values.input) {
    const inputPath = resolve(values.input);
    rawSnapshot = JSON.parse(await readFile(inputPath, "utf8"));
    const validated = DeribitConsolidatedSnapshotSchema.parse(rawSnapshot);
    underlyingPriceUsd = values.spot
      ? Number(values.spot)
      : (validated.instruments.find((item) => item.underlying_price > 0)
          ?.underlying_price ?? 0);
    sourceLabel = basename(inputPath);
  } else {
    const stagingPath = resolve(
      "artifacts/trading-readiness/live-deribit-chain.json",
    );
    const capture = await captureDeribitOptionsSnapshot({
      outputPath: stagingPath,
      minInstrumentCount: 1,
    });
    rawSnapshot = capture.snapshot;
    underlyingPriceUsd = capture.indexPrice;
    sourceLabel = "Deribit public REST";
  }

  const validated = DeribitConsolidatedSnapshotSchema.parse(rawSnapshot);
  if (!Number.isFinite(underlyingPriceUsd) || underlyingPriceUsd <= 0) {
    throw new Error("A positive underlying price is required for the audit");
  }
  const capturedAt = validated.timestamp;
  const outputDirectory = resolve(
    values.outputDir ?? join("docs/audits/M9", dateDirectory(capturedAt)),
  );
  const slug = timestampSlug(capturedAt);
  const rawPath = join(outputDirectory, `${slug}-deribit-chain.json`);
  const auditPath = join(outputDirectory, `${slug}-audit.json`);
  const chain = parseDeribitSnapshot(validated, capturedAt);
  const audit = buildTradingReadinessAudit({
    chain,
    underlyingPriceUsd,
    capturedAt,
    sourceSha256: sha256Json(validated),
  });
  const parity = values.parity
    ? await runDualEngineParity({ verbose: false })
    : null;
  const report = {
    audit,
    source: {
      label: sourceLabel,
      rawSnapshotPath: relative(process.cwd(), rawPath).replaceAll("\\", "/"),
    },
    independentReference: parity
      ? {
          engine: "tools/reference-python",
          tolerance: 1e-7,
          status: parity.failureCount === 0 ? "PASS" : "FAIL",
          ...parity,
        }
      : {
          engine: "tools/reference-python",
          status: "NOT_RUN",
          command: "npm run validate:trading-readiness -- --parity",
        },
  };
  await writeJson(rawPath, validated);
  await writeJson(auditPath, report);

  console.log(`M9 audit: ${audit.passed ? "PASS" : "FAIL"}`);
  console.log(`Source: ${sourceLabel}`);
  console.log(`Contracts: ${audit.contractCount}`);
  console.log(
    `Expiries compared: ${audit.expiriesCompared}/${audit.expiryCount}`,
  );
  console.log(
    `Unexplained critical discrepancies: ${audit.unexplainedCriticalDiscrepancyCount}`,
  );
  console.log(`Audit artifact: ${auditPath}`);
  console.log(`Raw snapshot: ${rawPath}`);
  if (!audit.passed || (parity !== null && parity.failureCount > 0)) {
    process.exitCode = 1;
  }
};

const runCertification = async (values: {
  readonly input?: string;
  readonly output?: string;
}): Promise<void> => {
  if (!values.input) {
    throw new Error("certify-full-day requires --input=<telemetry.json>");
  }
  const inputPath = resolve(values.input);
  const telemetry = JSON.parse(
    await readFile(inputPath, "utf8"),
  ) as SoakTelemetry;
  if (!Array.isArray(telemetry.samples)) {
    throw new Error("Telemetry input must contain a samples array");
  }
  const certification = certifyFullDayBrowserStability(telemetry.samples);
  const outputPath = resolve(
    values.output ?? `${inputPath.replace(/\.json$/u, "")}-certification.json`,
  );
  await writeJson(outputPath, {
    schemaVersion: "full-day-browser-certification-v1",
    inputPath,
    certifiedAt: Date.now(),
    certifiedAtIso: new Date().toISOString(),
    certification,
  });
  console.log(
    `Full-day certification: ${certification.passed ? "PASS" : "FAIL"}`,
  );
  console.log(
    `Observed hours: ${(certification.durationMs / 3_600_000).toFixed(3)}`,
  );
  console.log(`Output: ${outputPath}`);
  if (!certification.passed) process.exitCode = 1;
};

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    input: { type: "string" },
    output: { type: "string" },
    "output-dir": { type: "string" },
    spot: { type: "string" },
    parity: { type: "boolean", default: false },
  },
});

const command = positionals[0] ?? "audit";
if (command === "audit") {
  await runAudit({
    input: values.input,
    outputDir: values["output-dir"],
    spot: values.spot,
    parity: values.parity,
  });
} else if (command === "certify-full-day") {
  await runCertification({ input: values.input, output: values.output });
} else {
  throw new Error(`Unknown trading-readiness command: ${command}`);
}
