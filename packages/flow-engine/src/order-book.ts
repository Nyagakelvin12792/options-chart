import type { MarketEventV1 } from "@options-chart/market-data";
import {
  DEFAULT_FLOW_ENGINE_CONFIG_V1,
  type FlowEngineConfigV1,
} from "./configuration";
import type {
  BookLevelV1,
  BookStatusReason,
  BpsBandImbalanceV1,
  FeatureAvailability,
  OrderBookSnapshotV1,
  TopNImbalanceV1,
} from "./contracts";
import {
  BASIS_POINTS_SCALE,
  computeAbsoluteBpsDistance,
  computeQuoteVolume,
  parseNonNegativeDecimal,
  parsePositiveDecimal,
  roundDecimal,
  safeDivide,
} from "./decimal";
import {
  areSequencesEqual,
  evaluateSequenceTransition,
  isValidTimestampMs,
  resolveEffectiveTime,
  type EffectiveTimeResolution,
  type SequenceTransitionEvaluation,
  type SequenceTransitionKind,
} from "./effective-time";

export const ORDER_BOOK_POLICY_VERSION = "flow-order-book-v1" as const;

type Side = "bid" | "ask";
type RawLvl = readonly [number, number];
type Seq = number | string | null;

export interface BookLevelDiffV1 {
  readonly side: Side;
  readonly price: number;
  readonly previousQuantity: number;
  readonly nextQuantity: number;
  readonly deltaQuantity: number;
}

export interface BookApplyResultV1 {
  readonly accepted: boolean;
  readonly statusReason: BookStatusReason;
  readonly sequenceTransition: SequenceTransitionEvaluation;
  readonly referencePriceBefore: number | null;
  readonly referencePriceAfter: number | null;
  readonly levelDiffs: readonly BookLevelDiffV1[];
}

export interface BookSnapshotOptionsV1 {
  readonly isStale?: boolean;
  readonly hasUnresolvedGap?: boolean;
  readonly forceUnavailable?: boolean;
}

interface ParsedPayload {
  readonly updateType: "snapshot" | "delta";
  readonly sequence: Seq;
  readonly previousSequence: Seq | undefined;
  readonly bids: readonly RawLvl[];
  readonly asks: readonly RawLvl[];
}

const isValidSeq = (v: unknown): v is Seq =>
  v === null ||
  (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) ||
  (typeof v === "string" && v.length > 0);

function parseLevels(raw: unknown): readonly RawLvl[] | null {
  if (!Array.isArray(raw)) return null;
  const out: RawLvl[] = [];
  for (const r of raw) {
    if (!Array.isArray(r) || r.length !== 2) return null;
    const p = parsePositiveDecimal(r[0]),
      q = parseNonNegativeDecimal(r[1]);
    if (
      !p.ok ||
      !q.ok ||
      (q.value > 0 && !computeQuoteVolume(p.value, q.value).ok)
    )
      return null;
    out.push([p.value, q.value]);
  }
  return out;
}

function parseBookPayload(ev: MarketEventV1): ParsedPayload | null {
  if (
    ev.channel !== "l2-book" ||
    ev.venue !== "binance" ||
    ev.instrumentType !== "spot" ||
    ev.symbol !== "BTC-USDT" ||
    !isValidTimestampMs(ev.receiptTimestampMs) ||
    typeof ev.payload !== "object" ||
    !ev.payload
  ) {
    return null;
  }
  const raw = ev.payload as Record<string, unknown>;
  const uType = raw["updateType"],
    seq = raw["sequence"],
    pSeq = raw["previousSequence"];
  if (
    raw["schemaVersion"] !== "binance-spot-l2-book-payload-v1" ||
    (uType !== "snapshot" && uType !== "delta") ||
    !isValidSeq(seq) ||
    (pSeq !== undefined && !isValidSeq(pSeq))
  ) {
    return null;
  }
  const bids = parseLevels(raw["bids"]),
    asks = parseLevels(raw["asks"]);
  return bids && asks
    ? { updateType: uType, sequence: seq, previousSequence: pSeq, bids, asks }
    : null;
}

function findIdx(levels: readonly BookLevelV1[], price: number, side: Side) {
  let lo = 0,
    hi = levels.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1,
      mp = levels[mid]!.price;
    if (mp === price) return { found: true, index: mid };
    if (side === "bid" ? mp > price : mp < price) lo = mid + 1;
    else hi = mid - 1;
  }
  return { found: false, index: lo };
}

function mkLvl(price: number, quantity: number): BookLevelV1 {
  const quoteNotional = roundDecimal(price * quantity);
  return { price, quantity, quoteNotional };
}

