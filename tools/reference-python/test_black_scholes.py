"""
Unit test suite for Python Black-Scholes Reference Model.

Verifies:
1. Standard Normal CDF and PDF properties:
   - PDF symmetry: phi(x) == phi(-x)
   - PDF standard value: phi(0) == 1 / sqrt(2*pi)
   - CDF symmetry: Phi(x) + Phi(-x) == 1.0
   - CDF known values: Phi(0) = 0.5, Phi(1.959963984540054) = 0.975, etc.
   - CDF error < 1e-12 against high-precision standard values
   - Tail asymptotic limits (x -> +inf, x -> -inf)
2. d1 and d2 calculations:
   - Exact mathematical formula verification
   - S = K, r = 0 symmetry: d1 = 0.5 * sigma * sqrt(T), d2 = -d1
3. European Call and Put Option Pricing:
   - Standard textbook benchmark pricing (Hull, S=49/K=50 and S=100/K=100)
   - Put-Call Parity exactness: C - P = S - K * exp(-r * T) across 3,500+ parameter combinations
   - Asymptotic behavior:
     * Deep ITM / OTM calls and puts
     * At-expiry payoff convergence (T -> 0)
     * Zero-volatility convergence (sigma -> 0)
     * Extreme volatility behavior (sigma -> inf)
4. Input validation and error handling:
   - Negative spot, strike, T, or IV
   - Non-finite (NaN / inf) inputs
   - Invalid option type strings
"""

from __future__ import annotations

import math
import os
import sys
import unittest

# Ensure the module directory is on sys.path for direct execution
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from black_scholes import (
    INVERSE_SQRT_TWO_PI,
    black_scholes_call,
    black_scholes_price,
    black_scholes_put,
    call_price,
    d1,
    d1_d2,
    d2,
    put_price,
    std_normal_cdf,
    std_normal_pdf,
)


