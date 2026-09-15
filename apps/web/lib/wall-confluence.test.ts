import { describe, expect, it } from "vitest";
import type { Candle } from "@options-chart/domain";

import {
  analyzeWallReaction,
  auditWallMovement,
  createWallConfluenceZones,
  estimateDealerFlowWall,
  updateWallSignalHistory,
  type WallSignalInput,
} from "./wall-confluence";

const candle = (
  index: number,
  open: number,
  high: number,
  low: number,
  close: number,
): Candle => ({
  metadata: {
    source: "binance",
    sourceTimestamp: index * 60_000,
    receivedTimestamp: index * 60_000,
    normalizedTimestamp: index * 60_000,
    schemaVersion: "test-v1",
  },
  symbol: "BTCUSDT",
  interval: "1m",
  openTime: index * 60_000,
  closeTime: index * 60_000 + 59_999,
  open,
  high,
  low,
  close,
  volume: 1,
  quoteVolume: close,
  tradeCount: 1,
  isClosed: true,
});

const flatCandles = (count: number, price: number, startIndex = 0): Candle[] =>
  Array.from({ length: count }, (_, offset) =>
    candle(startIndex + offset, price, price + 0.5, price - 0.5, price),
  );

const signal = (
  id: string,
  kind: WallSignalInput["kind"],
  price: number,
): WallSignalInput => ({
  id,
  kind,
  label: id,
  price,
  normalizedConcentration: 1,
  confidence: 1,
  expiry: 1_800_000_000_000,
});

