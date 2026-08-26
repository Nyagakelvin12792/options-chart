import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { parseDeribitSnapshot } from "./normalizers";
import { DeribitConsolidatedSnapshotSchema } from "./schemas";

describe("live Deribit options chain snapshot fixture", () => {
  const fixturePath = resolve(
    __dirname,
    "../../../../tests/fixtures/deribit/live-chain-snapshot.json",
  );
  const rawData = JSON.parse(readFileSync(fixturePath, "utf8")) as unknown;

  it("validates against DeribitConsolidatedSnapshotSchema with 900+ active options", () => {
    const validated = DeribitConsolidatedSnapshotSchema.parse(rawData);
    expect(validated.schema_version).toBe("m0.5-deribit-snapshot-v1");
    expect(validated.timestamp).toBeGreaterThan(0);
    expect(validated.instruments.length).toBeGreaterThanOrEqual(900);

    const calls = validated.instruments.filter((i) => i.option_type === "call");
    const puts = validated.instruments.filter((i) => i.option_type === "put");
    expect(calls.length).toBeGreaterThan(0);
    expect(puts.length).toBeGreaterThan(0);

    const expiries = new Set(
      validated.instruments.map((i) => i.expiration_timestamp),
    );
    const strikes = new Set(validated.instruments.map((i) => i.strike));
    expect(expiries.size).toBeGreaterThanOrEqual(5);
    expect(strikes.size).toBeGreaterThanOrEqual(30);

    const totalOi = validated.instruments.reduce(
      (sum, i) => sum + i.open_interest,
      0,
    );
    expect(totalOi).toBeGreaterThan(0);

    const validIvCount = validated.instruments.filter(
      (i) => i.mark_iv !== null && i.mark_iv > 0,
    ).length;
    expect(validIvCount).toBeGreaterThan(0);
  });

  it("normalizes cleanly into domain OptionsChainSnapshot with decimal IV", () => {
    const validated = DeribitConsolidatedSnapshotSchema.parse(rawData);
    const chain = parseDeribitSnapshot(validated, validated.timestamp);

    expect(chain.currency).toBe("BTC");
    expect(chain.instruments.length).toBe(validated.instruments.length);

    for (const item of chain.instruments) {
      expect(item.instrument.symbol).toBe("BTC");
      expect(item.instrument.strike).toBeGreaterThan(0);
      expect(item.instrument.expiry).toBeGreaterThan(
        item.instrument.creationTimestamp,
      );
      expect(["call", "put"]).toContain(item.instrument.optionType);
      expect(item.quote.openInterestBtc).toBeGreaterThanOrEqual(0);
      if (item.quote.markIvDecimal !== null) {
        expect(item.quote.markIvDecimal).toBeGreaterThan(0);
        // Decimal IV (e.g. 0.50 for 50%) should not be in percentage scale (> 10 is implausible for normal BTC options)
        expect(item.quote.markIvDecimal).toBeLessThan(10);
      }
    }
  });
});
