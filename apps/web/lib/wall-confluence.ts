import type { Candle } from "@options-chart/domain";
import type { OptionsChainSnapshot } from "@options-chart/domain";
import { calculateContractExposure } from "@options-chart/options-engine";

export type ConfluenceSignalKind =
  | "gamma"
  | "open-interest"
  | "volume"
  | "dealer-flow"
  | "max-pain"
  | "gamma-flip";

export interface WallSignalInput {
  readonly id: string;
  readonly kind: ConfluenceSignalKind;
  readonly label: string;
  readonly price: number;
  readonly normalizedConcentration: number;
  readonly confidence: number;
  readonly expiry: number | null;
  readonly direction?: "support" | "resistance" | "neutral";
  readonly detail?: string;
}

export interface WallSignalHistory {
  readonly id: string;
  readonly price: number;
  readonly observations: number;
  readonly consecutiveObservations: number;
  readonly firstSeenAt: number;
  readonly lastSeenAt: number;
}

export interface ConfluenceScoreBreakdown {
  readonly concentration: number;
  readonly persistence: number;
  readonly distance: number;
  readonly expiry: number;
  readonly reaction: number;
}

export type WallReactionClassification =
  "rejection" | "breakout" | "retest" | "unconfirmed";

export interface WallReactionAnalysis {
  readonly classification: WallReactionClassification;
  readonly score: number;
  readonly touches: number;
  readonly rejectionCount: number;
  readonly breakoutCount: number;
  readonly retestCount: number;
  readonly lastReactionAt: number | null;
}

export interface WallExpiryBreadth {
  readonly distinctExpiryCount: number;
  readonly expiries: readonly number[];
  readonly signalsWithExpiryCount: number;
  readonly unscopedSignalCount: number;
}

export interface WallConfluenceZone {
  readonly id: string;
  readonly centerPrice: number;
  readonly lowerPrice: number;
  readonly upperPrice: number;
  readonly score: number;
  readonly strength: "VERY STRONG" | "STRONG" | "MODERATE" | "DEVELOPING";
  readonly confidence: number;
  readonly distinctSignalCount: number;
  readonly signals: readonly WallSignalInput[];
  readonly components: ConfluenceScoreBreakdown;
  readonly reactionTouches: number;
}

export interface WallConfluenceZoneV2 extends WallConfluenceZone {
  readonly reactionClassification: WallReactionClassification;
  readonly reactionAnalysis: WallReactionAnalysis;
  readonly expiryBreadth: WallExpiryBreadth;
}

export interface WallConfluenceOptions {
  readonly signals: readonly WallSignalInput[];
  readonly spotPrice: number;
  readonly now: number;
  readonly candles?: readonly Candle[];
  readonly history?: ReadonlyMap<string, WallSignalHistory>;
  readonly zoneToleranceUsd?: number;
}

export interface DealerFlowTrade {
  readonly tradeId: string;
  readonly instrumentName: string;
  readonly direction: "buy" | "sell";
  readonly amountBtc: number;
  readonly timestamp: number;
}

export interface DealerFlowWallResult {
  readonly signal: WallSignalInput | null;
  readonly tradesIncluded: number;
  readonly openingPressure: number;
  readonly closingPressure: number;
  readonly netDealerGammaOnePercentUsd: number;
}

export interface WallMovementSnapshot {
  readonly observedAt: number;
  readonly wallPrice: number | null;
  readonly spotPrice: number | null;
  readonly normalizedConcentration: number | null;
  readonly expiry: number | null;
  readonly concentrationLeaderId?: string | null;
}

export type WallMovementAttribution =
  "price" | "concentration" | "expiry-settlement" | "unknown";

export interface WallMovementAuditOptions {
  readonly movementToleranceUsd?: number;
  readonly concentrationChangeThreshold?: number;
  readonly spotChangeThresholdRatio?: number;
}

