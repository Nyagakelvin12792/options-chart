import { expect, test } from "@playwright/test";

const binanceKlines = Array.from({ length: 120 }, (_, index) => {
  const openTime = 1_725_000_000_000 + index * 3_600_000;
  const open = 59_000 + index * 18;
  const close = open + (index % 2 === 0 ? 120 : -75);
  return [
    openTime,
    open.toFixed(2),
    (Math.max(open, close) + 180).toFixed(2),
    (Math.min(open, close) - 140).toFixed(2),
    close.toFixed(2),
    "123.45",
    openTime + 3_599_999,
    "7350000.12",
    2_480 + index,
    "64.2",
    "3810000.50",
    "0",
  ];
});

test("renders validated candles and a versioned worker metric", async ({
  page,
}) => {
  await page.route("**/api/binance/klines", async (route) => {
    await route.fulfill({ json: binanceKlines });
  });

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Options Chart" }),
  ).toBeVisible();
  await expect(page.getByText("Validated Binance REST")).toBeVisible();
  await expect(page.getByTestId("total-open-interest")).toHaveText(
    "251.00 BTC",
  );

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
  await page.route("**/api/binance/klines", async (route) => {
    await route.fulfill({ json: binanceKlines });
  });

  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByText("Validated Binance REST")).toBeVisible();
    await expect(page.getByTestId("total-open-interest")).toHaveText(
      "251.00 BTC",
    );

    const layout = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      chartHeight:
        document.querySelector<HTMLElement>("[data-testid='candlestick-chart']")
          ?.clientHeight ?? 0,
    }));
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.chartHeight).toBeGreaterThanOrEqual(360);

    await page.screenshot({
      path: testInfo.outputPath(`${viewport.name}.png`),
      fullPage: true,
    });
  }
});
