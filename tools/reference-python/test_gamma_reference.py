"""
Unit Tests for Independent Python Reference Implementation of Deribit Inverse BTC Option Gamma & GEX.

Milestone: M4.2 Independent Validation
Author: Quantitative Finance Engineering / Antigravity

Run:
    python tools/reference-python/test_gamma_reference.py
"""

from __future__ import annotations

import math
import unittest

from gamma_reference import (
    DEFAULT_SIGNIFICANCE_FRACTION,
    MILLISECONDS_PER_DAY,
    MINIMUM_PROFILE_TIME_TO_EXPIRY_MS,
    GammaProfilePoint,
    OptionContract,
    calculate_black_scholes_d1_d2,
    calculate_contract_exposure,
    calculate_days_to_expiry,
    calculate_deribit_inverse_gamma,
    calculate_gamma_flip,
    calculate_gamma_profile,
    calculate_gross_gamma_btc,
    calculate_gross_gamma_one_percent_usd,
    calculate_modeled_signed_gex_one_percent_usd,
    calculate_time_to_expiry_years,
    find_zero_crossings,
    generate_spot_grid,
    interpolate_zero,
    select_headline_gamma_flip,
    standard_normal_cdf,
    standard_normal_pdf,
)


class TestNormalDistribution(unittest.TestCase):
    """Test standard normal PDF and CDF implementations."""

    def test_standard_normal_pdf(self):
        # N'(0) = 1 / sqrt(2*pi) ~= 0.3989422804014327
        self.assertAlmostEqual(
            standard_normal_pdf(0.0), 0.3989422804014327, places=12
        )
        # Symmetry: N'(x) == N'(-x)
        self.assertAlmostEqual(
            standard_normal_pdf(1.5), standard_normal_pdf(-1.5), places=12
        )
        # N'(1) = exp(-0.5) / sqrt(2*pi) ~= 0.24197072451914337
        self.assertAlmostEqual(
            standard_normal_pdf(1.0), 0.24197072451914337, places=12
        )

    def test_standard_normal_cdf(self):
        # N(0) = 0.5
        self.assertAlmostEqual(standard_normal_cdf(0.0), 0.5, places=12)
        # N(inf) = 1.0, N(-inf) = 0.0
        self.assertEqual(standard_normal_cdf(float("inf")), 1.0)
        self.assertEqual(standard_normal_cdf(float("-inf")), 0.0)
        self.assertTrue(math.isnan(standard_normal_cdf(float("nan"))))
        # Symmetry: N(-x) == 1 - N(x)
        x = 1.959963984540054  # 97.5% critical value
        self.assertAlmostEqual(standard_normal_cdf(x), 0.975, places=4)
        self.assertAlmostEqual(
            standard_normal_cdf(-x), 1.0 - standard_normal_cdf(x), places=12
        )


class TestBlackScholesHelpers(unittest.TestCase):
    """Test Black-Scholes d1, d2 and inverse gamma calculations."""

    def test_canonical_d1_d2_and_gamma(self):
        # S=100, K=100, T=1, IV=0.20, r=0.05
        # d1 = [ln(1) + (0.05 + 0.04/2)*1] / (0.20 * 1) = 0.07 / 0.20 = 0.35
        # d2 = 0.35 - 0.20 = 0.15
        d1, d2 = calculate_black_scholes_d1_d2(
            spot_price=100.0,
            strike=100.0,
            time_to_expiry_years=1.0,
            volatility_decimal=0.20,
            interest_rate_decimal=0.05,
        )
        self.assertAlmostEqual(d1, 0.35, places=12)
        self.assertAlmostEqual(d2, 0.15, places=12)

        # Gamma = N'(0.35) / (100 * 0.20 * 1)
        # N'(0.35) ~= 0.375240347
        # Gamma ~= 0.375240347 / 20 = 0.0187620173
        gamma = calculate_deribit_inverse_gamma(
            spot_price=100.0,
            strike=100.0,
            time_to_expiry_years=1.0,
            volatility_decimal=0.20,
            interest_rate_decimal=0.05,
        )
        self.assertAlmostEqual(gamma, 0.0187620173, places=8)

    def test_extreme_market_conditions(self):
        # Extreme IV = 5.0 (500%), short expiry = 1 day, high spot
        gamma = calculate_deribit_inverse_gamma(
            spot_price=100_000.0,
            strike=200_000.0,
            time_to_expiry_years=1.0 / 365.0,
            volatility_decimal=5.0,
            interest_rate_decimal=0.0,
        )
        self.assertTrue(math.isfinite(gamma))
        self.assertGreater(gamma, 0.0)

    def test_domain_validation_errors(self):
        # Non-positive spot
        with self.assertRaises(ValueError):
            calculate_black_scholes_d1_d2(0.0, 100.0, 1.0, 0.2, 0.0)
        with self.assertRaises(ValueError):
            calculate_black_scholes_d1_d2(-10.0, 100.0, 1.0, 0.2, 0.0)
        # Non-positive strike
        with self.assertRaises(ValueError):
            calculate_black_scholes_d1_d2(100.0, 0.0, 1.0, 0.2, 0.0)
        # Non-positive time
        with self.assertRaises(ValueError):
            calculate_black_scholes_d1_d2(100.0, 100.0, 0.0, 0.2, 0.0)
        # Non-positive IV
        with self.assertRaises(ValueError):
            calculate_black_scholes_d1_d2(100.0, 100.0, 1.0, 0.0, 0.0)
        # Non-finite rate
        with self.assertRaises(ValueError):
            calculate_black_scholes_d1_d2(100.0, 100.0, 1.0, 0.2, float("inf"))


