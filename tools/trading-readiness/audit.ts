import { createHash } from "node:crypto";

import type {
  GammaLevel,
  OptionSnapshot,
  OptionsChainSnapshot,
  StrikeExposure,
} from "@options-chart/domain";
import {
  CALCULATION_AUDIT_SCHEMA_VERSION,
  CALCULATION_ENGINE_VERSION,
  ENGINE_VERSION,
  GAMMA_PROFILE_VERSION,
  GEX_ASSUMPTIONS,
  GEX_MODEL_VERSION,
  MAX_PAIN_VERSION,
  calculateOptionsMetrics,
} from "@options-chart/options-engine";

export const TRADING_READINESS_AUDIT_VERSION = "trading-readiness-audit-v1";

export type DiscrepancySeverity = "INFO" | "WARNING" | "CRITICAL";
export type SessionRegime = "HIGH_VOLATILITY" | "QUIET" | "NORMAL";

export interface ValidationDiscrepancy {
  readonly id: string;
  readonly severity: DiscrepancySeverity;
  readonly scope: string;
  readonly message: string;
  readonly expected: number | string | null;
  readonly actual: number | string | null;
  readonly explained: boolean;
}

export interface RawWallCheck {
  readonly optionType: "call" | "put";
  readonly selectedStrike: number | null;
  readonly expectedStrike: number | null;
  readonly selectedGrossGammaOnePercentUsd: number | null;
  readonly expectedGrossGammaOnePercentUsd: number | null;
  readonly qualifyingStrikeCount: number;
  readonly passed: boolean;
}

export interface ExpiryAudit {
  readonly expiry: number;
  readonly expiryIso: string;
  readonly daysToExpiry: number;
  readonly contractCount: number;
  readonly totalOpenInterestBtc: number;
  readonly totalCallOpenInterestBtc: number;
  readonly totalPutOpenInterestBtc: number;
  readonly putCallOpenInterestRatio: number | null;
  readonly averageMarkIvDecimal: number | null;
  readonly modeledGexOnePercentUsd: number;
  readonly gammaFlipPrice: number | null;
  readonly callWallPrice: number | null;
  readonly putWallPrice: number | null;
  readonly maxPainPrice: number | null;
  readonly secondaryGexPrices: readonly number[];
  readonly rawWallChecks: readonly RawWallCheck[];
  readonly discrepancies: readonly ValidationDiscrepancy[];
}

export interface TradingReadinessAudit {
  readonly schemaVersion: typeof TRADING_READINESS_AUDIT_VERSION;
  readonly capturedAt: number;
  readonly capturedAtIso: string;
  readonly sourceTimestamp: number;
  readonly sourceTimestampIso: string;
  readonly sourceSha256: string;
  readonly underlyingPriceUsd: number;
  readonly contractCount: number;
  readonly expiryCount: number;
  readonly expiriesCompared: number;
  readonly formulaVersions: {
    readonly engineVersion: string;
    readonly calculationEngineVersion: string;
    readonly gexModelVersion: string;
    readonly gammaProfileVersion: string;
    readonly maxPainVersion: string;
    readonly calculationAuditSchemaVersion: string;
  };
  readonly expiryAudits: readonly ExpiryAudit[];
  readonly discrepancies: readonly ValidationDiscrepancy[];
  readonly criticalDiscrepancyCount: number;
  readonly unexplainedCriticalDiscrepancyCount: number;
  readonly passed: boolean;
}

export interface CandleObservation {
  readonly openTime: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
}

export interface SessionClassification {
  readonly regime: SessionRegime;
  readonly candleCount: number;
  readonly durationMs: number;
  readonly rangePercent: number;
  readonly maximumAbsoluteReturnPercent: number;
}

export interface RolloverComparison {
  readonly previousNearestExpiry: number | null;
  readonly currentNearestExpiry: number | null;
  readonly removedExpiries: readonly number[];
  readonly addedExpiries: readonly number[];
  readonly rolled: boolean;
}