describe("wall confluence", () => {
  it("scores a five-type overlap above a two-type overlap", () => {
    const five = [
      signal("g", "gamma", 100),
      signal("oi", "open-interest", 101),
      signal("v", "volume", 99),
      signal("m", "max-pain", 100),
      signal("f", "gamma-flip", 102),
    ];
    const two = [
      signal("g2", "gamma", 120),
      signal("oi2", "open-interest", 121),
    ];
    const zones = createWallConfluenceZones({
      signals: [...five, ...two],
      spotPrice: 110,
      now: 1_790_000_000_000,
      zoneToleranceUsd: 4,
    });

    expect(zones).toHaveLength(2);
    expect(zones[0]?.distinctSignalCount).toBe(5);
    expect(zones[0]!.score).toBeGreaterThan(zones[1]!.score);
  });

  it("counts call and put gamma as one distinct signal type", () => {
    const [zone] = createWallConfluenceZones({
      signals: [
        signal("call", "gamma", 100),
        signal("put", "gamma", 101),
        signal("oi", "open-interest", 100),
      ],
      spotPrice: 100,
      now: 1_790_000_000_000,
      zoneToleranceUsd: 4,
    });

    expect(zone?.distinctSignalCount).toBe(2);
  });

  it("reports expiry breadth separately from signal-family breadth", () => {
    const firstExpiry = 1_800_000_000_000;
    const secondExpiry = firstExpiry + 86_400_000;
    const [zone] = createWallConfluenceZones({
      signals: [
        signal("gamma-first", "gamma", 100),
        { ...signal("gamma-second", "gamma", 101), expiry: secondExpiry },
        signal("oi-first", "open-interest", 100),
        { ...signal("oi-repeat", "open-interest", 101), expiry: secondExpiry },
        { ...signal("volume-unscoped", "volume", 100), expiry: null },
      ],
      spotPrice: 100,
      now: 1_790_000_000_000,
      zoneToleranceUsd: 4,
    });

    expect(zone?.distinctSignalCount).toBe(3);
    expect(zone?.expiryBreadth).toEqual({
      distinctExpiryCount: 2,
      expiries: [firstExpiry, secondExpiry],
      signalsWithExpiryCount: 4,
      unscopedSignalCount: 1,
    });
  });

  it("keeps a two-type overlap above even a higher-quality single signal", () => {
    const zones = createWallConfluenceZones({
      signals: [
        signal("single", "max-pain", 100),
        signal("gamma", "gamma", 140),
        signal("oi", "open-interest", 141),
      ],
      spotPrice: 100,
      now: 1_790_000_000_000,
      zoneToleranceUsd: 4,
    });

    const single = zones.find((zone) => zone.distinctSignalCount === 1);
    const overlap = zones.find((zone) => zone.distinctSignalCount === 2);
    expect(overlap!.score).toBeGreaterThan(single!.score);
  });

  it("rewards stable observations without preserving a moved wall streak", () => {
    const first = signal("oi", "open-interest", 100);
    const once = updateWallSignalHistory(new Map(), [first], 1_000, 5);
    const stable = updateWallSignalHistory(once, [first], 2_000, 5);
    const moved = updateWallSignalHistory(
      stable,
      [{ ...first, price: 120 }],
      3_000,
      5,
    );

    expect(stable.get("oi")?.consecutiveObservations).toBe(2);
    expect(moved.get("oi")?.consecutiveObservations).toBe(1);
    expect(moved.get("oi")?.observations).toBe(3);
  });

  it("infers the dealer side opposite the aggressor without overstating confidence", () => {
    const expiry = 1_800_000_000_000;
    const metadata = {
      source: "deribit" as const,
      sourceTimestamp: 1_790_000_000_000,
      receivedTimestamp: 1_790_000_000_000,
      normalizedTimestamp: 1_790_000_000_000,
      schemaVersion: "test",
    };
    const contract = {
      instrument: {
        metadata,
        instrumentName: "BTC-FLOW-100-C",
        symbol: "BTC" as const,
        expiry,
        strike: 100,
        optionType: "call" as const,
        creationTimestamp: 1_780_000_000_000,
        isActive: true,
        settlementAsset: "BTC" as const,
        contractMultiplierBtc: 1 as const,
      },
      quote: {
        metadata,
        instrumentName: "BTC-FLOW-100-C",
        symbol: "BTC" as const,
        expiry,
        strike: 100,
        optionType: "call" as const,
        underlyingPriceUsd: 100,
        openInterestBtc: 12,
        volumeBtc: 2,
        volumeUsd: 200,
        markPriceBtc: 0.05,
        markIvDecimal: 0.5,
        interestRateDecimal: 0.01,
      },
    };
    const result = estimateDealerFlowWall({
      trades: [
        {
          tradeId: "1",
          instrumentName: contract.instrument.instrumentName,
          direction: "buy",
          amountBtc: 2,
          timestamp: 1_790_000_000_000,
        },
      ],
      chain: {
        currency: "BTC",
        metadata: contract.instrument.metadata,
        instruments: [contract],
      },
      expiry,
      spotPrice: 100,
      now: 1_790_000_001_000,
    });

    expect(result.signal?.kind).toBe("dealer-flow");
    expect(result.netDealerGammaOnePercentUsd).toBeLessThan(0);
    expect(result.signal!.confidence).toBeGreaterThanOrEqual(0.4);
    expect(result.signal!.confidence).toBeLessThan(0.7);
  });

  it("classifies a wall rejection", () => {
    const candles = [
      ...flatCandles(10, 104),
      candle(10, 104, 104.5, 100, 102),
      ...flatCandles(13, 104, 11),
    ];

    const reaction = analyzeWallReaction(candles, 100, 1);

    expect(reaction.classification).toBe("rejection");
    expect(reaction.rejectionCount).toBe(1);
    expect(reaction.touches).toBe(1);
  });

  it("classifies a confirmed breakout", () => {
    const candles = [
      ...flatCandles(10, 104),
      candle(10, 104, 104.5, 99.5, 100),
      ...flatCandles(13, 96, 11),
    ];

    const reaction = analyzeWallReaction(candles, 100, 1);

    expect(reaction.classification).toBe("breakout");
    expect(reaction.breakoutCount).toBe(1);
  });

  it("classifies a post-breakout retest", () => {
    const candles = [
      ...flatCandles(4, 104),
      candle(4, 104, 104.5, 99.5, 100),
      ...flatCandles(5, 96, 5),
      candle(10, 96, 100, 95.5, 98),
      ...flatCandles(13, 96, 11),
    ];

    const reaction = analyzeWallReaction(candles, 100, 1);

    expect(reaction.classification).toBe("retest");
    expect(reaction.breakoutCount).toBe(1);
    expect(reaction.retestCount).toBe(1);
  });

  it("leaves reactions unconfirmed when there is no follow-through", () => {
    const candles = [
      ...flatCandles(10, 104),
      candle(10, 104, 104.5, 99.5, 100),
      ...flatCandles(13, 100, 11),
    ];

    expect(analyzeWallReaction(candles, 100, 1).classification).toBe(
      "unconfirmed",
    );
  });

  it("attributes wall movement to price when spot and the wall move together", () => {
    const audit = auditWallMovement(
      {
        observedAt: 1_000,
        wallPrice: 100,
        spotPrice: 100,
        normalizedConcentration: 0.5,
        expiry: 10_000,
      },
      {
        observedAt: 2_000,
        wallPrice: 110,
        spotPrice: 110,
        normalizedConcentration: 0.5,
        expiry: 10_000,
      },
      { movementToleranceUsd: 1 },
    );

    expect(audit.attribution).toBe("price");
    expect(audit.contributingFactors).toEqual(["price"]);
  });

  it("attributes a changed concentration leader before coincident price movement", () => {
    const audit = auditWallMovement(
      {
        observedAt: 1_000,
        wallPrice: 100,
        spotPrice: 100,
        normalizedConcentration: 0.35,
        expiry: 10_000,
        concentrationLeaderId: "strike-100",
      },
      {
        observedAt: 2_000,
        wallPrice: 110,
        spotPrice: 110,
        normalizedConcentration: 0.8,
        expiry: 10_000,
        concentrationLeaderId: "strike-110",
      },
      { movementToleranceUsd: 1 },
    );

    expect(audit.attribution).toBe("concentration");
    expect(audit.contributingFactors).toEqual(["concentration", "price"]);
  });

  it("attributes expiry roll and settlement before other movement factors", () => {
    const audit = auditWallMovement(
      {
        observedAt: 1_000,
        wallPrice: 100,
        spotPrice: 100,
        normalizedConcentration: 0.4,
        expiry: 1_500,
      },
      {
        observedAt: 2_000,
        wallPrice: 120,
        spotPrice: 100,
        normalizedConcentration: 0.7,
        expiry: 20_000,
      },
      { movementToleranceUsd: 1 },
    );

    expect(audit.attribution).toBe("expiry-settlement");
    expect(audit.expiryChanged).toBe(true);
    expect(audit.settlementCrossed).toBe(true);
    expect(audit.contributingFactors).toEqual([
      "expiry-settlement",
      "concentration",
    ]);
  });

  it("reports unknown when supplied snapshots do not explain a wall move", () => {
    const audit = auditWallMovement(
      {
        observedAt: 1_000,
        wallPrice: 100,
        spotPrice: 100,
        normalizedConcentration: 0.5,
        expiry: 10_000,
      },
      {
        observedAt: 2_000,
        wallPrice: 120,
        spotPrice: 100,
        normalizedConcentration: 0.5,
        expiry: 10_000,
      },
      { movementToleranceUsd: 1 },
    );

    expect(audit.moved).toBe(true);
    expect(audit.attribution).toBe("unknown");
    expect(audit.contributingFactors).toEqual([]);
  });
});