class TestWorkedExamplesFromProjectPlan(unittest.TestCase):
    """
    Test explicitly worked examples documented in PROJECT_PLAN.md:
    S = $100,000
    Gamma = 0.00002 BTC/$
    OI = 500 BTC
    sign = +1 (Call) -> GEX = $1,000,000 per 1% move
    sign = -1 (Put) -> GEX = -$1,000,000 per 1% move
    """

    def test_project_plan_worked_example_call_and_put(self):
        spot = 100_000.0
        gamma = 0.00002
        oi_btc = 500.0

        # Gross gamma concentration in BTC: |Gamma| * OI = 0.00002 * 500 = 0.01 BTC/$
        gross_btc = calculate_gross_gamma_btc(gamma, oi_btc)
        self.assertAlmostEqual(gross_btc, 0.01, places=10)

        # Gross gamma 1% USD: |Gamma| * OI * S^2 * 0.01
        # = 0.00002 * 500 * (100,000)^2 * 0.01 = 0.01 * 10,000,000,000 * 0.01 = 1,000,000 USD
        gross_usd = calculate_gross_gamma_one_percent_usd(
            gamma_per_dollar=gamma,
            open_interest_btc=oi_btc,
            spot_price=spot,
        )
        self.assertEqual(gross_usd, 1_000_000.0)

        # Call GEX: sign = +1 -> +$1,000,000
        call_gex = calculate_modeled_signed_gex_one_percent_usd(
            option_type="call",
            gamma_per_dollar=gamma,
            open_interest_btc=oi_btc,
            spot_price=spot,
        )
        self.assertEqual(call_gex, 1_000_000.0)

        # Put GEX: sign = -1 -> -$1,000,000
        put_gex = calculate_modeled_signed_gex_one_percent_usd(
            option_type="put",
            gamma_per_dollar=gamma,
            open_interest_btc=oi_btc,
            spot_price=spot,
        )
        self.assertEqual(put_gex, -1_000_000.0)

    def test_project_plan_worked_example_smaller_oi(self):
        # S=$100,000, Gamma=0.00002, OI=10 BTC -> GEX = $20,000
        call_gex = calculate_modeled_signed_gex_one_percent_usd(
            option_type="call",
            gamma_per_dollar=0.00002,
            open_interest_btc=10.0,
            spot_price=100_000.0,
        )
        self.assertEqual(call_gex, 20_000.0)

    def test_zero_oi(self):
        # OI = 0 BTC -> GEX = $0
        gex = calculate_modeled_signed_gex_one_percent_usd(
            option_type="call",
            gamma_per_dollar=0.00002,
            open_interest_btc=0.0,
            spot_price=100_000.0,
        )
        self.assertEqual(gex, 0.0)

    def test_invalid_exposure_inputs(self):
        with self.assertRaises(ValueError):
            calculate_gross_gamma_one_percent_usd(0.00002, -5.0, 100_000.0)
        with self.assertRaises(ValueError):
            calculate_gross_gamma_one_percent_usd(0.00002, 500.0, -100_000.0)
        with self.assertRaises(ValueError):
            calculate_modeled_signed_gex_one_percent_usd(
                "invalid_type", 0.00002, 500.0, 100_000.0
            )


