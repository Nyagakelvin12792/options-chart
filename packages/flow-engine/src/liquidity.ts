import type { MarketEventV1 } from "@options-chart/market-data";
import {
  DEFAULT_FLOW_ENGINE_CONFIG_V1,
  type FlowEngineConfigV1,
} from "./configuration";
import type {
  FeatureAvailability,
  LiquidityBandChangeV1,
  LiquiditySnapshotV1,
  NormalizedTradeFlowV1,
  ReplenishmentEventV1,
} from "./contracts";
import { computeAbsoluteBpsDistance, roundDecimal } from "./decimal";
import { resolveEffectiveTime } from "./effective-time";
import type { BookApplyResultV1 } from "./order-book";

export const LIQUIDITY_POLICY_VERSION = "flow-liquidity-v1" as const;

type BookSide = "bid" | "ask";

interface DisplayedLiquidityDiffRecord {
  readonly timestampMs: number;
  readonly eventId: string;
  readonly referencePrice: number;
  readonly side: BookSide;
  readonly price: number;
  readonly distanceBps: number;
  readonly addedQuantity: number;
  readonly removedQuantity: number;
  readonly addedNotional: number;
  readonly removedNotional: number;
}

interface PendingRemovalCandidate {
  readonly removalEventId: string;
  readonly removalTimestampMs: number;
  readonly referencePriceAtRemoval: number;
  readonly side: BookSide;
  readonly removedPrice: number;
  readonly removedQuantity: number;
  consumed: boolean;
}

interface ExecutedTradeRecord {
  readonly timestampMs: number;
  readonly takerSide: "buy" | "sell";
  readonly baseQuantity: number;
  readonly quoteVolume: number;
}

export interface LiquiditySnapshotOptionsV1 {
  readonly isBookAvailable?: boolean;
  readonly forceDegraded?: boolean;
  readonly forceUnavailable?: boolean;
}

class HeadIndexedQueue<T> {
  private items: T[] = [];
  private head = 0;
  private readonly getTs: (item: T) => number;

  public constructor(getTs: (item: T) => number) {
    this.getTs = getTs;
  }

  public push(item: T): void {
    this.items.push(item);
  }

  public pruneBefore(cutoffMs: number, extraPred?: (item: T) => boolean): void {
    while (this.head < this.items.length) {
      const cur = this.items[this.head]!;
      if (this.getTs(cur) < cutoffMs || (extraPred && extraPred(cur))) {
        this.head++;
      } else {
        break;
      }
    }
    this.compactIfNeeded();
  }

  public trimToLast(maxCount: number): void {
    const active = this.items.length - this.head;
    if (active > maxCount) {
      this.head = this.items.length - maxCount;
      this.compactIfNeeded();
    }
  }

  public values(): readonly T[] {
    return this.head === 0 ? this.items : this.items.slice(this.head);
  }

  public forEach(fn: (item: T) => void): void {
    for (let i = this.head; i < this.items.length; i++) {
      fn(this.items[i]!);
    }
  }

  public findFirst(pred: (item: T) => boolean): T | undefined {
    for (let i = this.head; i < this.items.length; i++) {
      const item = this.items[i]!;
      if (pred(item)) return item;
    }
    return undefined;
  }

  public clear(): void {
    this.items = [];
    this.head = 0;
  }

  private compactIfNeeded(): void {
    if (this.head >= 64 && this.head * 2 >= this.items.length) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    }
  }
}

export class LiquidityEngine {
  private readonly cfg: FlowEngineConfigV1;
  private readonly maxBandBps: number;
  private readonly diffs = new HeadIndexedQueue<DisplayedLiquidityDiffRecord>(
    (r) => r.timestampMs,
  );
  private readonly removals = new HeadIndexedQueue<PendingRemovalCandidate>(
    (r) => r.removalTimestampMs,
  );
  private readonly replenishments = new HeadIndexedQueue<ReplenishmentEventV1>(
    (r) => r.replenishTimestampMs,
  );
  private readonly trades = new HeadIndexedQueue<ExecutedTradeRecord>(
    (r) => r.timestampMs,
  );
  private nextReplenishSeq = 1;

  public constructor(
    config: FlowEngineConfigV1 = DEFAULT_FLOW_ENGINE_CONFIG_V1,
  ) {
    this.cfg = config;
    this.maxBandBps = Math.max(...config.bpsBands);
  }

  public reset(): void {
    this.diffs.clear();
    this.removals.clear();
    this.replenishments.clear();
    this.trades.clear();
    this.nextReplenishSeq = 1;
  }

