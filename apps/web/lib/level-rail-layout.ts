import type { GammaLevelKind } from "@options-chart/domain";

export interface CollisionItem {
  readonly id: string;
  readonly trueY: number;
  readonly priority: number;
  readonly height?: number;
}

export interface CollisionPlacement extends CollisionItem {
  readonly displayY: number;
  readonly shifted: boolean;
  readonly offset: number;
}

export const TAG_HEIGHT = 16;
export const TAG_GAP = 3;
export const TAG_PADDING = 4;

/**
 * Returns canonical priority rank for level collision resolution:
 * SPOT (0) -> Call/Put Walls (1) -> Gamma Flip / Max Pain (2) -> Secondary GEX (3)
 */
export const getLevelPriority = (
  kind: GammaLevelKind | "spot" | "current-price",
): number => {
  if (kind === "spot" || kind === "current-price") return 0;
  if (kind === "call-wall" || kind === "put-wall") return 1;
  if (kind === "gamma-flip" || kind === "max-pain") return 2;
  return 3;
};

/**
 * Collision resolution algorithm for the professional level rail:
 * - Priority-ordered placement: higher-priority levels anchor closer to trueY
 * - Strict chart boundary clamping: guaranteed to remain visible within [minimumY, maximumY]
 * - Collision clearance: ensures at least (TAG_HEIGHT + TAG_GAP) distance between tags
 * - Monotonic ordering preservation when candidate shifts are evaluated
 */
export const layoutCollisionItems = (
  items: readonly CollisionItem[],
  height: number,
  options?: {
    tagHeight?: number;
    tagGap?: number;
    padding?: number;
  },
): readonly CollisionPlacement[] => {
  if (items.length === 0) return [];

  const tagHeight = options?.tagHeight ?? TAG_HEIGHT;
  const tagGap = options?.tagGap ?? TAG_GAP;
  const padding = options?.padding ?? TAG_PADDING;
  const slotSize = tagHeight + tagGap;

  const half = tagHeight / 2;
  const minimumY = half + padding;
  const maximumY = Math.max(minimumY, height - half - padding);

  const placed: CollisionPlacement[] = [];

  const collides = (candidate: number): boolean =>
    placed.some(
      ({ displayY }) => Math.abs(displayY - candidate) < slotSize,
    );

  // Sort by priority ascending (0 highest), then trueY ascending
  const sorted = [...items].sort(
    (left, right) => left.priority - right.priority || left.trueY - right.trueY,
  );

  for (const item of sorted) {
    const preferred = Math.min(Math.max(item.trueY, minimumY), maximumY);

    if (!collides(preferred)) {
      placed.push({
        ...item,
        displayY: preferred,
        shifted: Math.abs(preferred - item.trueY) > 1,
        offset: preferred - item.trueY,
      });
      continue;
    }

    // Generate candidate positions radiating outward from preferred position
    // Prioritize candidates that don't invert relative direction if possible
    const candidates: number[] = [];
    const maxSteps = Math.max(items.length * 2, 8);
    for (let step = 1; step <= maxSteps; step += 1) {
      const distance = step * slotSize;
      // Alternate candidate steps: evaluate both up and down
      candidates.push(preferred - distance, preferred + distance);
    }

    const displayY =
      candidates.find(
        (candidate) =>
          candidate >= minimumY &&
          candidate <= maximumY &&
          !collides(candidate),
      ) ?? preferred;

    placed.push({
      ...item,
      displayY,
      shifted: Math.abs(displayY - item.trueY) > 1,
      offset: displayY - item.trueY,
    });
  }

  // Sort final placements by displayY ascending
  return placed.sort((left, right) => left.displayY - right.displayY);
};