class TestNormalDistribution(unittest.TestCase):
    """Test suite for standard normal PDF and CDF implementations."""

    def test_pdf_standard_values(self) -> None:
        """Verify standard normal PDF against analytical values."""
        # phi(0) = 1 / sqrt(2*pi) ~ 0.3989422804014327
        self.assertAlmostEqual(std_normal_pdf(0.0), INVERSE_SQRT_TWO_PI, delta=1e-15)

        # phi(1) = (1 / sqrt(2*pi)) * exp(-0.5) ~ 0.24197072451914337
        expected_pdf_1 = INVERSE_SQRT_TWO_PI * math.exp(-0.5)
        self.assertAlmostEqual(std_normal_pdf(1.0), expected_pdf_1, delta=1e-15)

        # phi(2) = (1 / sqrt(2*pi)) * exp(-2.0) ~ 0.05399096651318806
        expected_pdf_2 = INVERSE_SQRT_TWO_PI * math.exp(-2.0)
        self.assertAlmostEqual(std_normal_pdf(2.0), expected_pdf_2, delta=1e-15)

    def test_pdf_symmetry(self) -> None:
        """Verify phi(x) == phi(-x) across a dense range."""
        test_points = [0.001, 0.01, 0.1, 0.5, 1.0, 1.645, 1.96, 2.58, 3.0, 4.5, 6.0, 10.0]
        for x in test_points:
            with self.subTest(x=x):
                self.assertEqual(std_normal_pdf(x), std_normal_pdf(-x))

    def test_pdf_limits(self) -> None:
        """Verify PDF limits at infinity and NaN."""
        self.assertEqual(std_normal_pdf(float("inf")), 0.0)
        self.assertEqual(std_normal_pdf(float("-inf")), 0.0)
        self.assertTrue(math.isnan(std_normal_pdf(float("nan"))))

    def test_pdf_integral_trapezoidal(self) -> None:
        """Verify integral of standard normal PDF over [-10, 10] equals 1.0."""
        # Numerical integration using trapezoidal rule with step 0.001
        step = 0.001
        start = -10.0
        end = 10.0
        n_steps = int((end - start) / step)
        total_area = 0.5 * (std_normal_pdf(start) + std_normal_pdf(end)) * step
        for i in range(1, n_steps):
            x = start + i * step
            total_area += std_normal_pdf(x) * step
        self.assertAlmostEqual(total_area, 1.0, delta=1e-7)

    def test_cdf_known_standard_values(self) -> None:
        """Verify CDF against high-precision standard statistical constants (< 1e-12 error)."""
        # Exact values from high-precision statistical tables / math libraries
        benchmarks = [
            (0.0, 0.5),
            (1.0, 0.8413447460685429),
            (-1.0, 0.15865525393145705),
            (1.6448536269514722, 0.95),
            (-1.6448536269514722, 0.05),
            (1.959963984540054, 0.975),
            (-1.959963984540054, 0.025),
            (2.3263478740408408, 0.99),
            (-2.3263478740408408, 0.01),
            (2.5758293035489004, 0.995),
            (-2.5758293035489004, 0.005),
            (3.0, 0.9986501019683699),
            (-3.0, 0.0013498980316301),
            (4.0, 0.9999683287581669),
            (-4.0, 0.0000316712418331),
            (5.0, 0.9999997133484281),
            (-5.0, 0.0000002866515719),
        ]
        for x, expected in benchmarks:
            with self.subTest(x=x):
                computed = std_normal_cdf(x)
                self.assertAlmostEqual(computed, expected, delta=1e-12)

    def test_cdf_symmetry(self) -> None:
        """Verify CDF symmetry: Phi(x) + Phi(-x) == 1.0 exactly or within float precision."""
        test_points = [0.0, 0.01, 0.1, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 8.0]
        for x in test_points:
            with self.subTest(x=x):
                sum_val = std_normal_cdf(x) + std_normal_cdf(-x)
                self.assertAlmostEqual(sum_val, 1.0, delta=1e-15)

    def test_cdf_monotonicity(self) -> None:
        """Verify CDF is strictly monotonically increasing."""
        points = [-10.0, -5.0, -3.0, -2.0, -1.0, -0.5, 0.0, 0.5, 1.0, 2.0, 3.0, 5.0, 10.0]
        for i in range(len(points) - 1):
            x1, x2 = points[i], points[i + 1]
            self.assertLess(std_normal_cdf(x1), std_normal_cdf(x2))

    def test_cdf_limits(self) -> None:
        """Verify CDF tail asymptotic limits and NaN handling."""
        self.assertEqual(std_normal_cdf(float("inf")), 1.0)
        self.assertEqual(std_normal_cdf(float("-inf")), 0.0)
        self.assertEqual(std_normal_cdf(40.0), 1.0)
        self.assertEqual(std_normal_cdf(-40.0), 0.0)
        self.assertTrue(math.isnan(std_normal_cdf(float("nan"))))


