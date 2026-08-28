import { expect, test } from "@playwright/test";

import { installBinanceKlineMock } from "./support/binance-kline-mock";
import { installDeribitFallbackMock } from "./support/deribit-fallback-mock";

const openFallbackDashboard = async (page: import("@playwright/test").Page) => {
  await installBinanceKlineMock(page);
  await installDeribitFallbackMock(page);
  await page.goto("/");
  await expect(page.getByTestId("candle-count")).toHaveText("2000");
  await expect(page.getByTestId("total-open-interest")).not.toHaveText("--");
  await expect(
    page.getByText("FALLBACK", { exact: true }).first(),
  ).toBeVisible();
};

const getChartCreateCount = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const api = (
      window as Window & {
        __optionsChartTest?: {
          getDiagnostics(): { chartCreateCount: number };
        };
      }
    ).__optionsChartTest;
    if (!api) throw new Error("Chart test API is unavailable");
    return api.getDiagnostics().chartCreateCount;
  });

test("renders the audited Gamma hierarchy, profile, and collision-safe Level Rail", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openFallbackDashboard(page);

  await expect(
    page.getByRole("complementary", { name: "Options level rail" }),
  ).toBeVisible();
  for (const kind of ["call-wall", "put-wall", "gamma-flip", "max-pain"]) {
    const tag = page.getByTestId(`level-tag-${kind}`);
    await expect(tag).toBeVisible();
    await expect(tag).toContainText(/\d{2,3},\d{3}/);
    await expect(tag).toContainText("FALLBACK");
  }
  await expect(page.getByTestId("level-tag-secondary-gex")).toHaveCount(3);
  await expect(page.getByTestId("gamma-profile")).toBeVisible();
  await expect(page.getByTestId("gamma-regime-shading")).toBeVisible();

  const callWall = page.getByTestId("level-tag-call-wall");
  await callWall.hover();
  await expect(callWall.getByRole("tooltip")).toContainText("Engine:");
  await expect(callWall.getByRole("tooltip")).toContainText("Scope:");
  await expect(callWall.getByRole("tooltip")).toContainText("Contracts:");

  const boxes = await page.locator(".level-tag").evaluateAll((nodes) =>
    nodes.map((node) => {
      const bounds = node.getBoundingClientRect();
      return { top: bounds.top, bottom: bounds.bottom };
    }),
  );
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      const first = boxes[left]!;
      const second = boxes[right]!;
      expect(
        Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top),
      ).toBeLessThanOrEqual(0);
    }
  }
  await expect(page.getByTestId("current-price-level")).toBeVisible();
});

test("updates Deribit expiry dates and overlays without recreating the chart", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openFallbackDashboard(page);
  expect(await getChartCreateCount(page)).toBe(1);

  const expirySelect = page.getByLabel("Expiry date");
  expect(await expirySelect.locator("option").count()).toBeGreaterThanOrEqual(
    2,
  );
  await expect(expirySelect.locator("option").first()).toHaveText(
    /^\d{2} [A-Z]{3} \d{2}$/,
  );
  const expiryValues = await expirySelect
    .locator("option")
    .evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value),
    );
  const selectedExpiry = expiryValues[1]!;
  await expirySelect.selectOption(selectedExpiry);
  await expect(
    page.getByRole("region", { name: "Options summary metrics" }),
  ).toHaveAttribute("data-expiry-scope", `custom:${selectedExpiry}`);
  expect(await getChartCreateCount(page)).toBe(1);

  await page
    .getByRole("button", { name: "Toggle Gamma regime shading" })
    .click();
  await expect(page.getByTestId("gamma-regime-shading")).toHaveCount(0);
  await page.getByRole("button", { name: "Collapse Gamma profile" }).click();
  await expect(page.getByTestId("gamma-profile")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Toggle secondary GEX levels" })
    .click();
  await expect(page.getByTestId("level-tag-secondary-gex")).toHaveCount(0);
  await page.getByRole("button", { name: "Hide options overlays" }).click();
  await expect(
    page.getByRole("complementary", { name: "Options level rail" }),
  ).toHaveCount(0);
  expect(await getChartCreateCount(page)).toBe(1);
});

test("keeps the chart-first Gamma layout stable across target viewports", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await installBinanceKlineMock(page);
  await installDeribitFallbackMock(page);

  for (const viewport of [
    { width: 1_366, height: 768 },
    { width: 1_920, height: 1_080 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByTestId("total-open-interest")).not.toHaveText("--");
    const layout = await page.evaluate(() => {
      const chart = document.querySelector<HTMLElement>(
        "[data-testid='candlestick-chart']",
      );
      const rail = document.querySelector<HTMLElement>(".level-rail");
      const summary = document.querySelector<HTMLElement>(
        ".options-summary-bar",
      );
      return {
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        chartWidth: chart?.clientWidth ?? 0,
        chartRight: chart?.getBoundingClientRect().right ?? 0,
        railLeft: rail?.getBoundingClientRect().left ?? 0,
        summaryHeight: summary?.clientHeight ?? 0,
      };
    });
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.chartWidth).toBeGreaterThan(viewport.width < 500 ? 180 : 900);
    expect(layout.chartRight).toBeLessThanOrEqual(layout.railLeft);
    expect(layout.summaryHeight).toBeGreaterThanOrEqual(28);
    await page.screenshot({
      path: testInfo.outputPath(`${viewport.width}x${viewport.height}.png`),
      fullPage: true,
    });
  }
});
