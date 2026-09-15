import { expect, test } from "@playwright/test";

import { installBinanceKlineMock } from "./support/binance-kline-mock";
import { installDeribitFixtureMock } from "./support/deribit-fixture-mock";

const openFixtureDashboard = async (page: import("@playwright/test").Page) => {
  await installBinanceKlineMock(page);
  await installDeribitFixtureMock(page);
  await page.goto("/");
  await expect(page.getByTestId("candle-count")).toHaveText("10000");
  await expect(page.getByTestId("total-open-interest")).not.toHaveText("--");
  await expect(page.getByText("LIVE", { exact: true }).first()).toBeVisible();
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

test("renders the audited Gamma hierarchy, profile, and compact chart levels", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openFixtureDashboard(page);

  await expect(
    page.getByRole("complementary", { name: "Options chart levels" }),
  ).toBeVisible();
  for (const kind of ["call-wall", "put-wall", "gamma-flip", "max-pain"]) {
    const tag = page.getByTestId(`level-tag-${kind}`);
    await expect(tag).toBeVisible();
    await expect(tag).toContainText(/\d{2,3},\d{3}/);
    await expect(tag).toContainText("LIVE");
  }
  await expect(page.getByTestId("level-tag-secondary-gex")).toHaveCount(3);
  await expect(page.getByTestId("gamma-profile")).toBeVisible();
  await expect(page.getByTestId("gamma-regime-shading")).toBeVisible();
  const structureBrief = page.getByTestId("options-structure-brief");
  await expect(structureBrief).toBeVisible();
  await expect(structureBrief.locator(".structure-zone").first()).toContainText(
    /\d\/6/,
  );
  await expect(structureBrief).toContainText("FLOW");
  await expect(structureBrief).toContainText("GAMMA");
  await expect(
    structureBrief.locator(".structure-zone-signals").first(),
  ).not.toBeEmpty();
  await expect(page.locator(".wall-confluence")).toHaveCount(0);
  await expect(page.locator(".confluence-zone-band").first()).toBeVisible();
  await expect(page.locator(".confluence-zone-band > span")).toHaveCount(0);

  const callWall = page.getByTestId("level-tag-call-wall");
  await callWall.hover();
  const auditTooltip = callWall.locator(".level-audit-tooltip");
  await expect(auditTooltip).toBeVisible();
  const auditText = await auditTooltip.textContent();
  expect(auditText).toContain("Engine:");
  expect(auditText).toContain("Scope:");
  expect(auditText).toContain("Contracts:");
  expect(auditText).toContain("Open interest:");
  expect(auditText).toContain("24h volume:");

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
  await openFixtureDashboard(page);
  expect(await getChartCreateCount(page)).toBe(1);

  const expirySelect = page.getByLabel("Expiry date");
  const exactExpiries = expirySelect.locator('option[value^="expiry:"]');
  expect(await exactExpiries.count()).toBeGreaterThanOrEqual(2);
  await expect(exactExpiries.first()).toHaveText(/^\d{2} [A-Z]{3} \d{2}$/);
  const selectedExpiry = await exactExpiries.nth(1).getAttribute("value");
  if (!selectedExpiry) throw new Error("Expected a second exact expiry");
  await expirySelect.selectOption(selectedExpiry);
  await expect(
    page.getByRole("region", { name: "Options summary metrics" }),
  ).toHaveAttribute(
    "data-expiry-scope",
    `exact-expiry:${selectedExpiry.slice(7)}`,
  );
  await expirySelect.selectOption("scope:all");
  await expect(
    page.getByRole("region", { name: "Options summary metrics" }),
  ).toHaveAttribute("data-expiry-scope", "all");
  expect(await getChartCreateCount(page)).toBe(1);

  const profile = page.getByTestId("gamma-profile");
  await expect(profile).toHaveAttribute("data-profile-metric", "gex");
  await page
    .getByRole("button", { name: "Open Interest concentration" })
    .click();
  await expect(profile).toHaveAttribute("data-profile-metric", "open-interest");
  await expect(profile.locator('[data-option-type="call"]')).not.toHaveCount(0);
  await expect(profile.locator('[data-option-type="put"]')).not.toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "24-hour options volume" }),
  ).toHaveCount(0);
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
    page.getByRole("complementary", { name: "Options chart levels" }),
  ).toHaveCount(0);
  expect(await getChartCreateCount(page)).toBe(1);
});

test("keeps options labels synchronized during price-scale dragging", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openFixtureDashboard(page);

  const chart = page.getByTestId("candlestick-chart");
  const level = page.getByTestId("current-price-level");
  const chartBox = await chart.boundingBox();
  const before = await level.boundingBox();
  if (!chartBox || !before) throw new Error("Chart geometry is unavailable");

  await page.mouse.move(chartBox.x + chartBox.width - 6, chartBox.y + 220);
  await page.mouse.down();
  await page.mouse.move(chartBox.x + chartBox.width - 6, chartBox.y + 300, {
    steps: 4,
  });
  await page.waitForTimeout(40);
  const during = await level.boundingBox();
  await page.mouse.up();

  expect(during).not.toBeNull();
  expect(Math.abs((during?.y ?? before.y) - before.y)).toBeGreaterThan(1);
});

test("keeps the chart-first Gamma layout stable across target viewports", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await installBinanceKlineMock(page);
  await installDeribitFixtureMock(page);

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
      const riskTerminal =
        document.querySelector<HTMLElement>(".risk-terminal");
      return {
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        chartWidth: chart?.clientWidth ?? 0,
        chartLeft: chart?.getBoundingClientRect().left ?? 0,
        chartRight: chart?.getBoundingClientRect().right ?? 0,
        chartBottom: chart?.getBoundingClientRect().bottom ?? 0,
        railLeft: rail?.getBoundingClientRect().left ?? 0,
        railRight: rail?.getBoundingClientRect().right ?? 0,
        railWidth: rail?.clientWidth ?? 0,
        riskLeft: riskTerminal?.getBoundingClientRect().left ?? 0,
        riskTop: riskTerminal?.getBoundingClientRect().top ?? 0,
        summaryHeight: summary?.clientHeight ?? 0,
      };
    });
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.chartWidth).toBeGreaterThan(viewport.width < 500 ? 180 : 750);
    expect(layout.railLeft).toBeGreaterThanOrEqual(layout.chartLeft);
    expect(layout.railRight).toBeLessThanOrEqual(layout.chartRight);
    expect(layout.chartRight - layout.railRight).toBeGreaterThanOrEqual(72);
    expect(layout.railWidth).toBeLessThanOrEqual(82);
    if (viewport.width > 760) {
      expect(layout.riskLeft).toBeGreaterThanOrEqual(layout.chartRight);
    } else {
      expect(layout.riskTop).toBeGreaterThanOrEqual(layout.chartBottom);
    }
    expect(layout.summaryHeight).toBeGreaterThanOrEqual(28);
    await page.screenshot({
      path: testInfo.outputPath(`${viewport.width}x${viewport.height}.png`),
      fullPage: true,
    });
  }
});
