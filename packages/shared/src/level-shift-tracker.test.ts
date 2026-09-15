import { describe, expect, it } from "vitest";
import type { CalculationMetadata, GammaLevel } from "@options-chart/domain";
import {
  LevelShiftTracker,
  type ConfluenceZoneInput,
} from "./level-shift-tracker";

const mockMetadata: CalculationMetadata = {
  calculatedAt: 1_700_000_000_000,
  calculationEngineVersion: "1.0.0",
  contractsIncluded: 100,
  contractsSeen: 100,
  event: {
    source: "deribit",
    sourceTimestamp: 1_700_000_000_000,
    receivedTimestamp: 1_700_000_000_000,
    normalizedTimestamp: 1_700_000_000_000,
    schemaVersion: "1.0.0",
  },
  excludedCountByReason: {},
  expiryScope: "all",
  gammaProfileVersion: "1.0.0",
  gexModelVersion: "1.0.0",
  nearestIncludedExpiry: null,
  nearestIncludedDte: null,
  qualifyingCrossings: [],
  durationMs: 5,
};

function makeLevel(
  kind: GammaLevel["kind"],
  price: number,
  label = kind.toUpperCase(),
): GammaLevel {
  return {
    id: `level-${kind}`,
    kind,
    label,
    price,
    importance: "primary",
    metadata: mockMetadata,
  };
}

