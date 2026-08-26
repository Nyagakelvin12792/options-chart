export const calculateTotalOpenInterestBtc = (
  openInterestValuesBtc: readonly number[],
): number => {
  let total = 0;
  let compensation = 0;

  for (const openInterestBtc of openInterestValuesBtc) {
    if (!Number.isFinite(openInterestBtc) || openInterestBtc < 0) {
      throw new RangeError(
        "Open interest values must be finite and non-negative",
      );
    }

    const adjustedValue = openInterestBtc - compensation;
    const nextTotal = total + adjustedValue;
    compensation = nextTotal - total - adjustedValue;
    total = nextTotal;
  }

  return Object.is(total, -0) ? 0 : total;
};