class TestSpotGridGenerator(unittest.TestCase):
    """Test the bounded 0.7x to 1.3x spot grid generator."""

    def test_default_grid_at_100k(self):
        spot = 100_000.0
        grid = generate_spot_grid(spot)

        # Bounds: 0.7 * 100,000 = 70,000 and 1.3 * 100,000 = 130,000
        self.assertEqual(grid[0], 70_000.0)
        self.assertEqual(grid[-1], 130_000.0)

        # Spot itself is guaranteed present
        self.assertIn(100_000.0, grid)

        # Step = max(100, 0.5% of 100,000) = 500
        self.assertEqual(grid[1] - grid[0], 500.0)

        # Strictly ascending
        for i in range(len(grid) - 1):
            self.assertLess(grid[i], grid[i + 1])

    def test_custom_grid_bounds_and_step(self):
        grid = generate_spot_grid(
            current_spot_price=50_000.0,
            lower_price=45_000.0,
            upper_price=55_000.0,
            step=1_000.0,
        )
        self.assertEqual(grid[0], 45_000.0)
        self.assertEqual(grid[-1], 55_000.0)
        self.assertIn(50_000.0, grid)
        self.assertEqual(grid, [45000.0, 46000.0, 47000.0, 48000.0, 49000.0, 50000.0, 51000.0, 52000.0, 53000.0, 54000.0, 55000.0])

    def test_invalid_grid_parameters(self):
        with self.assertRaises(ValueError):
            generate_spot_grid(-100.0)
        with self.assertRaises(ValueError):
            generate_spot_grid(100.0, lower_price=120.0, upper_price=80.0)
        with self.assertRaises(ValueError):
            generate_spot_grid(100.0, step=-5.0)


class TestZeroCrossingDetection(unittest.TestCase):
    """Test linear interpolation and zero-crossing detection."""

    def test_linear_interpolation(self):
        pt1 = GammaProfilePoint(spot_price=50.0, modeled_gex_one_percent_usd=-10.0)
        pt2 = GammaProfilePoint(spot_price=100.0, modeled_gex_one_percent_usd=10.0)
        zero = interpolate_zero(pt1, pt2)
        # S_zero = 50 + (0 - (-10)) * (100 - 50) / (10 - (-10)) = 50 + 10 * 50 / 20 = 75
        self.assertEqual(zero, 75.0)

    def test_multiple_crossings_and_tie_breaking(self):
        profile = [
            GammaProfilePoint(spot_price=50.0, modeled_gex_one_percent_usd=-10.0),
            GammaProfilePoint(spot_price=100.0, modeled_gex_one_percent_usd=10.0),
            GammaProfilePoint(spot_price=150.0, modeled_gex_one_percent_usd=-10.0),
            GammaProfilePoint(spot_price=200.0, modeled_gex_one_percent_usd=10.0),
        ]
        # Crossings between:
        # [50, 100] -> zero at 75
        # [100, 150] -> zero at 125
        # [150, 200] -> zero at 175
        crossings = find_zero_crossings(profile, current_spot_price=100.0)
        self.assertEqual(len(crossings), 3)
        self.assertEqual([c.price for c in crossings], [75.0, 125.0, 175.0])

        # Headline tie-breaking:
        # Distance to 100: |75 - 100| = 25, |125 - 100| = 25, |175 - 100| = 75
        # Tie between 75 and 125: rule picks lower price (75)
        headline = select_headline_gamma_flip(crossings)
        self.assertIsNotNone(headline)
        self.assertEqual(headline.price, 75.0)

    def test_rejection_of_insignificant_crossings(self):
        # Profile peak = 1000, 0.5% threshold = 5.0
        # Brackets with GEX = +1 and -1 are < 5.0, so must be rejected
        profile = [
            GammaProfilePoint(spot_price=90.0, modeled_gex_one_percent_usd=1000.0),
            GammaProfilePoint(spot_price=95.0, modeled_gex_one_percent_usd=1.0),
            GammaProfilePoint(spot_price=100.0, modeled_gex_one_percent_usd=-1.0),
            GammaProfilePoint(spot_price=105.0, modeled_gex_one_percent_usd=-1000.0),
        ]
        crossings = find_zero_crossings(profile, current_spot_price=100.0)
        self.assertEqual(crossings, [])

    def test_no_crossing_profiles(self):
        # Purely positive profile
        profile_positive = [
            GammaProfilePoint(spot_price=90.0, modeled_gex_one_percent_usd=10.0),
            GammaProfilePoint(spot_price=110.0, modeled_gex_one_percent_usd=20.0),
        ]
        self.assertEqual(
            find_zero_crossings(profile_positive, current_spot_price=100.0), []
        )
        self.assertIsNone(select_headline_gamma_flip([]))

        # Flat zero profile
        profile_zero = [
            GammaProfilePoint(spot_price=90.0, modeled_gex_one_percent_usd=0.0),
            GammaProfilePoint(spot_price=110.0, modeled_gex_one_percent_usd=0.0),
        ]
        self.assertEqual(
            find_zero_crossings(profile_zero, current_spot_price=100.0), []
        )