describe("LevelShiftTracker (Shift-Aware Level Model)", () => {
  it("marks first observation with calculation timestamp and initial_observation reason", () => {
    const tracker = new LevelShiftTracker();
    const t0 = 1_700_000_000_000;
    const callWall = makeLevel("call-wall", 65_000);

    const records = tracker.updateLevels([callWall], "all", t0);
    expect(records).toHaveLength(1);
    const rec = records[0]!;
    expect(rec.id).toBe("call-wall-all");
    expect(rec.activationTimestamp).toBe(t0);
    expect(rec.lastObservedTimestamp).toBe(t0);
    expect(rec.price).toBe(65_000);
    expect(rec.shiftReason).toBe("initial_observation");
    expect(rec.isHistoricalKnown).toBe(false);
  });

  it("preserves activation timestamp when level remains stable across subsequent updates", () => {
    const tracker = new LevelShiftTracker();
    const t0 = 1_700_000_000_000;
    const t1 = 1_700_000_060_000;
    const callWall = makeLevel("call-wall", 65_000);

    tracker.updateLevels([callWall], "all", t0);
    const records = tracker.updateLevels([callWall], "all", t1);

    expect(records).toHaveLength(1);
    const rec = records[0]!;
    // Activation timestamp must remain unchanged at t0!
    expect(rec.activationTimestamp).toBe(t0);
    // Last observed timestamp is updated to t1
    expect(rec.lastObservedTimestamp).toBe(t1);
  });

  it("shifts discrete wall activation timestamp when strike changes", () => {
    const tracker = new LevelShiftTracker();
    const t0 = 1_700_000_000_000;
    const t1 = 1_700_000_060_000;
    const cw1 = makeLevel("call-wall", 65_000);
    const cw2 = makeLevel("call-wall", 66_000); // strike shift

    tracker.updateLevels([cw1], "all", t0);
    const records = tracker.updateLevels([cw2], "all", t1);

    expect(records).toHaveLength(1);
    const rec = records[0]!;
    expect(rec.price).toBe(66_000);
    expect(rec.activationTimestamp).toBe(t1);
    expect(rec.lastObservedTimestamp).toBe(t1);
    expect(rec.shiftReason).toBe("strike_shift");
  });

  it("respects Gamma Flip anti-jitter tolerance and does NOT reset activation on minor fluctuations", () => {
    const tracker = new LevelShiftTracker();
    const t0 = 1_700_000_000_000;
    const t1 = 1_700_000_060_000;
    const t2 = 1_700_000_120_000;

    // Base price: $60,000. 0.25% tolerance = $150.
    const gf0 = makeLevel("gamma-flip", 60_000);
    tracker.updateLevels([gf0], "all", t0);

    // Minor fluctuation: +$40 (inside tolerance of $150)
    const gf1 = makeLevel("gamma-flip", 60_040);
    const recs1 = tracker.updateLevels([gf1], "all", t1);
    expect(recs1[0]!.activationTimestamp).toBe(t0); // Not reset!
    expect(recs1[0]!.lastObservedTimestamp).toBe(t1);
    expect(recs1[0]!.price).toBe(60_040);

    // Significant shift: +$250 (exceeds tolerance of $150)
    const gf2 = makeLevel("gamma-flip", 60_290);
    const recs2 = tracker.updateLevels([gf2], "all", t2);
    expect(recs2[0]!.activationTimestamp).toBe(t2); // Genuine shift!
    expect(recs2[0]!.shiftReason).toBe("gamma_flip_tolerance_exceeded");
    expect(recs2[0]!.price).toBe(60_290);
  });

  it("resets activation when expiry scope changes", () => {
    const tracker = new LevelShiftTracker();
    const t0 = 1_700_000_000_000;
    const t1 = 1_700_000_060_000;
    const wall = makeLevel("put-wall", 58_000);

    tracker.updateLevels([wall], "all", t0);
    const recs = tracker.updateLevels([wall], "near", t1);

    expect(recs[0]!.expiryScope).toBe("near");
    expect(recs[0]!.activationTimestamp).toBe(t1);
    expect(recs[0]!.shiftReason).toBe("initial_observation");
  });

  it("handles confluence zone shifts and signal composition changes", () => {
    const tracker = new LevelShiftTracker();
    const t0 = 1_700_000_000_000;
    const t1 = 1_700_000_060_000;
    const t2 = 1_700_000_120_000;

    const z0: ConfluenceZoneInput = {
      id: "zone-1",
      priceLow: 60_000,
      priceHigh: 61_000,
      score: 85,
      bias: "support",
      signalKinds: ["gamma", "open-interest"],
    };

    // First observation (midpoint = 60500, width = 1000)
    const recs0 = tracker.updateConfluenceZones([z0], "all", t0);
    expect(recs0[0]!.activationTimestamp).toBe(t0);

    // Small shift inside tolerance (midpoint moves from 60500 to 60600, delta = 100 < 500)
    const z1: ConfluenceZoneInput = {
      ...z0,
      priceLow: 60_100,
      priceHigh: 61_100,
    };
    const recs1 = tracker.updateConfluenceZones([z1], "all", t1);
    expect(recs1[0]!.activationTimestamp).toBe(t0); // Preserved!

    // Signal composition change (adds "volume") -> triggers shift
    const z2: ConfluenceZoneInput = {
      ...z1,
      signalKinds: ["gamma", "open-interest", "volume"],
    };
    const recs2 = tracker.updateConfluenceZones([z2], "all", t2);
    expect(recs2[0]!.activationTimestamp).toBe(t2);
    expect(recs2[0]!.shiftReason).toBe("confluence_signals_changed");
  });

  it("serializes and deserializes persisted state with Zod validation and safe error fallback", () => {
    const tracker = new LevelShiftTracker();
    const t0 = 1_700_000_000_000;
    const wall = makeLevel("call-wall", 65_000);
    tracker.updateLevels([wall], "all", t0);

    const json = tracker.serialize();
    expect(json).toContain("call-wall-all");

    // Load into clean tracker
    const freshTracker = new LevelShiftTracker();
    const success = freshTracker.loadPersisted(json);
    expect(success).toBe(true);
    expect(freshTracker.getRecord("call-wall-all")?.activationTimestamp).toBe(t0);

    // Corrupted JSON fallback
    const corruptedFallback = freshTracker.loadPersisted("{ invalid json ");
    expect(corruptedFallback).toBe(false);

    // Invalid schema fallback
    const badSchema = freshTracker.loadPersisted(JSON.stringify({ version: 2 }));
    expect(badSchema).toBe(false);
  });
});
