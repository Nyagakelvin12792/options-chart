"""
Pure Python Reference Implementation: Black-Scholes-Merton European Option Pricing Model.

This module provides high-precision, mathematically rigorous reference implementations
for the standard normal distribution functions, d1/d2 calculation, and European call/put
pricing under the Black-Scholes (1973) and Merton (1973) framework.

Zero external dependencies (pure standard library math).
All calculations use IEEE 754 double precision with error < 1e-15 for CDF/PDF.
"""

from __future__ import annotations

import math
from typing import Tuple, Union

# Mathematical constants
INVERSE_SQRT_TWO_PI: float = 1.0 / math.sqrt(2.0 * math.pi)  # ~0.3989422804014327
SQRT_TWO: float = math.sqrt(2.0)  # ~1.4142135623730951


def std_normal_pdf(x: float) -> float:
    """
    Standard normal probability density function (PDF): phi(x).

    phi(x) = (1 / sqrt(2 * pi)) * exp(-x^2 / 2)

    Parameters
    ----------
    x : float
        Evaluation point.

    Returns
    -------
    float
        Standard normal probability density at x.
    """
    if math.isnan(x):
        return float("nan")
    if math.isinf(x):
        return 0.0
    return INVERSE_SQRT_TWO_PI * math.exp(-0.5 * x * x)


def std_normal_cdf(x: float) -> float:
    """
    Standard normal cumulative distribution function (CDF): Phi(x).

    Phi(x) = 0.5 * (1.0 + erf(x / sqrt(2)))

    Utilizes math.erf from the standard library (C99 erf), providing precision
    matching standard double-precision floating point (< 1e-15 error).

    Parameters
    ----------
    x : float
        Evaluation point.

    Returns
    -------
    float
        Probability that standard normal variable Z <= x.
    """
    if math.isnan(x):
        return float("nan")
    if x == float("inf"):
        return 1.0
    if x == float("-inf"):
        return 0.0
    if x == 0.0:
        return 0.5
    return 0.5 * (1.0 + math.erf(x / SQRT_TWO))


def _validate_inputs(
    spot: float,
    strike: float,
    time_to_expiry_years: float,
    iv: float,
    rate: float,
) -> None:
    """Validate numerical inputs for Black-Scholes pricing and Greeks."""
    if math.isnan(spot) or math.isnan(strike) or math.isnan(time_to_expiry_years) or math.isnan(iv) or math.isnan(rate):
        raise ValueError("Input parameters cannot be NaN")
    if spot <= 0.0:
        raise ValueError(f"Spot price must be strictly positive (> 0), got {spot}")
    if strike <= 0.0:
        raise ValueError(f"Strike price must be strictly positive (> 0), got {strike}")
    if time_to_expiry_years < 0.0:
        raise ValueError(f"Time to expiry must be non-negative (>= 0), got {time_to_expiry_years}")
    if iv < 0.0:
        raise ValueError(f"Implied volatility must be non-negative (>= 0), got {iv}")
    if not math.isfinite(rate):
        raise ValueError(f"Interest rate must be finite, got {rate}")


def d1(
    spot: float,
    strike: float,
    time_to_expiry_years: float,
    iv: float,
    rate: float = 0.0,
) -> float:
    """
    Calculate Black-Scholes d1.

    d1 = [ln(S / K) + (r + sigma^2 / 2) * T] / [sigma * sqrt(T)]

    Parameters
    ----------
    spot : float
        Current spot / underlying asset price (S > 0).
    strike : float
        Option strike price (K > 0).
    time_to_expiry_years : float
        Time to expiration in annualized years (T > 0).
    iv : float
        Annualized implied volatility as a decimal (sigma > 0).
    rate : float, optional
        Risk-free interest rate as a decimal (annualized, default = 0.0).

    Returns
    -------
    float
        The d1 value.
    """
    _validate_inputs(spot, strike, time_to_expiry_years, iv, rate)
    if time_to_expiry_years == 0.0 or iv == 0.0:
        raise ValueError("Time to expiry and volatility must be strictly positive to compute d1")

    vol_sqrt_t = iv * math.sqrt(time_to_expiry_years)
    numerator = math.log(spot / strike) + (rate + 0.5 * iv * iv) * time_to_expiry_years
    return numerator / vol_sqrt_t


def d2(
    spot: float,
    strike: float,
    time_to_expiry_years: float,
    iv: float,
    rate: float = 0.0,
) -> float:
    """
    Calculate Black-Scholes d2.

    d2 = d1 - sigma * sqrt(T)
       = [ln(S / K) + (r - sigma^2 / 2) * T] / [sigma * sqrt(T)]

    Parameters
    ----------
    spot : float
        Current spot / underlying asset price (S > 0).
    strike : float
        Option strike price (K > 0).
    time_to_expiry_years : float
        Time to expiration in annualized years (T > 0).
    iv : float
        Annualized implied volatility as a decimal (sigma > 0).
    rate : float, optional
        Risk-free interest rate as a decimal (annualized, default = 0.0).

    Returns
    -------
    float
        The d2 value.
    """
    _validate_inputs(spot, strike, time_to_expiry_years, iv, rate)
    if time_to_expiry_years == 0.0 or iv == 0.0:
        raise ValueError("Time to expiry and volatility must be strictly positive to compute d2")

    vol_sqrt_t = iv * math.sqrt(time_to_expiry_years)
    d1_val = (math.log(spot / strike) + (rate + 0.5 * iv * iv) * time_to_expiry_years) / vol_sqrt_t
    return d1_val - vol_sqrt_t


