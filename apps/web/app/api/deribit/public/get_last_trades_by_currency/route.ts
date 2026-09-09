import {
  DeribitRecentOptionTradesQuerySchema,
  DeribitRecentOptionTradesResultSchema,
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

  const incoming = Object.fromEntries(new URL(request.url).searchParams);
  const { currency, kind, ...requestedQuery } = incoming;
  if (
    (currency !== undefined && currency !== "BTC") ||
    (kind !== undefined && kind !== "option")
  ) {
    return NextResponse.json(
      { error: "Only BTC option trades are supported" },
      { status: 400 },
    );
  }

  const query = DeribitRecentOptionTradesQuerySchema.safeParse(requestedQuery);
  if (!query.success) {
    return NextResponse.json(
      { error: "Invalid Deribit option trade request" },
      { status: 400 },
    );
  }

  return proxyDeribitPublicRequest(
    "public/get_last_trades_by_currency",
    { currency: "BTC", kind: "option", ...query.data },
    DeribitRecentOptionTradesResultSchema,
  );
}
