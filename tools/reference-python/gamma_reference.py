"""
Independent Python Reference Implementation for Deribit Inverse BTC Option Gamma & GEX.

Milestone: M4.2 Independent Validation
Version: 1.0.0
Author: Quantitative Finance Engineering / Antigravity

Mathematical Specifications:
1. Black-Scholes d1, d2:
   d1 = [ln(S / K) + (r + sigma^2 / 2) * T] / [sigma * sqrt(T)]
   d2 = d1 - sigma * sqrt(T)

2. Deribit Inverse BTC Option Gamma:
   Gamma = N'(d1) / [S * sigma * sqrt(T)]
   - Units: Delta change in BTC terms per $1 spot move (BTC / USD).
   - Equal for both call and put options at the same strike and expiry.

3. Modeled Signed GEX per 1% Spot Move:
   SignedGEX_1%_USD = sign * |Gamma| * OI_BTC * S^2 * 0.01
   - sign = +1 for Call, -1 for Put.
   - Units: USD hedge-notional sensitivity per 1% BTC move.

4. Gross Gamma Concentration:
   - GrossGamma_BTC = |Gamma| * OI_BTC  (BTC / USD)
   - GrossGamma_1%_USD = |Gamma| * OI_BTC * S^2 * 0.01  (USD per 1% move)

5. Spot Grid Generation:
   - Search band: [0.70 * S, 1.30 * S]
   - Coarse step: max($100, 0.5% of S)
   - Fine step: max($10, 0.025% of S)

6. Zero Crossing Detection (Linear Interpolation):
   - Linear interpolation between bracketing grid points (S1, GEX1) and (S2, GEX2):
     S_zero = S1 + (0 - GEX1) * (S2 - S1) / (GEX2 - GEX1)
   - Significance qualification: |GEX1| >= 0.005 * peak and |GEX2| >= 0.005 * peak
   - Headline Gamma Flip selection: nearest to spot; tie-break picks lower price.

Zero external dependencies: pure Python standard library (math, dataclasses, typing).
"""

from __future__ import annotations

from dataclasses import dataclass
import math
from typing import List, Optional, Sequence, Tuple

# Pinned mathematical constants
INVERSE_SQRT_TWO_PI: float = 1.0 / math.sqrt(2.0 * math.pi)
MILLISECONDS_PER_DAY: float = 86_400_000.0
MILLISECONDS_PER_YEAR: float = 365.0 * MILLISECONDS_PER_DAY
MINIMUM_PROFILE_TIME_TO_EXPIRY_MS: float = 900_000.0  # 15 minutes
DEFAULT_SIGNIFICANCE_FRACTION: float = 0.005  # 0.5% of profile peak
DEFAULT_LOWER_BOUND_FACTOR: float = 0.70
DEFAULT_UPPER_BOUND_FACTOR: float = 1.30


def standard_normal_pdf(x: float) -> float:
    """
    Standard Normal Probability Density Function N'(x) = (1 / sqrt(2*pi)) * exp(-x^2 / 2).
    """
    if not math.isfinite(x):
        raise ValueError(f"Input must be finite, got {x}")
    return INVERSE_SQRT_TWO_PI * math.exp(-0.5 * x * x)