class TestBlackScholesD1D2(unittest.TestCase):
    """Test suite for d1 and d2 calculations."""

    def test_atm_zero_rate_symmetry(self) -> None:
        """When S == K and r == 0, d1 = 0.5 * sigma * sqrt(T) and d2 = -d1."""
        spot = 50000.0
        strike = 50000.0
        rate = 0.0
        time_to_expiry = 0.25
        iv = 0.60

        expected_d1 = 0.5 * iv * math.sqrt(time_to_expiry)
        expected_d2 = -expected_d1

        d1_val = d1(spot, strike, time_to_expiry, iv, rate)
        d2_val = d2(spot, strike, time_to_expiry, iv, rate)
        d1_pair, d2_pair = d1_d2(spot, strike, time_to_expiry, iv, rate)

        self.assertAlmostEqual(d1_val, expected_d1, delta=1e-14)
        self.assertAlmostEqual(d2_val, expected_d2, delta=1e-14)
        self.assertAlmostEqual(d1_pair, expected_d1, delta=1e-14)
        self.assertAlmostEqual(d2_pair, expected_d2, delta=1e-14)

    def test_known_analytical_values(self) -> None:
        """Test d1 and d2 with known analytical case: S=100, K=100, T=1, sigma=0.2, r=0.05."""
        spot = 100.0
        strike = 100.0
        time_to_expiry = 1.0
        iv = 0.20
        rate = 0.05

        # d1 = [ln(1) + (0.05 + 0.5 * 0.04) * 1] / [0.2 * 1] = 0.07 / 0.2 = 0.35
        # d2 = 0.35 - 0.2 = 0.15
        d1_val, d2_val = d1_d2(spot, strike, time_to_expiry, iv, rate)
        self.assertAlmostEqual(d1_val, 0.35, delta=1e-14)
        self.assertAlmostEqual(d2_val, 0.15, delta=1e-14)

    def test_d1_d2_relation(self) -> None:
        """Verify d1 - d2 == iv * sqrt(T) holds generally."""
        test_cases = [
            (30000.0, 35000.0, 0.1, 0.45, 0.03),
            (60000.0, 55000.0, 0.5, 0.75, 0.0),
            (100000.0, 100000.0, 2.0, 0.85, -0.01),
        ]
        for spot, strike, t, iv, rate in test_cases:
            with self.subTest(spot=spot, strike=strike, t=t, iv=iv, rate=rate):
                d1_val, d2_val = d1_d2(spot, strike, t, iv, rate)
                expected_diff = iv * math.sqrt(t)
                self.assertAlmostEqual(d1_val - d2_val, expected_diff, delta=1e-14)


