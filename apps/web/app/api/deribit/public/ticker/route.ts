import {
  DeribitOptionTickerSchema,
} from "@options-chart/market-data";
import { NextResponse } from "next/server";

import { getDashboardAccess } from "@/lib/auth";
import { proxyDeribitPublicRequest } from "../../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await getDashboardAccess();
  if (!access.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const instrumentName = new URL(request.url).searchParams.get(
    "instrument_name",
  );
  if (!instrumentName || !/^BTC-[A-Z0-9]+-[0-9]+-[CP]$/.test(instrumentName)) {
    return NextResponse.json(
      { error: "A valid BTC option instrument is required" },
      { status: 400 },
    );
  }

  return proxyDeribitPublicRequest(
    "public/ticker",
    { instrument_name: instrumentName },
    DeribitOptionTickerSchema,
  );
}