export interface BrowserStabilitySample {
  readonly timestamp: number;
  readonly domNodes: number;
  readonly heapBytes: number | null;
  readonly activeBinanceSockets: number;
  readonly activeWorkers: number;
  readonly chart: {
    readonly chartCreateCount: number;
    readonly listenerCount: number;
    readonly maxOperationDurationMs: number;
  };
}

export interface FullDayCertification {
  readonly durationMs: number;
  readonly sampleCount: number;
  readonly passed: boolean;
  readonly failures: readonly string[];
}

const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

const relativeDifference = (left: number, right: number): number => {
  const scale = Math.max(Math.abs(left), Math.abs(right), 1);
  return Math.abs(left - right) / scale;
};

const findLevel = (
  levels: readonly GammaLevel[],
  kind: GammaLevel["kind"],
): GammaLevel | null => levels.find((level) => level.kind === kind) ?? null;

const independentlyAggregateOpenInterest = (
  contracts: readonly OptionSnapshot[],
): {
  readonly total: number;
  readonly call: number;
  readonly put: number;
} => {
  let call = 0;
  let put = 0;
  for (const contract of contracts) {
    if (!contract.instrument.isActive) continue;
    const openInterest = contract.quote.openInterestBtc;
    if (!Number.isFinite(openInterest) || openInterest < 0) continue;
    if (contract.instrument.optionType === "call") call += openInterest;
    else put += openInterest;
  }
  return { total: call + put, call, put };
};

const independentlyRankRawWall = (
  exposures: readonly StrikeExposure[],
  optionType: "call" | "put",
  spotPrice: number,
): {
  readonly exposure: StrikeExposure | null;
  readonly qualifyingStrikeCount: number;
} => {
  const side = exposures.filter(
    (exposure) => exposure.optionType === optionType,
  );
  const totalGross = sum(
    side.map((exposure) => exposure.grossGammaOnePercentUsd),
  );
  if (totalGross <= 0) return { exposure: null, qualifyingStrikeCount: 0 };

  const candidates = side.filter(
    (exposure) =>
      exposure.strike >=
        spotPrice * GEX_ASSUMPTIONS.wallStrikeLowerMultiplier &&
      exposure.strike <=
        spotPrice * GEX_ASSUMPTIONS.wallStrikeUpperMultiplier &&
      exposure.openInterestBtc >= GEX_ASSUMPTIONS.wallMinimumOpenInterestBtc &&
      exposure.grossGammaOnePercentUsd / totalGross >=
        GEX_ASSUMPTIONS.wallMinimumSameSideGrossShare,
  );
  candidates.sort(
    (left, right) =>
      right.grossGammaOnePercentUsd - left.grossGammaOnePercentUsd ||
      right.openInterestBtc - left.openInterestBtc ||
      Math.abs(left.strike - spotPrice) - Math.abs(right.strike - spotPrice) ||
      left.strike - right.strike,
  );
  return {
    exposure: candidates[0] ?? null,
    qualifyingStrikeCount: candidates.length,
  };
};

const buildWallCheck = (
  exposures: readonly StrikeExposure[],
  levels: readonly GammaLevel[],
  optionType: "call" | "put",
  spotPrice: number,
): RawWallCheck => {
  const kind = optionType === "call" ? "call-wall" : "put-wall";
  const selected = findLevel(levels, kind);
  const expected = independentlyRankRawWall(exposures, optionType, spotPrice);
  const selectedExposure = selected
    ? (exposures.find(
        (exposure) =>
          exposure.optionType === optionType &&
          exposure.strike === selected.price,
      ) ?? null)
    : null;
  return {
    optionType,
    selectedStrike: selected?.price ?? null,
    expectedStrike: expected.exposure?.strike ?? null,
    selectedGrossGammaOnePercentUsd:
      selectedExposure?.grossGammaOnePercentUsd ?? null,
    expectedGrossGammaOnePercentUsd:
      expected.exposure?.grossGammaOnePercentUsd ?? null,
    qualifyingStrikeCount: expected.qualifyingStrikeCount,
    passed: (selected?.price ?? null) === (expected.exposure?.strike ?? null),
  };
};

