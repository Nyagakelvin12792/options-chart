import { describe, expect, it } from "vitest";

import type { CandleObservation } from "../../tools/trading-readiness/audit";
import {
  buildTradingReadinessAudit,
  certifyFullDayBrowserStability,
  classifyExternalComparison,
  classifySession,
  compareExpiryRollover,
  sha256Json,
} from "../../tools/trading-readiness/audit";
import {
  createChainFixture,
  createOptionFixture,
} from "../../packages/options-engine/src/test-fixtures";

const hour = 60 * 60 * 1_000;
const day = 24 * hour;

describe("trading-readiness audit", () => {
  it("reconciles multiple expiries and raw wall rankings", () => {
    const now = Date.UTC(2026, 7, 27, 8);
    const expiries = [now + day, now + 7 * day, now + 30 * day];
    const chain = createChainFixture(
      expiries.flatMap((expiry, expiryIndex) =>
        [70_000, 80_000, 90_000].flatMap((strike, strikeIndex) =>
          (["call", "put"] as const).map((optionType) =>
            createOptionFixture({
              expiry,
              strike,
              optionType,
              openInterestBtc: 20 + expiryIndex * 5 + strikeIndex * 10,
              markIvDecimal: 0.55 + expiryIndex * 0.05,
              underlyingPriceUsd: 80_000,
            }),
          ),
        ),
      ),
      now,
    );
    const audit = buildTradingReadinessAudit({
      chain,
      underlyingPriceUsd: 80_000,
      capturedAt: now,
      sourceSha256: sha256Json(chain),
    });

    expect(audit.expiriesCompared).toBe(3);
    expect(audit.expiryAudits).toHaveLength(3);
    expect(
      audit.expiryAudits.every((expiry) =>
        expiry.rawWallChecks.every((wall) => wall.passed),
      ),
    ).toBe(true);
    expect(audit.unexplainedCriticalDiscrepancyCount).toBe(0);
    expect(audit.passed).toBe(true);
  });

  it("refuses to pass a chain without multiple expiries", () => {
    const now = Date.UTC(2026, 7, 27, 8);
    const chain = createChainFixture(
      [
        createOptionFixture({
          expiry: now + day,
          strike: 80_000,
          optionType: "call",
          openInterestBtc: 10,
          markIvDecimal: 0.6,
          underlyingPriceUsd: 80_000,
        }),
      ],
      now,
    );
    const audit = buildTradingReadinessAudit({
      chain,
      underlyingPriceUsd: 80_000,
      capturedAt: now,
      sourceSha256: sha256Json(chain),
    });
    expect(audit.passed).toBe(false);
    expect(audit.discrepancies).toContainEqual(
      expect.objectContaining({
        id: "insufficient-expiries",
        severity: "CRITICAL",
      }),
    );
  });

  it("classifies high-volatility and quiet sessions deterministically", () => {
    const candles = (prices: readonly number[]): CandleObservation[] =>
      prices.map((close, index) => ({
        openTime: index * hour,
        open: index === 0 ? close : prices[index - 1]!,
        high: close * 1.001,
        low: close * 0.999,
        close,
      }));
    expect(classifySession(candles([100, 103, 107])).regime).toBe(
      "HIGH_VOLATILITY",
    );
    expect(classifySession(candles([100, 100.2, 100.1])).regime).toBe("QUIET");
  });

  it("detects expiry rollover and preserves added and removed evidence", () => {
    const comparison = compareExpiryRollover([100, 200, 300], [200, 300, 400]);
    expect(comparison).toEqual({
      previousNearestExpiry: 100,
      currentNearestExpiry: 200,
      removedExpiries: [100],
      addedExpiries: [400],
      rolled: true,
    });
  });

  it("requires 24 elapsed hours for full-day browser certification", () => {
    const sample = (timestamp: number) => ({
      timestamp,
      domNodes: 300,
      heapBytes: 100_000_000,
      activeBinanceSockets: 1,
      activeWorkers: 1,
      chart: {
        chartCreateCount: 1,
        listenerCount: 4,
        maxOperationDurationMs: 4,
      },
    });
    expect(
      certifyFullDayBrowserStability([sample(0), sample(8 * hour)]).passed,
    ).toBe(false);
    expect(
      certifyFullDayBrowserStability([sample(0), sample(24 * hour)]).passed,
    ).toBe(true);
  });

  it("keeps unknown external methodologies observational", () => {
    const observational = classifyExternalComparison({
      metric: "gamma-flip",
      internalValue: 80_000,
      externalValue: 90_000,
      methodologyEquivalent: false,
      relativeTolerance: 1e-7,
    });
    expect(observational).toMatchObject({ severity: "INFO", explained: true });
    const comparable = classifyExternalComparison({
      metric: "total-oi",
      internalValue: 100,
      externalValue: 110,
      methodologyEquivalent: true,
      relativeTolerance: 0.01,
    });
    expect(comparable).toMatchObject({
      severity: "CRITICAL",
      explained: false,
    });
  });
});