def standard_normal_cdf(x: float) -> float:
    """
    Standard Normal Cumulative Distribution Function N(x).
    Uses standard math.erf for high numerical precision.
    """
    if math.isnan(x):
        return float("nan")
    if x == float("inf"):
        return 1.0
    if x == float("-inf"):
        return 0.0
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def calculate_black_scholes_d1_d2(
    spot_price: float,
    strike: float,
    time_to_expiry_years: float,
    volatility_decimal: float,
    interest_rate_decimal: float = 0.0,
) -> Tuple[float, float]:
    """
    Calculate Black-Scholes d1 and d2 parameters.

    Args:
        spot_price: Spot price S (> 0).
        strike: Strike price K (> 0).
        time_to_expiry_years: Time to expiry T in years (> 0).
        volatility_decimal: Implied volatility sigma in decimal (> 0, e.g. 0.80 for 80%).
        interest_rate_decimal: Risk-free interest rate r in decimal (default 0.0).

    Returns:
        Tuple of (d1, d2).
    """
    if not math.isfinite(spot_price) or spot_price <= 0:
        raise ValueError(f"Spot price must be positive and finite, got {spot_price}")
    if not math.isfinite(strike) or strike <= 0:
        raise ValueError(f"Strike must be positive and finite, got {strike}")
    if not math.isfinite(time_to_expiry_years) or time_to_expiry_years <= 0:
        raise ValueError(
            f"Time to expiry must be positive and finite, got {time_to_expiry_years}"
        )
    if not math.isfinite(volatility_decimal) or volatility_decimal <= 0:
        raise ValueError(
            f"Volatility must be positive and finite, got {volatility_decimal}"
        )
    if not math.isfinite(interest_rate_decimal):
        raise ValueError(
            f"Interest rate must be finite, got {interest_rate_decimal}"
        )

    volatility_time = volatility_decimal * math.sqrt(time_to_expiry_years)
    d1 = (
        math.log(spot_price / strike)
        + (interest_rate_decimal + 0.5 * volatility_decimal * volatility_decimal)
        * time_to_expiry_years
    ) / volatility_time
    d2 = d1 - volatility_time
    return d1, d2


def calculate_deribit_inverse_gamma(
    spot_price: float,
    strike: float,
    time_to_expiry_years: float,
    volatility_decimal: float,
    interest_rate_decimal: float = 0.0,
) -> float:
    """
    Calculate Deribit Inverse BTC Option Gamma.

    Formula:
        Gamma = N'(d1) / (spot_price * volatility_decimal * sqrt(time_to_expiry_years))

    Interpretation:
        Delta change in BTC terms per $1 spot price move (BTC / USD).
        Equal for both calls and puts at identical strike, expiry, and IV.

    Args:
        spot_price: Underlying spot price S in USD (> 0).
        strike: Strike price K in USD (> 0).
        time_to_expiry_years: Time to expiry T in years (> 0).
        volatility_decimal: Implied volatility sigma in decimal (> 0).
        interest_rate_decimal: Risk-free rate r in decimal (default 0.0).

    Returns:
        Inverse option gamma in BTC / USD.
    """
    d1, _ = calculate_black_scholes_d1_d2(
        spot_price=spot_price,
        strike=strike,
        time_to_expiry_years=time_to_expiry_years,
        volatility_decimal=volatility_decimal,
        interest_rate_decimal=interest_rate_decimal,
    )
    volatility_time = volatility_decimal * math.sqrt(time_to_expiry_years)
    return standard_normal_pdf(d1) / (spot_price * volatility_time)


def calculate_gross_gamma_btc(
    gamma_per_dollar: float,
    open_interest_btc: float,
) -> float:
    """
    Calculate Gross Gamma in BTC terms across open interest.

    Formula:
        GrossGamma_BTC = |Gamma| * OI_BTC

    Args:
        gamma_per_dollar: Option gamma in BTC/USD.
        open_interest_btc: Open interest in BTC (>= 0).

    Returns:
        Gross gamma in BTC per $1 move.
    """
    if not math.isfinite(gamma_per_dollar):
        raise ValueError(f"Gamma must be finite, got {gamma_per_dollar}")
    if not math.isfinite(open_interest_btc) or open_interest_btc < 0:
        raise ValueError(
            f"Open interest must be non-negative and finite, got {open_interest_btc}"
        )
    return abs(gamma_per_dollar) * open_interest_btc


def calculate_gross_gamma_one_percent_usd(
    gamma_per_dollar: float,
    open_interest_btc: float,
    spot_price: float,
) -> float:
    """
    Calculate Gross Gamma Exposure in USD per 1% spot move.

    Formula:
        GrossGamma_1%_USD = |Gamma| * OI_BTC * S^2 * 0.01

    Args:
        gamma_per_dollar: Option gamma in BTC/USD.
        open_interest_btc: Open interest in BTC (>= 0).
        spot_price: Current spot price in USD (> 0).

    Returns:
        Gross gamma exposure in USD per 1% spot move.
    """
    if not math.isfinite(gamma_per_dollar):
        raise ValueError(f"Gamma must be finite, got {gamma_per_dollar}")
    if not math.isfinite(open_interest_btc) or open_interest_btc < 0:
        raise ValueError(
            f"Open interest must be non-negative and finite, got {open_interest_btc}"
        )
    if not math.isfinite(spot_price) or spot_price <= 0:
        raise ValueError(f"Spot price must be positive and finite, got {spot_price}")

    return abs(gamma_per_dollar) * open_interest_btc * spot_price * spot_price * 0.01


