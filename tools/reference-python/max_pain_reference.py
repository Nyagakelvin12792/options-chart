"""
Python Reference Implementation of Expiry-Specific Max Pain Solver.

This module provides a pure, mathematically rigorous, self-contained reference
solver for computing the Max Pain strike for Deribit BTC options chains.

Zero external dependencies - standard Python library only.

Mathematical Formulation:
-------------------------
For a single options expiry with eligible calls and puts:
Let candidate settlement prices K_eval be the set of unique listed strikes {K_1, K_2, ..., K_n}.
At each candidate settlement price K_eval:
  Call_Payoff(K_eval) = sum_{c in Calls} max(0, K_eval - strike_c) * OI_btc_c
  Put_Payoff(K_eval)  = sum_{p in Puts}  max(0, strike_p - K_eval) * OI_btc_p
  Total_Payoff(K_eval) = Call_Payoff(K_eval) + Put_Payoff(K_eval)

The Max Pain strike is the candidate strike K_eval that minimizes Total_Payoff(K_eval).
In case of ties in Total_Payoff, the lower candidate strike is selected (deterministic tie-break).
"""

from __future__ import annotations

import json
import math
import sys
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Union


@dataclass(frozen=True)
class OptionContract:
    """Represents a single option contract within a chain slice."""

    strike: float
    option_type: str  # "call" or "put" (case-insensitive)
    open_interest_btc: float
    expiry: Optional[Union[int, float, str]] = None
    is_active: bool = True
    instrument_name: Optional[str] = None


@dataclass
class StrikePayoffBreakdown:
    """Detailed payoff breakdown at a specific candidate evaluation strike."""

    eval_strike: float
    call_payoff_usd: float
    put_payoff_usd: float
    total_payoff_usd: float