const comparisonDiscrepancy = (
  id: string,
  scope: string,
  label: string,
  expected: number,
  actual: number,
  tolerance = 1e-10,
): ValidationDiscrepancy | null =>
  relativeDifference(expected, actual) <= tolerance
    ? null
    : {
        id,
        severity: "CRITICAL",
        scope,
        message: `${label} failed independent reconciliation`,
        expected,
        actual,
        explained: false,
      };

export const sha256Json = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export const buildTradingReadinessAudit = (input: {
  readonly chain: OptionsChainSnapshot;
  readonly underlyingPriceUsd: number;
  readonly capturedAt: number;
  readonly sourceSha256: string;
  readonly minimumExpiryComparisons?: number;
}): TradingReadinessAudit => {
  const expiries = [
    ...new Set(
      input.chain.instruments
        .filter(
          (contract) =>
            contract.instrument.isActive &&
            contract.instrument.expiry > input.capturedAt,
        )
        .map((contract) => contract.instrument.expiry),
    ),
  ].sort((left, right) => left - right);
  const minimumComparisons = input.minimumExpiryComparisons ?? 3;
  const selectedExpiries = expiries.slice(0, Math.max(minimumComparisons, 3));
  const topLevelDiscrepancies: ValidationDiscrepancy[] = [];
  if (selectedExpiries.length < minimumComparisons) {
    topLevelDiscrepancies.push({
      id: "insufficient-expiries",
      severity: "CRITICAL",
      scope: "chain",
      message: `Expected at least ${minimumComparisons} active expiries`,
      expected: minimumComparisons,
      actual: selectedExpiries.length,
      explained: false,
    });
  }

  const expiryAudits = selectedExpiries.map((expiry): ExpiryAudit => {
    const contracts = input.chain.instruments.filter(
      (contract) => contract.instrument.expiry === expiry,
    );
    const result = calculateOptionsMetrics({
      chain: input.chain,
      underlyingPriceUsd: input.underlyingPriceUsd,
      calculatedAt: input.capturedAt,
      expiryScope: { kind: "custom", expiry },
      interestRateFallbackDecimal: 0,
      maxPainExpiry: expiry,
      secondaryLevelCount: 3,
    });
    const rawOi = independentlyAggregateOpenInterest(contracts);
    const discrepancies = [
      comparisonDiscrepancy(
        "total-oi-reconciliation",
        `expiry:${expiry}`,
        "Total OI",
        rawOi.total,
        result.summary.totalOpenInterestBtc,
      ),
      comparisonDiscrepancy(
        "call-oi-reconciliation",
        `expiry:${expiry}`,
        "Call OI",
        rawOi.call,
        result.summary.totalCallOpenInterestBtc,
      ),
      comparisonDiscrepancy(
        "put-oi-reconciliation",
        `expiry:${expiry}`,
        "Put OI",
        rawOi.put,
        result.summary.totalPutOpenInterestBtc,
      ),
    ].filter((item): item is ValidationDiscrepancy => item !== null);
    const rawWallChecks = (["call", "put"] as const).map((optionType) =>
      buildWallCheck(
        result.strikeExposures,
        result.summary.keyLevels,
        optionType,
        input.underlyingPriceUsd,
      ),
    );
    for (const wall of rawWallChecks) {
      if (!wall.passed) {
        discrepancies.push({
          id: `${wall.optionType}-wall-reconciliation`,
          severity: "CRITICAL",
          scope: `expiry:${expiry}`,
          message: `${wall.optionType} wall does not match the independently ranked raw concentration`,
          expected: wall.expectedStrike,
          actual: wall.selectedStrike,
          explained: false,
        });
      }
    }
    const levels = result.summary.keyLevels;
    return {
      expiry,
      expiryIso: new Date(expiry).toISOString(),
      daysToExpiry: (expiry - input.capturedAt) / 86_400_000,
      contractCount: contracts.length,
      totalOpenInterestBtc: result.summary.totalOpenInterestBtc,
      totalCallOpenInterestBtc: result.summary.totalCallOpenInterestBtc,
      totalPutOpenInterestBtc: result.summary.totalPutOpenInterestBtc,
      putCallOpenInterestRatio: result.summary.putCallOpenInterestRatio,
      averageMarkIvDecimal: result.summary.averageMarkIvDecimal,
      modeledGexOnePercentUsd: result.summary.modeledGexOnePercentUsd,
      gammaFlipPrice: result.gammaFlipPrice,
      callWallPrice: findLevel(levels, "call-wall")?.price ?? null,
      putWallPrice: findLevel(levels, "put-wall")?.price ?? null,
      maxPainPrice: result.maxPain?.price ?? null,
      secondaryGexPrices: levels
        .filter((level) => level.kind === "secondary-gex")
        .map((level) => level.price),
      rawWallChecks,
      discrepancies,
    };
  });
  const discrepancies = [
    ...topLevelDiscrepancies,
    ...expiryAudits.flatMap((audit) => audit.discrepancies),
  ];
  const critical = discrepancies.filter(
    (discrepancy) => discrepancy.severity === "CRITICAL",
  );
  const unexplainedCritical = critical.filter(
    (discrepancy) => !discrepancy.explained,
  );

  return {
    schemaVersion: TRADING_READINESS_AUDIT_VERSION,
    capturedAt: input.capturedAt,
    capturedAtIso: new Date(input.capturedAt).toISOString(),
    sourceTimestamp: input.chain.metadata.sourceTimestamp,
    sourceTimestampIso: new Date(
      input.chain.metadata.sourceTimestamp,
    ).toISOString(),
    sourceSha256: input.sourceSha256,
    underlyingPriceUsd: input.underlyingPriceUsd,
    contractCount: input.chain.instruments.length,
    expiryCount: expiries.length,
    expiriesCompared: expiryAudits.length,
    formulaVersions: {
      engineVersion: ENGINE_VERSION,
      calculationEngineVersion: CALCULATION_ENGINE_VERSION,
      gexModelVersion: GEX_MODEL_VERSION,
      gammaProfileVersion: GAMMA_PROFILE_VERSION,
      maxPainVersion: MAX_PAIN_VERSION,
      calculationAuditSchemaVersion: CALCULATION_AUDIT_SCHEMA_VERSION,
    },
    expiryAudits,
    discrepancies,
    criticalDiscrepancyCount: critical.length,
    unexplainedCriticalDiscrepancyCount: unexplainedCritical.length,
    passed: unexplainedCritical.length === 0,
  };
};

