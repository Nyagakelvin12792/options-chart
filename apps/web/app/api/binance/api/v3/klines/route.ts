import type { CandleInterval } from "@options-chart/domain";
import { NextResponse } from "next/server";

import { getDashboardAccess } from "@/lib/auth";

const BINANCE_KLINES_ENDPOINT = "https://data-api.binance.vision/api/v3/klines";
const SUPPORTED_INTERVALS = new Set<CandleInterval>([
  "1m",
  "5m",
  "15m",
  "1h",
  "4h",
  "1d",
  "1w",
]);

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await getDashboardAccess();
  if (!access.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const incoming = new URL(request.url).searchParams;
  const symbol = incoming.get("symbol") ?? "BTCUSDT";
  const interval = incoming.get("interval") ?? "1h";
  const limit = Number(incoming.get("limit") ?? "1000");
  const startTime = incoming.get("startTime");
  const endTime = incoming.get("endTime");

  if (
    symbol !== "BTCUSDT" ||
    !SUPPORTED_INTERVALS.has(interval as CandleInterval) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 1_000
  ) {
    return NextResponse.json(
      { error: "Invalid Binance kline request" },
      { status: 400 },
    );
  }

  const endpoint = new URL(BINANCE_KLINES_ENDPOINT);
  endpoint.searchParams.set("symbol", symbol);
  endpoint.searchParams.set("interval", interval);
  endpoint.searchParams.set("limit", String(limit));
  if (startTime !== null) endpoint.searchParams.set("startTime", startTime);
  if (endTime !== null) endpoint.searchParams.set("endTime", endTime);

  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: `Binance returned HTTP ${response.status}` },
        { status: 502 },
      );
    }

    const payload: unknown = await response.json();
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Binance candle history is temporarily unavailable" },
      { status: 502 },
    );
  }
}
