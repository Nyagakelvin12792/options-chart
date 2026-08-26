"""
Unit tests for Python Reference Max Pain Solver.

Executes a comprehensive suite of deterministic test cases with mathematically verified
known outcomes, edge cases, tie-breaking rules, and TypeScript engine parity verification.
"""

from __future__ import annotations

import math
import unittest

from max_pain_reference import (
    OptionContract,
    calculate_holder_payoff,
    calculate_max_pain,
    calculate_max_pain_from_json,
)


class TestMaxPainReference(unittest.TestCase):
    """Test suite for max_pain_reference.py."""

    def test_calculate_holder_payoff(self) -> None:
        """Verify single contract intrinsic payoff calculation."""
        # In-the-money Call: settlement 105,000, strike 100,000, OI 2.5 BTC -> (105000-100000)*2.5 = 12,500 USD
        self.assertEqual(calculate_holder_payoff(100000, "call", 2.5, 105000), 12500.0)
        # Out-of-the-money Call: settlement 95,000, strike 100,000, OI 2.5 BTC -> 0.0 USD
        self.assertEqual(calculate_holder_payoff(100000, "call", 2.5, 95000), 0.0)
        # At-the-money Call: settlement 100,000, strike 100,000, OI 2.5 BTC -> 0.0 USD
        self.assertEqual(calculate_holder_payoff(100000, "call", 2.5, 100000), 0.0)

        # In-the-money Put: settlement 95,000, strike 100,000, OI 4.0 BTC -> (100000-95000)*4.0 = 20,000 USD
        self.assertEqual(calculate_holder_payoff(100000, "put", 4.0, 95000), 20000.0)
        # Out-of-the-money Put: settlement 105,000, strike 100,000, OI 4.0 BTC -> 0.0 USD
        self.assertEqual(calculate_holder_payoff(100000, "put", 4.0, 105000), 0.0)
        # At-the-money Put: settlement 100,000, strike 100,000, OI 4.0 BTC -> 0.0 USD
        self.assertEqual(calculate_holder_payoff(100000, "put", 4.0, 100000), 0.0)

        # Case-insensitivity & abbreviation support
        self.assertEqual(calculate_holder_payoff(100, "CALL", 1.0, 110), 10.0)
        self.assertEqual(calculate_holder_payoff(100, "c", 1.0, 110), 10.0)
        self.assertEqual(calculate_holder_payoff(100, "PUT", 1.0, 90), 10.0)
        self.assertEqual(calculate_holder_payoff(100, "p", 1.0, 90), 10.0)

        # Invalid option type raises ValueError
        with self.assertRaises(ValueError):
            calculate_holder_payoff(100, "forward", 1.0, 110)

    def test_single_strike_straddle(self) -> None:
        """A single call and put at strike 100,000 -> Max Pain is 100,000 with payout 0."""
        expiry = 1756454400000
        contracts = [
            OptionContract(strike=100000, option_type="call", open_interest_btc=50.0, expiry=expiry),
            OptionContract(strike=100000, option_type="put", open_interest_btc=50.0, expiry=expiry),
        ]
        result = calculate_max_pain(contracts, expiry=expiry)

        self.assertEqual(result.expiry, expiry)
        self.assertEqual(result.max_pain_strike, 100000.0)
        self.assertEqual(result.min_total_payout_usd, 0.0)
        self.assertEqual(result.candidate_strikes, [100000.0])
        self.assertEqual(result.strike_payouts, {100000.0: 0.0})
        self.assertEqual(result.contracts_seen, 2)
        self.assertEqual(result.contracts_included, 2)
        self.assertEqual(result.excluded_counts, {})

    def test_symmetric_three_strike_chain(self) -> None:
        """
        Symmetric chain:
        Strikes: 90,000, 100,000, 110,000 with equal Call and Put OI (10 BTC each).
        Payoffs:
          At 90k:  Calls=0, Puts=(100k-90k)*10 + (110k-90k)*10 = 100k + 200k = 300k. Total = 300k
          At 100k: Calls=(100k-90k)*10=100k, Puts=(110k-100k)*10=100k. Total = 200k
          At 110k: Calls=(110k-90k)*10 + (110k-100k)*10 = 200k + 100k = 300k, Puts=0. Total = 300k
        Expected Max Pain: 100,000 with min payout = 200,000 USD.
        """
        expiry = 1756454400000
        contracts = [
            OptionContract(strike=90000, option_type="call", open_interest_btc=10.0, expiry=expiry),
            OptionContract(strike=100000, option_type="call", open_interest_btc=10.0, expiry=expiry),
            OptionContract(strike=110000, option_type="call", open_interest_btc=10.0, expiry=expiry),
            OptionContract(strike=90000, option_type="put", open_interest_btc=10.0, expiry=expiry),
            OptionContract(strike=100000, option_type="put", open_interest_btc=10.0, expiry=expiry),
            OptionContract(strike=110000, option_type="put", open_interest_btc=10.0, expiry=expiry),
        ]
        result = calculate_max_pain(contracts, expiry=expiry)

        self.assertEqual(result.max_pain_strike, 100000.0)
        self.assertEqual(result.min_total_payout_usd, 200000.0)
        self.assertEqual(result.strike_payouts[90000.0], 300000.0)
        self.assertEqual(result.strike_payouts[100000.0], 200000.0)
        self.assertEqual(result.strike_payouts[110000.0], 300000.0)

    def test_asymmetric_call_heavy_chain(self) -> None:
        """
        Call-heavy chain pulls Max Pain down to minimize large call intrinsic value.
        Strikes: 50k, 60k, 70k.
        Calls: 100 BTC each at 50k, 60k, 70k.
        Puts: 10 BTC each at 50k, 60k, 70k.
        Payoffs:
          At 50k: Calls=0, Puts=(60k-50k)*10 + (70k-50k)*10 = 300,000. Total = 300,000
          At 60k: Calls=(60k-50k)*100 = 1,000,000, Puts=(70k-60k)*10 = 100,000. Total = 1,100,000
          At 70k: Calls=(70k-50k)*100 + (70k-60k)*100 = 3,000,000, Puts=0. Total = 3,000,000
        Expected Max Pain: 50,000 with min payout = 300,000 USD.
        """
        expiry = 1756454400000
        contracts = [
            OptionContract(strike=50000, option_type="call", open_interest_btc=100.0, expiry=expiry),
            OptionContract(strike=60000, option_type="call", open_interest_btc=100.0, expiry=expiry),
            OptionContract(strike=70000, option_type="call", open_interest_btc=100.0, expiry=expiry),
            OptionContract(strike=50000, option_type="put", open_interest_btc=10.0, expiry=expiry),
            OptionContract(strike=60000, option_type="put", open_interest_btc=10.0, expiry=expiry),
            OptionContract(strike=70000, option_type="put", open_interest_btc=10.0, expiry=expiry),
        ]
        result = calculate_max_pain(contracts, expiry=expiry)

        self.assertEqual(result.max_pain_strike, 50000.0)
        self.assertEqual(result.min_total_payout_usd, 300000.0)
        self.assertEqual(result.strike_payouts[50000.0], 300000.0)
        self.assertEqual(result.strike_payouts[60000.0], 1100000.0)
        self.assertEqual(result.strike_payouts[70000.0], 3000000.0)

    def test_asymmetric_put_heavy_chain(self) -> None:
        """
        Put-heavy chain pulls Max Pain up to minimize large put intrinsic value.
        Strikes: 50k, 60k, 70k.
        Calls: 10 BTC each at 50k, 60k, 70k.
        Puts: 100 BTC each at 50k, 60k, 70k.
        Payoffs:
          At 50k: Calls=0, Puts=(60k-50k)*100 + (70k-50k)*100 = 3,000,000. Total = 3,000,000
          At 60k: Calls=100k, Puts=1,000,000. Total = 1,100,000
          At 70k: Calls=(70k-50k)*10 + (70k-60k)*10 = 300,000, Puts=0. Total = 300,000
        Expected Max Pain: 70,000 with min payout = 300,000 USD.
        """
        expiry = 1756454400000
        contracts = [
            OptionContract(strike=50000, option_type="call", open_interest_btc=10.0, expiry=expiry),
            OptionContract(strike=60000, option_type="call", open_interest_btc=10.0, expiry=expiry),
            OptionContract(strike=70000, option_type="call", open_interest_btc=10.0, expiry=expiry),
            OptionContract(strike=50000, option_type="put", open_interest_btc=100.0, expiry=expiry),
            OptionContract(strike=60000, option_type="put", open_interest_btc=100.0, expiry=expiry),
            OptionContract(strike=70000, option_type="put", open_interest_btc=100.0, expiry=expiry),
        ]
        result = calculate_max_pain(contracts, expiry=expiry)

        self.assertEqual(result.max_pain_strike, 70000.0)
        self.assertEqual(result.min_total_payout_usd, 300000.0)
        self.assertEqual(result.strike_payouts[50000.0], 3000000.0)
        self.assertEqual(result.strike_payouts[60000.0], 1100000.0)
        self.assertEqual(result.strike_payouts[70000.0], 300000.0)

    def test_deterministic_tie_breaking(self) -> None:
        """
        Exact tie in min payout:
        Strike 80k Call (OI 10), Strike 90k Put (OI 10).
          At 80k: Calls=0, Puts=(90k-80k)*10 = 100,000. Total = 100,000
          At 90k: Calls=(90k-80k)*10 = 100,000, Puts=0. Total = 100,000
        Both candidate strikes yield exactly 100,000 USD payout.
        Tie-breaker must deterministically select the lower strike (80,000).
        """
        expiry = 1756454400000
        contracts = [
            OptionContract(strike=80000, option_type="call", open_interest_btc=10.0, expiry=expiry),
            OptionContract(strike=90000, option_type="put", open_interest_btc=10.0, expiry=expiry),
        ]
        result = calculate_max_pain(contracts, expiry=expiry)

        self.assertEqual(result.max_pain_strike, 80000.0)
        self.assertEqual(result.min_total_payout_usd, 100000.0)
        self.assertEqual(result.strike_payouts[80000.0], 100000.0)
        self.assertEqual(result.strike_payouts[90000.0], 100000.0)

    def test_expiry_filtering_isolation(self) -> None:
        """Options with non-matching expiry must be ignored."""
        expiry_1 = 1756454400000
        expiry_2 = 1757059200000

        contracts = [
            # Expiry 1: Call 100k OI 10, Put 100k OI 10 -> Max Pain 100k
            OptionContract(strike=100000, option_type="call", open_interest_btc=10.0, expiry=expiry_1),
            OptionContract(strike=100000, option_type="put", open_interest_btc=10.0, expiry=expiry_1),
            # Expiry 2: Call 50k OI 1000 (huge call), Put 50k OI 10 -> Max Pain 50k
            OptionContract(strike=50000, option_type="call", open_interest_btc=1000.0, expiry=expiry_2),
            OptionContract(strike=50000, option_type="put", open_interest_btc=10.0, expiry=expiry_2),
        ]

        res_1 = calculate_max_pain(contracts, expiry=expiry_1)
        self.assertEqual(res_1.expiry, expiry_1)
        self.assertEqual(res_1.max_pain_strike, 100000.0)
        self.assertEqual(res_1.contracts_seen, 2)
        self.assertEqual(res_1.contracts_included, 2)

        res_2 = calculate_max_pain(contracts, expiry=expiry_2)
        self.assertEqual(res_2.expiry, expiry_2)
        self.assertEqual(res_2.max_pain_strike, 50000.0)
        self.assertEqual(res_2.contracts_seen, 2)
        self.assertEqual(res_2.contracts_included, 2)

    def test_zero_open_interest_validity(self) -> None:
        """Contracts with zero open interest are valid, included, and contribute 0 payoff."""
        expiry = 1756454400000
        contracts = [
            OptionContract(strike=90000, option_type="call", open_interest_btc=10.0, expiry=expiry),
            OptionContract(strike=100000, option_type="call", open_interest_btc=0.0, expiry=expiry),  # zero OI
            OptionContract(strike=110000, option_type="put", open_interest_btc=20.0, expiry=expiry),
        ]
        result = calculate_max_pain(contracts, expiry=expiry)

        self.assertEqual(result.contracts_seen, 3)
        self.assertEqual(result.contracts_included, 3)
        self.assertEqual(result.candidate_strikes, [90000.0, 100000.0, 110000.0])
        # At 90k: Calls=0, Puts=(110k-90k)*20 = 400,000
        self.assertEqual(result.strike_payouts[90000.0], 400000.0)
        # At 100k: Calls=(100k-90k)*10 + 0 = 100,000, Puts=(110k-100k)*20 = 200,000. Total = 300,000
        self.assertEqual(result.strike_payouts[100000.0], 300000.0)
        # At 110k: Calls=(110k-90k)*10 + 0 = 200,000, Puts=0. Total = 200,000
        self.assertEqual(result.strike_payouts[110000.0], 200000.0)
        self.assertEqual(result.max_pain_strike, 110000.0)
        self.assertEqual(result.min_total_payout_usd, 200000.0)

    def test_invalid_contracts_and_exclusions(self) -> None:
        """Contracts with invalid strike, invalid OI, or inactive status are properly handled."""
        expiry = 1756454400000
        contracts = [
            OptionContract(strike=100000, option_type="call", open_interest_btc=10.0, expiry=expiry),
            OptionContract(strike=-5000, option_type="call", open_interest_btc=10.0, expiry=expiry),  # negative strike
            OptionContract(strike=0, option_type="call", open_interest_btc=10.0, expiry=expiry),  # zero strike
            OptionContract(strike=float("nan"), option_type="call", open_interest_btc=10.0, expiry=expiry),  # NaN strike
            OptionContract(strike=100000, option_type="put", open_interest_btc=-5.0, expiry=expiry),  # negative OI
            OptionContract(strike=100000, option_type="put", open_interest_btc=float("nan"), expiry=expiry),  # NaN OI
            OptionContract(strike=100000, option_type="put", open_interest_btc=10.0, expiry=expiry, is_active=False),  # inactive
            OptionContract(strike=100000, option_type="straddle", open_interest_btc=10.0, expiry=expiry),  # bad type
        ]
        result = calculate_max_pain(contracts, expiry=expiry)

        self.assertEqual(result.contracts_seen, 8)
        self.assertEqual(result.contracts_included, 1)  # Only the first contract is eligible
        self.assertEqual(result.excluded_counts.get("invalid_strike"), 3)
        self.assertEqual(result.excluded_counts.get("invalid_oi"), 2)
        self.assertEqual(result.excluded_counts.get("invalid_option_type"), 1)
        self.assertEqual(result.max_pain_strike, 100000.0)
        self.assertEqual(result.min_total_payout_usd, 0.0)

    def test_empty_chain(self) -> None:
        """Empty contract list returns None for max pain and zero included contracts."""
        result = calculate_max_pain([], expiry=1756454400000)
        self.assertIsNone(result.max_pain_strike)
        self.assertIsNone(result.min_total_payout_usd)
        self.assertEqual(result.contracts_seen, 0)
        self.assertEqual(result.contracts_included, 0)
        self.assertEqual(result.candidate_strikes, [])

    def test_json_payload_interoperability(self) -> None:
        """Verify calculate_max_pain_from_json handles nested Deribit-like JSON structures."""
        json_data = {
            "instruments": [
                {
                    "instrument": {
                        "instrumentName": "BTC-28AUG26-90000-C",
                        "strike": 90000,
                        "optionType": "call",
                        "expiry": 1756454400000,
                        "isActive": True,
                    },
                    "quote": {
                        "openInterestBtc": 10.0,
                    },
                },
                {
                    "instrument": {
                        "instrumentName": "BTC-28AUG26-110000-P",
                        "strike": 110000,
                        "optionType": "put",
                        "expiry": 1756454400000,
                        "isActive": True,
                    },
                    "quote": {
                        "openInterestBtc": 20.0,
                    },
                },
            ]
        }
        result = calculate_max_pain_from_json(json_data, expiry=1756454400000)
        self.assertEqual(result.max_pain_strike, 110000.0)
        self.assertEqual(result.min_total_payout_usd, 200000.0)
        self.assertEqual(result.contracts_included, 2)

    def test_typescript_parity(self) -> None:
        """
        Exact parity test with TypeScript calculate.test.ts fixture:
        Contracts:
          - Call Strike 90, OI 10
          - Put Strike 110, OI 20
        Candidate strikes: [90, 110]
        Payouts:
          - At 90: Put payout = (110 - 90) * 20 = 400. Total = 400.
          - At 110: Call payout = (110 - 90) * 10 = 200. Total = 200.
        Result: Max Pain = 110 with totalPayoutUsd = 200.
        """
        expiry = 1756454400000
        contracts = [
            OptionContract(strike=90, option_type="call", open_interest_btc=10, expiry=expiry),
            OptionContract(strike=110, option_type="put", open_interest_btc=20, expiry=expiry),
        ]
        result = calculate_max_pain(contracts, expiry=expiry)
        self.assertEqual(result.max_pain_strike, 110)
        self.assertEqual(result.min_total_payout_usd, 200)
        self.assertEqual(result.strike_payouts[90], 400)
        self.assertEqual(result.strike_payouts[110], 200)


if __name__ == "__main__":
    unittest.main(verbosity=2)