function mkDiff(
  side: Side,
  price: number,
  prev: number,
  next: number,
): BookLevelDiffV1 {
  const d = roundDecimal(next - prev);
  return {
    side,
    price,
    previousQuantity: prev,
    nextQuantity: next,
    deltaQuantity: d,
  };
}

function mkSeq(kind: SequenceTransitionKind, prev: Seq, curr: Seq) {
  return {
    kind,
    previousSequence: prev,
    currentSequence: curr,
    missingCount: null,
  };
}

function mkRes(
  accepted: boolean,
  statusReason: BookStatusReason,
  seq: SequenceTransitionEvaluation,
  refBefore: number | null,
  refAfter: number | null = null,
  levelDiffs: readonly BookLevelDiffV1[] = [],
): BookApplyResultV1 {
  return {
    accepted,
    statusReason,
    sequenceTransition: seq,
    referencePriceBefore: refBefore,
    referencePriceAfter: refAfter,
    levelDiffs,
  };
}

function buildSide(
  raw: readonly RawLvl[],
  side: Side,
  max: number,
): BookLevelV1[] {
  const deduped = new Map<number, number>();
  for (const [p, q] of raw) deduped.set(p, q);
  const lvls = Array.from(deduped.entries())
    .filter(([, q]) => q > 0)
    .map(([p, q]) => mkLvl(p, q))
    .sort((a, b) => (side === "bid" ? b.price - a.price : a.price - b.price));
  return lvls.length > max ? lvls.slice(0, max) : lvls;
}

function diffSide(
  prev: readonly BookLevelV1[],
  next: readonly BookLevelV1[],
  s: Side,
) {
  const pm = new Map(prev.map((l) => [l.price, l.quantity]));
  const seen = new Set<number>();
  const out: BookLevelDiffV1[] = [];
  for (const l of next) {
    seen.add(l.price);
    const pq = pm.get(l.price) ?? 0;
    if (pq !== l.quantity) out.push(mkDiff(s, l.price, pq, l.quantity));
  }
  for (const l of prev) {
    if (!seen.has(l.price)) out.push(mkDiff(s, l.price, l.quantity, 0));
  }
  return out;
}

function sumLvls(
  lvls: readonly BookLevelV1[],
  fn: (l: BookLevelV1, i: number) => boolean,
) {
  let q = 0,
    n = 0,
    count = 0;
  for (let i = 0; i < lvls.length; i++) {
    const l = lvls[i]!;
    if (fn(l, i)) {
      q += l.quantity;
      n += l.quoteNotional;
      count++;
    }
  }
  return { qty: roundDecimal(q), notional: roundDecimal(n), count };
}

function calcImb(
  b: { qty: number; notional: number },
  a: { qty: number; notional: number },
) {
  const qr = safeDivide(b.qty - a.qty, b.qty + a.qty);
  const nr = safeDivide(b.notional - a.notional, b.notional + a.notional);
  const quantityImbalance = qr === null ? null : roundDecimal(qr, 6);
  const notionalImbalance = nr === null ? null : roundDecimal(nr, 6);
  const nums = {
    bidQuantity: b.qty,
    askQuantity: a.qty,
    bidNotional: b.notional,
    askNotional: a.notional,
  };
  return { ...nums, quantityImbalance, notionalImbalance };
}

export class OrderBookEngine {
  private readonly cfg: FlowEngineConfigV1;
  private bids: BookLevelV1[] = [];
  private asks: BookLevelV1[] = [];
  private valid = false;
  private reason: BookStatusReason = "awaiting-snapshot";
  private lastUpdMs: number | null = null;
  private lastRecMs: number | null = null;
  private lastSeq: Seq = null;

  public constructor(
    config: FlowEngineConfigV1 = DEFAULT_FLOW_ENGINE_CONFIG_V1,
  ) {
    this.cfg = config;
  }

  private invalidate(reason: BookStatusReason): void {
    this.bids = [];
    this.asks = [];
    this.valid = false;
    this.reason = reason;
  }

  public reset(): void {
    this.invalidate("awaiting-snapshot");
    this.lastUpdMs = null;
    this.lastRecMs = null;
    this.lastSeq = null;
  }

  public markSequenceGap(): void {
    this.invalidate("sequence-gap");
  }

  public getMidPrice(): number | null {
    return this.valid && this.bids.length && this.asks.length
      ? roundDecimal((this.bids[0]!.price + this.asks[0]!.price) / 2)
      : null;
  }

