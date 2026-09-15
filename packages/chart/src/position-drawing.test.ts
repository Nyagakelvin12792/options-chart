import { describe, expect, it } from "vitest";

import {
  createPositionDrawing,
  isPositionDrawingOrderValid,
  movePositionDrawingLevel,
  positionRewardRiskRatio,
} from "./position-drawing";

describe("position drawing", () => {
  it.each(["long", "short"] as const)(
    "creates a valid %s position with a two-to-one target",
    (direction) => {
      const drawing = createPositionDrawing({
        id: direction,
        direction,
        entry: 60_000,
        createdAt: 1,
      });

      expect(isPositionDrawingOrderValid(drawing)).toBe(true);
      expect(positionRewardRiskRatio(drawing)).toBeCloseTo(2);
    },
  );

  it("clamps dragged levels without inverting a position", () => {
    const drawing = createPositionDrawing({
      id: "long",
      direction: "long",
      entry: 60_000,
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
