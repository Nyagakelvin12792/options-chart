import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { format } from "prettier";

import {
  MARKET_EVENT_V1_JSON_SCHEMA,
  MARKET_HEALTH_EVENT_V1_JSON_SCHEMA,
} from "../packages/market-data/src/market-events/json-schema.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemaTargets = [
  {
    label: "market-event-v1",
    path: resolve(
      repositoryRoot,
      "services/cryptofeed-collector/schemas/market-event-v1.schema.json",
    ),
    schema: MARKET_EVENT_V1_JSON_SCHEMA,
  },
  {
    label: "market-health-event-v1",
    path: resolve(
      repositoryRoot,
      "services/cryptofeed-collector/schemas/market-health-event-v1.schema.json",
    ),
    schema: MARKET_HEALTH_EVENT_V1_JSON_SCHEMA,
  },
] as const;

const writeMode = process.argv.includes("--write");

async function stableJson(value: unknown): Promise<string> {
  return format(JSON.stringify(value), { parser: "json" });
}

for (const target of schemaTargets) {
  const expected = await stableJson(target.schema);
  if (writeMode) {
    await writeFile(target.path, expected, "utf8");
    process.stdout.write(`wrote ${target.label} schema\n`);
    continue;
  }

  const actualText = await readFile(target.path, "utf8");
  const actual = JSON.parse(actualText) as unknown;
  if (!isDeepStrictEqual(actual, target.schema)) {
    throw new Error(
      `${target.label} schema is out of sync; run npm run schemas:market-events:write`,
    );
  }
  if (actualText !== expected) {
    throw new Error(
      `${target.label} schema formatting is out of sync; run npm run schemas:market-events:write`,
    );
  }
  process.stdout.write(`checked ${target.label} schema\n`);
}
