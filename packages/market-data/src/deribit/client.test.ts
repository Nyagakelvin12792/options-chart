import { describe, expect, it } from "vitest";

import { RateLimitError, SchemaValidationError } from "@options-chart/shared";

import { DeribitRestClient } from "./client";

const jsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("DeribitRestClient", () => {
  it("calls public JSON-RPC endpoints with explicit query parameters", async () => {
    const requests: URL[] = [];
    const fetcher: typeof fetch = async (input) => {
      requests.push(new URL(String(input)));
      return jsonResponse({ jsonrpc: "2.0", id: 1, result: 1_780_000_000_000 });
    };
    const client = new DeribitRestClient({
      endpoint: "https://deribit.test/api/v2/",
      fetcher,
    });

    await expect(client.getTime()).resolves.toBe(1_780_000_000_000);
    expect(requests[0]?.pathname).toBe("/api/v2/public/get_time");
  });

  it("rejects malformed result payloads with a structured schema error", async () => {
    const fetcher: typeof fetch = async () =>
      jsonResponse({ jsonrpc: "2.0", id: 1, result: "not-a-timestamp" });
    const client = new DeribitRestClient({ fetcher });

    await expect(client.getTime()).rejects.toBeInstanceOf(
      SchemaValidationError,
    );
  });

  it("classifies HTTP and JSON-RPC rate limits", async () => {
    const httpClient = new DeribitRestClient({
      fetcher: async () => jsonResponse({}, 429),
    });
    const rpcClient = new DeribitRestClient({
      fetcher: async () =>
        jsonResponse({
          jsonrpc: "2.0",
          id: 1,
          error: { code: 10028, message: "too_many_requests" },
        }),
    });

    await expect(httpClient.getTime()).rejects.toBeInstanceOf(RateLimitError);
    await expect(rpcClient.getTime()).rejects.toBeInstanceOf(RateLimitError);
  });

  it("requests recent BTC option trades with bounded raw flow fields", async () => {
    const requests: URL[] = [];
    const fetcher: typeof fetch = async (input) => {
      requests.push(new URL(String(input)));
      return jsonResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          trades: [
            {
              trade_seq: 467,
              trade_id: "415305279",
              timestamp: 1_770_984_454_552,
              tick_direction: 2,
              price: 0.0525,
              mark_price: 0.05253883,
              iv: 45.91,
              instrument_name: "BTC-24APR26-72000-C",
              index_price: 66_930.31,
              direction: "buy",
              amount: 3,
            },
          ],
          has_more: true,
        },
      });
    };
    const client = new DeribitRestClient({
      endpoint: "https://deribit.test/api/v2",
      fetcher,
    });

    const result = await client.getRecentOptionTrades({
      count: 250,
      sorting: "asc",
      startTimestamp: 1_770_000_000_000,
      endTimestamp: 1_771_000_000_000,
    });

    expect(result.trades[0]?.direction).toBe("buy");
    expect(requests[0]?.pathname).toBe(
      "/api/v2/public/get_last_trades_by_currency_and_time",
    );
    expect(Object.fromEntries(requests[0]?.searchParams ?? [])).toEqual({
      currency: "BTC",
      kind: "option",
      count: "250",
      sorting: "asc",
      start_timestamp: "1770000000000",
      end_timestamp: "1771000000000",
    });
  });

  it("preserves Deribit's full index reference and rejects invalid trade limits", async () => {
    const fetcher: typeof fetch = async () =>
      jsonResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          index_price: 78_625.5,
          estimated_delivery_price: 78_601.25,
        },
      });
    const client = new DeribitRestClient({ fetcher });

    await expect(client.getIndexReference()).resolves.toEqual({
      index_price: 78_625.5,
      estimated_delivery_price: 78_601.25,
    });
    await expect(
      client.getRecentOptionTrades({ count: 1_001 }),
    ).rejects.toBeInstanceOf(SchemaValidationError);
  });

  it("loads an option ticker for gamma reconciliation", async () => {
    const requests: URL[] = [];
    const client = new DeribitRestClient({
      endpoint: "https://deribit.test/api/v2",
      fetcher: async (input) => {
        requests.push(new URL(String(input)));
        return jsonResponse({
          jsonrpc: "2.0",
          id: 1,
          result: {
            instrument_name: "BTC-24APR26-72000-C",
            timestamp: 1_770_984_454_552,
            underlying_price: 66_930.31,
            interest_rate: 0.01,
            mark_iv: 45.91,
            greeks: { gamma: 0.00012 },
          },
        });
      },
    });

    await expect(
      client.getOptionTicker("BTC-24APR26-72000-C"),
    ).resolves.toMatchObject({ greeks: { gamma: 0.00012 } });
    expect(requests[0]?.pathname).toBe("/api/v2/public/ticker");
    await expect(client.getOptionTicker("BTC-PERPETUAL")).rejects.toBeInstanceOf(
      SchemaValidationError,
    );
  });
});