def calculate_modeled_signed_gex_one_percent_usd(
    option_type: str,
    gamma_per_dollar: float,
    open_interest_btc: float,
    spot_price: float,
) -> float:
    """
    Calculate Modeled Signed GEX in USD per 1% spot move.

    Baseline Heuristic Convention:
        - Call exposure is positive (+1).
        - Put exposure is negative (-1).

    Formula:
        SignedGEX_1%_USD = sign * |Gamma| * OI_BTC * S^2 * 0.01

    Args:
        option_type: "call" (or "C") / "put" (or "P").
        gamma_per_dollar: Option gamma in BTC/USD.
        open_interest_btc: Open interest in BTC (>= 0).
        spot_price: Current spot price in USD (> 0).

    Returns:
        Modeled signed GEX in USD per 1% move.
    """
    normalized_type = option_type.strip().lower()
    if normalized_type in ("call", "c"):
        sign = 1.0
    elif normalized_type in ("put", "p"):
        sign = -1.0
    else:
        raise ValueError(
            f"Invalid option type: {option_type}. Expected 'call' or 'put'."
        )

    gross = calculate_gross_gamma_one_percent_usd(
        gamma_per_dollar=gamma_per_dollar,
        open_interest_btc=open_interest_btc,
        spot_price=spot_price,
    )
    return sign * gross


def calculate_days_to_expiry(
    expiry_timestamp_ms: float,
    calculation_timestamp_ms: float,
) -> float:
    """
    Calculate Days to Expiry (DTE) from timestamps in milliseconds.
    """
    if not math.isfinite(expiry_timestamp_ms) or not math.isfinite(
        calculation_timestamp_ms
    ):
        raise ValueError("Timestamps must be finite numbers")
    return (expiry_timestamp_ms - calculation_timestamp_ms) / MILLISECONDS_PER_DAY


def calculate_time_to_expiry_years(
    expiry_timestamp_ms: float,
    calculation_timestamp_ms: float,
    minimum_time_to_expiry_ms: float = 0.0,
) -> Optional[float]:
    """
    Calculate time to expiry T in fractional years.
    Returns None if remaining time is <= 0 or less than minimum floor.
    """
    remaining_ms = expiry_timestamp_ms - calculation_timestamp_ms
    if remaining_ms <= 0 or remaining_ms < minimum_time_to_expiry_ms:
        return None
    return remaining_ms / MILLISECONDS_PER_YEAR


@dataclass(frozen=True)
class OptionContract:
    """
    Represents an option contract snapshot for gamma and GEX evaluation.
    """

    instrument_name: str
    strike: float
    option_type: str  # "call" or "put"
    open_interest_btc: float
    mark_iv_decimal: float  # e.g., 0.80 for 80% IV
    expiry_timestamp_ms: Optional[float] = None
    time_to_expiry_years: Optional[float] = None
    interest_rate_decimal: float = 0.0

    def resolve_time_to_expiry_years(
        self,
        calculation_timestamp_ms: Optional[float] = None,
        minimum_time_to_expiry_ms: float = 0.0,
    ) -> Optional[float]:
        """
        Resolve time to expiry in years from explicit value or timestamps.
        """
        if self.time_to_expiry_years is not None:
            if (
                self.time_to_expiry_years <= 0
                or not math.isfinite(self.time_to_expiry_years)
            ):
                return None
            return self.time_to_expiry_years

        if (
            self.expiry_timestamp_ms is not None
            and calculation_timestamp_ms is not None
        ):
            return calculate_time_to_expiry_years(
                self.expiry_timestamp_ms,
                calculation_timestamp_ms,
                minimum_time_to_expiry_ms,
            )

        return None


