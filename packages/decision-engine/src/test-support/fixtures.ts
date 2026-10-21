import {
  FlowEngine,
  type FlowFeatureSnapshotV1,
} from "@options-chart/flow-engine";
import type { MarketEventV1 } from "@options-chart/market-data";
import type { MarketStateInputV1 } from "../market-state-input";

export const NOW = 1_700_000_600_000;
export const FRESH_MS = 60_000;
const AS_OF = NOW - 1_000;

const PROVENANCE = {
  collector: "cryptofeed" as const,
  collectorVersion: "1.0.0",
  connectionId: "conn-fixture-0",
};

function hexId(n: number): string {
  return `market-event-v1:${n.toString(16).padStart(16, "0")}`;
}

function bookEvent(n: number, ts: number): MarketEventV1 {
  const bids = Array.from({ length: 10 }, (_, i) => [
    (66_990 - i * 10).toFixed(2),
    "1.00",
  ]);
  const asks = Array.from({ length: 10 }, (_, i) => [
    (67_010 + i * 10).toFixed(2),
    "1.00",
  ]);
  return {
    schemaVersion: "market-event-v1",
    eventId: hexId(n),
    venue: "binance",
    symbol: "BTC-USDT",
    instrumentType: "spot",
    channel: "l2-book",
    exchangeTimestampMs: ts - 5,
    receiptTimestampMs: ts,
    sequence: 100,
    payload: {
      schemaVersion: "binance-spot-l2-book-payload-v1",
      updateType: "snapshot",
      sequence: 100,
      bids,
      asks,
    },
    provenance: { ...PROVENANCE, recordedAtMs: ts },
  } as MarketEventV1;
}

function tradeEvent(
  n: number,
  ts: number,
  side: "buy" | "sell" | null,
): MarketEventV1 {
  return {
    schemaVersion: "market-event-v1",
    eventId: hexId(n),
    venue: "binance",
    symbol: "BTC-USDT",
    instrumentType: "spot",
    channel: "trade",
    exchangeTimestampMs: ts - 5,
    receiptTimestampMs: ts,
    sequence: n,
    payload: {
      schemaVersion: "binance-spot-trade-payload-v1",
      tradeId: n,
      price: "67000.00",
      quantity: "0.5000",
      tradeTimestampMs: ts - 5,
      takerSide: side,
    },
    provenance: { ...PROVENANCE, recordedAtMs: ts },
  } as MarketEventV1;
}

/** Real M11.3 snapshot produced by the real engine; nothing is hand-faked. */
export function makeFlowSnapshot(
  sides: readonly ("buy" | "sell" | null)[],
  asOfMs: number = AS_OF,
): FlowFeatureSnapshotV1 {
  const engine = new FlowEngine();
  const start = asOfMs - sides.length * 100 - 100;
  engine.ingest(bookEvent(1, start));
  let snapshot = engine.snapshot();
  sides.forEach((side, i) => {
    snapshot =
      engine.ingest(tradeEvent(10 + i, start + 100 + i * 100, side)) ??
      snapshot;
  });
  return snapshot;
}

const swing = (
  timeframe: "4h" | "1h" | "15m",
  trend: "up" | "down",
): NonNullable<MarketStateInputV1["structure"]["h4"]> =>
  trend === "up"
    ? {
        asOfMs: AS_OF,
        staleAfterMs: FRESH_MS,
        timeframe,
        formulaVersion: "swing-structure-v1",
        close: 67_500,
        lastSwingHigh: 68_000,
        prevSwingHigh: 67_000,
        lastSwingLow: 66_500,
        prevSwingLow: 66_000,
      }
    : {
        asOfMs: AS_OF,
        staleAfterMs: FRESH_MS,
        timeframe,
        formulaVersion: "swing-structure-v1",
        close: 66_000,
        lastSwingHigh: 67_000,
        prevSwingHigh: 68_000,
        lastSwingLow: 65_500,
        prevSwingLow: 66_000,
      };

export const uptrend = (tf: "4h" | "1h" | "15m") => swing(tf, "up");
export const downtrend = (tf: "4h" | "1h" | "15m") => swing(tf, "down");

export function baseInput(
  overrides: Partial<MarketStateInputV1> = {},
): MarketStateInputV1 {
  const input: MarketStateInputV1 = {
    identity: {
      createdAtMs: NOW + 5,
      effectiveAtMs: NOW,
      symbol: "BTCUSDT",
      activeTimeframe: "1h",
      expiryScope: "next-expiry",
      mode: "live-shadow",
      generationId: "gen-1",
      replayCursorMs: null,
    },
    candles: {
      asOfMs: AS_OF,
      staleAfterMs: FRESH_MS,
      sourceVersion: "binance-spot-candle-v1",
      lastPrice: 67_000,
      previousPrice: 66_950,
    },
    structure: { h4: uptrend("4h"), h1: uptrend("1h"), m15: uptrend("15m") },
    avwap: {
      asOfMs: AS_OF,
      staleAfterMs: FRESH_MS,
      formulaVersion: "avwap-v1",
      anchorId: "anchor-1",
      value: 66_900,
    },
    volumeProfile: {
      asOfMs: AS_OF,
      staleAfterMs: FRESH_MS,
      formulaVersion: "volume-profile-v1",
      poc: 66_800,
      vah: 67_200,
      val: 66_400,
    },
    zones: [
      {
        asOfMs: AS_OF,
        staleAfterMs: FRESH_MS,
        zoneId: "gamma-wall-66900",
        kind: "gamma-wall",
        price: 66_900,
        strength: "strong",
        formulaVersion: "wall-v1",
        source: "deribit",
      },
      {
        asOfMs: AS_OF,
        staleAfterMs: FRESH_MS,
        zoneId: "oi-wall-68000",
        kind: "open-interest-wall",
        price: 68_000,
        strength: "moderate",
        formulaVersion: "wall-v1",
        source: "deribit",
      },
    ],
    options: {
      asOfMs: AS_OF,
      staleAfterMs: FRESH_MS,
      formulaVersion: "gex-model-v1",
      modeledSignedGexOnePercentUsd: 100_000_000,
      gammaFlipPrice: 65_000,
      atmIvCurrent: 0.5,
      atmIvBaseline: 0.5,
      nextExpiryMs: NOW + 10 * 3_600_000,
    },
    flow: {
      staleAfterMs: FRESH_MS,
      snapshot: makeFlowSnapshot(Array(10).fill("buy")),
    },
    proposedTrade: {
      asOfMs: AS_OF,
      staleAfterMs: FRESH_MS,
      side: "long",
      entryPrice: 67_000,
      stopPrice: 66_800,
      targetPrice: 67_600,
      entrySource: "market-price",
      stopSource: "swing-low",
      targetSource: "resistance-zone",
      rewardRiskRatio: 3,
      rewardRiskFormulaVersion: "risk-terminal-v1",
    },
    accountRisk: {
      asOfMs: AS_OF,
      staleAfterMs: FRESH_MS,
      state: "available",
      reasonCodes: [],
    },
  };
  return { ...input, ...overrides };
}
