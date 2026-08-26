import { describe, expect, it } from "vitest";
import {
  BinanceWsKlineDataSchema,
  BinanceWsKlineEventSchema,
} from "./ws-schemas";

// ---------------------------------------------------------------------------
// Valid fixture
// ---------------------------------------------------------------------------

const VALID_WS_KLINE_EVENT = {
  e: "kline",
  E: 1700000000000,
  s: "BTCUSDT",
  k: {
    t: 1700000000000,
    T: 1700000059999,
    s: "BTCUSDT",
    i: "1m",
    f: 100,
    L: 200,
    o: "36000.00",
    c: "36100.50",
    h: "36150.00",
    l: "35950.00",
    v: "12.345",
    n: 101,
    x: false,
    q: "445000.12",
    V: "6.789",
    Q: "244000.56",
    B: "0",
  },
};

describe("BinanceWsKlineEventSchema", () => {
  it("accepts a valid kline event", () => {
    const result = BinanceWsKlineEventSchema.safeParse(VALID_WS_KLINE_EVENT);
    expect(result.success).toBe(true);
  });

  it("rejects non-kline event type", () => {
    const result = BinanceWsKlineEventSchema.safeParse({
      ...VALID_WS_KLINE_EVENT,
      e: "trade",
    });
    expect(result.success).toBe(false);
  });

  it("rejects inconsistent OHLC", () => {
    const result = BinanceWsKlineDataSchema.safeParse({
      ...VALID_WS_KLINE_EVENT.k,
      h: "35000.00", // high below open/close
    });
    expect(result.success).toBe(false);
  });

  it("rejects close time before open time", () => {
    const result = BinanceWsKlineDataSchema.safeParse({
      ...VALID_WS_KLINE_EVENT.k,
      T: VALID_WS_KLINE_EVENT.k.t - 1,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a closed kline (x=true)", () => {
    const result = BinanceWsKlineEventSchema.safeParse({
      ...VALID_WS_KLINE_EVENT,
      k: { ...VALID_WS_KLINE_EVENT.k, x: true },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.k.x).toBe(true);
    }
  });
});
