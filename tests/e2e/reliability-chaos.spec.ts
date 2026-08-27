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

test.describe("Milestone 7: Reliability & Failure Injection E2E Suite", () => {
  test("M7.14 sleep/wake visibilitychange simulation preserves chart instance and state", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openFallbackDashboard(page);

    const initialCreateCount = await getChartCreateCount(page);
    expect(initialCreateCount).toBe(1);

    // Simulate tab hiding (sleep)
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        value: true,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await page.waitForTimeout(500);

    // Simulate tab waking (resume)
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        value: false,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await page.waitForTimeout(500);

    // Chart must NOT be recreated
    const postWakeCreateCount = await getChartCreateCount(page);
    expect(postWakeCreateCount).toBe(1);

    // Level Rail and candles must remain rendered
    await expect(page.getByTestId("level-tag-call-wall")).toBeVisible();
    await expect(page.getByTestId("candle-count")).toContainText(/\d{4}/);
  });

  test("M7.15 offline/online network disruption recovers cleanly without chart reset", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openFallbackDashboard(page);

    // Simulate browser offline event
    await page.evaluate(() => {
      window.dispatchEvent(new Event("offline"));
    });

    await page.waitForTimeout(500);

    // Simulate browser online event
    await page.evaluate(() => {
      window.dispatchEvent(new Event("online"));
    });

    await page.waitForTimeout(500);

    // Chart must maintain single instance
    const count = await getChartCreateCount(page);
    expect(count).toBe(1);

    // Overlay levels remain interactive
    const gammaFlip = page.getByTestId("level-tag-gamma-flip");
    await expect(gammaFlip).toBeVisible();
    await gammaFlip.hover();
    await expect(gammaFlip.getByRole("tooltip")).toBeVisible();
  });

  test("M7.16 & M7.17 health badges and level states accurately reflect provenance", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openFallbackDashboard(page);

    // In fallback mode, tags must explicitly show FALLBACK (never falsely labeled LIVE)
    const callWall = page.getByTestId("level-tag-call-wall");
    await expect(callWall).toContainText("FALLBACK");
    await expect(callWall).not.toContainText("LIVE");

    // Summary bar must show FALLBACK status
    await expect(page.locator(".summary-state")).toHaveText("FALLBACK");
  });
});