  private pruneAll(asOfFeatureMs: number): void {
    const winCutoff = asOfFeatureMs - this.cfg.liquidityWindowMs;
    const remCutoff = asOfFeatureMs - this.cfg.replenishmentMaxElapsedMs;
    this.diffs.pruneBefore(winCutoff);
    this.removals.pruneBefore(remCutoff, (r) => r.consumed);
    this.replenishments.pruneBefore(winCutoff);
    this.replenishments.trimToLast(this.cfg.maxRetainedReplenishments);
    this.trades.pruneBefore(winCutoff);
  }

  public recordBookUpdate(
    event: MarketEventV1,
    applyResult: BookApplyResultV1,
  ): void {
    if (!applyResult.accepted || applyResult.levelDiffs.length === 0) return;
    const refPrice =
      applyResult.referencePriceAfter ?? applyResult.referencePriceBefore;
    if (refPrice === null || refPrice <= 0) return;

    const featureMs = resolveEffectiveTime(event).featureTimestampMs;
    this.pruneAll(featureMs);

    for (const diff of applyResult.levelDiffs) {
      if (diff.deltaQuantity === 0) continue;
      const distBps = computeAbsoluteBpsDistance(
        diff.price,
        refPrice,
        refPrice,
      );
      if (distBps === null) continue;

      const isAdd = diff.deltaQuantity > 0;
      const absQty = roundDecimal(Math.abs(diff.deltaQuantity));
      const notional = roundDecimal(diff.price * absQty);

      this.diffs.push({
        timestampMs: featureMs,
        eventId: event.eventId,
        referencePrice: refPrice,
        side: diff.side,
        price: diff.price,
        distanceBps: distBps,
        addedQuantity: isAdd ? absQty : 0,
        removedQuantity: isAdd ? 0 : absQty,
        addedNotional: isAdd ? notional : 0,
        removedNotional: isAdd ? 0 : notional,
      });

      if (distBps > this.maxBandBps) continue;

      if (!isAdd) {
        this.removals.push({
          removalEventId: event.eventId,
          removalTimestampMs: featureMs,
          referencePriceAtRemoval: refPrice,
          side: diff.side,
          removedPrice: diff.price,
          removedQuantity: absQty,
          consumed: false,
        });
      } else {
        this.tryMatchReplenishment(
          event.eventId,
          featureMs,
          diff.side,
          diff.price,
          absQty,
        );
      }
    }
  }

  private tryMatchReplenishment(
    replenishEventId: string,
    replenishMs: number,
    side: BookSide,
    replenishedPrice: number,
    replenishedQty: number,
  ): void {
    const maxElapsed = this.cfg.replenishmentMaxElapsedMs;
    const tolBps = this.cfg.replenishmentPriceToleranceBps;
    const minRatio = this.cfg.replenishmentMinRatio;

    const match = this.removals.findFirst((rem) => {
      if (rem.consumed || rem.side !== side) return false;
      const elapsed = replenishMs - rem.removalTimestampMs;
      if (elapsed < 0 || elapsed > maxElapsed) return false;
      const pDist = computeAbsoluteBpsDistance(
        replenishedPrice,
        rem.removedPrice,
        rem.removedPrice,
      );
      if (pDist === null || pDist > tolBps) return false;
      const ratio = roundDecimal(replenishedQty / rem.removedQuantity, 6);
      return ratio >= minRatio;
    });

    if (!match) return;
    match.consumed = true;
    const pDist =
      computeAbsoluteBpsDistance(
        replenishedPrice,
        match.removedPrice,
        match.removedPrice,
      ) ?? 0;
    const ratio = roundDecimal(replenishedQty / match.removedQuantity, 6);
    const id = `replenishment-${this.nextReplenishSeq++}`;

    this.replenishments.push({
      replenishmentId: id,
      side,
      removalEventId: match.removalEventId,
      replenishEventId,
      removalTimestampMs: match.removalTimestampMs,
      replenishTimestampMs: replenishMs,
      elapsedMs: replenishMs - match.removalTimestampMs,
      referencePriceAtRemoval: match.referencePriceAtRemoval,
      removedPrice: match.removedPrice,
      replenishedPrice,
      priceDistanceBps: pDist,
      removedQuantity: match.removedQuantity,
      replenishedQuantity: replenishedQty,
      replenishmentRatio: ratio,
      classificationLabel: "observed-displayed-liquidity-replenishment",
    });
    this.replenishments.trimToLast(this.cfg.maxRetainedReplenishments);
  }