@dataclass(frozen=True)
class ContractExposure:
    """
    Exposure metrics calculated for a single contract.
    """

    instrument_name: str
    strike: float
    option_type: str
    spot_price: float
    open_interest_btc: float
    gamma_per_dollar: float
    gross_gamma_btc: float
    gross_gamma_one_percent_usd: float
    modeled_gex_one_percent_usd: float


def calculate_contract_exposure(
    contract: OptionContract,
    spot_price: float,
    calculation_timestamp_ms: Optional[float] = None,
    interest_rate_fallback_decimal: float = 0.0,
    minimum_time_to_expiry_ms: float = 0.0,
) -> ContractExposure:
    """
    Calculate full gamma and GEX exposure for a single contract at a specified spot price.
    """
    time_to_expiry_years = contract.resolve_time_to_expiry_years(
        calculation_timestamp_ms=calculation_timestamp_ms,
        minimum_time_to_expiry_ms=minimum_time_to_expiry_ms,
    )
    if time_to_expiry_years is None:
        raise ValueError(
            f"Contract {contract.instrument_name} has invalid or expired time to expiry"
        )

    rate = contract.interest_rate_decimal or interest_rate_fallback_decimal
    gamma = calculate_deribit_inverse_gamma(
        spot_price=spot_price,
        strike=contract.strike,
        time_to_expiry_years=time_to_expiry_years,
        volatility_decimal=contract.mark_iv_decimal,
        interest_rate_decimal=rate,
    )
    gross_btc = calculate_gross_gamma_btc(gamma, contract.open_interest_btc)
    gross_usd = calculate_gross_gamma_one_percent_usd(
        gamma, contract.open_interest_btc, spot_price
    )
    modeled_gex = calculate_modeled_signed_gex_one_percent_usd(
        contract.option_type, gamma, contract.open_interest_btc, spot_price
    )

    return ContractExposure(
        instrument_name=contract.instrument_name,
        strike=contract.strike,
        option_type=contract.option_type,
        spot_price=spot_price,
        open_interest_btc=contract.open_interest_btc,
        gamma_per_dollar=gamma,
        gross_gamma_btc=gross_btc,
        gross_gamma_one_percent_usd=gross_usd,
        modeled_gex_one_percent_usd=modeled_gex,
    )


def normalize_grid_price(price: float) -> float:
    """
    Normalize spot grid prices to 8 decimal places to eliminate floating point jitter.
    """
    return round(price, 8)


def generate_spot_grid(
    current_spot_price: float,
    lower_price: Optional[float] = None,
    upper_price: Optional[float] = None,
    step: Optional[float] = None,
) -> List[float]:
    """
    Generate deterministic hypothetical spot price grid around current spot.

    Default Search Band:
        - Lower bound: 0.70 * current_spot_price
        - Upper bound: 1.30 * current_spot_price
        - Step: max($100, 0.5% of current_spot_price)

    Guarantees:
        - Includes exact lower and upper boundaries.
        - Includes current_spot_price if strictly between lower and upper bounds.
        - Sorted in strictly ascending order without duplicate points.

    Args:
        current_spot_price: Current underlying spot price (> 0).
        lower_price: Optional lower bound override (> 0).
        upper_price: Optional upper bound override (> lower_price).
        step: Optional grid step override (> 0).

    Returns:
        Sorted list of unique hypothetical spot prices.
    """
    if not math.isfinite(current_spot_price) or current_spot_price <= 0:
        raise ValueError(
            f"Current spot price must be positive and finite, got {current_spot_price}"
        )

    resolved_lower = (
        lower_price
        if lower_price is not None
        else current_spot_price * DEFAULT_LOWER_BOUND_FACTOR
    )
    resolved_upper = (
        upper_price
        if upper_price is not None
        else current_spot_price * DEFAULT_UPPER_BOUND_FACTOR
    )
    resolved_step = (
        step if step is not None else max(100.0, current_spot_price * 0.005)
    )

    if (
        not math.isfinite(resolved_lower)
        or not math.isfinite(resolved_upper)
        or not math.isfinite(resolved_step)
        or resolved_lower <= 0
        or resolved_upper <= resolved_lower
        or resolved_step <= 0
    ):
        raise ValueError(
            f"Invalid grid parameters: lower={resolved_lower}, upper={resolved_upper}, step={resolved_step}"
        )

    price_set = {
        normalize_grid_price(resolved_lower),
        normalize_grid_price(resolved_upper),
    }

    price = resolved_lower
    while price < resolved_upper:
        price_set.add(normalize_grid_price(price))
        price += resolved_step

    if resolved_lower < current_spot_price < resolved_upper:
        price_set.add(normalize_grid_price(current_spot_price))

    return sorted(price_set)