class TestEuropeanOptionPricing(unittest.TestCase):
    """Test suite for European option pricing benchmarks, formulas, and parity."""

    def test_classic_atm_benchmark(self) -> None:
        """
        Verify classic benchmark: S = 100, K = 100, T = 1.0, sigma = 0.20, r = 0.05.
        Analytical:
        d1 = 0.35, d2 = 0.15
        Call = 100 * Phi(0.35) - 100 * exp(-0.05) * Phi(0.15) = 10.450583572185565
        Put = 100 * exp(-0.05) * Phi(-0.15) - 100 * Phi(-0.35) = 5.573526022256971
        """
        spot = 100.0
        strike = 100.0
        t = 1.0
        iv = 0.20
        rate = 0.05

        c = call_price(spot, strike, t, iv, rate)
        p = put_price(spot, strike, t, iv, rate)

        expected_c = 10.450583572185565
        expected_p = 5.573526022256971

        self.assertAlmostEqual(c, expected_c, delta=1e-12)
        self.assertAlmostEqual(p, expected_p, delta=1e-12)

        # Exact parity check: C - P = S - K * exp(-r * T)
        self.assertAlmostEqual(c - p, spot - strike * math.exp(-rate * t), delta=1e-14)

    def test_hull_textbook_benchmark(self) -> None:
        """
        Verify European call and put against Hull (Options, Futures, and Other Derivatives).
        S = 49, K = 50, r = 0.05, sigma = 0.20, T = 0.3846.
        Exact analytical: Call = 2.4004610869656666, Put = 2.448146933950394.
        """
        spot = 49.0
        strike = 50.0
        rate = 0.05
        iv = 0.20
        t = 0.3846

        c_price = call_price(spot, strike, t, iv, rate)
        p_price = put_price(spot, strike, t, iv, rate)

        expected_c = 2.4004610869656666
        expected_p = 2.448146933950394

        self.assertAlmostEqual(c_price, expected_c, delta=1e-12)
        self.assertAlmostEqual(p_price, expected_p, delta=1e-12)

        # Put-Call Parity exact check: C - P = S - K * exp(-r * T)
        parity_lhs = c_price - p_price
        parity_rhs = spot - strike * math.exp(-rate * t)
        self.assertAlmostEqual(parity_lhs, parity_rhs, delta=1e-13)

    def test_atm_crypto_benchmark(self) -> None:
        """
        Verify BTC typical option pricing:
        S = 60000, K = 60000, r = 0.0, sigma = 0.60, T = 30 / 365.
        """
        spot = 60000.0
        strike = 60000.0
        rate = 0.0
        iv = 0.60
        t = 30.0 / 365.0

        c_price = call_price(spot, strike, t, iv, rate)
        p_price = put_price(spot, strike, t, iv, rate)

        # For S=K and r=0, Call price must equal Put price
        self.assertAlmostEqual(c_price, p_price, delta=1e-12)

        # Verify against analytical formula: S * (2 * Phi(0.5 * iv * sqrt(t)) - 1)
        expected_price = spot * (2.0 * std_normal_cdf(0.5 * iv * math.sqrt(t)) - 1.0)
        self.assertAlmostEqual(c_price, expected_price, delta=1e-12)

    def test_put_call_parity_grid(self) -> None:
        """
        Comprehensive Put-Call Parity verification across a large multidimensional parameter grid:
        C - P == S - K * exp(-r * T)
        Error must be < 1e-10 across all combinations.
        """
        spots = [100.0, 1000.0, 20000.0, 60000.0, 100000.0, 250000.0]
        strike_ratios = [0.5, 0.75, 0.9, 1.0, 1.1, 1.25, 2.0]
        times = [1.0 / 365.0, 7.0 / 365.0, 30.0 / 365.0, 90.0 / 365.0, 0.5, 1.0, 2.5]
        volatilities = [0.05, 0.20, 0.50, 0.80, 1.20, 2.50]
        rates = [-0.02, 0.0, 0.03, 0.08]

        count = 0
        max_error = 0.0

        for spot in spots:
            for ratio in strike_ratios:
                strike = spot * ratio
                for t in times:
                    for iv in volatilities:
                        for rate in rates:
                            c = call_price(spot, strike, t, iv, rate)
                            p = put_price(spot, strike, t, iv, rate)

                            parity_lhs = c - p
                            parity_rhs = spot - strike * math.exp(-rate * t)
                            error = abs(parity_lhs - parity_rhs)

                            if error > max_error:
                                max_error = error

                            self.assertAlmostEqual(
                                parity_lhs,
                                parity_rhs,
                                delta=1e-10,
                                msg=f"Parity failed for S={spot}, K={strike}, T={t}, IV={iv}, r={rate}",
                            )
                            count += 1

        self.assertGreater(count, 3500)
        self.assertLess(max_error, 1e-10)

    def test_black_scholes_price_dispatcher(self) -> None:
        """Verify black_scholes_price dispatcher function and aliases."""
        spot = 50000.0
        strike = 52000.0
        t = 0.25
        iv = 0.55
        rate = 0.02

        c_expected = call_price(spot, strike, t, iv, rate)
        p_expected = put_price(spot, strike, t, iv, rate)

        self.assertEqual(black_scholes_price("call", spot, strike, t, iv, rate), c_expected)
        self.assertEqual(black_scholes_price("Call", spot, strike, t, iv, rate), c_expected)
        self.assertEqual(black_scholes_price("c", spot, strike, t, iv, rate), c_expected)
        self.assertEqual(black_scholes_price("C", spot, strike, t, iv, rate), c_expected)

        self.assertEqual(black_scholes_price("put", spot, strike, t, iv, rate), p_expected)
        self.assertEqual(black_scholes_price("Put", spot, strike, t, iv, rate), p_expected)
        self.assertEqual(black_scholes_price("p", spot, strike, t, iv, rate), p_expected)
        self.assertEqual(black_scholes_price("P", spot, strike, t, iv, rate), p_expected)

        self.assertEqual(black_scholes_call(spot, strike, t, iv, rate), c_expected)
        self.assertEqual(black_scholes_put(spot, strike, t, iv, rate), p_expected)

        with self.assertRaises(ValueError):
            black_scholes_price("invalid_type", spot, strike, t, iv, rate)


