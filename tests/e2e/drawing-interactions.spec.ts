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
  getDrawings(): readonly any[];
  getSelectedInterval(): string;
  getVisibleRange(): { fromTimestamp: number; toTimestamp: number } | null;
  addHorizontalDrawing(price: number): void;
  addVerticalDrawing(timestamp: number): void;
  addVpDrawing?(fromTimestamp: number, toTimestamp: number): void;
  addVwapDrawing?(anchorTimestamp: number): void;
  selectDrawing?(id: string | null): void;
  getSelectedDrawingId?(): string | null;
  deleteSelectedDrawing?(): void;
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

test.describe("TradingView-Quality Drawing Tool Interactions", () => {
  test.beforeEach(async ({ page }) => {
    await installBinanceKlineMock(page);
    await installDeribitFixtureMock(page);
  });

  test("places interactive Fixed Range Volume Profile and Anchored VWAP drawings", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    // Wait for 10,000 candles and level tags to load
    await expect(page.getByTestId("candle-count")).toHaveText("10000");
    await expect(page.getByTestId("level-tag-call-wall")).toBeVisible();

    const chart = page.getByTestId("candlestick-chart");
    const chartBox = await chart.boundingBox();
    expect(chartBox).not.toBeNull();
    if (!chartBox) throw new Error("Chart plot bounds are unavailable");

    // 1. Verify Toolbar Buttons
    const pointerBtn = page.getByRole("button", { name: "Pointer and crosshair" });
    const vpBtn = page.getByRole("button", { name: "Fixed range Volume Profile" });
    const avwapBtn = page.getByRole("button", { name: "Anchored VWAP" });
    const hLineBtn = page.getByRole("button", { name: "Horizontal line" });
    const vLineBtn = page.getByRole("button", { name: "Vertical line" });
    const longPosBtn = page.getByRole("button", { name: "Long position" });
    const shortPosBtn = page.getByRole("button", { name: "Short position" });

    await expect(pointerBtn).toBeVisible();
    await expect(vpBtn).toBeVisible();
    await expect(avwapBtn).toBeVisible();
    await expect(hLineBtn).toBeVisible();
    await expect(vLineBtn).toBeVisible();
    await expect(longPosBtn).toBeVisible();
    await expect(shortPosBtn).toBeVisible();

    // 2. Draw Fixed Range Volume Profile by dragging across range
    await vpBtn.click();
    await expect(vpBtn).toHaveAttribute("aria-pressed", "true");

    const vpStartX = chartBox.x + chartBox.width * 0.35;
    const vpStartY = chartBox.y + chartBox.height * 0.5;
    const vpEndX = chartBox.x + chartBox.width * 0.65;
    const vpEndY = chartBox.y + chartBox.height * 0.5;

    await page.mouse.move(vpStartX, vpStartY);
    await page.mouse.down();
    await page.mouse.move(vpEndX, vpEndY, { steps: 10 });
    await page.mouse.up();

    // Verify VP drawing created
    await expect
      .poll(async () => (await evaluateChart<readonly any[]>(page, "getDrawings")).length)
      .toBe(1);

    let drawings = await evaluateChart<readonly any[]>(page, "getDrawings");
    const vpDrawing = drawings[0];
    expect(vpDrawing.type).toBe("volume-profile-range");
    expect(vpDrawing.fromTimestamp).toBeLessThan(vpDrawing.toTimestamp);
    expect(vpDrawing.isSelected).toBe(true);

    // 3. Draw Anchored VWAP by clicking on a candle
    await avwapBtn.click();
    await expect(avwapBtn).toHaveAttribute("aria-pressed", "true");

    const avwapClickX = chartBox.x + chartBox.width * 0.25;
    const avwapClickY = chartBox.y + chartBox.height * 0.45;

    await page.mouse.click(avwapClickX, avwapClickY);

    // Verify AVWAP drawing created and toolbar auto-resets to pointer mode
    await expect
      .poll(async () => (await evaluateChart<readonly any[]>(page, "getDrawings")).length)
      .toBe(2);

    await expect(pointerBtn).toHaveAttribute("aria-pressed", "true");

    drawings = await evaluateChart<readonly any[]>(page, "getDrawings");
    const avwapDrawing = drawings.find((d) => d.type === "anchored-vwap");
    expect(avwapDrawing).toBeDefined();
    expect(typeof avwapDrawing.anchorTimestamp).toBe("number");
    expect(avwapDrawing.anchorTimestamp).toBeGreaterThan(0);

    // 4. Test Persistence across page reload
    await page.reload();
    await expect(page.getByTestId("candle-count")).toHaveText("10000");

    const reloadedDrawings = await evaluateChart<readonly any[]>(page, "getDrawings");
    expect(reloadedDrawings.length).toBe(2);
    expect(reloadedDrawings.some((d) => d.type === "volume-profile-range")).toBe(true);
    expect(reloadedDrawings.some((d) => d.type === "anchored-vwap")).toBe(true);

    // 5. Test Timeframe Switching with drawings
    const fourHourBtn = page.getByRole("button", { name: "4h" });
    if (await fourHourBtn.isVisible()) {
      await fourHourBtn.click();
      await page.waitForTimeout(500);
      const postSwitchDrawings = await evaluateChart<readonly any[]>(page, "getDrawings");
      expect(postSwitchDrawings.length).toBe(2);
    }

    // 6. Test Delete selected drawing via UI Delete button
    const deleteBtn = page.getByRole("button", { name: "Delete selected drawing" });
    await deleteBtn.click();

    await expect
      .poll(async () => (await evaluateChart<readonly any[]>(page, "getDrawings")).length)
      .toBe(1);

    // 7. Clear all drawings via Clear button
    const clearBtn = page.getByRole("button", { name: "Clear drawings" });
    await clearBtn.click();

    await expect
      .poll(async () => (await evaluateChart<readonly any[]>(page, "getDrawings")).length)
      .toBe(0);
  });

  test("captures visual verification screenshots across desktop and mobile viewports", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto("/");
    await expect(page.getByTestId("candle-count")).toHaveText("10000");
    await expect(page.getByTestId("level-tag-call-wall")).toBeVisible();

    // Add high-quality Fixed Range VP and Anchored VWAP drawings
    const visibleRange = await evaluateChart<{ fromTimestamp: number; toTimestamp: number } | null>(
      page,
      "getVisibleRange",
    );
    expect(visibleRange).not.toBeNull();
    const fromTime = visibleRange!.fromTimestamp + 3600_000 * 5;
    const toTime = visibleRange!.toTimestamp - 3600_000 * 5;

    await evaluateChart(page, "addVpDrawing", [fromTime, toTime]);
    await evaluateChart(page, "addVwapDrawing", [fromTime]);

    await page.waitForTimeout(1000);

    // Desktop 1440x900
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: "tests/e2e/screenshots/drawing-interactions-1440x900.png",
      fullPage: true,
    });

    // Desktop 1280x720
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: "tests/e2e/screenshots/drawing-interactions-1280x720.png",
      fullPage: true,
    });

    // Mobile 390x844
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: "tests/e2e/screenshots/drawing-interactions-390x844.png",
      fullPage: true,
    });
  });
});