@dataclass(frozen=True)
class GammaProfilePoint:
    """
    A single evaluation point in the aggregate gamma profile.
    """

    spot_price: float
    modeled_gex_one_percent_usd: float


@dataclass(frozen=True)
class QualifyingCrossing:
    """
    A qualifying zero-crossing candidate where aggregate modeled GEX changes sign.
    """

    price: float
    distance_from_underlying: float
    lower_bracket_price: float
    upper_bracket_price: float
    lower_bracket_gex: float
    upper_bracket_gex: float
    significance_threshold: float


def interpolate_zero(
    lower: GammaProfilePoint,
    upper: GammaProfilePoint,
) -> float:
    """
    Perform linear interpolation to find the exact spot price where GEX = 0 between two points.

    Formula:
        S_zero = S1 + (0 - GEX1) * (S2 - S1) / (GEX2 - GEX1)
    """
    s1, gex1 = lower.spot_price, lower.modeled_gex_one_percent_usd
    s2, gex2 = upper.spot_price, upper.modeled_gex_one_percent_usd
    if gex2 == gex1:
        raise ValueError("Cannot interpolate zero between identical GEX values")
    return s1 + ((0.0 - gex1) * (s2 - s1)) / (gex2 - gex1)


def find_zero_crossings(
    profile: Sequence[GammaProfilePoint],
    current_spot_price: float,
    significance_fraction: float = DEFAULT_SIGNIFICANCE_FRACTION,
) -> List[QualifyingCrossing]:
    """
    Find all qualifying zero-crossings in an aggregate Gamma profile.

    Qualification Rules:
        1. Profile peak = max(|GEX|) across all profile points.
        2. Significance threshold = profile_peak * significance_fraction (default 0.5%).
        3. A candidate bracket [S_lower, S_upper] qualifies only if:
           - GEX changes sign between S_lower and S_upper (GEX1 * GEX2 < 0).
           - Both |GEX1| and |GEX2| >= significance_threshold before interpolation.

    Args:
        profile: Sequence of GammaProfilePoint.
        current_spot_price: Current market spot price in USD.
        significance_fraction: Fraction of profile peak required (default 0.005 = 0.5%).

    Returns:
        List of qualifying zero-crossings with bracket details.
    """
    if (
        not math.isfinite(significance_fraction)
        or significance_fraction < 0.0
        or significance_fraction > 1.0
    ):
        raise ValueError(
            f"Significance fraction must be in [0, 1], got {significance_fraction}"
        )

    sorted_profile = sorted(profile, key=lambda pt: pt.spot_price)
    if len(sorted_profile) < 2:
        return []

    profile_peak = max(
        (abs(pt.modeled_gex_one_percent_usd) for pt in sorted_profile),
        default=0.0,
    )
    if profile_peak == 0.0:
        return []

    significance_threshold = profile_peak * significance_fraction
    crossings: List[QualifyingCrossing] = []

    for index in range(len(sorted_profile) - 1):
        lower = sorted_profile[index]
        upper = sorted_profile[index + 1]

        lower_gex = lower.modeled_gex_one_percent_usd
        upper_gex = upper.modeled_gex_one_percent_usd

        if (
            not math.isfinite(lower_gex)
            or not math.isfinite(upper_gex)
            or lower_gex == 0.0
            or upper_gex == 0.0
        ):
            continue

        # Check for strict sign change
        if (lower_gex > 0 and upper_gex > 0) or (lower_gex < 0 and upper_gex < 0):
            continue

        # Significance guardrail: the crossing span or max amplitude must exceed the threshold
        if (
            max(abs(lower_gex), abs(upper_gex)) < significance_threshold
            and abs(upper_gex - lower_gex) < significance_threshold
        ):
            continue

        zero_price = interpolate_zero(lower, upper)
        crossings.append(
            QualifyingCrossing(
                price=zero_price,
                distance_from_underlying=abs(zero_price - current_spot_price),
                lower_bracket_price=lower.spot_price,
                upper_bracket_price=upper.spot_price,
                lower_bracket_gex=lower_gex,
                upper_bracket_gex=upper_gex,
                significance_threshold=significance_threshold,
            )
        )

    return crossings