  public recordExecutedTrade(trade: NormalizedTradeFlowV1): void {
    if (trade.takerSide !== "buy" && trade.takerSide !== "sell") return;
    this.trades.pruneBefore(
      trade.featureTimestampMs - this.cfg.liquidityWindowMs,
    );
    this.trades.push({
      timestampMs: trade.featureTimestampMs,
      takerSide: trade.takerSide,
      baseQuantity: trade.baseQuantity,
      quoteVolume: trade.quoteVolume,
    });
  }

  public snapshot(
    asOfFeatureTimestampMs: number,
    currentReferencePrice: number | null,
    options?: LiquiditySnapshotOptionsV1,
  ): LiquiditySnapshotV1 {
    this.pruneAll(asOfFeatureTimestampMs);

    const bands: LiquidityBandChangeV1[] = this.cfg.bpsBands.map((bandBps) => {
      let bidAddQ = 0,
        bidRemQ = 0,
        askAddQ = 0,
        askRemQ = 0;
      let bidAddN = 0,
        bidRemN = 0,
        askAddN = 0,
        askRemN = 0;
      this.diffs.forEach((d) => {
        if (d.timestampMs > asOfFeatureTimestampMs || d.distanceBps > bandBps) {
          return;
        }
        if (d.side === "bid") {
          bidAddQ += d.addedQuantity;
          bidRemQ += d.removedQuantity;
          bidAddN += d.addedNotional;
          bidRemN += d.removedNotional;
        } else {
          askAddQ += d.addedQuantity;
          askRemQ += d.removedQuantity;
          askAddN += d.addedNotional;
          askRemN += d.removedNotional;
        }
      });
      const bAddQ = roundDecimal(bidAddQ),
        bRemQ = roundDecimal(bidRemQ);
      const aAddQ = roundDecimal(askAddQ),
        aRemQ = roundDecimal(askRemQ);
      return {
        bandBps,
        bidAddedQuantity: bAddQ,
        bidRemovedQuantity: bRemQ,
        bidNetQuantity: roundDecimal(bAddQ - bRemQ),
        askAddedQuantity: aAddQ,
        askRemovedQuantity: aRemQ,
        askNetQuantity: roundDecimal(aAddQ - aRemQ),
        bidAddedNotional: roundDecimal(bidAddN),
        bidRemovedNotional: roundDecimal(bidRemN),
        askAddedNotional: roundDecimal(askAddN),
        askRemovedNotional: roundDecimal(askRemN),
      };
    });

    let totalBidRemInMax = 0,
      totalAskRemInMax = 0;
    this.diffs.forEach((d) => {
      if (
        d.timestampMs <= asOfFeatureTimestampMs &&
        d.distanceBps <= this.maxBandBps
      ) {
        if (d.side === "bid") totalBidRemInMax += d.removedQuantity;
        else totalAskRemInMax += d.removedQuantity;
      }
    });

    let buyQuote = 0,
      sellQuote = 0,
      buyBase = 0,
      sellBase = 0;
    this.trades.forEach((t) => {
      if (t.timestampMs > asOfFeatureTimestampMs) return;
      if (t.takerSide === "buy") {
        buyQuote += t.quoteVolume;
        buyBase += t.baseQuantity;
      } else {
        sellQuote += t.quoteVolume;
        sellBase += t.baseQuantity;
      }
    });

    const cancellationOrRemovalBidQuantity = roundDecimal(
      Math.max(0, totalBidRemInMax - sellBase),
    );
    const cancellationOrRemovalAskQuantity = roundDecimal(
      Math.max(0, totalAskRemInMax - buyBase),
    );

    const recentReplenishments = this.replenishments
      .values()
      .filter((r) => r.replenishTimestampMs <= asOfFeatureTimestampMs);

    const refOk = currentReferencePrice !== null && currentReferencePrice > 0;
    let availability: FeatureAvailability = "available";
    if (
      options?.forceUnavailable === true ||
      options?.isBookAvailable === false ||
      !refOk
    ) {
      availability = "unavailable";
    } else if (options?.forceDegraded === true) {
      availability = "degraded";
    }

    return {
      availability,
      referencePrice: refOk ? roundDecimal(currentReferencePrice) : null,
      windowDurationMs: this.cfg.liquidityWindowMs,
      bands,
      recentReplenishments,
      executedAggressiveBuyQuoteVolume: roundDecimal(buyQuote),
      executedAggressiveSellQuoteVolume: roundDecimal(sellQuote),
      cancellationOrRemovalBidQuantity,
      cancellationOrRemovalAskQuantity,
    };
  }
}
