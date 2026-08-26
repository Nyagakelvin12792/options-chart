import { describe, expect, it } from "vitest";

import { parseDeribitSnapshot } from "./normalizers";

const snapshotFixture = {
  schema_version: "m0.5-deribit-snapshot-v1",
  timestamp: 1_900_000_000_000,
  instruments: [
    {
      instrument_name: "BTC-01JAN30-90000-C",
      creation_timestamp: 1_800_000_000_000,
      expiration_timestamp: 1_910_000_000_000,
      strike: 90_000,
      option_type: "call",
      underlying_price: 91_000,
      open_interest: 42.5,
      mark_price: 0.08,
      mark_iv: 52.4,
      interest_rate: 0.01,
    },
  ],
} as const;

describe("parseDeribitSnapshot", () => {
  it("normalizes percentage-point IV and BTC open interest", () => {
    const snapshot = parseDeribitSnapshot(snapshotFixture, 1_900_000_000_100);

    expect(snapshot.instruments[0]?.quote).toMatchObject({
      openInterestBtc: 42.5,
      markIvDecimal: 0.524,
      markPriceBtc: 0.08,
    });
    expect(snapshot.instruments[0]?.instrument.contractMultiplierBtc).toBe(1);
  });

  it("rejects duplicate instruments", () => {
    expect(() =>
      parseDeribitSnapshot(
        {
          ...snapshotFixture,
          instruments: [
            snapshotFixture.instruments[0],
            snapshotFixture.instruments[0],
          ],
        },
        Date.now(),
      ),
    ).toThrow();
  });
});
