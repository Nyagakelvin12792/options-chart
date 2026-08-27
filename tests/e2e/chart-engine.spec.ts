import { expect, test, type Page } from "@playwright/test";

import { installBinanceKlineMock } from "./support/binance-kline-mock";

interface BrowserChartDiagnostics {
  readonly chartCreateCount: number;
  readonly historyReplacementCount: number;
  readonly realtimeUpdateCount: number;
  readonly listenerCount: number;
  readonly dataPointCount: number;
  readonly drawingCount: number;
  readonly conflationEnabled: boolean;
}

interface BrowserChartApi {
  getDiagnostics(): BrowserChartDiagnostics;
  getDrawings(): readonly unknown[];
  getSelectedInterval(): string;
  getVisibleRange(): { fromTimestamp: number; toTimestamp: number } | null;
  zoomToLastBars(count: number): {
    fromTimestamp: number;
    toTimestamp: number;
  };
  reconcile(): Promise<void>;
  loadOlderHistory(): Promise<void>;
  addHorizontalDrawing(price: number): void;
  addVerticalDrawing(timestamp: number): void;
  runConflationBenchmark(): {
    disabled: { averageUpdateMs: number; durationMs: number };
    enabled: { averageUpdateMs: number; durationMs: number };
    recommendation: "disabled" | "enabled";
  };
  runSoak(updates?: number): {
    updates: number;
    simulatedHours: number;
    averageUpdateMs: number;
    chartCreateCountBefore: number;
    chartCreateCountAfter: number;
    listenerCountBefore: number;
    listenerCountAfter: number;
    domNodesBefore: number;
    domNodesAfter: number;
  };
}

const evaluateChart = async <Result>(
  page: Page,
  operation: keyof BrowserChartApi,
  args: readonly unknown[] = [],
): Promise<Result> =>
  (await page.evaluate(
    ({ methodName, methodArgs }) => {
      const api = (window as Window & { __optionsChartTest?: BrowserChartApi })
        .__optionsChartTest;
      if (!api) throw new Error("Chart test API is unavailable");
      const method = api[methodName] as (
        ...values: readonly unknown[]
      ) => unknown;
      return method.apply(api, methodArgs);
    },
    { methodName: operation, methodArgs: args },
  )) as Result;

test("preserves viewport and drawings across repair, history growth, and timeframe changes", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const mock = await installBinanceKlineMock(page);
  await page.goto("/");
  await expect(page.getByTestId("candle-count")).toHaveText("2000");

  const zoomedRange = await evaluateChart<{
    fromTimestamp: number;
    toTimestamp: number;
  }>(page, "zoomToLastBars", [120]);
  mock.queueGapRepair();
  await evaluateChart<void>(page, "reconcile");
  expect(await evaluateChart(page, "getVisibleRange")).toEqual(zoomedRange);

  const chart = page.getByTestId("candlestick-chart");
  const chartBox = await chart.boundingBox();
  expect(chartBox).not.toBeNull();
  if (!chartBox) throw new Error("Chart plot bounds are unavailable");
  const plotClick = (xRatio: number, yRatio: number) => ({
    x: Math.round(chartBox.width * xRatio),
    y: Math.round(chartBox.height * yRatio),
  });
  const horizontalLineButton = page.getByRole("button", {
    name: "Horizontal line",
  });
  await horizontalLineButton.click();
  await chart.click({ position: plotClick(0.45, 0.3) });
  await expect
    .poll(
      async () =>
        (await evaluateChart<readonly unknown[]>(page, "getDrawings")).length,
    )
    .toBe(1);

  const verticalLineButton = page.getByRole("button", {
    name: "Vertical line",
  });
  await verticalLineButton.click();
  await chart.click({ position: plotClick(0.6, 0.35) });
  await expect
    .poll(
      async () =>
        (await evaluateChart<readonly unknown[]>(page, "getDrawings")).length,
    )
    .toBe(2);

  const rangeBeforeLazyLoad = await evaluateChart(page, "getVisibleRange");
  await evaluateChart<void>(page, "loadOlderHistory");
  await expect(page.getByTestId("candle-count")).toHaveText("3003");
  expect(await evaluateChart(page, "getVisibleRange")).toEqual(
    rangeBeforeLazyLoad,
  );

  await page.getByRole("button", { name: "5m", exact: true }).click();
  await expect(page.getByText("BTC / USDT · 5m")).toBeVisible();
  await expect(page.getByTestId("candle-count")).toHaveText("2000");
  expect(
    (await evaluateChart<readonly unknown[]>(page, "getDrawings")).length,
  ).toBe(2);
  expect(
    (await evaluateChart<BrowserChartDiagnostics>(page, "getDiagnostics"))
      .chartCreateCount,
  ).toBe(1);
});