export const classifySession = (
  candles: readonly CandleObservation[],
): SessionClassification => {
  if (candles.length < 2) {
    throw new RangeError(
      "Session classification requires at least two candles",
    );
  }
  const sorted = [...candles].sort(
    (left, right) => left.openTime - right.openTime,
  );
  const first = sorted[0]!;
  const last = sorted.at(-1)!;
  const highest = Math.max(...sorted.map((candle) => candle.high));
  const lowest = Math.min(...sorted.map((candle) => candle.low));
  const rangePercent = ((highest - lowest) / first.open) * 100;
  let maximumAbsoluteReturnPercent = 0;
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    maximumAbsoluteReturnPercent = Math.max(
      maximumAbsoluteReturnPercent,
      Math.abs((current.close - previous.close) / previous.close) * 100,
    );
  }
  const regime: SessionRegime =
    rangePercent >= 5 || maximumAbsoluteReturnPercent >= 2
      ? "HIGH_VOLATILITY"
      : rangePercent <= 1.5 && maximumAbsoluteReturnPercent <= 0.75
        ? "QUIET"
        : "NORMAL";
  return {
    regime,
    candleCount: sorted.length,
    durationMs: last.openTime - first.openTime,
    rangePercent,
    maximumAbsoluteReturnPercent,
  };
};

