import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cliPath = fileURLToPath(
  new URL("../node_modules/@playwright/test/cli.js", import.meta.url),
);
const durationArgument = process.argv.find((argument) =>
  argument.startsWith("--duration-ms="),
);
const durationMs = durationArgument?.slice("--duration-ms=".length);
const outputArgument = process.argv.find((argument) =>
  argument.startsWith("--output="),
);
const outputPath = outputArgument?.slice("--output=".length);
const result = spawnSync(
  process.execPath,
  [cliPath, "test", "chart-long-soak.spec.ts"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      CHART_SOAK: "1",
      ...(durationMs ? { CHART_SOAK_DURATION_MS: durationMs } : {}),
      ...(outputPath ? { CHART_SOAK_OUTPUT: outputPath } : {}),
    },
  },
);

process.exitCode = result.status ?? 1;