test("debounces rapid timeframe changes and requests Binance weekly candles directly", async ({
  page,
}) => {
  const mock = await installBinanceKlineMock(page);
  await page.goto("/");
  await expect(page.getByTestId("candle-count")).toHaveText("2000");

  for (const timeframe of ["1m", "5m", "15m", "4h", "1w"]) {
    await page.getByRole("button", { name: timeframe, exact: true }).click();
  }

  await expect(page.getByText("BTC / USDT · 1w")).toBeVisible();
  await expect(page.getByTestId("candle-count")).toHaveText("2000");
  expect(await evaluateChart(page, "getSelectedInterval")).toBe("1w");
  expect(mock.requests.some((request) => request.interval === "1w")).toBe(true);
  expect(
    (await evaluateChart<BrowserChartDiagnostics>(page, "getDiagnostics"))
      .chartCreateCount,
  ).toBe(1);
});

test("keeps the chart-first layout stable at required desktop viewports", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await installBinanceKlineMock(page);

  for (const viewport of [
    { width: 1_366, height: 768 },
    { width: 1_920, height: 1_080 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByTestId("candle-count")).toHaveText("2000");

    const layout = await page.evaluate(() => {
      const chart = document.querySelector<HTMLElement>(
        "[data-testid='candlestick-chart']",
      );
      const toolbar = document.querySelector<HTMLElement>(".drawing-toolbar");
      const rail = document.querySelector<HTMLElement>(".metric-rail");
      return {
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        chartWidth: chart?.clientWidth ?? 0,
        chartHeight: chart?.clientHeight ?? 0,
        toolbarRight: toolbar?.getBoundingClientRect().right ?? 0,
        chartLeft: chart?.getBoundingClientRect().left ?? 0,
        chartRight: chart?.getBoundingClientRect().right ?? 0,
        railLeft: rail?.getBoundingClientRect().left ?? 0,
      };
    });

    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.chartWidth).toBeGreaterThan(900);
    expect(layout.chartHeight).toBeGreaterThan(540);
    expect(layout.toolbarRight).toBeLessThanOrEqual(layout.chartLeft);
    expect(layout.chartRight).toBeLessThanOrEqual(layout.railLeft);
    await page.screenshot({
      path: testInfo.outputPath(`${viewport.width}x${viewport.height}.png`),
      fullPage: true,
    });
  }
});

test("holds one chart through an accelerated eight-hour update soak", async ({
  page,
}, testInfo) => {
  await installBinanceKlineMock(page);
  await page.goto("/");
  await expect(page.getByTestId("candle-count")).toHaveText("2000");

  const conflation = await evaluateChart<
    ReturnType<BrowserChartApi["runConflationBenchmark"]>
  >(page, "runConflationBenchmark");
  const soak = await evaluateChart<ReturnType<BrowserChartApi["runSoak"]>>(
    page,
    "runSoak",
  );
  testInfo.annotations.push(
    { type: "conflation-benchmark", description: JSON.stringify(conflation) },
    { type: "eight-hour-equivalent-soak", description: JSON.stringify(soak) },
  );

  expect(soak.updates).toBe(28_800);
  expect(soak.simulatedHours).toBe(8);
  expect(soak.averageUpdateMs).toBeLessThan(5);
  expect(soak.chartCreateCountAfter).toBe(soak.chartCreateCountBefore);
  expect(soak.listenerCountAfter).toBe(soak.listenerCountBefore);
  expect(soak.domNodesAfter).toBe(soak.domNodesBefore);
  expect(
    (await evaluateChart<BrowserChartDiagnostics>(page, "getDiagnostics"))
      .conflationEnabled,
  ).toBe(false);
});