def d1_d2(
    spot: float,
    strike: float,
    time_to_expiry_years: float,
    iv: float,
    rate: float = 0.0,
) -> Tuple[float, float]:
    """
    Simultaneously compute d1 and d2 efficiently.

    Parameters
    ----------
    spot : float
        Current spot / underlying asset price (S > 0).
    strike : float
        Option strike price (K > 0).
    time_to_expiry_years : float
        Time to expiration in annualized years (T > 0).
    iv : float
        Annualized implied volatility as a decimal (sigma > 0).
    rate : float, optional
        Risk-free interest rate as a decimal (annualized, default = 0.0).

    Returns
    -------
    tuple[float, float]
        (d1, d2)
    """
    _validate_inputs(spot, strike, time_to_expiry_years, iv, rate)
    if time_to_expiry_years == 0.0 or iv == 0.0:
        raise ValueError("Time to expiry and volatility must be strictly positive to compute d1 and d2")

    vol_sqrt_t = iv * math.sqrt(time_to_expiry_years)
    d1_val = (math.log(spot / strike) + (rate + 0.5 * iv * iv) * time_to_expiry_years) / vol_sqrt_t
    d2_val = d1_val - vol_sqrt_t
    return d1_val, d2_val


def call_price(
    spot: float,
    strike: float,
    time_to_expiry_years: float,
    iv: float,
    rate: float = 0.0,
) -> float:
    """
    Calculate European Call option price under Black-Scholes-Merton model.

    Call = S * Phi(d1) - K * exp(-r * T) * Phi(d2)

    Handles boundary conditions:
    - If T == 0: max(S - K, 0.0)
    - If iv == 0: max(S - K * exp(-r * T), 0.0)

    Parameters
    ----------
    spot : float
        Current spot / underlying asset price (S > 0).
    strike : float
        Option strike price (K > 0).
    time_to_expiry_years : float
        Time to expiration in annualized years (T >= 0).
    iv : float
        Annualized implied volatility as a decimal (sigma >= 0).
    rate : float, optional
        Risk-free interest rate as a decimal (annualized, default = 0.0).

    Returns
    -------
    float
        European call option price.
    """
    _validate_inputs(spot, strike, time_to_expiry_years, iv, rate)

    # Expiry boundary condition
    if time_to_expiry_years == 0.0:
        return max(0.0, spot - strike)

    discount_factor = math.exp(-rate * time_to_expiry_years)
    discounted_strike = strike * discount_factor

    # Zero volatility boundary condition
    if iv == 0.0:
        return max(0.0, spot - discounted_strike)

    d1_val, d2_val = d1_d2(spot, strike, time_to_expiry_years, iv, rate)
    price = spot * std_normal_cdf(d1_val) - discounted_strike * std_normal_cdf(d2_val)
    return max(0.0, price)


def put_price(
    spot: float,
    strike: float,
    time_to_expiry_years: float,
    iv: float,
    rate: float = 0.0,
) -> float:
    """
    Calculate European Put option price under Black-Scholes-Merton model.

    Put = K * exp(-r * T) * Phi(-d2) - S * Phi(-d1)

    Handles boundary conditions:
    - If T == 0: max(K - S, 0.0)
    - If iv == 0: max(K * exp(-r * T) - S, 0.0)

    Parameters
    ----------
    spot : float
        Current spot / underlying asset price (S > 0).
    strike : float
        Option strike price (K > 0).
    time_to_expiry_years : float
        Time to expiration in annualized years (T >= 0).
    iv : float
        Annualized implied volatility as a decimal (sigma >= 0).
    rate : float, optional
        Risk-free interest rate as a decimal (annualized, default = 0.0).

    Returns
    -------
    float
        European put option price.
    """
    _validate_inputs(spot, strike, time_to_expiry_years, iv, rate)

    # Expiry boundary condition
    if time_to_expiry_years == 0.0:
        return max(0.0, strike - spot)

    discount_factor = math.exp(-rate * time_to_expiry_years)
    discounted_strike = strike * discount_factor

    # Zero volatility boundary condition
    if iv == 0.0:
        return max(0.0, discounted_strike - spot)

    d1_val, d2_val = d1_d2(spot, strike, time_to_expiry_years, iv, rate)
    price = discounted_strike * std_normal_cdf(-d2_val) - spot * std_normal_cdf(-d1_val)
    return max(0.0, price)


def black_scholes_price(
    option_type: str,
    spot: float,
    strike: float,
    time_to_expiry_years: float,
    iv: float,
    rate: float = 0.0,
) -> float:
    """
    Calculate European option price for a given option type ('call'/'c' or 'put'/'p').

    Parameters
    ----------
    option_type : str
        'call', 'c', 'put', or 'p' (case-insensitive).
    spot : float
        Current spot / underlying asset price.
    strike : float
        Option strike price.
    time_to_expiry_years : float
        Time to expiration in annualized years.
    iv : float
        Annualized implied volatility as a decimal.
    rate : float, optional
        Risk-free interest rate as a decimal (default = 0.0).

    Returns
    -------
    float
        European option price.
    """
    clean_type = option_type.strip().lower()
    if clean_type in ("call", "c"):
        return call_price(spot, strike, time_to_expiry_years, iv, rate)
    elif clean_type in ("put", "p"):
        return put_price(spot, strike, time_to_expiry_years, iv, rate)
    else:
        raise ValueError(f"Invalid option_type '{option_type}'; expected 'call' ('c') or 'put' ('p')")


# Convenient aliases
black_scholes_call = call_price
black_scholes_put = put_price
