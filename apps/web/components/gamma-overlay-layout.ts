export interface CollisionItem {
  readonly id: string;
  readonly trueY: number;
  readonly priority: number;
}

export interface CollisionPlacement extends CollisionItem {
  readonly displayY: number;
  readonly shifted: boolean;
}

const TAG_HEIGHT = 26;
const TAG_GAP = 4;

export const layoutCollisionItems = (
  items: readonly CollisionItem[],
  height: number,
): readonly CollisionPlacement[] => {
  const half = TAG_HEIGHT / 2;
  const minimumY = half + 4;
  const maximumY = Math.max(minimumY, height - half - 4);
  const placed: CollisionPlacement[] = [];
  const collides = (candidate: number): boolean =>
    placed.some(
      ({ displayY }) => Math.abs(displayY - candidate) < TAG_HEIGHT + TAG_GAP,
    );

  for (const item of [...items].sort(
    (left, right) => left.priority - right.priority || left.trueY - right.trueY,
  )) {
    const preferred = Math.min(Math.max(item.trueY, minimumY), maximumY);
    const candidates = [preferred];
    for (let step = 1; step <= items.length; step += 1) {
      const distance = step * (TAG_HEIGHT + TAG_GAP);
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
    });
  }

  return placed.sort((left, right) => left.displayY - right.displayY);
};