export interface WallMovementAudit {
  readonly moved: boolean;
  readonly attribution: WallMovementAttribution;
  readonly contributingFactors: readonly Exclude<
    WallMovementAttribution,
    "unknown"
  >[];
  readonly wallPriceChangeUsd: number | null;
  readonly spotPriceChangeUsd: number | null;
  readonly concentrationChange: number | null;
  readonly expiryChanged: boolean;
  readonly settlementCrossed: boolean;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const average = (values: readonly number[]): number =>
  values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;

export const estimateDealerFlowWall = ({
  trades,
  chain,
  previousChain,
  expiry,
  spotPrice,
  now,
  interestRateFallbackDecimal = 0.01,
}: {
  readonly trades: readonly DealerFlowTrade[];
  readonly chain: OptionsChainSnapshot;
  readonly previousChain?: OptionsChainSnapshot | null;
  readonly expiry: number;
  readonly spotPrice: number;
  readonly now: number;
  readonly interestRateFallbackDecimal?: number;
}): DealerFlowWallResult => {
  const currentByName = new Map(
    chain.instruments.map((contract) => [
      contract.instrument.instrumentName,
      contract,
    ]),
  );
  const previousByName = new Map(
    (previousChain?.instruments ?? []).map((contract) => [
      contract.instrument.instrumentName,
      contract,
    ]),
  );
  const strikeFlow = new Map<
    number,
    {
      signedGex: number;
      grossGex: number;
      confidenceTotal: number;
      trades: number;
    }
  >();
  let openingPressure = 0;
  let closingPressure = 0;
  let tradesIncluded = 0;

  for (const trade of trades) {
    const contract = currentByName.get(trade.instrumentName);
    if (
      !contract ||
      contract.instrument.expiry !== expiry ||
      !Number.isFinite(trade.amountBtc) ||
      trade.amountBtc <= 0 ||
      trade.timestamp > now
    ) {
      continue;
    }
    let grossGex: number;
    try {
      grossGex = calculateContractExposure(
        {
          ...contract,
          quote: { ...contract.quote, openInterestBtc: trade.amountBtc },
        },
        spotPrice,
        now,
        interestRateFallbackDecimal,
      ).grossGammaOnePercentUsd;
    } catch {
      continue;
    }

    const previous = previousByName.get(trade.instrumentName);
    const oiDelta = previous
      ? contract.quote.openInterestBtc - previous.quote.openInterestBtc
      : 0;
    const ivDelta =
      previous &&
      previous.quote.markIvDecimal !== null &&
      contract.quote.markIvDecimal !== null
        ? contract.quote.markIvDecimal - previous.quote.markIvDecimal
        : 0;
    const likelyOpening = Math.max(0, oiDelta);
    const likelyClosing = Math.max(0, -oiDelta);
    openingPressure += Math.min(trade.amountBtc, likelyOpening);
    closingPressure += Math.min(trade.amountBtc, likelyClosing);
    const oiEvidence = clamp01(Math.abs(oiDelta) / trade.amountBtc);
    const ivCorroborates =
      (trade.direction === "buy" && ivDelta > 0) ||
      (trade.direction === "sell" && ivDelta < 0);
    const ageMinutes = Math.max(0, now - trade.timestamp) / 60_000;
    const recency = Math.exp(-ageMinutes / 60);
    const confidence = clamp01(
      0.4 + oiEvidence * 0.25 + (ivCorroborates ? 0.15 : 0) + recency * 0.2,
    );
    // A buy aggressor is modeled against a dealer sale, and vice versa.
    const dealerSign = trade.direction === "buy" ? -1 : 1;
    const current = strikeFlow.get(contract.instrument.strike) ?? {
      signedGex: 0,
      grossGex: 0,
      confidenceTotal: 0,
      trades: 0,
    };
    strikeFlow.set(contract.instrument.strike, {
      signedGex: current.signedGex + dealerSign * grossGex,
      grossGex: current.grossGex + grossGex,
      confidenceTotal: current.confidenceTotal + confidence,
      trades: current.trades + 1,
    });
    tradesIncluded += 1;
  }

  const ranked = [...strikeFlow.entries()].sort(
    ([leftStrike, left], [rightStrike, right]) =>
      Math.abs(right.signedGex) - Math.abs(left.signedGex) ||
      right.grossGex - left.grossGex ||
      leftStrike - rightStrike,
  );
  const winner = ranked[0];
  const totalAbsoluteGex = ranked.reduce(
    (total, [, value]) => total + Math.abs(value.signedGex),
    0,
  );
  const netDealerGammaOnePercentUsd = ranked.reduce(
    (total, [, value]) => total + value.signedGex,
    0,
  );
  if (!winner || totalAbsoluteGex <= 0) {
    return {
      signal: null,
      tradesIncluded,
      openingPressure,
      closingPressure,
      netDealerGammaOnePercentUsd,
    };
  }
  const [price, value] = winner;
  const confidence = clamp01(value.confidenceTotal / value.trades);
  return {
    signal: {
      id: "dealer-flow-wall",
      kind: "dealer-flow",
      label: "Flow-Informed Dealer Wall",
      price,
      normalizedConcentration: Math.abs(value.signedGex) / totalAbsoluteGex,
      confidence,
      expiry,
      direction: "neutral",
      detail: `${value.trades} recent trades; ${value.signedGex >= 0 ? "long" : "short"} dealer gamma proxy`,
    },
    tradesIncluded,
    openingPressure,
    closingPressure,
    netDealerGammaOnePercentUsd,
  };
};

const calculateAtr = (candles: readonly Candle[]): number => {
  const sample = candles.slice(-15);
  if (sample.length < 2) return 0;
  const ranges: number[] = [];
  for (let index = 1; index < sample.length; index += 1) {
    const candle = sample[index]!;
    const previous = sample[index - 1]!;
    ranges.push(
      Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - previous.close),
        Math.abs(candle.low - previous.close),
      ),
    );
  }
  return average(ranges);
};