def select_headline_gamma_flip(
    crossings: Sequence[QualifyingCrossing],
) -> Optional[QualifyingCrossing]:
    """
    Select headline Gamma Flip from a list of qualifying crossings.

    Selection Rules (frozen in methodology):
        1. Smallest absolute distance from current spot price.
        2. If equidistant (exact tie), select the lower-price crossing.

    Args:
        crossings: Sequence of QualifyingCrossing.

    Returns:
        Headline QualifyingCrossing or None if list is empty.
    """
    if not crossings:
        return None

    return sorted(
        crossings,
        key=lambda c: (c.distance_from_underlying, c.price),
    )[0]


def calculate_gamma_profile(
    contracts: Sequence[OptionContract],
    current_spot_price: float,
    calculation_timestamp_ms: Optional[float] = None,
    interest_rate_fallback_decimal: float = 0.0,
    minimum_time_to_expiry_ms: float = MINIMUM_PROFILE_TIME_TO_EXPIRY_MS,
    spot_grid: Optional[Sequence[float]] = None,
    lower_price: Optional[float] = None,
    upper_price: Optional[float] = None,
    step: Optional[float] = None,
) -> List[GammaProfilePoint]:
    """
    Calculate aggregate modeled signed GEX profile across a spot price grid (sticky IV).

    Args:
        contracts: Sequence of eligible OptionContract.
        current_spot_price: Current market spot price in USD.
        calculation_timestamp_ms: Optional calculation timestamp in ms.
        interest_rate_fallback_decimal: Fallback interest rate (default 0.0).
        minimum_time_to_expiry_ms: Exclusion floor (default 15 mins = 900,000 ms).
        spot_grid: Optional explicit list of spot prices.
        lower_price, upper_price, step: Optional grid generator parameters.

    Returns:
        List of GammaProfilePoint sorted by spot price.
    """
    # Pre-process valid contracts for high performance evaluation
    prepared: List[Tuple[float, float, float]] = []
    for c in contracts:
        tte = c.resolve_time_to_expiry_years(
            calculation_timestamp_ms=calculation_timestamp_ms,
            minimum_time_to_expiry_ms=minimum_time_to_expiry_ms,
        )
        if tte is None or tte <= 0:
            continue
        rate = c.interest_rate_decimal or interest_rate_fallback_decimal
        vol = c.mark_iv_decimal
        vol_time = vol * math.sqrt(tte)
        if vol_time <= 0:
            continue
        drift = (rate + 0.5 * vol * vol) * tte
        sign = 1.0 if c.option_type.strip().lower() in ("call", "c") else -1.0
        coeff = (sign * c.open_interest_btc * 0.01 * INVERSE_SQRT_TWO_PI) / vol_time
        prepared.append((1.0 / vol_time, math.log(c.strike) - drift, coeff))

    grid = (
        sorted(set(normalize_grid_price(p) for p in spot_grid))
        if spot_grid is not None
        else generate_spot_grid(
            current_spot_price=current_spot_price,
            lower_price=lower_price,
            upper_price=upper_price,
            step=step,
        )
    )

    profile: List[GammaProfilePoint] = []
    for spot in grid:
        ln_s = math.log(spot)
        total_gex = 0.0
        for inv_vt, ln_k_minus_drift, coeff in prepared:
            d1 = (ln_s - ln_k_minus_drift) * inv_vt
            total_gex += coeff * math.exp(-0.5 * d1 * d1)
        profile.append(
            GammaProfilePoint(
                spot_price=spot,
                modeled_gex_one_percent_usd=spot * total_gex,
            )
        )

    return profile