class TestAsymptoticAndBoundaryConditions(unittest.TestCase):
    """Test suite for boundary conditions and asymptotic behavior."""

    def test_at_expiry_payoff(self) -> None:
        """At T == 0, option price must equal intrinsic value."""
        spot = 60000.0
        strikes = [40000.0, 50000.0, 60000.0, 70000.0, 80000.0]

        for strike in strikes:
            with self.subTest(strike=strike):
                expected_call = max(0.0, spot - strike)
                expected_put = max(0.0, strike - spot)

                self.assertEqual(call_price(spot, strike, 0.0, 0.60, 0.0), expected_call)
                self.assertEqual(put_price(spot, strike, 0.0, 0.60, 0.0), expected_put)

    def test_near_zero_expiry_continuity(self) -> None:
        """As T -> 0+, Black-Scholes price converges smoothly to intrinsic payoff."""
        spot = 60000.0
        strike_itm = 50000.0
        strike_otm = 70000.0
        iv = 0.50
        rate = 0.0

        t_small = 1e-8  # ~0.3 seconds
        call_itm = call_price(spot, strike_itm, t_small, iv, rate)
        call_otm = call_price(spot, strike_otm, t_small, iv, rate)
        put_itm = put_price(spot, strike_otm, t_small, iv, rate)
        put_otm = put_price(spot, strike_itm, t_small, iv, rate)

        self.assertAlmostEqual(call_itm, 10000.0, delta=1e-3)
        self.assertAlmostEqual(call_otm, 0.0, delta=1e-3)
        self.assertAlmostEqual(put_itm, 10000.0, delta=1e-3)
        self.assertAlmostEqual(put_otm, 0.0, delta=1e-3)

    def test_zero_volatility(self) -> None:
        """At iv == 0, option price equals discounted intrinsic value."""
        spot = 60000.0
        strike_itm = 50000.0
        strike_otm = 70000.0
        t = 0.5
        rate = 0.04
        discounted_itm = strike_itm * math.exp(-rate * t)
        discounted_otm = strike_otm * math.exp(-rate * t)

        self.assertAlmostEqual(
            call_price(spot, strike_itm, t, 0.0, rate),
            spot - discounted_itm,
            delta=1e-12,
        )
        self.assertAlmostEqual(
            call_price(spot, strike_otm, t, 0.0, rate),
            0.0,
            delta=1e-12,
        )
        self.assertAlmostEqual(
            put_price(spot, strike_otm, t, 0.0, rate),
            discounted_otm - spot,
            delta=1e-12,
        )
        self.assertAlmostEqual(
            put_price(spot, strike_itm, t, 0.0, rate),
            0.0,
            delta=1e-12,
        )

    def test_deep_itm_and_otm_extremes(self) -> None:
        """Deep ITM and OTM asymptotic limits."""
        spot = 100000.0
        t = 0.25
        iv = 0.50
        rate = 0.05

        # Extreme ITM call / OTM put: Strike = 1.0
        strike_low = 1.0
        discounted_low = strike_low * math.exp(-rate * t)
        self.assertAlmostEqual(call_price(spot, strike_low, t, iv, rate), spot - discounted_low, delta=1e-6)
        self.assertAlmostEqual(put_price(spot, strike_low, t, iv, rate), 0.0, delta=1e-12)

        # Extreme OTM call / ITM put: Strike = 10,000,000.0
        strike_high = 10_000_000.0
        discounted_high = strike_high * math.exp(-rate * t)
        self.assertAlmostEqual(call_price(spot, strike_high, t, iv, rate), 0.0, delta=1e-12)
        self.assertAlmostEqual(put_price(spot, strike_high, t, iv, rate), discounted_high - spot, delta=1e-6)

    def test_extreme_high_volatility(self) -> None:
        """As sigma -> inf, Call -> S and Put -> K * exp(-r * T)."""
        spot = 50000.0
        strike = 50000.0
        t = 1.0
        rate = 0.03
        iv_huge = 50.0  # 5000% IV

        discounted_strike = strike * math.exp(-rate * t)
        c = call_price(spot, strike, t, iv_huge, rate)
        p = put_price(spot, strike, t, iv_huge, rate)

        self.assertAlmostEqual(c, spot, delta=10.0)
        self.assertAlmostEqual(p, discounted_strike, delta=10.0)
        self.assertAlmostEqual(c - p, spot - discounted_strike, delta=1e-10)

    def test_monotonicity_properties(self) -> None:
        """Verify standard theoretical monotonicity of option prices."""
        spot = 60000.0
        strike = 60000.0
        t = 0.5
        iv = 0.60
        rate = 0.02

        # 1. Call price is strictly increasing in Spot; Put is strictly decreasing in Spot
        c_low_s = call_price(spot - 1000, strike, t, iv, rate)
        c_mid_s = call_price(spot, strike, t, iv, rate)
        c_high_s = call_price(spot + 1000, strike, t, iv, rate)
        self.assertLess(c_low_s, c_mid_s)
        self.assertLess(c_mid_s, c_high_s)

        p_low_s = put_price(spot - 1000, strike, t, iv, rate)
        p_mid_s = put_price(spot, strike, t, iv, rate)
        p_high_s = put_price(spot + 1000, strike, t, iv, rate)
        self.assertGreater(p_low_s, p_mid_s)
        self.assertGreater(p_mid_s, p_high_s)

        # 2. Both Call and Put prices are strictly increasing in IV (Vega > 0)
        c_low_iv = call_price(spot, strike, t, iv - 0.1, rate)
        c_high_iv = call_price(spot, strike, t, iv + 0.1, rate)
        self.assertLess(c_low_iv, c_mid_s)
        self.assertLess(c_mid_s, c_high_iv)

        p_low_iv = put_price(spot, strike, t, iv - 0.1, rate)
        p_high_iv = put_price(spot, strike, t, iv + 0.1, rate)
        self.assertLess(p_low_iv, p_mid_s)
        self.assertLess(p_mid_s, p_high_iv)