const priceSide = (
  price: number,
  lowerPrice: number,
  upperPrice: number,
): -1 | 0 | 1 => {
  if (price < lowerPrice) return -1;
  if (price > upperPrice) return 1;
  return 0;
};

export const calculateWallZoneTolerance = (
  spotPrice: number,
  candles: readonly Candle[] = [],
): number => {
  const atr = calculateAtr(candles);
  return Math.max(50, spotPrice * 0.0025, atr * 0.5);
};

export const updateWallSignalHistory = (
  previous: ReadonlyMap<string, WallSignalHistory>,
  signals: readonly WallSignalInput[],
  observedAt: number,
  toleranceUsd: number,
): ReadonlyMap<string, WallSignalHistory> => {
  const next = new Map(previous);
  const activeIds = new Set(signals.map(({ id }) => id));

  for (const signal of signals) {
    const existing = previous.get(signal.id);
    const remainsInZone =
      existing !== undefined &&
      Math.abs(existing.price - signal.price) <= toleranceUsd;
    next.set(signal.id, {
      id: signal.id,
      price: signal.price,
      observations: (existing?.observations ?? 0) + 1,
      consecutiveObservations: remainsInZone
        ? existing.consecutiveObservations + 1
        : 1,
      firstSeenAt:
        remainsInZone && existing ? existing.firstSeenAt : observedAt,
      lastSeenAt: observedAt,
    });
  }

  for (const [id, record] of next) {
    if (!activeIds.has(id) && observedAt - record.lastSeenAt > 30 * 60_000) {
      next.delete(id);
    }
  }
  return next;
};