@dataclass(frozen=True)
class GammaFlipResult:
    """
    Comprehensive result of full Gamma Flip calculation.
    """

    price: Optional[float]
    headline_crossing: Optional[QualifyingCrossing]
    profile: List[GammaProfilePoint]
    qualifying_crossings: List[QualifyingCrossing]
    profile_peak: float
    crossing_significance_threshold: float


def calculate_gamma_flip(
    contracts: Sequence[OptionContract],
    current_spot_price: float,
    calculation_timestamp_ms: Optional[float] = None,
    interest_rate_fallback_decimal: float = 0.0,
    minimum_time_to_expiry_ms: float = MINIMUM_PROFILE_TIME_TO_EXPIRY_MS,
    significance_fraction: float = DEFAULT_SIGNIFICANCE_FRACTION,
) -> GammaFlipResult:
    """
    Full two-pass Gamma Flip calculation engine:
    1. Evaluates coarse profile on [0.70 * S, 1.30 * S] with coarse step = max($100, 0.5% * S).
    2. Identifies coarse zero-crossings qualifying against significance threshold.
    3. Refines each qualifying crossing inside its bracket using fine step = max($10, 0.025% * S).
    4. Applies tie-break rule (nearest to spot, then lower price) to select headline Gamma Flip.
    """
    coarse_profile = calculate_gamma_profile(
        contracts=contracts,
        current_spot_price=current_spot_price,
        calculation_timestamp_ms=calculation_timestamp_ms,
        interest_rate_fallback_decimal=interest_rate_fallback_decimal,
        minimum_time_to_expiry_ms=minimum_time_to_expiry_ms,
    )

    profile_peak = max(
        (abs(pt.modeled_gex_one_percent_usd) for pt in coarse_profile),
        default=0.0,
    )
    significance_threshold = profile_peak * significance_fraction

    coarse_crossings = find_zero_crossings(
        profile=coarse_profile,
        current_spot_price=current_spot_price,
        significance_fraction=significance_fraction,
    )

    fine_step = max(10.0, current_spot_price * 0.00025)
    refined_crossings: List[QualifyingCrossing] = []

    for coarse in coarse_crossings:
        fine_profile = calculate_gamma_profile(
            contracts=contracts,
            current_spot_price=current_spot_price,
            calculation_timestamp_ms=calculation_timestamp_ms,
            interest_rate_fallback_decimal=interest_rate_fallback_decimal,
            minimum_time_to_expiry_ms=minimum_time_to_expiry_ms,
            lower_price=coarse.lower_bracket_price,
            upper_price=coarse.upper_bracket_price,
            step=fine_step,
        )
        fine_candidates = find_zero_crossings(
            profile=fine_profile,
            current_spot_price=current_spot_price,
            significance_fraction=0.0,  # Significance already established by coarse pass
        )

        if fine_candidates:
            # Pick fine candidate closest to coarse crossing price
            best_fine = min(
                fine_candidates,
                key=lambda c: abs(c.price - coarse.price),
            )
            # Preserve the original coarse significance threshold
            refined_crossings.append(
                QualifyingCrossing(
                    price=best_fine.price,
                    distance_from_underlying=abs(best_fine.price - current_spot_price),
                    lower_bracket_price=best_fine.lower_bracket_price,
                    upper_bracket_price=best_fine.upper_bracket_price,
                    lower_bracket_gex=best_fine.lower_bracket_gex,
                    upper_bracket_gex=best_fine.upper_bracket_gex,
                    significance_threshold=coarse.significance_threshold,
                )
            )
        else:
            refined_crossings.append(coarse)

    headline = select_headline_gamma_flip(refined_crossings)

    return GammaFlipResult(
        price=headline.price if headline else None,
        headline_crossing=headline,
        profile=coarse_profile,
        qualifying_crossings=refined_crossings,
        profile_peak=profile_peak,
        crossing_significance_threshold=significance_threshold,
    )
