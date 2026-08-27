import type { Page } from "@playwright/test";

export const installDeribitFallbackMock = async (page: Page): Promise<void> => {
  await page.route("https://www.deribit.com/api/v2/**", (route) =>
    route.abort(),
  );
};