export const analyzeWallReaction = (
  candles: readonly Candle[],
  centerPrice: number,
  halfWidth: number,
): WallReactionAnalysis => {
  const sample = candles.slice(-320);
  const atr = calculateAtr(sample);
  const empty: WallReactionAnalysis = {
    classification: "unconfirmed",
    score: 0,
    touches: 0,
    rejectionCount: 0,
    breakoutCount: 0,
    retestCount: 0,
    lastReactionAt: null,
  };
  if (
    sample.length < 20 ||
    atr <= 0 ||
    !Number.isFinite(centerPrice) ||
    !Number.isFinite(halfWidth)
  ) {
    return empty;
  }

  const reactions: number[] = [];
  const normalizedHalfWidth = Math.max(0, halfWidth);
  const lowerPrice = centerPrice - normalizedHalfWidth;
  const upperPrice = centerPrice + normalizedHalfWidth;
  let latestClassification: WallReactionClassification = "unconfirmed";
  let rejectionCount = 0;
  let breakoutCount = 0;
  let retestCount = 0;
  let lastReactionAt: number | null = null;
  let breakoutSide: -1 | 1 | null = null;
  let previousTouch = -10;
  for (let index = 0; index < sample.length - 3; index += 1) {
    const candle = sample[index]!;
    const touched =
      candle.low <= centerPrice + halfWidth &&
      candle.high >= centerPrice - halfWidth;
    if (!touched || index - previousTouch < 5) continue;
    previousTouch = index;
    const followThrough = sample.slice(
      index + 1,
      Math.min(sample.length, index + 7),
    );
    const excursion = followThrough.reduce(
      (largest, next) =>
        Math.max(
          largest,
          Math.abs(next.close - centerPrice) - normalizedHalfWidth,
        ),
      0,
    );
    reactions.push(clamp01(excursion / (atr * 1.5)));

    const approachSide =
      index > 0
        ? priceSide(sample[index - 1]!.close, lowerPrice, upperPrice)
        : 0;
    const confirmedSides = followThrough
      .filter(
        (next) =>
          Math.max(
            0,
            Math.abs(next.close - centerPrice) - normalizedHalfWidth,
          ) >=
          atr * 0.25,
      )
      .map((next) => priceSide(next.close, lowerPrice, upperPrice))
      .filter((side): side is -1 | 1 => side !== 0);
    const oppositeSide =
      approachSide === 0
        ? null
        : (confirmedSides.find((side) => side === -approachSide) ?? null);
    const returnedSide =
      approachSide === 0
        ? null
        : (confirmedSides.find((side) => side === approachSide) ?? null);

    if (oppositeSide !== null) {
      latestClassification = "breakout";
      breakoutCount += 1;
      breakoutSide = oppositeSide;
      lastReactionAt = candle.openTime;
    } else if (returnedSide !== null && breakoutSide === approachSide) {
      latestClassification = "retest";
      retestCount += 1;
      lastReactionAt = candle.openTime;
    } else if (returnedSide !== null) {
      latestClassification = "rejection";
      rejectionCount += 1;
      lastReactionAt = candle.openTime;
    }
  }

  const recentReactions = reactions.slice(-5);
  if (recentReactions.length === 0) return empty;
  const repeatability = Math.min(1, recentReactions.length / 3);
  return {
    classification: latestClassification,
    score: clamp01(average(recentReactions) * (0.65 + repeatability * 0.35)),
    touches: recentReactions.length,
    rejectionCount,
    breakoutCount,
    retestCount,
    lastReactionAt,
  };
};

const expiryBreadthForSignals = (
  signals: readonly WallSignalInput[],
): WallExpiryBreadth => {
  const expiries = [
    ...new Set(
      signals
        .map(({ expiry }) => expiry)
        .filter(
          (expiry): expiry is number =>
            expiry !== null && Number.isFinite(expiry) && expiry > 0,
        ),
    ),
  ].sort((left, right) => left - right);
  const signalsWithExpiryCount = signals.filter(
    ({ expiry }) => expiry !== null && Number.isFinite(expiry) && expiry > 0,
  ).length;
  return {
    distinctExpiryCount: expiries.length,
    expiries,
    signalsWithExpiryCount,
    unscopedSignalCount: signals.length - signalsWithExpiryCount,
  };
};

const finiteDifference = (
  current: number | null,
  previous: number | null,
): number | null =>
  current !== null &&
  previous !== null &&
  Number.isFinite(current) &&
  Number.isFinite(previous)
    ? current - previous
    : null;

