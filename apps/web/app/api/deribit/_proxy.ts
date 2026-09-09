import {
  DERIBIT_REST_ENDPOINT,
  DeribitRpcResponseSchema,
} from "@options-chart/market-data";
import { NextResponse } from "next/server";

interface ResultSchema {
  safeParse(value: unknown): { readonly success: boolean };
}

type ProxyParameter = string | number | boolean;

export const proxyDeribitPublicRequest = async (
  method: string,
  params: Readonly<Record<string, ProxyParameter | undefined>>,
  resultSchema: ResultSchema,
): Promise<NextResponse> => {
  const endpoint = new URL(`${DERIBIT_REST_ENDPOINT}/${method}`);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) endpoint.searchParams.set(name, String(value));
  }

  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: `Deribit returned HTTP ${response.status}` },
        { status: response.status === 429 ? 429 : 502 },
      );
    }

    const payload: unknown = await response.json();
    const envelope = DeribitRpcResponseSchema.safeParse(payload);
    if (!envelope.success) {
      return NextResponse.json(
        { error: "Deribit returned an invalid JSON-RPC response" },
        { status: 502 },
      );
    }
    if (
      envelope.data.error === undefined &&
      !resultSchema.safeParse(envelope.data.result).success
    ) {
      return NextResponse.json(
        { error: "Deribit returned an invalid result" },
        { status: 502 },
      );
    }

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Deribit market data is temporarily unavailable" },
      { status: 502 },
    );
  }
};
