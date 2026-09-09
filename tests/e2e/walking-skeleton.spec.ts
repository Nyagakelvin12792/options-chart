import { expect, test, type Page } from "@playwright/test";

import { installBinanceKlineMock } from "./support/binance-kline-mock";
import {
  installDeribitFixtureMock,
  installDeribitUnavailableMock,
} from "./support/deribit-fixture-mock";

const expectPositiveBtcMetric = async (page: Page) => {
  const metric = page.getByTestId("total-open-interest");
  await expect(metric).not.toHaveText("--");
  const value = Number((await metric.textContent())?.replace(/[^0-9.]/g, ""));
  expect(value).toBeGreaterThan(0);
};

test("renders validated candles and a versioned worker metric", async ({
  page,
}) => {
  await installBinanceKlineMock(page);
  await installDeribitFixtureMock(page);

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Options Chart" }),
  ).toBeVisible();
  await expect(page.getByText(/Binance REST/)).toBeVisible();
  await expect(page.getByTestId("candle-count")).toHaveText("10000");
  await expectPositiveBtcMetric(page);
  await expect(page.getByText("LIVE", { exact: true }).first()).toBeVisible();

  const chartHasPixels = await page
    .getByTestId("candlestick-chart")
    .evaluate((container) =>
      Array.from(container.querySelectorAll("canvas")).some((canvas) => {
        const context = canvas.getContext("2d");
        if (!context || canvas.width === 0 || canvas.height === 0) {
          return false;
        }
        const pixels = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        ).data;
        for (let index = 3; index < pixels.length; index += 4) {
          if ((pixels[index] ?? 0) > 0) {
            return true;
          }
        }
        return false;
      }),
    );
  expect(chartHasPixels).toBe(true);

  const benchmark = await page.evaluate(() => {
    const runBenchmark = (
      window as Window & {
        __optionsChartBenchmark?: () => {
          updates: number;
          durationMs: number;
          averageUpdateMs: number;
        };
      }
    ).__optionsChartBenchmark;
    if (!runBenchmark) {
      throw new Error("Chart benchmark is not available");
    }
    return runBenchmark();
  });

  expect(benchmark.updates).toBe(500);
  expect(benchmark.averageUpdateMs).toBeLessThan(5);
  test.info().annotations.push({
    type: "chart-benchmark",
    description: JSON.stringify(benchmark),
  });
});

test("keeps the chart surface aligned on desktop and mobile", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await installBinanceKlineMock(page);
  await installDeribitFixtureMock(page);

  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByText(/Binance REST/)).toBeVisible();
    await expectPositiveBtcMetric(page);

    const layout = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      wallBottom:
        document.querySelector<HTMLElement>(".wall-confluence")
          ?.getBoundingClientRect().bottom ?? 0,
      workspaceTop:
        document.querySelector<HTMLElement>(".workspace-grid")
          ?.getBoundingClientRect().top ?? 0,
      chartHeight:
        document.querySelector<HTMLElement>("[data-testid='candlestick-chart']")
          ?.clientHeight ?? 0,
    }));
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(Math.abs(layout.workspaceTop - layout.wallBottom)).toBeLessThanOrEqual(
      1,
    );
    expect(layout.chartHeight).toBeGreaterThanOrEqual(360);

    await page.screenshot({
      path: testInfo.outputPath(`${viewport.name}.png`),
      fullPage: true,
    });
  }
});

test("does not invent options metrics when Deribit is unavailable", async ({
  page,
}) => {
  await installBinanceKlineMock(page);
  await installDeribitUnavailableMock(page);
  await page.goto("/");

  await expect(page.getByTestId("candle-count")).toHaveText("10000");
  await expect(page.getByTestId("total-open-interest")).toHaveText("--");
  await expect(
    page.getByText("OPTIONS DATA UNAVAILABLE", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-testid^='level-tag-']")).toHaveCount(0);
});