export const auditWallMovement = (
  previous: WallMovementSnapshot,
  current: WallMovementSnapshot,
  options: WallMovementAuditOptions = {},
): WallMovementAudit => {
  const wallPriceChangeUsd = finiteDifference(
    current.wallPrice,
    previous.wallPrice,
  );
  const spotPriceChangeUsd = finiteDifference(
    current.spotPrice,
    previous.spotPrice,
  );
  const concentrationChange = finiteDifference(
    current.normalizedConcentration,
    previous.normalizedConcentration,
  );
  const referenceWallPrice = previous.wallPrice ?? current.wallPrice ?? 0;
  const movementToleranceUsd = Math.max(
    0,
    options.movementToleranceUsd ?? Math.max(1, referenceWallPrice * 0.0001),
  );
  const moved =
    wallPriceChangeUsd === null
      ? previous.wallPrice !== current.wallPrice
      : Math.abs(wallPriceChangeUsd) > movementToleranceUsd;
  const expiryChanged = previous.expiry !== current.expiry;
  const settlementCrossed =
    previous.expiry !== null &&
    Number.isFinite(previous.expiry) &&
    previous.observedAt < previous.expiry &&
    current.observedAt >= previous.expiry;
  const leaderChanged =
    previous.concentrationLeaderId !== undefined &&
    current.concentrationLeaderId !== undefined &&
    previous.concentrationLeaderId !== current.concentrationLeaderId;
  const concentrationChanged =
    leaderChanged ||
    (concentrationChange !== null &&
      Math.abs(concentrationChange) >=
        (options.concentrationChangeThreshold ?? 0.05));
  const previousSpot = previous.spotPrice;
  const spotChanged =
    spotPriceChangeUsd !== null &&
    previousSpot !== null &&
    Number.isFinite(previousSpot) &&
    previousSpot > 0 &&
    Math.abs(spotPriceChangeUsd / previousSpot) >=
      (options.spotChangeThresholdRatio ?? 0.0025);
  const movedWithSpot =
    wallPriceChangeUsd !== null &&
    spotPriceChangeUsd !== null &&
    Math.sign(wallPriceChangeUsd) === Math.sign(spotPriceChangeUsd);

  const contributingFactors: Array<
    Exclude<WallMovementAttribution, "unknown">
  > = [];
  if (moved && (expiryChanged || settlementCrossed)) {
    contributingFactors.push("expiry-settlement");
  }
  if (moved && concentrationChanged) {
    contributingFactors.push("concentration");
  }
  if (moved && spotChanged && movedWithSpot) {
    contributingFactors.push("price");
  }

  return {
    moved,
    attribution: contributingFactors[0] ?? "unknown",
    contributingFactors,
    wallPriceChangeUsd,
    spotPriceChangeUsd,
    concentrationChange,
    expiryChanged,
    settlementCrossed,
  };
};

const persistenceForSignal = (
  history: WallSignalHistory | undefined,
  now: number,
): number => {
  if (!history) return 0;
  const recency = Math.exp(
    -Math.max(0, now - history.lastSeenAt) / (10 * 60_000),
  );
  const consecutive = Math.min(1, history.consecutiveObservations / 6);
  const observations = Math.min(1, history.observations / 12);
  return clamp01((consecutive * 0.7 + observations * 0.3) * recency);
};

const expiryScoreForSignal = (signal: WallSignalInput, now: number): number => {
  if (signal.expiry === null) return 0.5;
  const dte = Math.max(0, signal.expiry - now) / 86_400_000;
  return 1 / (1 + dte / 7);
};

const scoreLabel = (score: number): WallConfluenceZone["strength"] => {
  if (score >= 80) return "VERY STRONG";
  if (score >= 65) return "STRONG";
  if (score >= 45) return "MODERATE";
  return "DEVELOPING";
};

const strongestByKind = (
  signals: readonly WallSignalInput[],
): readonly WallSignalInput[] => {
  const strongest = new Map<ConfluenceSignalKind, WallSignalInput>();
  for (const signal of signals) {
    const current = strongest.get(signal.kind);
    if (
      !current ||
      signal.normalizedConcentration * signal.confidence >
        current.normalizedConcentration * current.confidence
    ) {
      strongest.set(signal.kind, signal);
    }
  }
  return [...strongest.values()];
};

