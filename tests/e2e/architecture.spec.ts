import { expect, test } from "@playwright/test";

test("renders the M0.5 access-controlled dashboard shell", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Options Chart" }),
  ).toBeVisible();
  await expect(page.getByText("Local access")).toBeVisible();
  await expect(page.getByText("Read-only market analytics")).toBeVisible();
});