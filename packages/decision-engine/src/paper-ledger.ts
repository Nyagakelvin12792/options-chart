import { z } from "zod";

const finite = z.number().refine(Number.isFinite, "must be finite");

export const PaperOrderV1Schema = z.strictObject({
  orderId: z.string().min(1),
  side: z.enum(["long", "short"]),
  quantityBtc: finite.positive(),
  entryPrice: finite.positive(),
  stopPrice: finite.positive(),
  targetPrice: finite.positive(),
  feeBps: finite.nonnegative(),
  slippageBps: finite.nonnegative(),
});
export type PaperOrderV1 = z.infer<typeof PaperOrderV1Schema>;

export const PaperBarV1Schema = z.strictObject({
  openTime: z.number().int().nonnegative(),
  high: finite.positive(),
  low: finite.positive(),
  close: finite.positive(),
  availableLiquidityBtc: finite.nonnegative(),
});
export type PaperBarV1 = z.infer<typeof PaperBarV1Schema>;

export interface PaperLedgerEntryV1 {
  readonly orderId: string;
  readonly status: "unfilled" | "partial" | "filled";
  readonly filledQuantityBtc: number;
  readonly entryFillPrice: number | null;
  readonly exitFillPrice: number | null;
  readonly exitReason: "stop" | "target" | "horizon" | null;
  readonly grossPnlUsd: number;
  readonly feesUsd: number;
  readonly netPnlUsd: number;
}

/** Conservative bar fill: 25% liquidity cap and stop-first same-bar ordering. */
export function simulateConservativePaperOrder(
  rawOrder: PaperOrderV1,
  rawBars: readonly PaperBarV1[],
): PaperLedgerEntryV1 {
  const order = PaperOrderV1Schema.parse(rawOrder);
  const bars = rawBars.map((bar) => PaperBarV1Schema.parse(bar));
  const entryBar = bars.find(
    (bar) => bar.low <= order.entryPrice && bar.high >= order.entryPrice,
  );
  if (!entryBar) {
    return {
      orderId: order.orderId,
      status: "unfilled",
      filledQuantityBtc: 0,
      entryFillPrice: null,
      exitFillPrice: null,
      exitReason: null,
      grossPnlUsd: 0,
      feesUsd: 0,
      netPnlUsd: 0,
    };
  }

  const filledQuantityBtc = Math.min(
    order.quantityBtc,
    entryBar.availableLiquidityBtc * 0.25,
  );
  const status =
    filledQuantityBtc < order.quantityBtc ? "partial" : "filled";
  const side = order.side === "long" ? 1 : -1;
  const slippage = order.slippageBps / 10_000;
  const entryFillPrice = order.entryPrice * (1 + side * slippage);
  const entryIndex = bars.indexOf(entryBar);
  let exitReason: PaperLedgerEntryV1["exitReason"] = "horizon";
  let exitPrice = bars.at(-1)?.close ?? entryFillPrice;

  for (const bar of bars.slice(entryIndex)) {
    const stopHit =
      order.side === "long" ? bar.low <= order.stopPrice : bar.high >= order.stopPrice;
    const targetHit =
      order.side === "long"
        ? bar.high >= order.targetPrice
        : bar.low <= order.targetPrice;
    if (stopHit) {
      exitReason = "stop";
      exitPrice = order.stopPrice;
      break;
    }
    if (targetHit) {
      exitReason = "target";
      exitPrice = order.targetPrice;
      break;
    }
  }

  const exitFillPrice = exitPrice * (1 - side * slippage);
  const grossPnlUsd =
    (exitFillPrice - entryFillPrice) * filledQuantityBtc * side;
  const feesUsd =
    (entryFillPrice + exitFillPrice) *
    filledQuantityBtc *
    (order.feeBps / 10_000);
  return {
    orderId: order.orderId,
    status,
    filledQuantityBtc,
    entryFillPrice,
    exitFillPrice,
    exitReason,
    grossPnlUsd,
    feesUsd,
    netPnlUsd: grossPnlUsd - feesUsd,
  };
}
