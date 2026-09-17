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

export const createPositionFromGesture = (options: {
  readonly id: string;
  readonly direction: PositionDirection;
  readonly entryPrice: number;
  readonly currentPrice: number;
  readonly fromTimestamp: number;
  readonly toTimestamp: number;
  readonly defaultRewardRiskRatio: number;
}): PositionDrawing | null => {
  if (
    !Number.isFinite(options.entryPrice) ||
    !Number.isFinite(options.currentPrice) ||
    !Number.isFinite(options.fromTimestamp) ||
    !Number.isFinite(options.toTimestamp) ||
    !Number.isFinite(options.defaultRewardRiskRatio) ||
    options.defaultRewardRiskRatio <= 0
  ) {
    return null;
  }

  const minGap = Math.max(Math.abs(options.entryPrice) * 1e-5, 1e-4);
  const priceDiff = Math.abs(options.currentPrice - options.entryPrice);
  if (priceDiff < minGap) {
    return null;
  }

  const ratio = options.defaultRewardRiskRatio;
  let stopLoss: number;
  let takeProfit: number;

  if (options.direction === "long") {
    if (options.currentPrice < options.entryPrice) {
      // Dragging below entry explicitly sets stop
      stopLoss = options.currentPrice;
      takeProfit = options.entryPrice + (options.entryPrice - stopLoss) * ratio;
    } else {
      // Dragging above entry explicitly sets target
      takeProfit = options.currentPrice;
      stopLoss = options.entryPrice - (takeProfit - options.entryPrice) / ratio;
    }
  } else {
    if (options.currentPrice > options.entryPrice) {
      // Dragging above entry explicitly sets stop
      stopLoss = options.currentPrice;
      takeProfit = options.entryPrice - (stopLoss - options.entryPrice) * ratio;
    } else {
      // Dragging below entry explicitly sets target
      takeProfit = options.currentPrice;
      stopLoss = options.entryPrice + (options.entryPrice - options.currentPrice) / ratio;
    }
  }

  const from = Math.min(options.fromTimestamp, options.toTimestamp);
  const to = Math.max(options.fromTimestamp, options.toTimestamp);

  const drawing = createPositionDrawing({
    id: options.id,
    direction: options.direction,
    entry: options.entryPrice,
    stopLoss,
    takeProfit,
    createdAt: Date.now(),
    fromTimestamp: from,
    toTimestamp: to,
  });

  return isPositionDrawingOrderValid(drawing) ? drawing : null;
};

export const movePositionTimeBoundary = (
  drawing: PositionDrawing,
  boundary: "fromTimestamp" | "toTimestamp",
  nextTimestamp: number,
): PositionDrawing => {
  if (!Number.isFinite(nextTimestamp)) return drawing;
  const currentFrom = drawing.fromTimestamp ?? nextTimestamp;
  const currentTo = drawing.toTimestamp ?? nextTimestamp;
  if (boundary === "fromTimestamp") {
    return {
      ...drawing,
      fromTimestamp: Math.min(nextTimestamp, currentTo),
      toTimestamp: Math.max(nextTimestamp, currentTo),
    };
  }
  return {
    ...drawing,
    fromTimestamp: Math.min(currentFrom, nextTimestamp),
    toTimestamp: Math.max(currentFrom, nextTimestamp),
  };
};

export const moveCompletePositionRange = (
  drawing: PositionDrawing,
  deltaTimestamp: number,
): PositionDrawing => {
  if (!Number.isFinite(deltaTimestamp) || deltaTimestamp === 0) return drawing;
  const from = (drawing.fromTimestamp ?? 0) + deltaTimestamp;
  const to = (drawing.toTimestamp ?? 0) + deltaTimestamp;
  return {
    ...drawing,
    fromTimestamp: from,
    toTimestamp: to,
  };
};
