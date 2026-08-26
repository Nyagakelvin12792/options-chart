import { expect, test } from "@playwright/test";

test("renders the M0 architecture scaffold", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "BTC Options Metrics Dashboard" }),
  ).toBeVisible();
  await expect(page.getByText("Architecture lock")).toBeVisible();
});
