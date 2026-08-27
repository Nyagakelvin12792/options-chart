import type { Page } from "@playwright/test";

const INTERVAL_MS = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
  "1w": 604_800_000,
} as const;

type SupportedInterval = keyof typeof INTERVAL_MS;

export interface BinanceKlineMockState {
  readonly requests: Array<{
    readonly interval: SupportedInterval;
    readonly startTime: number | null;
    readonly endTime: number;
    readonly limit: number;
  }>;
  queueGapRepair(): void;
}

const makeKlines = (
  startTime: number,
  count: number,
  interval: SupportedInterval,
) => {
  const duration = INTERVAL_MS[interval];
  return Array.from({ length: count }, (_, index) => {
    const openTime = startTime + index * duration;
    const sequence = Math.floor(openTime / duration);
    const trend =
      Math.sin(sequence / 17) * 320 + Math.sin(sequence / 190) * 740;
    const open = 78_000 + trend;
    const close = open + (index % 2 === 0 ? 95 : -70);
    return [
      openTime,
      open.toFixed(2),
      (Math.max(open, close) + 140).toFixed(2),
      (Math.min(open, close) - 120).toFixed(2),
      close.toFixed(2),
      (110 + (index % 25)).toFixed(3),
      openTime + duration - 1,
      "8750000.12",
      2_400 + index,
      "64.2",
      "3810000.50",
      "0",
    ];
  });
};

export async function installBinanceKlineMock(
  page: Page,
): Promise<BinanceKlineMockState> {
  let repairQueued = false;
  const requests: BinanceKlineMockState["requests"] = [];

  await page.route("**/api/binance/api/v3/klines?**", async (route) => {
    const url = new URL(route.request().url());
    const interval = (url.searchParams.get("interval") ??
      "1h") as SupportedInterval;
    const duration = INTERVAL_MS[interval];
    const limit = Number(url.searchParams.get("limit") ?? "1000");
    const endTime = Number(url.searchParams.get("endTime") ?? Date.now());
    const startValue = url.searchParams.get("startTime");
    const startTime = startValue === null ? null : Number(startValue);
    requests.push({ interval, startTime, endTime, limit });

    if (repairQueued && startTime !== null) {
      repairQueued = false;
      await route.fulfill({
        json: makeKlines(startTime, 3, interval),
      });
      return;
    }

    const pageStart = startTime ?? endTime - limit * duration;
    const available = Math.max(0, Math.ceil((endTime - pageStart) / duration));
    await route.fulfill({
      json: makeKlines(pageStart, Math.min(limit, available), interval),
    });
  });

  return {
    requests,
    queueGapRepair: () => {
      repairQueued = true;
    },
  };
}
