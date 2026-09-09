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

test("renders the audited Gamma hierarchy, profile, and collision-safe Level Rail", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openFixtureDashboard(page);

  await expect(
    page.getByRole("complementary", { name: "Options level rail" }),
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
  await expect(
    page.getByRole("heading", { name: /Wall confluence/i }),
  ).toBeVisible();
  await expect(page.locator(".wall-confluence-zone").first()).toContainText(
    /of 6/i,
  );
  for (const signal of [
    "gamma",
    "open-interest",
    "volume",
    "max-pain",
    "gamma-flip",
  ]) {
    await expect(
      page.locator(`.wall-confluence-signal.signal-${signal}`).first(),
    ).toBeVisible();
  }
  await expect(page.locator(".confluence-zone-band").first()).toBeVisible();

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

  const profile = page.getByTestId("gamma-profile");
  await expect(profile).toHaveAttribute("data-profile-metric", "gex");
  await page
    .getByRole("button", { name: "Open Interest concentration" })
    .click();
  await expect(profile).toHaveAttribute("data-profile-metric", "open-interest");
  await expect(profile.locator('[data-option-type="call"]')).not.toHaveCount(0);
  await expect(profile.locator('[data-option-type="put"]')).not.toHaveCount(0);
  await page.getByRole("button", { name: "24-hour options volume" }).click();
  await expect(profile).toHaveAttribute("data-profile-metric", "volume");
  await expect(profile.locator('[data-option-type="call"]')).not.toHaveCount(0);
  await expect(profile.locator('[data-option-type="put"]')).not.toHaveCount(0);
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
    expect(layout.chartWidth).toBeGreaterThan(viewport.width < 500 ? 180 : 750);
    expect(layout.chartRight).toBeLessThanOrEqual(layout.railLeft);
    expect(layout.summaryHeight).toBeGreaterThanOrEqual(28);
    await page.screenshot({
      path: testInfo.outputPath(`${viewport.width}x${viewport.height}.png`),
      fullPage: true,
    });
  }
});