class TestInputValidation(unittest.TestCase):
    """Test error handling and validation for invalid inputs."""

    def test_negative_spot(self) -> None:
        with self.assertRaises(ValueError):
            call_price(-100.0, 100.0, 1.0, 0.2)
        with self.assertRaises(ValueError):
            d1(0.0, 100.0, 1.0, 0.2)

    def test_negative_strike(self) -> None:
        with self.assertRaises(ValueError):
            put_price(100.0, -50.0, 1.0, 0.2)
        with self.assertRaises(ValueError):
            d2(100.0, 0.0, 1.0, 0.2)

    def test_negative_expiry(self) -> None:
        with self.assertRaises(ValueError):
            call_price(100.0, 100.0, -0.5, 0.2)

    def test_negative_iv(self) -> None:
        with self.assertRaises(ValueError):
            put_price(100.0, 100.0, 1.0, -0.2)

    def test_nan_inputs(self) -> None:
        nan_val = float("nan")
        with self.assertRaises(ValueError):
            call_price(nan_val, 100.0, 1.0, 0.2)
        with self.assertRaises(ValueError):
            call_price(100.0, nan_val, 1.0, 0.2)
        with self.assertRaises(ValueError):
            call_price(100.0, 100.0, nan_val, 0.2)
        with self.assertRaises(ValueError):
            call_price(100.0, 100.0, 1.0, nan_val)
        with self.assertRaises(ValueError):
            call_price(100.0, 100.0, 1.0, 0.2, nan_val)

    def test_infinite_rate(self) -> None:
        with self.assertRaises(ValueError):
            call_price(100.0, 100.0, 1.0, 0.2, float("inf"))


if __name__ == "__main__":
    unittest.main()
