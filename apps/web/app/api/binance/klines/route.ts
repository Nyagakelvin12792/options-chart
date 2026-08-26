import { NextResponse } from "next/server";

import { getDashboardAccess } from "@/lib/auth";

const BINANCE_KLINES_ENDPOINT = "https://data-api.binance.vision/api/v3/klines";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await getDashboardAccess();
  if (!access.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const endpoint = new URL(BINANCE_KLINES_ENDPOINT);
  endpoint.searchParams.set("symbol", "BTCUSDT");
  endpoint.searchParams.set("interval", "1h");
  endpoint.searchParams.set("limit", "120");

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
