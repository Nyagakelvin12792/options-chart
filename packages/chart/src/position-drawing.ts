import type { PositionDirection, PositionDrawing } from "./chart-adapter";

export type PositionDrawingLevel = "entry" | "stopLoss" | "takeProfit";

const MINIMUM_ABSOLUTE_GAP = 1e-8;

const requestedGap = (drawing: PositionDrawing): number =>
  Math.max(
    Math.abs(drawing.entry),
    Math.abs(drawing.stopLoss),
    Math.abs(drawing.takeProfit),
    1,
  ) * 1e-6;

const boundedGap = (drawing: PositionDrawing): number =>
  Math.max(
    MINIMUM_ABSOLUTE_GAP,
    Math.min(
      requestedGap(drawing),
      Math.abs(drawing.takeProfit - drawing.stopLoss) / 4,
    ),
  );

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);

export const isPositionDrawingOrderValid = (
  drawing: PositionDrawing,
): boolean =>
  drawing.direction === "long"
    ? drawing.stopLoss < drawing.entry && drawing.entry < drawing.takeProfit
    : drawing.takeProfit < drawing.entry && drawing.entry < drawing.stopLoss;

export const createPositionDrawing = (options: {
  readonly id: string;
  readonly direction: PositionDirection;
  readonly entry: number;
  readonly stopLoss: number;
  readonly takeProfit: number;
  readonly createdAt: number;
  readonly fromTimestamp?: number;
  readonly toTimestamp?: number;
}): PositionDrawing => {
  return {
    ...options,
    type: "position",
  };
};

export const movePositionDrawingLevel = (
  drawing: PositionDrawing,
  level: PositionDrawingLevel,
  nextPrice: number,
): PositionDrawing => {
  if (!Number.isFinite(nextPrice)) return drawing;

  const gap = boundedGap(drawing);
  if (drawing.direction === "long") {
    if (level === "entry") {
      return {
        ...drawing,
        entry: clamp(
          nextPrice,
          drawing.stopLoss + gap,
          drawing.takeProfit - gap,
        ),
      };
    }
    if (level === "stopLoss") {
      return {
        ...drawing,
        stopLoss: Math.min(nextPrice, drawing.entry - gap),
      };
    }
    return {
      ...drawing,
      takeProfit: Math.max(nextPrice, drawing.entry + gap),
    };
  }

  if (level === "entry") {
    return {
      ...drawing,
      entry: clamp(nextPrice, drawing.takeProfit + gap, drawing.stopLoss - gap),
    };
  }
  if (level === "stopLoss") {
    return {
      ...drawing,
      stopLoss: Math.max(nextPrice, drawing.entry + gap),
    };
  }
  return {
    ...drawing,
    takeProfit: Math.min(nextPrice, drawing.entry - gap),
  };
};

export const positionRewardRiskRatio = (drawing: PositionDrawing): number =>
  Math.abs(drawing.takeProfit - drawing.entry) /
  Math.abs(drawing.entry - drawing.stopLoss);
