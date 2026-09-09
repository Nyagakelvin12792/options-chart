import type {
  OptionSnapshot,
  OptionType,
  StrikeExposure,
  WallSignal,
  WallSignalNormalizationGroup,
} from "@options-chart/domain";

import { selectRawCallWall, selectRawPutWall } from "./walls";

export interface StaticWallSignalInput {
  readonly strikeExposures: readonly StrikeExposure[];
  readonly contracts: readonly OptionSnapshot[];
  readonly currentSpotPrice: number;
  readonly maxPainPrice: number | null;
  readonly gammaFlipPrice: number | null;
}

interface StrikeMetric {
  readonly strike: number;
  readonly value: number;
}

const sumMetricByStrike = (
  contracts: readonly OptionSnapshot[],
  selectValue: (contract: OptionSnapshot) => number | null | undefined,
): readonly StrikeMetric[] => {
  const totals = new Map<number, number>();
  for (const contract of contracts) {
    const value = selectValue(contract);
    if (
      value === null ||
      value === undefined ||
      !Number.isFinite(value) ||
      value <= 0
    ) {
      continue;
    }
    totals.set(
      contract.instrument.strike,
      (totals.get(contract.instrument.strike) ?? 0) + value,
    );
  }
  return [...totals.entries()].map(([strike, value]) => ({ strike, value }));
};

const selectStrongestMetric = (
  metrics: readonly StrikeMetric[],
  currentSpotPrice: number,
): StrikeMetric | null =>
  [...metrics].sort(
    (left, right) =>
      right.value - left.value ||
      Math.abs(left.strike - currentSpotPrice) -
        Math.abs(right.strike - currentSpotPrice) ||
      left.strike - right.strike,
  )[0] ?? null;

const createSignal = (
  id: string,
  kind: WallSignal["kind"],
  label: string,
  price: number,
  optionType: OptionType | null,
  metricValue: number,
  metricTotal: number,
  normalizationGroup: WallSignalNormalizationGroup,
): WallSignal => ({
  id,
  kind,
  label,
  price,
  optionType,
  metricValue,
  metricTotal,
  concentration: metricTotal > 0 ? Math.min(1, metricValue / metricTotal) : 0,
  normalizationGroup,
});

const createGammaSignal = (
  wall: StrikeExposure | null,
  strikeExposures: readonly StrikeExposure[],
  optionType: OptionType,
): WallSignal | null => {
  if (wall === null) {
    return null;
  }
  const metricTotal = strikeExposures
    .filter((exposure) => exposure.optionType === optionType)
    .reduce((total, exposure) => total + exposure.grossGammaOnePercentUsd, 0);
  return createSignal(
    `gamma-${optionType}`,
    "gamma",
    optionType === "call" ? "Call Gamma Wall" : "Put Gamma Wall",
    wall.strike,
    optionType,
    wall.grossGammaOnePercentUsd,
    metricTotal,
    optionType === "call" ? "call-gamma" : "put-gamma",
  );
};

const createConcentrationSignal = (
  metrics: readonly StrikeMetric[],
  currentSpotPrice: number,
  kind: "open-interest" | "volume",
): WallSignal | null => {
  const strongest = selectStrongestMetric(metrics, currentSpotPrice);
  if (strongest === null) {
    return null;
  }
  const metricTotal = metrics.reduce(
    (total, metric) => total + metric.value,
    0,
  );
  return createSignal(
    kind,
    kind,
    kind === "open-interest" ? "Open Interest Wall" : "24h Volume Wall",
    strongest.strike,
    null,
    strongest.value,
    metricTotal,
    kind,
  );
};

export const calculateStaticWallSignals = (
  input: StaticWallSignalInput,
): readonly WallSignal[] => {
  if (!Number.isFinite(input.currentSpotPrice) || input.currentSpotPrice <= 0) {
    throw new RangeError(
      "Current spot price must be finite and greater than zero",
    );
  }
  for (const [name, price] of [
    ["Max pain", input.maxPainPrice],
    ["Gamma flip", input.gammaFlipPrice],
  ] as const) {
    if (price !== null && (!Number.isFinite(price) || price <= 0)) {
      throw new RangeError(`${name} price must be null or finite and positive`);
    }
  }

  const signals: WallSignal[] = [];
  const callGamma = createGammaSignal(
    selectRawCallWall(input.strikeExposures, input.currentSpotPrice),
    input.strikeExposures,
    "call",
  );
  const putGamma = createGammaSignal(
    selectRawPutWall(input.strikeExposures, input.currentSpotPrice),
    input.strikeExposures,
    "put",
  );
  if (callGamma) signals.push(callGamma);
  if (putGamma) signals.push(putGamma);

  const openInterest = createConcentrationSignal(
    sumMetricByStrike(
      input.contracts,
      (contract) => contract.quote.openInterestBtc,
    ),
    input.currentSpotPrice,
    "open-interest",
  );
  if (openInterest) signals.push(openInterest);

  const volume = createConcentrationSignal(
    sumMetricByStrike(input.contracts, (contract) => contract.quote.volumeBtc),
    input.currentSpotPrice,
    "volume",
  );
  if (volume) signals.push(volume);

  if (input.maxPainPrice !== null) {
    signals.push(
      createSignal(
        "max-pain",
        "max-pain",
        "Max Pain",
        input.maxPainPrice,
        null,
        1,
        1,
        "max-pain",
      ),
    );
  }
  if (input.gammaFlipPrice !== null) {
    signals.push(
      createSignal(
        "gamma-flip",
        "gamma-flip",
        "Modeled Gamma Flip",
        input.gammaFlipPrice,
        null,
        1,
        1,
        "gamma-flip",
      ),
    );
  }
  return signals;
};
