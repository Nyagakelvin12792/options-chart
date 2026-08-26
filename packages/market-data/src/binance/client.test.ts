import { describe, expect, it, vi } from "vitest";
import { BinanceRestClient } from "./client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(responses: Array<{ ok: boolean; status: number; body?: unknown }>) {
  let callIndex = 0;
  return vi.fn(async () => {
    const resp = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    if (!resp) throw new Error("No mock response configured");
    return {
      ok: resp.ok,
      status: resp.status,
      headers: new Headers(),
      json: async () => resp.body ?? {},
    } as unknown as Response;
  });
}

describe("BinanceRestClient", () => {
  it("returns JSON from a successful klines request", async () => {
    const body = [[1700000000000, "36000", "36150", "35950", "36100", "12.0", 1700000059999, "432000", 100, "6.0", "216000", "0"]];
    const fetchMock = mockFetch([{ ok: true, status: 200, body }]);
    vi.stubGlobal("fetch", fetchMock);

    const client = new BinanceRestClient({
      endpoints: ["https://test.binance.com"],
      timeoutMs: 5000,
    });
    const result = await client.fetchKlines({ interval: "1h" });
    expect(result).toEqual(body);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCallUrl = String(fetchMock.mock.calls[0]);
    expect(firstCallUrl).toContain("/api/v3/klines");

    vi.unstubAllGlobals();
  });

  it("fails over to fallback endpoint on transport error", async () => {
    const body = { serverTime: 1700000000000 };
    let callCount = 0;
    const fetchMock = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        throw new TypeError("Network failure");
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => body,
      } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new BinanceRestClient({
      endpoints: ["https://primary.test", "https://fallback.test"],
      timeoutMs: 5000,
    });

    const result = await client.fetchServerTime();
    expect(result).toEqual(body);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0])).toContain("primary.test");
    expect(String(fetchMock.mock.calls[1])).toContain("fallback.test");

    vi.unstubAllGlobals();
  });

  it("throws RateLimitError immediately on HTTP 429 (no failover)", async () => {
    const fetchMock = mockFetch([{ ok: false, status: 429 }]);
    vi.stubGlobal("fetch", fetchMock);

    const client = new BinanceRestClient({
      endpoints: ["https://primary.test", "https://fallback.test"],
      timeoutMs: 5000,
    });

    await expect(client.fetchKlines({ interval: "1m" })).rejects.toThrow(
      "rate limit",
    );
    // Should NOT have tried the fallback.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it("throws when all endpoints fail", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Network failure");
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new BinanceRestClient({
      endpoints: ["https://a.test", "https://b.test"],
      timeoutMs: 5000,
    });

    await expect(client.fetchServerTime()).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.unstubAllGlobals();
  });

  it("includes query parameters for klines", async () => {
    const fetchMock = mockFetch([{ ok: true, status: 200, body: [] }]);
    vi.stubGlobal("fetch", fetchMock);

    const client = new BinanceRestClient({
      endpoints: ["https://test.binance.com"],
    });
    await client.fetchKlines({
      interval: "5m",
      startTime: 1000,
      endTime: 2000,
      limit: 500,
    });

    const url = String(fetchMock.mock.calls[0]);
    expect(url).toContain("interval=5m");
    expect(url).toContain("startTime=1000");
    expect(url).toContain("endTime=2000");
    expect(url).toContain("limit=500");

    vi.unstubAllGlobals();
  });
});
