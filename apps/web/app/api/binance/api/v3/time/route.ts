import { NextResponse } from "next/server";

import { getDashboardAccess } from "@/lib/auth";

const BINANCE_TIME_ENDPOINTS = [
  "https://data-api.binance.vision/api/v3/time",
  "https://api.binance.com/api/v3/time",
] as const;

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await getDashboardAccess();
  if (!access.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  for (const endpoint of BINANCE_TIME_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
        headers: { Accept: "application/json" },
      });

      if (!response.ok) continue;
      const payload: unknown = await response.json();
      return NextResponse.json(payload, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch {
      continue;
    }
  }

  return NextResponse.json(
    { error: "Binance server time is temporarily unavailable" },
    { status: 502 },
  );
}