export const compareExpiryRollover = (
  previousExpiries: readonly number[],
  currentExpiries: readonly number[],
): RolloverComparison => {
  const previous = [...new Set(previousExpiries)].sort((a, b) => a - b);
  const current = [...new Set(currentExpiries)].sort((a, b) => a - b);
  const previousSet = new Set(previous);
  const currentSet = new Set(current);
  return {
    previousNearestExpiry: previous[0] ?? null,
    currentNearestExpiry: current[0] ?? null,
    removedExpiries: previous.filter((expiry) => !currentSet.has(expiry)),
    addedExpiries: current.filter((expiry) => !previousSet.has(expiry)),
    rolled: (previous[0] ?? null) !== (current[0] ?? null),
  };
};

export const certifyFullDayBrowserStability = (
  samples: readonly BrowserStabilitySample[],
): FullDayCertification => {
  if (samples.length < 2) {
    return {
      durationMs: 0,
      sampleCount: samples.length,
      passed: false,
      failures: ["At least two telemetry samples are required"],
    };
  }
  const sorted = [...samples].sort(
    (left, right) => left.timestamp - right.timestamp,
  );
  const first = sorted[0]!;
  const last = sorted.at(-1)!;
  const durationMs = last.timestamp - first.timestamp;
  const failures: string[] = [];
  if (durationMs < 24 * 60 * 60 * 1_000) {
    failures.push("Observed duration is less than 24 elapsed hours");
  }
  if (sorted.some((sample) => sample.chart.chartCreateCount !== 1)) {
    failures.push("Chart instance count was not exactly one");
  }
  if (sorted.some((sample) => sample.activeBinanceSockets !== 1)) {
    failures.push("Binance socket count left steady state");
  }
  if (sorted.some((sample) => sample.activeWorkers !== 1)) {
    failures.push("Calculation worker count left steady state");
  }
  if (last.chart.listenerCount !== first.chart.listenerCount) {
    failures.push("Chart listener count changed during observation");
  }
  if (last.domNodes > first.domNodes + 5) {
    failures.push("DOM node count grew beyond the allowed bound");
  }
  if (
    first.heapBytes !== null &&
    last.heapBytes !== null &&
    last.heapBytes >= first.heapBytes * 1.5 + 50_000_000
  ) {
    failures.push("Heap growth exceeded the allowed bound");
  }
  return {
    durationMs,
    sampleCount: sorted.length,
    passed: failures.length === 0,
    failures,
  };
};

export const classifyExternalComparison = (input: {
  readonly metric: string;
  readonly internalValue: number;
  readonly externalValue: number;
  readonly methodologyEquivalent: boolean;
  readonly relativeTolerance: number;
}): ValidationDiscrepancy => {
  const difference = relativeDifference(
    input.internalValue,
    input.externalValue,
  );
  if (!input.methodologyEquivalent) {
    return {
      id: `external-${input.metric}`,
      severity: "INFO",
      scope: "external-reference",
      message:
        "External methodology is not equivalent; comparison is observational only",
      expected: input.externalValue,
      actual: input.internalValue,
      explained: true,
    };
  }
  const passed = difference <= input.relativeTolerance;
  return {
    id: `external-${input.metric}`,
    severity: passed ? "INFO" : "CRITICAL",
    scope: "external-reference",
    message: passed
      ? "Equivalent external comparison is within tolerance"
      : "Equivalent external comparison exceeded tolerance",
    expected: input.externalValue,
    actual: input.internalValue,
    explained: passed,
  };
};