class TestFullGammaProfileAndFlip(unittest.TestCase):
    """Test full gamma profile calculation and Gamma Flip resolution."""

    def test_single_call_profile_has_no_forced_crossing(self):
        # Call only: positive GEX across entire profile -> no crossing -> price is None
        contract = OptionContract(
            instrument_name="BTC-TEST-CALL",
            strike=100.0,
            option_type="call",
            open_interest_btc=10.0,
            mark_iv_decimal=0.80,
            time_to_expiry_years=30.0 / 365.0,
        )
        profile = calculate_gamma_profile(
            contracts=[contract],
            current_spot_price=100.0,
            spot_grid=[70.0, 100.0, 130.0],
        )
        self.assertEqual(len(profile), 3)
        self.assertTrue(all(pt.modeled_gex_one_percent_usd > 0 for pt in profile))

        flip_result = calculate_gamma_flip(
            contracts=[contract],
            current_spot_price=100.0,
        )
        self.assertIsNone(flip_result.price)
        self.assertIsNone(flip_result.headline_crossing)
        self.assertEqual(flip_result.qualifying_crossings, [])

    def test_mixed_call_put_portfolio_produces_gamma_flip(self):
        # Put at 95k (OI=200 BTC) and Call at 105k (OI=200 BTC), IV=0.60, T=30d
        # Below 95k: put dominance -> negative GEX
        # Above 105k: call dominance -> positive GEX
        # There should be a clean Gamma Flip between 95k and 105k (near 98.4k)
        now_ms = 1_700_000_000_000.0
        expiry_ms = now_ms + 30 * MILLISECONDS_PER_DAY

        put_contract = OptionContract(
            instrument_name="BTC-26AUG-95000-P",
            strike=95_000.0,
            option_type="put",
            open_interest_btc=200.0,
            mark_iv_decimal=0.60,
            expiry_timestamp_ms=expiry_ms,
        )
        call_contract = OptionContract(
            instrument_name="BTC-26AUG-105000-C",
            strike=105_000.0,
            option_type="call",
            open_interest_btc=200.0,
            mark_iv_decimal=0.60,
            expiry_timestamp_ms=expiry_ms,
        )

        flip_result = calculate_gamma_flip(
            contracts=[put_contract, call_contract],
            current_spot_price=100_000.0,
            calculation_timestamp_ms=now_ms,
        )

        self.assertIsNotNone(flip_result.price)
        self.assertAlmostEqual(flip_result.price, 98_408.2, delta=1.0)
        self.assertGreater(len(flip_result.qualifying_crossings), 0)
        self.assertGreater(flip_result.profile_peak, 0)

    def test_near_expiry_15_minute_floor_exclusion(self):
        # Contract with 10 minutes remaining (< 15 mins) must be excluded from profile
        now_ms = 1_700_000_000_000.0
        near_expiry_ms = now_ms + 10 * 60 * 1000.0  # 10 minutes

        expired_contract = OptionContract(
            instrument_name="BTC-EXPIRING-SOON",
            strike=100_000.0,
            option_type="call",
            open_interest_btc=500.0,
            mark_iv_decimal=0.80,
            expiry_timestamp_ms=near_expiry_ms,
        )

        # Time to expiry should return None when minimum floor (15 min = 900,000 ms) is enforced
        tte = expired_contract.resolve_time_to_expiry_years(
            calculation_timestamp_ms=now_ms,
            minimum_time_to_expiry_ms=MINIMUM_PROFILE_TIME_TO_EXPIRY_MS,
        )
        self.assertIsNone(tte)

        # Profile with only near-expiry contracts results in empty/zero GEX profile
        profile = calculate_gamma_profile(
            contracts=[expired_contract],
            current_spot_price=100_000.0,
            calculation_timestamp_ms=now_ms,
            minimum_time_to_expiry_ms=MINIMUM_PROFILE_TIME_TO_EXPIRY_MS,
        )
        self.assertTrue(all(pt.modeled_gex_one_percent_usd == 0.0 for pt in profile))


if __name__ == "__main__":
    unittest.main(verbosity=2)
