import { expect, test } from "@playwright/test";

import { installBinanceKlineMock } from "./support/binance-kline-mock";

const enabled = process.env.CHART_SOAK === "1";
const durationMs = Number(
  process.env.CHART_SOAK_DURATION_MS ?? 8 * 60 * 60 * 1_000,
);
const sampleIntervalMs = Math.min(60_000, durationMs);

test("runs the continuous chart soak with bounded resources", async ({
  page,
}, testInfo) => {
  test.skip(!enabled, "Run through npm run test:chart-soak");
  test.setTimeout(durationMs + 10 * 60 * 1_000);

  await installBinanceKlineMock(page);
  await page.goto("/");
  await expect(page.getByTestId("candle-count")).toHaveText("2000");

  const sample = () =>
    page.evaluate(() => {
      const api = (
        window as Window & {
          __optionsChartTest?: {
            getRuntimeHealth(): {
              chart: {
                chartCreateCount: number;
                listenerCount: number;
                maxOperationDurationMs: number;
              };
              activeBinanceSockets: number;
              activeWorkers: number;
            };
          };
        }
      ).__optionsChartTest;
      if (!api) throw new Error("Chart diagnostics are unavailable");
      const memory = (
        performance as Performance & {
          memory?: { usedJSHeapSize?: number };
        }
      ).memory;
      return {
        timestamp: Date.now(),
        domNodes: document.getElementsByTagName("*").length,
        heapBytes: memory?.usedJSHeapSize ?? null,
        ...api.getRuntimeHealth(),
      };
    });

  const samples = [await sample()];
  const startedAt = Date.now();
  while (Date.now() - startedAt < durationMs) {
    await page.waitForTimeout(
      Math.min(sampleIntervalMs, durationMs - (Date.now() - startedAt)),
    );
    samples.push(await sample());
  }

  const first = samples[0]!;
  const last = samples.at(-1)!;
  await testInfo.attach("chart-soak-telemetry.json", {
    body: Buffer.from(JSON.stringify({ durationMs, samples }, null, 2)),
    contentType: "application/json",
  });

  expect(samples.every((entry) => entry.chart.chartCreateCount === 1)).toBe(
    true,
  );
  expect(samples.every((entry) => entry.activeBinanceSockets === 1)).toBe(true);
  expect(samples.every((entry) => entry.activeWorkers === 1)).toBe(true);
  expect(last.chart.listenerCount).toBe(first.chart.listenerCount);
  expect(last.domNodes).toBeLessThanOrEqual(first.domNodes + 5);
  const allowedMaxOperationDurationMs = Math.max(
    first.chart.maxOperationDurationMs * 1.5,
    first.chart.maxOperationDurationMs + 50,
  );
  expect(last.chart.maxOperationDurationMs).toBeLessThanOrEqual(
    allowedMaxOperationDurationMs,
  );
  if (first.heapBytes !== null && last.heapBytes !== null) {
    expect(last.heapBytes).toBeLessThan(first.heapBytes * 1.5 + 50_000_000);
  }
});
