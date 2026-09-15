import { describe, expect, it } from "vitest";

import {
  getLevelPriority,
  layoutCollisionItems,
  TAG_GAP,
  TAG_HEIGHT,
} from "./level-rail-layout";

describe("level-rail-layout", () => {
  describe("getLevelPriority", () => {
    it("assigns priority strictly matching: SPOT (0) -> Walls (1) -> Flip/Pain (2) -> Secondary (3)", () => {
      expect(getLevelPriority("spot")).toBe(0);
      expect(getLevelPriority("current-price")).toBe(0);
      expect(getLevelPriority("call-wall")).toBe(1);
      expect(getLevelPriority("put-wall")).toBe(1);
      expect(getLevelPriority("gamma-flip")).toBe(2);
      expect(getLevelPriority("max-pain")).toBe(2);
      expect(getLevelPriority("secondary-gex")).toBe(3);
    });
  });

  describe("layoutCollisionItems", () => {
    it("returns empty array for empty items", () => {
      expect(layoutCollisionItems([], 500)).toEqual([]);
    });

    it("positions a single item at its true coordinate clamped to boundary", () => {
      const single = layoutCollisionItems(
        [{ id: "spot", trueY: 250, priority: 0 }],
        600,
      );
      expect(single).toHaveLength(1);
      expect(single[0]?.displayY).toBe(250);
      expect(single[0]?.shifted).toBe(false);
    });

    it("prioritizes higher-priority levels at exact coordinates and pushes lower-priority levels away", () => {
      const items = [
        { id: "secondary", trueY: 300, priority: 3 },
        { id: "spot", trueY: 300, priority: 0 },
        { id: "call-wall", trueY: 301, priority: 1 },
        { id: "gamma-flip", trueY: 302, priority: 2 },
      ];

      const placements = layoutCollisionItems(items, 800);
      expect(placements).toHaveLength(4);

      // Spot should be exactly at 300
      const spot = placements.find((p) => p.id === "spot");
      expect(spot?.displayY).toBe(300);
      expect(spot?.shifted).toBe(false);

      // Call wall should have displaced secondary or gamma flip
      const call = placements.find((p) => p.id === "call-wall");
      expect(call?.shifted).toBe(true);

      // Ensure all 4 placements have at least (TAG_HEIGHT + TAG_GAP) separation
      for (let i = 0; i < placements.length - 1; i += 1) {
        const diff = (placements[i + 1]?.displayY ?? 0) - (placements[i]?.displayY ?? 0);
        expect(diff).toBeGreaterThanOrEqual(TAG_HEIGHT + TAG_GAP - 0.01);
      }
    });

    it("strictly clamps all tags within chart bounds", () => {
      const placements = layoutCollisionItems(
        [
          { id: "far-above", trueY: -500, priority: 1 },
          { id: "near-top", trueY: 0, priority: 2 },
          { id: "near-bottom", trueY: 600, priority: 2 },
          { id: "far-below", trueY: 1500, priority: 1 },
        ],
        600,
      );

      expect(placements).toHaveLength(4);
      for (const placement of placements) {
        expect(placement.displayY).toBeGreaterThanOrEqual(TAG_HEIGHT / 2 + 4);
        expect(placement.displayY).toBeLessThanOrEqual(600 - TAG_HEIGHT / 2 - 4);
      }
    });
  });
});
