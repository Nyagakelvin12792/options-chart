export const DECIMAL_POLICY_VERSION = "flow-decimal-policy-v1" as const;
export const MAX_SAFE_DECIMAL_MAGNITUDE = 1e15;
export const DECIMAL_SCALE_DECIMALS = 8;
export const BASIS_POINTS_SCALE = 10_000;
export const QUOTE_MILLION_UNIT = 1_000_000;

const DECIMAL_STRING_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

export type DecimalFailureReason =
  | "invalid-format"
  | "non-finite"
  | "non-positive"
  | "negative"
  | "magnitude-overflow";

export type DecimalParseResult =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly reason: DecimalFailureReason };

export function roundDecimal(
  value: number,
  decimals = DECIMAL_SCALE_DECIMALS,
): number {
  if (!Number.isFinite(value)) {
    return value;
  }
  if (value === 0) {
    return 0;
  }
  const factor = 10 ** decimals;
  if (!Number.isFinite(factor) || factor <= 0) {
    return value;
  }
  const sign = value < 0 ? -1 : 1;
  const rounded =
    (sign * Math.round((Math.abs(value) + Number.EPSILON) * factor)) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function parsePositiveDecimal(raw: unknown): DecimalParseResult {
  if (typeof raw !== "string" || !DECIMAL_STRING_PATTERN.test(raw)) {
    return { ok: false, reason: "invalid-format" };
  }
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) {
    return { ok: false, reason: "non-finite" };
  }
  if (numeric <= 0) {
    return { ok: false, reason: "non-positive" };
  }
  if (numeric > MAX_SAFE_DECIMAL_MAGNITUDE) {
    return { ok: false, reason: "magnitude-overflow" };
  }
  return { ok: true, value: numeric };
}

export function parseNonNegativeDecimal(raw: unknown): DecimalParseResult {
  if (typeof raw !== "string" || !DECIMAL_STRING_PATTERN.test(raw)) {
    return { ok: false, reason: "invalid-format" };
  }
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) {
    return { ok: false, reason: "non-finite" };
  }
  if (numeric < 0) {
    return { ok: false, reason: "negative" };
  }
  if (numeric > MAX_SAFE_DECIMAL_MAGNITUDE) {
    return { ok: false, reason: "magnitude-overflow" };
  }
  return { ok: true, value: numeric === 0 ? 0 : numeric };
}

export function validatePositiveFiniteNumber(
  value: unknown,
): DecimalParseResult {
  if (typeof value !== "number") {
    return { ok: false, reason: "invalid-format" };
  }
  if (!Number.isFinite(value)) {
    return { ok: false, reason: "non-finite" };
  }
  if (value <= 0) {
    return { ok: false, reason: "non-positive" };
  }
  if (value > MAX_SAFE_DECIMAL_MAGNITUDE) {
    return { ok: false, reason: "magnitude-overflow" };
  }
  return { ok: true, value };
}

export function computeQuoteVolume(
  price: number,
  quantity: number,
): DecimalParseResult {
  const priceValidation = validatePositiveFiniteNumber(price);
  if (!priceValidation.ok) {
    return priceValidation;
  }
  const quantityValidation = validatePositiveFiniteNumber(quantity);
  if (!quantityValidation.ok) {
    return quantityValidation;
  }
  const product = priceValidation.value * quantityValidation.value;
  if (!Number.isFinite(product)) {
    return { ok: false, reason: "non-finite" };
  }
  if (product <= 0) {
    return { ok: false, reason: "non-positive" };
  }
  if (product > MAX_SAFE_DECIMAL_MAGNITUDE) {
    return { ok: false, reason: "magnitude-overflow" };
  }
  const rounded = roundDecimal(product, DECIMAL_SCALE_DECIMALS);
  if (rounded <= 0) {
    return { ok: false, reason: "non-positive" };
  }
  return { ok: true, value: rounded };
}

export function safeDivide(
  numerator: number,
  denominator: number,
  minAbsDenominator = 1e-12,
): number | null {
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    !Number.isFinite(minAbsDenominator) ||
    minAbsDenominator <= 0 ||
    Math.abs(denominator) < minAbsDenominator
  ) {
    return null;
  }
  const quotient = numerator / denominator;
  if (!Number.isFinite(quotient)) {
    return null;
  }
  return Object.is(quotient, -0) ? 0 : quotient;
}

export function computeSignedBpsChange(
  startPrice: number,
  endPrice: number,
): number | null {
  const startCheck = validatePositiveFiniteNumber(startPrice);
  const endCheck = validatePositiveFiniteNumber(endPrice);
  if (!startCheck.ok || !endCheck.ok) {
    return null;
  }
  const ratio = safeDivide(endCheck.value - startCheck.value, startCheck.value);
  if (ratio === null) {
    return null;
  }
  return roundDecimal(ratio * BASIS_POINTS_SCALE, 6);
}

export function computeAbsoluteBpsDistance(
  priceA: number,
  priceB: number,
  referencePrice?: number,
): number | null {
  const checkA = validatePositiveFiniteNumber(priceA);
  const checkB = validatePositiveFiniteNumber(priceB);
  const denomPrice = referencePrice ?? priceB;
  const checkDenom = validatePositiveFiniteNumber(denomPrice);
  if (!checkA.ok || !checkB.ok || !checkDenom.ok) {
    return null;
  }
  const ratio = safeDivide(
    Math.abs(checkA.value - checkB.value),
    checkDenom.value,
  );
  if (ratio === null) {
    return null;
  }
  return roundDecimal(ratio * BASIS_POINTS_SCALE, 6);
}
