import { describe, expect, it } from "vitest";

import {
  createPositionDrawing,
  createPositionFromGesture,
  isPositionDrawingOrderValid,
  moveCompletePositionRange,
  movePositionDrawingLevel,
  movePositionTimeBoundary,
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

  describe("createPositionFromGesture", () => {
    it("creates a long position with explicit stop and exact configured R:R target", () => {
      const position = createPositionFromGesture({
        id: "pos-long-stop",
        direction: "long",
        entryPrice: 100,
        currentPrice: 90,
        fromTimestamp: 1_000,
        toTimestamp: 2_000,
        defaultRewardRiskRatio: 2.5,
      });

      expect(position).not.toBeNull();
      expect(position?.direction).toBe("long");
      expect(position?.entry).toBe(100);
      expect(position?.stopLoss).toBe(90);
      // Risk = 10, Target = 100 + 10 * 2.5 = 125
      expect(position?.takeProfit).toBe(125);
      expect(positionRewardRiskRatio(position!)).toBeCloseTo(2.5);
      expect(isPositionDrawingOrderValid(position!)).toBe(true);
    });

    it("creates a long position with explicit target and exact configured R:R stop", () => {
      const position = createPositionFromGesture({
        id: "pos-long-target",
        direction: "long",
        entryPrice: 100,
        currentPrice: 130,
        fromTimestamp: 1_000,
        toTimestamp: 2_000,
        defaultRewardRiskRatio: 3,
      });

      expect(position).not.toBeNull();
      expect(position?.direction).toBe("long");
      expect(position?.entry).toBe(100);
      expect(position?.takeProfit).toBe(130);
      // Reward = 30, Risk = 30 / 3 = 10, Stop = 100 - 10 = 90
      expect(position?.stopLoss).toBe(90);
      expect(positionRewardRiskRatio(position!)).toBeCloseTo(3);
      expect(isPositionDrawingOrderValid(position!)).toBe(true);
    });

    it("creates a short position with explicit stop and explicit target", () => {
      // Explicit stop (dragging above entry)
      const stopPosition = createPositionFromGesture({
        id: "pos-short-stop",
        direction: "short",
        entryPrice: 100,
        currentPrice: 110,
        fromTimestamp: 1_000,
        toTimestamp: 2_000,
        defaultRewardRiskRatio: 2,
      });

      expect(stopPosition).not.toBeNull();
      expect(stopPosition?.direction).toBe("short");
      expect(stopPosition?.entry).toBe(100);
      expect(stopPosition?.stopLoss).toBe(110);
      // Risk = 10, Target = 100 - 10 * 2 = 80
      expect(stopPosition?.takeProfit).toBe(80);
      expect(positionRewardRiskRatio(stopPosition!)).toBeCloseTo(2);
      expect(isPositionDrawingOrderValid(stopPosition!)).toBe(true);

      // Explicit target (dragging below entry)
      const targetPosition = createPositionFromGesture({
        id: "pos-short-target",
        direction: "short",
        entryPrice: 100,
        currentPrice: 70,
        fromTimestamp: 1_000,
        toTimestamp: 2_000,
        defaultRewardRiskRatio: 3,
      });

      expect(targetPosition).not.toBeNull();
      expect(targetPosition?.direction).toBe("short");
      expect(targetPosition?.entry).toBe(100);
      expect(targetPosition?.takeProfit).toBe(70);
      // Reward = 30, Risk = 30 / 3 = 10, Stop = 100 + 10 = 110
      expect(targetPosition?.stopLoss).toBe(110);
      expect(positionRewardRiskRatio(targetPosition!)).toBeCloseTo(3);
      expect(isPositionDrawingOrderValid(targetPosition!)).toBe(true);
    });

    it("rejects zero-height and min price gap gestures by returning null", () => {
      // Identical entry and current price (zero height)
      expect(
        createPositionFromGesture({
          id: "zero-height",
          direction: "long",
          entryPrice: 100,
          currentPrice: 100,
          fromTimestamp: 1_000,
          toTimestamp: 2_000,
          defaultRewardRiskRatio: 2,
        }),
      ).toBeNull();

      // Sub-minimum price gap (minGap is Math.max(100 * 1e-5, 1e-4) = 0.001)
      expect(
        createPositionFromGesture({
          id: "sub-min-gap",
          direction: "long",
          entryPrice: 100,
          currentPrice: 100.0001,
          fromTimestamp: 1_000,
          toTimestamp: 2_000,
          defaultRewardRiskRatio: 2,
        }),
      ).toBeNull();

      // Non-finite values or non-positive ratio
      expect(
        createPositionFromGesture({
          id: "invalid-ratio",
          direction: "long",
          entryPrice: 100,
          currentPrice: 90,
          fromTimestamp: 1_000,
          toTimestamp: 2_000,
          defaultRewardRiskRatio: 0,
        }),
      ).toBeNull();
    });

    it("normalizes reverse horizontal drag timestamps so fromTimestamp <= toTimestamp", () => {
      const position = createPositionFromGesture({
        id: "reverse-drag",
        direction: "long",
        entryPrice: 100,
        currentPrice: 90,
        fromTimestamp: 5_000,
        toTimestamp: 1_000,
        defaultRewardRiskRatio: 2,
      });

      expect(position).not.toBeNull();
      expect(position!.fromTimestamp).toBe(1_000);
      expect(position!.toTimestamp).toBe(5_000);
      expect(position!.fromTimestamp!).toBeLessThanOrEqual(position!.toTimestamp!);
    });
  });

  describe("time boundary and range movement", () => {
    it("moves left boundary (fromTimestamp) and normalizes if dragged past right boundary", () => {
      const drawing = createPositionDrawing({
        id: "test-pos",
        direction: "long",
        entry: 100,
        stopLoss: 90,
        takeProfit: 120,
        createdAt: 1,
        fromTimestamp: 1_000,
        toTimestamp: 2_000,
      });

      // Move left boundary further left
      const movedLeft = movePositionTimeBoundary(drawing, "fromTimestamp", 500);
      expect(movedLeft.fromTimestamp).toBe(500);
      expect(movedLeft.toTimestamp).toBe(2_000);

      // Move left boundary past right boundary -> normalizes so from <= to
      const movedPast = movePositionTimeBoundary(drawing, "fromTimestamp", 3_000);
      expect(movedPast.fromTimestamp).toBe(2_000);
      expect(movedPast.toTimestamp).toBe(3_000);
    });

    it("moves right boundary (toTimestamp) and normalizes if dragged past left boundary", () => {
      const drawing = createPositionDrawing({
        id: "test-pos",
        direction: "long",
        entry: 100,
        stopLoss: 90,
        takeProfit: 120,
        createdAt: 1,
        fromTimestamp: 1_000,
        toTimestamp: 2_000,
      });

      // Move right boundary further right
      const movedRight = movePositionTimeBoundary(drawing, "toTimestamp", 3_000);
      expect(movedRight.fromTimestamp).toBe(1_000);
      expect(movedRight.toTimestamp).toBe(3_000);

      // Move right boundary before left boundary -> normalizes so from <= to
      const movedBefore = movePositionTimeBoundary(drawing, "toTimestamp", 500);
      expect(movedBefore.fromTimestamp).toBe(500);
      expect(movedBefore.toTimestamp).toBe(1_000);
    });

    it("moves complete position range while preserving duration", () => {
      const drawing = createPositionDrawing({
        id: "test-pos",
        direction: "long",
        entry: 100,
        stopLoss: 90,
        takeProfit: 120,
        createdAt: 1,
        fromTimestamp: 1_000,
        toTimestamp: 3_000,
      });
      const originalDuration = drawing.toTimestamp! - drawing.fromTimestamp!;

      const shifted = moveCompletePositionRange(drawing, 2_500);
      expect(shifted.fromTimestamp).toBe(3_500);
      expect(shifted.toTimestamp).toBe(5_500);
      expect(shifted.toTimestamp! - shifted.fromTimestamp!).toBe(originalDuration);

      const shiftedBack = moveCompletePositionRange(shifted, -1_500);
      expect(shiftedBack.fromTimestamp).toBe(2_000);
      expect(shiftedBack.toTimestamp).toBe(4_000);
      expect(shiftedBack.toTimestamp! - shiftedBack.fromTimestamp!).toBe(originalDuration);
    });
  });

  describe("isPositionDrawingOrderValid", () => {
    it("rejects inverted levels for long positions", () => {
      // stopLoss above entry
      expect(
        isPositionDrawingOrderValid(
          createPositionDrawing({
            id: "inverted-long-stop",
            direction: "long",
            entry: 100,
            stopLoss: 105,
            takeProfit: 120,
            createdAt: 1,
          }),
        ),
      ).toBe(false);

      // takeProfit below entry
      expect(
        isPositionDrawingOrderValid(
          createPositionDrawing({
            id: "inverted-long-target",
            direction: "long",
            entry: 100,
            stopLoss: 90,
            takeProfit: 95,
            createdAt: 1,
          }),
        ),
      ).toBe(false);

      // entry equal to stopLoss or takeProfit
      expect(
        isPositionDrawingOrderValid(
          createPositionDrawing({
            id: "equal-long-stop",
            direction: "long",
            entry: 100,
            stopLoss: 100,
            takeProfit: 120,
            createdAt: 1,
          }),
        ),
      ).toBe(false);
    });

    it("rejects inverted levels for short positions", () => {
      // stopLoss below entry
      expect(
        isPositionDrawingOrderValid(
          createPositionDrawing({
            id: "inverted-short-stop",
            direction: "short",
            entry: 100,
            stopLoss: 95,
            takeProfit: 80,
            createdAt: 1,
          }),
        ),
      ).toBe(false);

      // takeProfit above entry
      expect(
        isPositionDrawingOrderValid(
          createPositionDrawing({
            id: "inverted-short-target",
            direction: "short",
            entry: 100,
            stopLoss: 110,
            takeProfit: 105,
            createdAt: 1,
          }),
        ),
      ).toBe(false);

      // entry equal to stopLoss or takeProfit
      expect(
        isPositionDrawingOrderValid(
          createPositionDrawing({
            id: "equal-short-stop",
            direction: "short",
            entry: 100,
            stopLoss: 100,
            takeProfit: 80,
            createdAt: 1,
          }),
        ),
      ).toBe(false);
    });
  });
});
