import { expect, test, type Page } from "@playwright/test";

import { installBinanceKlineMock } from "./support/binance-kline-mock";
import { installDeribitFixtureMock } from "./support/deribit-fixture-mock";

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
  await installDeribitFixtureMock(page);
  await page.goto("/");
  await expect(page.getByTestId("candle-count")).toHaveText("10000");
  await expect(page.getByTestId("level-tag-call-wall")).toBeVisible();

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
  await expect
    .poll(async () =>
      Number(await page.getByTestId("candle-count").innerText()),
    )
    .toBeGreaterThanOrEqual(11_000);
  expect(await evaluateChart(page, "getVisibleRange")).toEqual(
    rangeBeforeLazyLoad,
  );

  await page.getByRole("button", { name: "5m", exact: true }).click();
  await expect(page.getByText("BTC / USDT · 5m")).toBeVisible();
  await expect
    .poll(async () =>
      Number(await page.getByTestId("candle-count").innerText()),
    )
    .toBeGreaterThanOrEqual(1_000);
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
  test.setTimeout(120_000);
  const mock = await installBinanceKlineMock(page);
  await page.goto("/");
  await expect(page.getByTestId("candle-count")).toHaveText("10000");

  for (const timeframe of ["1m", "5m", "15m", "4h", "1w"]) {
    await page.getByRole("button", { name: timeframe, exact: true }).click();
  }

  await expect(page.getByText("BTC / USDT · 1w")).toBeVisible();
  await expect
    .poll(async () =>
      Number(await page.getByTestId("candle-count").innerText()),
    )
    .toBeGreaterThanOrEqual(1_000);
  expect(await evaluateChart(page, "getSelectedInterval")).toBe("1w");
  expect(mock.requests.some((request) => request.interval === "1w")).toBe(true);
  expect(
    (await evaluateChart<BrowserChartDiagnostics>(page, "getDiagnostics"))
      .chartCreateCount,
  ).toBe(1);
});

test("anchors Volume Profile by drag and syncs explicit position levels to risk", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await installBinanceKlineMock(page);
  await installDeribitFixtureMock(page);
  await page.goto("/");
  await expect(page.getByTestId("candle-count")).toHaveText("10000");

  const chart = page.getByTestId("candlestick-chart");
  const bounds = await chart.boundingBox();
  if (!bounds) throw new Error("Chart plot bounds are unavailable");

  await page
    .getByRole("button", { name: "Fixed range Volume Profile" })
    .click();
  await page.mouse.move(bounds.x + bounds.width * 0.25, bounds.y + 220);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.65, bounds.y + 220);
  await page.mouse.up();

  await expect
    .poll(
      async () =>
        (
          await evaluateChart<readonly { type?: string }[]>(page, "getDrawings")
        ).filter((drawing) => drawing.type === "volume-profile-range").length,
    )
    .toBe(1);

  await page.getByRole("button", { name: "Long position" }).click();
  await chart.click({
    position: { x: bounds.width * 0.42, y: bounds.height * 0.5 },
  });
  expect(
    (
      await evaluateChart<readonly { type?: string }[]>(page, "getDrawings")
    ).filter((drawing) => drawing.type === "position").length,
  ).toBe(0);
  await chart.click({
    position: { x: bounds.width * 0.52, y: bounds.height * 0.66 },
  });
  await chart.click({
    position: { x: bounds.width * 0.68, y: bounds.height * 0.3 },
  });

  await expect(page.getByText("Long chart position synced")).toBeVisible();
  await expect
    .poll(
      async () =>
        (
          await evaluateChart<readonly { type?: string }[]>(page, "getDrawings")
        ).filter((drawing) => drawing.type === "position").length,
    )
    .toBe(1);
  await expect(page.getByText("Size limited by")).toBeVisible();

  await page.getByRole("button", { name: "Short position" }).click();
  await chart.click({
    position: { x: bounds.width * 0.44, y: bounds.height * 0.5 },
  });
  await chart.click({
    position: { x: bounds.width * 0.54, y: bounds.height * 0.32 },
  });
  await chart.click({
    position: { x: bounds.width * 0.72, y: bounds.height * 0.74 },
  });

  await expect(page.getByText("Short chart position synced")).toBeVisible();
  await expect
    .poll(
      async () =>
        (
          await evaluateChart<readonly { type?: string }[]>(page, "getDrawings")
        ).filter((drawing) => drawing.type === "position").length,
    )
    .toBe(2);
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
    await expect(page.getByTestId("candle-count")).toHaveText("10000");

    const layout = await page.evaluate(() => {
      const chart = document.querySelector<HTMLElement>(
        "[data-testid='candlestick-chart']",
      );
      const toolbar = document.querySelector<HTMLElement>(".drawing-toolbar");
      const rail = document.querySelector<HTMLElement>(".level-rail");
      return {
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        chartWidth: chart?.clientWidth ?? 0,
        chartHeight: chart?.clientHeight ?? 0,
        toolbarRight: toolbar?.getBoundingClientRect().right ?? 0,
        chartLeft: chart?.getBoundingClientRect().left ?? 0,
        chartRight: chart?.getBoundingClientRect().right ?? 0,
        railLeft: rail?.getBoundingClientRect().left ?? null,
        railRight: rail?.getBoundingClientRect().right ?? null,
      };
    });

    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.chartWidth).toBeGreaterThan(750);
    expect(layout.chartHeight).toBeGreaterThan(540);
    expect(layout.toolbarRight).toBeLessThanOrEqual(layout.chartLeft);
    if (layout.railLeft !== null && layout.railRight !== null) {
      expect(layout.railLeft).toBeGreaterThanOrEqual(layout.chartLeft);
      expect(layout.railRight).toBeLessThanOrEqual(layout.chartRight);
    }
    await page.screenshot({
      path: testInfo.outputPath(`${viewport.width}x${viewport.height}.png`),
      fullPage: true,
    });
  }
});

test("holds one chart through an accelerated eight-hour update soak", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await installBinanceKlineMock(page);
  await page.goto("/");
  await expect(page.getByTestId("candle-count")).toHaveText("10000");

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