export const createWallConfluenceZones = (
  options: WallConfluenceOptions,
): readonly WallConfluenceZoneV2[] => {
  const candles = options.candles ?? [];
  const history = options.history ?? new Map<string, WallSignalHistory>();
  const tolerance =
    options.zoneToleranceUsd ??
    calculateWallZoneTolerance(options.spotPrice, candles);
  const validSignals = options.signals
    .filter(
      (signal) =>
        Number.isFinite(signal.price) &&
        signal.price > 0 &&
        Number.isFinite(signal.normalizedConcentration) &&
        Number.isFinite(signal.confidence),
    )
    .map((signal) => ({
      ...signal,
      normalizedConcentration: clamp01(signal.normalizedConcentration),
      confidence: clamp01(signal.confidence),
    }))
    .sort(
      (left, right) =>
        left.price - right.price || left.id.localeCompare(right.id),
    );

  const clusters: WallSignalInput[][] = [];
  for (const signal of validSignals) {
    const current = clusters.at(-1);
    if (!current) {
      clusters.push([signal]);
      continue;
    }
    const center = average(current.map(({ price }) => price));
    if (Math.abs(signal.price - center) <= tolerance) current.push(signal);
    else clusters.push([signal]);
  }

  return clusters
    .map((signals, index): WallConfluenceZoneV2 => {
      const representatives = strongestByKind(signals);
      const weightedPriceTotal = signals.reduce(
        (total, signal) =>
          total + signal.price * Math.max(0.05, signal.confidence),
        0,
      );
      const totalWeight = signals.reduce(
        (total, signal) => total + Math.max(0.05, signal.confidence),
        0,
      );
      const centerPrice = weightedPriceTotal / totalWeight;
      const minimumPrice = Math.min(...signals.map(({ price }) => price));
      const maximumPrice = Math.max(...signals.map(({ price }) => price));
      const halfWidth = Math.max(
        tolerance * 0.35,
        (maximumPrice - minimumPrice) / 2,
      );
      const typeCoverage =
        representatives.reduce(
          (total, signal) => total + signal.confidence,
          0,
        ) / 6;
      const normalizedMagnitude = average(
        representatives.map(
          (signal) => signal.normalizedConcentration * signal.confidence,
        ),
      );
      const concentration = clamp01(
        typeCoverage * 0.7 + normalizedMagnitude * 0.3,
      );
      const persistence = average(
        representatives.map((signal) =>
          persistenceForSignal(history.get(signal.id), options.now),
        ),
      );
      const atr = calculateAtr(candles);
      const distanceScale = Math.max(options.spotPrice * 0.025, atr * 4, 1);
      const distance = Math.exp(
        -Math.abs(centerPrice - options.spotPrice) / distanceScale,
      );
      const expiry = average(
        representatives.map((signal) =>
          expiryScoreForSignal(signal, options.now),
        ),
      );
      const reaction = analyzeWallReaction(candles, centerPrice, halfWidth);
      const expiryBreadth = expiryBreadthForSignals(signals);
      const components: ConfluenceScoreBreakdown = {
        concentration: concentration * 100,
        persistence: persistence * 100,
        distance: distance * 100,
        expiry: expiry * 100,
        reaction: reaction.score * 100,
      };
      const quality =
        normalizedMagnitude * 0.25 +
        persistence * 0.2 +
        distance * 0.2 +
        expiry * 0.1 +
        reaction.score * 0.25;
      // Each distinct signal family owns a non-overlapping score band. This
      // makes broader confluence decisive while quality ranks zones within it.
      const score = Math.round(
        Math.min(100, (representatives.length - 1) * 17 + quality * 15),
      );
      const confidence = average(
        representatives.map(({ confidence: value }) => value),
      );

      return {
        id: `zone-${Math.round(centerPrice)}-${index}`,
        centerPrice,
        lowerPrice: minimumPrice - tolerance * 0.35,
        upperPrice: maximumPrice + tolerance * 0.35,
        score,
        strength: scoreLabel(score),
        confidence,
        distinctSignalCount: representatives.length,
        signals,
        components,
        reactionTouches: reaction.touches,
        reactionClassification: reaction.classification,
        reactionAnalysis: reaction,
        expiryBreadth,
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        Math.abs(left.centerPrice - options.spotPrice) -
          Math.abs(right.centerPrice - options.spotPrice),
    );
};
