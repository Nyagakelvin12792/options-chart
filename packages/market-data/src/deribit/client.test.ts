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
});
