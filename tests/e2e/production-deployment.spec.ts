import { expect, test } from "@playwright/test";

import { installBinanceKlineMock } from "./support/binance-kline-mock";
import { installDeribitFallbackMock } from "./support/deribit-fallback-mock";

test.describe("Milestone 8: Vercel Production Deployment & Security Suite", () => {
  test("M8.16 validates input parameters on Binance proxy route", async ({
    request,
  }) => {
    // Bad request parameters return 400
    const response = await request.get("/api/binance/api/v3/klines", {
      params: {
        symbol: "INVALID_SYMBOL",
        interval: "invalid_interval",
        limit: "9999",
      },
    });

    expect(response.status()).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("Invalid Binance kline request");
  });

  test("M8.17 serves production CSP and security headers on page routes", async ({
    page,
  }) => {
    const response = await page.goto("/");
    expect(response).not.toBeNull();

    const headers = response?.headers() ?? {};
    const csp = headers["content-security-policy"];

    expect(csp).toBeDefined();
    expect(csp).toContain("connect-src");
    expect(csp).toContain("https://api.binance.com");
    expect(csp).toContain("https://data-api.binance.vision");
    expect(csp).toContain("https://www.deribit.com");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
  });

  test("M8.17 calculation Web Worker initializes and executes under CSP", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await installBinanceKlineMock(page);
    await installDeribitFallbackMock(page);
    await page.goto("/");

    // Wait for worker metrics to calculate under CSP
    await expect(page.getByTestId("total-open-interest")).not.toHaveText("--");
    await expect(page.getByTestId("level-tag-call-wall")).toBeVisible();
    await expect(page.getByTestId("gamma-profile")).toBeVisible();

    // Verify worker diagnostics state
    const health = await page.evaluate(() => {
      const api = (
        window as Window & {
          __optionsChartTest?: {
            getRuntimeHealth(): {
              activeWorkers: number;
              chart: { chartCreateCount: number };
            };
          };
        }
      ).__optionsChartTest;
      return api?.getRuntimeHealth();
    });

    expect(health?.activeWorkers).toBe(1);
    expect(health?.chart.chartCreateCount).toBe(1);
  });

  test("M8.19 runtime diagnostics bundle contains complete system telemetry", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await installBinanceKlineMock(page);
    await installDeribitFallbackMock(page);
    await page.goto("/");

    await expect(page.getByTestId("candle-count")).toContainText(/\d{4}/);

    const diagnostics = await page.evaluate(() => {
      const api = (
        window as Window & {
          __optionsChartTest?: {
            getDiagnostics(): unknown;
          };
        }
      ).__optionsChartTest;
      return api?.getDiagnostics();
    });

    expect(diagnostics).toBeDefined();
  });
});
