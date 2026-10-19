import { expect, test } from "@playwright/test";
import { installBinanceKlineMock } from "./support/binance-kline-mock";
import { installDeribitFixtureMock } from "./support/deribit-fixture-mock";
import { REQUIRED_EVIDENCE } from "../../apps/web/lib/macro-context";
function fixture() {
  const time = new Date().toISOString();
  return {
    snapshotId: "a".repeat(24),
    contractVersion: "1.0.0",
    methodologyVersion: "btc-macros-rules-1.0.0-candidate",
    createdAt: time,
    maxAgeSeconds: 3600,
    brief: "Software fixture",
    integrity: {
      mode: "live",
      requiredEvidenceComplete: true,
      independentCrossCheck: false,
    },
    usable: true,
    veto: false,
    regime: "SUPPORTIVE",
    macro: "SUPPORTIVE",
    fundamentals: "MIXED",
    positioning: "BALANCED",
    missing: [],
    evidence: Object.entries(REQUIRED_EVIDENCE).map(([metric, r]) => ({
      metric,
      observationId: "b".repeat(64),
      value: 1,
      unit: r.unit,
      asOf: time,
      status: "PRIMARY VALIDATED",
      sourceUrl: "https://example.com/evidence",
    })),
    conflicts: [],
    limitations: ["Software fixture only"],
    scope: "Context only. No option levels, entries, sizing, or orders.",
  };
}
test("macro import remains isolated, rejects degradation, and clears", async ({
  page,
}) => {
  await installBinanceKlineMock(page);
  await installDeribitFixtureMock(page);
  await page.goto("/");
  const panel = page.getByRole("region", { name: "Macro context" });
  await expect(panel.getByRole("status")).toHaveText("No snapshot");
  const input = panel.getByLabel("Import macro snapshot");
  const payload = fixture();
  await input.setInputFiles({
    name: "macro.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(payload)),
  });
  await expect(panel.getByRole("status")).toHaveText("Context available");
  await input.setInputFiles({
    name: "stale.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ ...payload, createdAt: "2020-01-01T00:00:00Z" }),
    ),
  });
  await expect(panel.getByRole("status")).toHaveText("Context blocked");
  await expect(panel.getByRole("alert")).toContainText("expired");
  await panel.getByRole("button", { name: "Clear macro context" }).click();
  await expect(panel.getByRole("status")).toHaveText("No snapshot");
  await input.setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from("{}"),
  });
  await expect(panel.getByRole("alert")).toContainText("valid JSON snapshot");
  await expect(page.getByTestId("candlestick-chart")).toBeVisible();
});