  public applyL2BookEvent(event: MarketEventV1): BookApplyResultV1 {
    const refBefore = this.getMidPrice();
    const p = parseBookPayload(event);
    if (!p) {
      this.invalidate("malformed-book");
      return mkRes(
        false,
        "malformed-book",
        mkSeq("opaque-unorderable", this.lastSeq, null),
        refBefore,
      );
    }
    const t = resolveEffectiveTime(event);
    return p.updateType === "snapshot"
      ? this.onSnapshot(p, t, refBefore)
      : this.onDelta(p, t, refBefore);
  }

  private finalize(
    seqEval: SequenceTransitionEvaluation,
    refBefore: number | null,
    diffs: readonly BookLevelDiffV1[],
  ): BookApplyResultV1 {
    if (!this.bids.length || !this.asks.length) {
      this.invalidate("empty-book");
      return mkRes(false, "empty-book", seqEval, refBefore);
    }
    if (this.bids[0]!.price >= this.asks[0]!.price) {
      this.invalidate("crossed-book");
      return mkRes(false, "crossed-book", seqEval, refBefore);
    }
    this.valid = true;
    this.reason = "ok";
    return mkRes(true, "ok", seqEval, refBefore, this.getMidPrice(), diffs);
  }

  private onSnapshot(
    p: ParsedPayload,
    t: EffectiveTimeResolution,
    refBefore: number | null,
  ) {
    const seqEval = mkSeq("initial", this.lastSeq, p.sequence);
    const hadValid = this.valid,
      prevB = this.bids,
      prevA = this.asks;
    this.lastSeq = p.sequence;
    this.lastUpdMs = t.featureTimestampMs;
    this.lastRecMs = t.receiptTimestampMs;
    const max = this.cfg.maxBookLevelsPerSide;
    this.bids = buildSide(p.bids, "bid", max);
    this.asks = buildSide(p.asks, "ask", max);
    const diffs = hadValid
      ? [
          ...diffSide(prevB, this.bids, "bid"),
          ...diffSide(prevA, this.asks, "ask"),
        ]
      : [];
    return this.finalize(seqEval, refBefore, diffs);
  }

  private onDelta(
    p: ParsedPayload,
    t: EffectiveTimeResolution,
    refBefore: number | null,
  ) {
    if (!this.valid) {
      const r = this.reason === "ok" ? "awaiting-snapshot" : this.reason;
      return mkRes(
        false,
        r,
        evaluateSequenceTransition(
          this.lastSeq,
          p.sequence,
          p.previousSequence,
        ),
        refBefore,
      );
    }
    let seqEval: SequenceTransitionEvaluation;
    if (p.previousSequence !== undefined && p.previousSequence !== null) {
      seqEval = evaluateSequenceTransition(
        this.lastSeq,
        p.sequence,
        p.previousSequence,
      );
      if (seqEval.kind === "duplicate" || seqEval.kind === "out-of-order") {
        return mkRes(false, this.reason, seqEval, refBefore, refBefore);
      }
      if (seqEval.kind === "gap") {
        this.markSequenceGap();
        return mkRes(false, "sequence-gap", seqEval, refBefore);
      }
    } else {
      const isDup = areSequencesEqual(this.lastSeq, p.sequence);
      const isNum =
        typeof this.lastSeq === "number" && typeof p.sequence === "number";
      const isOoo = isNum && (p.sequence as number) < (this.lastSeq as number);
      if (isDup || isOoo) {
        return mkRes(
          false,
          this.reason,
          mkSeq(isDup ? "duplicate" : "out-of-order", this.lastSeq, p.sequence),
          refBefore,
          refBefore,
        );
      }
      const k: SequenceTransitionKind = isNum
        ? "contiguous"
        : this.lastSeq === null
          ? "initial"
          : "opaque-unorderable";
      seqEval = mkSeq(k, this.lastSeq, p.sequence);
    }
    this.lastSeq = p.sequence;
    this.lastUpdMs = t.featureTimestampMs;
    this.lastRecMs = t.receiptTimestampMs;
    const diffs: BookLevelDiffV1[] = [];
    this.applySide(this.bids, p.bids, "bid", diffs);
    this.applySide(this.asks, p.asks, "ask", diffs);
    return this.finalize(seqEval, refBefore, diffs);
  }

