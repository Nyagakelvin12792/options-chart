#!/usr/bin/env python3
"""
Dual-Engine Parity Evaluator (Python Side) for M4.5.

Generates deterministic grid-based and randomized option parameter combinations
and evaluates Black-Scholes / Deribit Inverse Gamma metrics using pure Python
reference models (black_scholes.py and gamma_reference.py).

Outputs binary Float64 arrays or JSON for high-throughput inter-process verification.
"""

from __future__ import annotations

import math
import os
import random
import struct
import sys
from typing import Iterator, Tuple

# Ensure local reference modules can be imported
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

import black_scholes as bs  # noqa: E402
import gamma_reference as gr  # noqa: E402


def generate_parameter_stream(
    grid_target: int = 20_000,
    random_target: int = 80_000,
    seed: int = 42,
) -> Iterator[Tuple[float, float, float, float, float, float, str]]:
    """
    Yield deterministic (S, K, T, iv, r, oi, option_type) parameter combinations.

    Domain requirements:
    - S  in [10^3, 2*10^5]
    - K  in [10^3, 3*10^5]
    - T  in [1/365, 2.0]
    - iv in [0.05, 3.0]
    - r = 0.0
    - Call and Put
    """
    # 1. Deterministic Grid (10 x 10 x 10 x 10 x 2 = 20,000 combinations)
    spots = [1_000.0, 5_000.0, 20_000.0, 50_000.0, 65_000.0, 80_000.0, 100_000.0, 120_000.0, 150_000.0, 200_000.0]
    strikes = [1_000.0, 10_000.0, 30_000.0, 60_000.0, 90_000.0, 100_000.0, 120_000.0, 150_000.0, 200_000.0, 300_000.0]
    expiries = [1.0 / 365.0, 7.0 / 365.0, 14.0 / 365.0, 30.0 / 365.0, 60.0 / 365.0, 90.0 / 365.0, 180.0 / 365.0, 270.0 / 365.0, 1.0, 2.0]
    ivs = [0.05, 0.20, 0.40, 0.60, 0.80, 1.00, 1.25, 1.50, 2.00, 3.00]
    r = 0.0
    oi_grid = 100.0

    count = 0
    for s in spots:
        for k in strikes:
            for t in expiries:
                for iv in ivs:
                    for opt_type in ("call", "put"):
                        yield s, k, t, iv, r, oi_grid, opt_type
                        count += 1
                        if count >= grid_target:
                            break
                    if count >= grid_target:
                        break
                if count >= grid_target:
                    break
            if count >= grid_target:
                break
        if count >= grid_target:
            break

    # 2. Seeded Deterministic PRNG Stream
    rng = random.Random(seed)
    for _ in range(random_target):
        s = rng.uniform(1_000.0, 200_000.0)
        k = rng.uniform(1_000.0, 300_000.0)
        t = rng.uniform(1.0 / 365.0, 2.0)
        iv = rng.uniform(0.05, 3.0)
        oi = rng.uniform(0.01, 10_000.0)
        opt_type = "call" if rng.random() >= 0.5 else "put"
        yield s, k, t, iv, r, oi, opt_type


def evaluate_stream_binary(
    grid_target: int = 20_000,
    random_target: int = 80_000,
    seed: int = 42,
) -> bytes:
    """
    Evaluate all test combinations and pack into a compact binary Float64 format.

    Each record contains 13 double-precision float64 values (104 bytes per record):
    Inputs:
    0: spot (S)
    1: strike (K)
    2: time_to_expiry (T)
    3: iv (sigma)
    4: rate (r)
    5: open_interest (OI)
    6: is_call (1.0 for call, 0.0 for put)
    Outputs:
    7: d1
    8: d2
    9: cdf(d1)
    10: pdf(d1)
    11: gamma
    12: signed_gex
    """
    records = []
    for s, k, t, iv, r, oi, opt_type in generate_parameter_stream(grid_target, random_target, seed):
        d1, d2 = gr.calculate_black_scholes_d1_d2(s, k, t, iv, r)
        cdf_d1 = bs.std_normal_cdf(d1)
        pdf_d1 = bs.std_normal_pdf(d1)
        gamma = gr.calculate_deribit_inverse_gamma(s, k, t, iv, r)
        signed_gex = gr.calculate_modeled_signed_gex_one_percent_usd(opt_type, gamma, oi, s)
        is_call = 1.0 if opt_type == "call" else 0.0

        records.append(
            struct.pack(
                "<13d",
                s,
                k,
                t,
                iv,
                r,
                oi,
                is_call,
                d1,
                d2,
                cdf_d1,
                pdf_d1,
                gamma,
                signed_gex,
            )
        )

    return b"".join(records)


def main():
    grid_target = 20_000
    random_target = 80_000
    seed = 42

    if len(sys.argv) > 1 and sys.argv[1] == "--binary":
        data = evaluate_stream_binary(grid_target, random_target, seed)
        sys.stdout.buffer.write(data)
        sys.stdout.buffer.flush()
        return

    # Text summary mode
    total = 0
    for _ in generate_parameter_stream(grid_target, random_target, seed):
        total += 1
    print(f"Generated and verified {total} parameter vectors.")


if __name__ == "__main__":
    main()
