import { describe, expect, it } from "vitest";

import {
  createPositionDrawing,
  isPositionDrawingOrderValid,
  movePositionDrawingLevel,
  positionRewardRiskRatio,
} from "./position-drawing";

describe("position drawing", () => {
  it.each(["long", "short"] as const)(
    "preserves user-selected levels for a %s position",
    (direction) => {
      const stopLoss = direction === "long" ? 59_500 : 60_500;
      const takeProfit = direction === "long" ? 61_250 : 58_750;
      const drawing = createPositionDrawing({
        id: direction,
        direction,
        entry: 60_000,
        stopLoss,
        takeProfit,
        createdAt: 1,
      });

      expect(isPositionDrawingOrderValid(drawing)).toBe(true);
      expect(drawing.stopLoss).toBe(stopLoss);
      expect(drawing.takeProfit).toBe(takeProfit);
      expect(positionRewardRiskRatio(drawing)).toBeCloseTo(2.5);
    },
  );

  it("clamps dragged levels without inverting a position", () => {
    const drawing = createPositionDrawing({
      id: "long",
      direction: "long",
      entry: 60_000,
      stopLoss: 59_500,
      takeProfit: 61_000,
      createdAt: 1,
    });
    const movedStop = movePositionDrawingLevel(drawing, "stopLoss", 70_000);
    const movedTarget = movePositionDrawingLevel(
      movedStop,
      "takeProfit",
      50_000,
    );

    expect(isPositionDrawingOrderValid(movedStop)).toBe(true);
    expect(isPositionDrawingOrderValid(movedTarget)).toBe(true);
  });
});
