import { DeribitIndexPriceResultSchema } from "@options-chart/market-data";
import { NextResponse } from "next/server";

import { getDashboardAccess } from "@/lib/auth";
import { proxyDeribitPublicRequest } from "../../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await getDashboardAccess();
  if (!access.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const incoming = new URL(request.url).searchParams;
  const indexName = incoming.get("index_name");
  if (indexName !== null && indexName !== "btc_usd") {
    return NextResponse.json(
      { error: "Only the btc_usd index is supported" },
      { status: 400 },
    );
  }

  return proxyDeribitPublicRequest(
    "public/get_index_price",
    { index_name: "btc_usd" },
    DeribitIndexPriceResultSchema,
  );
}
