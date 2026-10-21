import { expect, test } from "@playwright/test";

import { installBinanceKlineMock } from "./support/binance-kline-mock";
import { installDeribitFixtureMock } from "./support/deribit-fixture-mock";

test("keeps deterministic and Jev shadow opinions compact and distinct", async ({
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

    const dock = page.getByRole("region", {
      name: "AI assisted decision dock",
    });
    await expect(dock).toBeVisible();
    await expect(dock.getByText("SHADOW", { exact: true })).toBeVisible();
    await expect(dock.getByText("Rules", { exact: true })).toBeVisible();
    await expect(dock.getByText("Jev · shadow", { exact: true })).toBeVisible();
    await expect(dock.getByRole("button", { name: "Check Jev" })).toBeVisible();

    await dock.getByRole("button", { name: "Details" }).click();
    await expect(
      dock.getByText("Pending held-out shadow sample"),
    ).toBeVisible();

    const dimensions = await dock.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width,
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
      };
    });
    expect(dimensions.left).toBeGreaterThanOrEqual(0);
    expect(dimensions.right).toBeLessThanOrEqual(dimensions.viewportWidth);
    expect(dimensions.documentWidth).toBeLessThanOrEqual(
      dimensions.viewportWidth,
    );
    expect(dimensions.width).toBeGreaterThan(250);

    await page.screenshot({
      path: testInfo.outputPath(`decision-dock-${viewport.name}.png`),
      fullPage: true,
    });
  }
});
