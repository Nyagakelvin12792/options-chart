import { describe, expect, it } from "vitest";

import { layoutCollisionItems } from "./gamma-overlay-layout";

describe("level rail collision layout", () => {
  it("keeps priority at the true coordinate and offsets lower-priority tags", () => {
    const result = layoutCollisionItems(
      [
        { id: "gamma", trueY: 200, priority: 1 },
        { id: "call", trueY: 202, priority: 2 },
        { id: "gex", trueY: 204, priority: 4 },
      ],
      600,
    );

    expect(result.find(({ id }) => id === "gamma")?.displayY).toBe(200);
    expect(result.find(({ id }) => id === "call")?.shifted).toBe(true);
    expect(result.find(({ id }) => id === "gex")?.shifted).toBe(true);
    expect(new Set(result.map(({ displayY }) => displayY)).size).toBe(3);
  });

  it("keeps every tag within chart bounds", () => {
    const result = layoutCollisionItems(
      [
        { id: "top", trueY: -20, priority: 1 },
        { id: "bottom", trueY: 900, priority: 2 },
      ],
      500,
    );

    expect(
      result.every(({ displayY }) => displayY >= 17 && displayY <= 483),
    ).toBe(true);
  });
});
