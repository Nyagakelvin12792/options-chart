import { describe, expect, it } from "vitest";

import {
  createWallConfluenceZones,
  estimateDealerFlowWall,
  updateWallSignalHistory,
  type WallSignalInput,
} from "./wall-confluence";

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
});