@dataclass
class MaxPainResult:
    """The result of an expiry-specific Max Pain calculation."""

    expiry: Optional[Union[int, float, str]]
    max_pain_strike: Optional[float]
    min_total_payout_usd: Optional[float]
    candidate_strikes: List[float] = field(default_factory=list)
    strike_payouts: Dict[float, float] = field(default_factory=dict)
    breakdowns: List[StrikePayoffBreakdown] = field(default_factory=list)
    contracts_seen: int = 0
    contracts_included: int = 0
    excluded_counts: Dict[str, int] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert result to a serializable dictionary."""
        return {
            "expiry": self.expiry,
            "max_pain_strike": self.max_pain_strike,
            "min_total_payout_usd": self.min_total_payout_usd,
            "candidate_strikes": self.candidate_strikes,
            "strike_payouts": self.strike_payouts,
            "breakdowns": [asdict(b) for b in self.breakdowns],
            "contracts_seen": self.contracts_seen,
            "contracts_included": self.contracts_included,
            "excluded_counts": self.excluded_counts,
        }


def calculate_holder_payoff(
    strike: float,
    option_type: str,
    open_interest_btc: float,
    settlement_price: float,
) -> float:
    """
    Compute intrinsic payoff in USD for option holders at a given settlement price.

    Calls: max(0, settlement_price - strike) * open_interest_btc
    Puts:  max(0, strike - settlement_price) * open_interest_btc
    """
    opt_lower = option_type.lower()
    if opt_lower in ("call", "c"):
        intrinsic = max(0.0, settlement_price - strike)
    elif opt_lower in ("put", "p"):
        intrinsic = max(0.0, strike - settlement_price)
    else:
        raise ValueError(f"Unknown option_type '{option_type}', expected 'call' or 'put'")

    return intrinsic * open_interest_btc


def _coerce_contract(item: Any) -> OptionContract:
    """Helper to coerce various input representations to OptionContract."""
    if isinstance(item, OptionContract):
        return item
    if hasattr(item, "strike") and hasattr(item, "option_type") and hasattr(item, "open_interest_btc"):
        return OptionContract(
            strike=float(item.strike),
            option_type=str(item.option_type),
            open_interest_btc=float(item.open_interest_btc),
            expiry=getattr(item, "expiry_timestamp_ms", getattr(item, "expiry", None)),
            is_active=getattr(item, "is_active", getattr(item, "isActive", True)),
            instrument_name=getattr(item, "instrument_name", getattr(item, "instrumentName", None)),
        )
    if isinstance(item, dict):
        # Support Deribit JSON-like nested snapshot structure or flat dict
        if "instrument" in item and "quote" in item:
            inst = item["instrument"]
            quote = item["quote"]
            return OptionContract(
                strike=float(inst.get("strike", quote.get("strike", 0.0))),
                option_type=str(inst.get("optionType", inst.get("option_type", quote.get("optionType", "call")))),
                open_interest_btc=float(quote.get("openInterestBtc", quote.get("open_interest_btc", 0.0))),
                expiry=inst.get("expiry", quote.get("expiry")),
                is_active=bool(inst.get("isActive", inst.get("is_active", True))),
                instrument_name=inst.get("instrumentName", inst.get("instrument_name")),
            )
        return OptionContract(
            strike=float(item["strike"]),
            option_type=str(item.get("option_type", item.get("optionType", item.get("type", "call")))),
            open_interest_btc=float(item.get("open_interest_btc", item.get("openInterestBtc", item.get("oi", 0.0)))),
            expiry=item.get("expiry"),
            is_active=bool(item.get("is_active", item.get("isActive", True))),
            instrument_name=item.get("instrument_name", item.get("instrumentName")),
        )
    if isinstance(item, (tuple, list)):
        if len(item) == 3:
            return OptionContract(strike=float(item[0]), option_type=str(item[1]), open_interest_btc=float(item[2]))
        elif len(item) >= 4:
            return OptionContract(
                strike=float(item[0]),
                option_type=str(item[1]),
                open_interest_btc=float(item[2]),
                expiry=item[3],
                is_active=bool(item[4]) if len(item) > 4 else True,
            )
    raise TypeError(f"Cannot coerce item of type {type(item)} to OptionContract")


def calculate_max_pain(
    contracts: Sequence[Union[OptionContract, Dict[str, Any], Sequence[Any]]],
    expiry: Optional[Union[int, float, str]] = None,
) -> MaxPainResult:
    """
    Expiry-specific Max Pain solver.

    Parameters:
    -----------
    contracts : Sequence of OptionContract, dict, or tuple (strike, option_type, open_interest_btc, [expiry, is_active])
    expiry    : Target expiry filter. If None and contracts have no expiry, assumes all contracts belong to the single target expiry.

    Returns:
    --------
    MaxPainResult containing:
      - expiry: target expiry
      - max_pain_strike: strike minimizing aggregate holder payout (USD)
      - min_total_payout_usd: aggregate holder payout at the max pain strike
      - candidate_strikes: sorted list of unique evaluated strikes
      - strike_payouts: dict mapping eval_strike -> total_payout_usd
      - breakdowns: list of StrikePayoffBreakdown (call, put, total)
      - contracts_seen: total contracts matching expiry
      - contracts_included: eligible valid contracts evaluated
      - excluded_counts: breakdown of reasons for any excluded contracts
    """
    coerced = [_coerce_contract(c) for c in contracts]

    # Filter for expiry if specified
    if expiry is not None:
        expiry_contracts = [c for c in coerced if c.expiry == expiry and c.is_active]
        seen_count = len([c for c in coerced if c.expiry == expiry])
    else:
        expiry_contracts = [c for c in coerced if c.is_active]
        seen_count = len(coerced)

    excluded_counts: Dict[str, int] = {}
    eligible_contracts: List[OptionContract] = []

    for c in expiry_contracts:
        if not math.isfinite(c.strike) or c.strike <= 0.0:
            excluded_counts["invalid_strike"] = excluded_counts.get("invalid_strike", 0) + 1
            continue
        if not math.isfinite(c.open_interest_btc) or c.open_interest_btc < 0.0:
            excluded_counts["invalid_oi"] = excluded_counts.get("invalid_oi", 0) + 1
            continue
        opt_type = c.option_type.lower()
        if opt_type not in ("call", "c", "put", "p"):
            excluded_counts["invalid_option_type"] = excluded_counts.get("invalid_option_type", 0) + 1
            continue
        eligible_contracts.append(c)

    # Unique listed strikes from eligible contracts, sorted ascending
    candidate_strikes = sorted(list({c.strike for c in eligible_contracts}))

    if not candidate_strikes:
        return MaxPainResult(
            expiry=expiry,
            max_pain_strike=None,
            min_total_payout_usd=None,
            candidate_strikes=[],
            strike_payouts={},
            breakdowns=[],
            contracts_seen=seen_count,
            contracts_included=len(eligible_contracts),
            excluded_counts=excluded_counts,
        )

    # Separate calls and puts for fast calculation
    calls = [(c.strike, c.open_interest_btc) for c in eligible_contracts if c.option_type.lower() in ("call", "c")]
    puts = [(c.strike, c.open_interest_btc) for c in eligible_contracts if c.option_type.lower() in ("put", "p")]

    breakdowns: List[StrikePayoffBreakdown] = []
    strike_payouts: Dict[float, float] = {}

    best_strike: Optional[float] = None
    min_payout: float = float("inf")

    for k_eval in candidate_strikes:
        # Sum calls payoff: max(0, K_eval - strike) * OI
        call_payout = sum(max(0.0, k_eval - k) * oi for k, oi in calls)
        # Sum puts payoff: max(0, strike - K_eval) * OI
        put_payout = sum(max(0.0, k - k_eval) * oi for k, oi in puts)
        total_payout = call_payout + put_payout

        strike_payouts[k_eval] = total_payout
        breakdowns.append(
            StrikePayoffBreakdown(
                eval_strike=k_eval,
                call_payoff_usd=call_payout,
                put_payoff_usd=put_payout,
                total_payoff_usd=total_payout,
            )
        )

        # Deterministic tie-break: lowest strike price if payouts are equal
        if total_payout < min_payout:
            min_payout = total_payout
            best_strike = k_eval
        elif total_payout == min_payout:
            if best_strike is not None and k_eval < best_strike:
                best_strike = k_eval

    return MaxPainResult(
        expiry=expiry,
        max_pain_strike=best_strike,
        min_total_payout_usd=min_payout,
        candidate_strikes=candidate_strikes,
        strike_payouts=strike_payouts,
        breakdowns=breakdowns,
        contracts_seen=seen_count,
        contracts_included=len(eligible_contracts),
        excluded_counts=excluded_counts,
    )


def calculate_max_pain_from_json(
    json_input: Union[str, Dict[str, Any], List[Any]],
    expiry: Optional[Union[int, float, str]] = None,
) -> MaxPainResult:
    """Parse JSON string or dictionary payload and calculate Max Pain."""
    if isinstance(json_input, str):
        payload = json.loads(json_input)
    else:
        payload = json_input

    if isinstance(payload, dict):
        if "instruments" in payload:
            contracts = payload["instruments"]
        elif "contracts" in payload:
            contracts = payload["contracts"]
        elif "data" in payload:
            contracts = payload["data"]
        else:
            raise ValueError("Expected 'instruments', 'contracts', or 'data' in JSON dictionary")
    elif isinstance(payload, list):
        contracts = payload
    else:
        raise TypeError("JSON input must be a JSON string, list, or dictionary")

    return calculate_max_pain(contracts, expiry=expiry)


if __name__ == "__main__":
    # If invoked directly with a file argument or stdin, process JSON
    if len(sys.argv) > 1:
        file_path = sys.argv[1]
        target_expiry = sys.argv[2] if len(sys.argv) > 2 else None
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        res = calculate_max_pain_from_json(data, expiry=target_expiry)
        print(json.dumps(res.to_dict(), indent=2))
    else:
        # Simple demonstration output
        demo_chain = [
            OptionContract(strike=90000, option_type="call", open_interest_btc=100.0, expiry=1756454400000),
            OptionContract(strike=95000, option_type="call", open_interest_btc=150.0, expiry=1756454400000),
            OptionContract(strike=100000, option_type="call", open_interest_btc=200.0, expiry=1756454400000),
            OptionContract(strike=95000, option_type="put", open_interest_btc=200.0, expiry=1756454400000),
            OptionContract(strike=100000, option_type="put", open_interest_btc=150.0, expiry=1756454400000),
            OptionContract(strike=105000, option_type="put", open_interest_btc=100.0, expiry=1756454400000),
        ]
        result = calculate_max_pain(demo_chain, expiry=1756454400000)
        print("Max Pain Reference Result:")
        print(json.dumps(result.to_dict(), indent=2))