  private applySide(
    lvls: BookLevelV1[],
    upds: readonly RawLvl[],
    side: Side,
    diffs: BookLevelDiffV1[],
  ): void {
    for (const [price, nq] of upds) {
      const { found, index } = findIdx(lvls, price, side);
      const pq = found ? lvls[index]!.quantity : 0;
      if (nq === 0) {
        if (found) lvls.splice(index, 1);
      } else if (found) {
        lvls[index] = mkLvl(price, nq);
      } else {
        lvls.splice(index, 0, mkLvl(price, nq));
      }
      if (pq !== nq) diffs.push(mkDiff(side, price, pq, nq));
    }
    if (lvls.length > this.cfg.maxBookLevelsPerSide)
      lvls.length = this.cfg.maxBookLevelsPerSide;
  }

  public snapshot(
    asOfReceiptMs: number,
    opts?: BookSnapshotOptionsV1,
  ): OrderBookSnapshotV1 {
    const base = {
      lastUpdateTimestampMs: this.lastUpdMs,
      lastReceiptTimestampMs: this.lastRecMs,
      lastSequence: this.lastSeq,
    };
    if (
      !this.valid ||
      opts?.hasUnresolvedGap === true ||
      opts?.forceUnavailable === true
    ) {
      const statusReason: BookStatusReason =
        opts?.hasUnresolvedGap === true
          ? "sequence-gap"
          : this.reason === "ok"
            ? "awaiting-snapshot"
            : this.reason;
      const nulls = {
        bestBid: null,
        bestAsk: null,
        midPrice: null,
        spreadAmount: null,
        spreadBps: null,
        microprice: null,
      };
      const zeros = {
        retainedBidLevels: 0,
        retainedAskLevels: 0,
        bookCoverageRatio: 0,
      };
      return {
        availability: "unavailable",
        statusReason,
        ...base,
        ...nulls,
        ...zeros,
        topNImbalances: [],
        bpsBandImbalances: [],
      };
    }

    const bestBid = this.bids[0]!,
      bestAsk = this.asks[0]!;
    const midPrice = roundDecimal((bestBid.price + bestAsk.price) / 2);
    const spreadAmount = roundDecimal(bestAsk.price - bestBid.price);
    const spreadBps = roundDecimal(
      (spreadAmount / midPrice) * BASIS_POINTS_SCALE,
      6,
    );
    const microNum =
      bestBid.price * bestAsk.quantity + bestAsk.price * bestBid.quantity;
    const microprice = roundDecimal(
      microNum / (bestBid.quantity + bestAsk.quantity),
    );
    const retainedBidLevels = this.bids.length,
      retainedAskLevels = this.asks.length;
    const minRet = Math.min(retainedBidLevels, retainedAskLevels);
    const bookCoverageRatio = roundDecimal(
      Math.min(1, minRet / this.cfg.expectedBookDepthForFullCoverage),
      6,
    );

    const topNImbalances: TopNImbalanceV1[] = this.cfg.topNDepths.map(
      (depthN) => {
        const b = sumLvls(this.bids, (_, i) => i < depthN),
          a = sumLvls(this.asks, (_, i) => i < depthN);
        const cov = roundDecimal(
          Math.min(1, Math.min(b.count, a.count) / depthN),
          6,
        );
        return {
          depthN,
          ...calcImb(b, a),
          availableBidLevels: b.count,
          availableAskLevels: a.count,
          coverageRatio: cov,
        };
      },
    );

    const bpsBandImbalances: BpsBandImbalanceV1[] = this.cfg.bpsBands.map(
      (bandBps) => {
        const inB = (l: BookLevelV1) => {
          const d = computeAbsoluteBpsDistance(l.price, midPrice, midPrice);
          return d !== null && d <= bandBps;
        };
        const b = sumLvls(this.bids, inB),
          a = sumLvls(this.asks, inB);
        return {
          bandBps,
          ...calcImb(b, a),
          includedBidLevels: b.count,
          includedAskLevels: a.count,
        };
      },
    );

    const stale =
      opts?.isStale === true ||
      (this.lastRecMs !== null &&
        asOfReceiptMs - this.lastRecMs > this.cfg.bookStaleThresholdMs);
    const trunc = bookCoverageRatio < this.cfg.minBookCoverageRatio;
    const availability: FeatureAvailability =
      stale || trunc ? "degraded" : "available";
    const statusReason: BookStatusReason = stale
      ? "stale-book"
      : trunc
        ? "truncated-depth"
        : "ok";
    const prices = {
      bestBid,
      bestAsk,
      midPrice,
      spreadAmount,
      spreadBps,
      microprice,
    };
    const counts = {
      retainedBidLevels,
      retainedAskLevels,
      bookCoverageRatio,
      topNImbalances,
      bpsBandImbalances,
    };
    return { availability, statusReason, ...base, ...prices, ...counts };
  }
}
