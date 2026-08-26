# Deribit Options Greek Conventions & Specifications

**Milestone**: M4.6 Reverse-Engineer and Document Deribit Greek Conventions  
**Version**: 1.0.0  
**Date**: 2026-08-26  
**Status**: COMPLETE / FROZEN  
**Target Asset**: Deribit BTC Options (`BTC-DDMMMYY-STRIKE-[C|P]`)

---

## 1. Executive Summary & Core Constants

This document details the reverse-engineered mathematical specifications, market conventions, API representations, and Greek transformation formulas for European inverse options listed on **Deribit**.

All options analytics within the `options-chart` calculation engine conform to these exact specifications.

### Core System Constants

| Parameter                  | Identifier            | Value / Convention      | Rationale & Definition                                  |
| -------------------------- | --------------------- | ----------------------- | ------------------------------------------------------- |
| **Underlying Asset**       | `SYMBOL`              | `BTC`                   | Base currency for all modeled options contracts.        |
| **Settlement Asset**       | `SETTLEMENT_CURRENCY` | `BTC`                   | Coin-margined (inverse) settlement in native Bitcoin.   |
| **Contract Multiplier**    | `CONTRACT_MULTIPLIER` | `1.0 BTC`               | Exactly $1\text{ contract} = 1.0\text{ BTC}$.           |
| **Annualization Basis**    | `YEAR_BASIS`          | `365.0` days            | Continuous 24/7/365 crypto market operations.           |
| **Year Duration (ms)**     | `YEAR_MS`             | `31,536,000,000 ms`     | $365.0 \times 86,400 \times 1,000\text{ ms}$.           |
| **Day Duration (ms)**      | `DAY_MS`              | `86,400,000 ms`         | $24 \times 60 \times 60 \times 1,000\text{ ms}$.        |
| **Settlement Clock**       | `EXPIRY_TIME_UTC`     | `08:00:00.000 UTC`      | Fixed daily expiry timestamp for all Deribit contracts. |
| **Settlement TWAP Window** | `TWAP_WINDOW_MS`      | `1,800,000 ms` (30 min) | 07:30:00 UTC to 08:00:00 UTC index average.             |
| **Risk-Free Rate**         | `INTEREST_RATE_R`     | `0.00` ($r = 0$)        | Coin-margined baseline; no fiat cash flow financing.    |
| **Underlying Index**       | `PRICE_INDEX`         | `btc_usd`               | Composite spot index across major spot exchanges.       |
| **API IV Format**          | `API_IV_UNIT`         | Percentage points       | e.g., `80.5` represents $80.5\%$ volatility.            |
| **Normalized IV**          | `NORMALIZED_IV_UNIT`  | Decimal                 | e.g., $\sigma = 80.5 / 100 = 0.8050$.                   |
| **Time Floor**             | `MIN_PROFILE_T_MS`    | `900,000 ms` (15 min)   | Near-expiry cutoff for continuous gamma profiling.      |

---

## 2. Contract Architecture & Inverse Payoff Structure

### 2.1 Coin-Margined (Inverse) Options

Deribit options are **European-style, cash-settled inverse options**. Unlike traditional equity options (which settle in fiat USD), Deribit options are denominated in USD for strike prices and quotations, but all premiums, margins, and final payoffs are paid and settled in **BTC**.

- **Contract Size**: $1\text{ contract} = 1.0\text{ BTC}$.
- **Open Interest (OI)**: Reported directly in units of BTC ($1\text{ contract} = 1\text{ BTC OI}$).
- **Instrument Name Syntax**:
  $$\text{BTC}-\langle\text{DDMMMYY}\rangle-\langle\text{STRIKE}\rangle-\langle\text{C}|\text{P}\rangle$$
  _Examples_: `BTC-28MAR25-90000-C`, `BTC-26AUG26-60000-P`.

### 2.2 Expiration Payoff Equations

Let $S_T$ denote the final settlement price (the 30-minute `btc_usd` TWAP at 08:00 UTC) and $K$ denote the strike price in USD.

#### USD-Equivalent Payoff (Notional Value):

$$\text{Payoff}_{\text{USD}}^{\text{Call}} = \max(0, S_T - K)$$
$$\text{Payoff}_{\text{USD}}^{\text{Put}} = \max(0, K - S_T)$$

#### BTC-Settled Payoff (Actual Transfer Amount):

$$\text{Payoff}_{\text{BTC}}^{\text{Call}} = \frac{\max(0, S_T - K)}{S_T} = \max\left(0, 1 - \frac{K}{S_T}\right)$$
$$\text{Payoff}_{\text{BTC}}^{\text{Put}} = \frac{\max(0, K - S_T)}{S_T} = \max\left(0, \frac{K}{S_T} - 1\right)$$

#### Key Structural Properties:

1. **Bounded BTC Upside for Calls**: As $S_T \to \infty$, $\text{Payoff}_{\text{BTC}}^{\text{Call}} \to 1.0\text{ BTC}$. Even if BTC surges to \$1,000,000, the maximum payout per call contract cannot exceed $1.0\text{ BTC}$.
2. **Unbounded BTC Payout for Puts**: As $S_T \to 0$, $\text{Payoff}_{\text{BTC}}^{\text{Put}} \to \infty\text{ BTC}$. To guarantee solvency, Deribit requires margin collateral calculated dynamically under portfolio margining / standard maintenance margin models.

---

## 3. Time Representation & Annualization Convention

### 3.1 Year Basis ($365.0$ Days)

Because cryptocurrency markets trade continuously without exchange holidays, weekends, or market opens/closes, Deribit uses an **ACT/365.0 continuous day-count convention**:

$$\text{YEAR\_BASIS} = 365.0$$
$$\text{YEAR\_MS} = 365.0 \times 86,400 \times 1,000 = 31,536,000,000\text{ ms}$$

### 3.2 Time to Expiration Calculation

For any calculation timestamp $t_{\text{calc}}$ (in epoch milliseconds) and option expiration timestamp $t_{\text{expiry}}$:

$$\Delta t_{\text{ms}} = t_{\text{expiry}} - t_{\text{calc}}$$
$$\text{DTE} = \frac{\Delta t_{\text{ms}}}{86,400,000}$$
$$T = \frac{\Delta t_{\text{ms}}}{31,536,000,000} = \frac{\text{DTE}}{365.0}$$

```typescript
export const millisecondsPerDay = 86_400_000;
export const millisecondsPerYear = 365 * millisecondsPerDay;

export const calculateDaysToExpiry = (
  expiryTimestamp: number,
  calculationTimestamp: number,
): number => (expiryTimestamp - calculationTimestamp) / millisecondsPerDay;

export const calculateTimeToExpiryYears = (
  expiryTimestamp: number,
  calculationTimestamp: number,
  minimumTimeToExpiryMs = 0,
): number | null => {
  const remainingMs = expiryTimestamp - calculationTimestamp;
  if (remainingMs <= 0 || remainingMs < minimumTimeToExpiryMs) {
    return null;
  }
  return remainingMs / millisecondsPerYear;
};
```

### 3.3 Traditional Finance Contrast

| Convention          | Crypto (Deribit)             | Traditional Equity / Index (CBOE / SPX)            |
| ------------------- | ---------------------------- | -------------------------------------------------- |
| **Day-Count Basis** | **ACT/365.0** (Continuous)   | ACT/252 (Trading Days) or ACT/365 (Calendar)       |
| **Trading Hours**   | 24 hours / 7 days / 365 days | 6.5 hours / 5 days / ~252 days                     |
| **Weekend Decay**   | Theta decays continuously    | Theta often stepped or priced over trading days    |
| **Expiry Clock**    | **08:00:00 UTC**             | 16:00:00 ET (PM settle) or 09:30:00 ET (AM settle) |

---

## 4. Settlement Clock & Expiration Lifecycle

### 4.1 Fixed 08:00:00 UTC Expiry Clock

Every Deribit option expires at exactly **08:00:00.000 UTC** on its expiration date.

- **Daily Expiries (0DTE / 1DTE)**: Expire at 08:00 UTC daily.
- **Weekly Expiries**: Expire at 08:00 UTC on Friday.
- **Monthly Expiries**: Expire at 08:00 UTC on the last Friday of each month.
- **Quarterly Expiries**: Expire at 08:00 UTC on the last Friday of March, June, September, December.

### 4.2 Settlement Price Determination (30-Minute TWAP)

The settlement delivery price is calculated as the Time-Weighted Average Price (TWAP) of the `btc_usd` index between **07:30:00 UTC** and **08:00:00 UTC** on the day of expiration:

$$S_{\text{settlement}} = \frac{1}{1800} \int_{07:30:00}^{08:00:00} S_{\text{index}}(t) \, dt$$

### 4.3 Expiry Lifecycle States

- `open`: Regular active trading and mark pricing.
- `settlement`: Expiration window (07:30:00 to 08:00:00 UTC) during TWAP measurement.
- `delivered`: Contracts settled and exercised; BTC balances adjusted.
- `archivized`: Decommissioned contract record.

---

## 5. Risk-Free Interest Rate Convention ($r = 0$)

### 5.1 The $r = 0$ Standard

Deribit standardizes on **$r = 0.0$ (0.00% annualized)** for Black-Scholes option pricing and published Greek calculations on BTC options.

### 5.2 Rationale & Forward Equivalence

1. **Coin-Margined Structure**: Collateral is held in native BTC without interest-bearing fiat loans or risk-free fiat cash bonds.
2. **Forward Pricing Parity (Black-76)**:
   In futures and options markets, the forward price $F$ satisfies $F = S e^{(r-q)T}$. When modeling options directly with respect to the spot index under $r = 0, q = 0$, spot price $S$ equals forward price $F$, and the discounting factor $e^{-rT} = 1$.
3. **Elimination of Arbitrary Model Parameters**: Eliminating an external fiat yield curve (e.g., US Treasury yields or SOFR) removes model basis mismatch between exchange participants across different global jurisdictions.
4. **Fallback Specification**: In the engine, `interestRateFallbackDecimal` is strictly defined as `0.0`.

---

## 6. Underlying Index (`btc_usd`)

### 6.1 Composite Index Pricing

Deribit prices and evaluates all BTC options against the **`btc_usd`** index.

- **Index Name**: `btc_usd`
- **Data Channels**:
  - WebSocket: `deribit_price_index.btc_usd`
  - REST: `public/get_index_price?index_name=btc_usd`
- **Constituent Exchanges**: Coinbase, Bitstamp, Kraken, Gemini, Binance, Bybit, OKX, etc.
- **Outlier Filtering**: Outliers deviating significantly from the median are trimmed, and the remaining constituents are volume/liquidity-weighted.

---

## 7. Implied Volatility (IV) Normalization

### 7.1 Representation in Deribit API

Deribit transmits Implied Volatility as **percentage points**:

- Field `mark_iv`: e.g. `80.5` ($= 80.5\%$).
- Field `bid_iv`: e.g. `79.1` ($= 79.1\%$).
- Field `ask_iv`: e.g. `81.9` ($= 81.9\%$).

### 7.2 Canonical Decimal Normalization

Before evaluation in Black-Scholes or Gamma formulas, the percentage-point IV is divided by 100 **exactly once**:

$$\sigma = \frac{\text{mark\_iv}}{100.0}$$

```typescript
// Normalization in packages/market-data/src/deribit/normalizers.ts
markIvDecimal: item.mark_iv === null ? null : item.mark_iv / 100;
```

### 7.3 Numerical Domain & Sanitization

| Condition       | API Value          | Normalized Value | Engine Handling                              |
| --------------- | ------------------ | ---------------- | -------------------------------------------- |
| Normal IV       | `65.4`             | `0.6540`         | Processed normally in Black-Scholes.         |
| High Volatility | `250.0`            | `2.5000`         | Processed normally (finite positive).        |
| Missing IV      | `null`             | `null`           | Excluded from Gamma profile; retained in OI. |
| Zero / Negative | `<= 0`             | Invalid          | Excluded by eligibility validator.           |
| Non-finite      | `NaN` / `Infinity` | Invalid          | Filtered out by schema parser.               |

---

## 8. Mathematical Formulation: Black-Scholes & Greeks

### 8.1 Black-Scholes $d_1$ and $d_2$ with $r = 0$

With $r = 0$, the canonical Black-Scholes $d_1$ and $d_2$ simplify to:

$$d_1 = \frac{\ln(S / K) + \frac{1}{2}\sigma^2 T}{\sigma \sqrt{T}}$$
$$d_2 = d_1 - \sigma \sqrt{T} = \frac{\ln(S / K) - \frac{1}{2}\sigma^2 T}{\sigma \sqrt{T}}$$

Where:

- $S$: Underlying spot index price (`btc_usd`) in USD.
- $K$: Strike price in USD.
- $T$: Time to expiration in years ($T = \Delta t_{\text{ms}} / 31,536,000,000$).
- $\sigma$: Normalized implied volatility ($\text{mark\_iv} / 100$).

### 8.2 Standard Normal Probability Functions

The standard normal probability density function $\phi(x) = N'(x)$ is:
$$N'(x) = \frac{1}{\sqrt{2\pi}} e^{-\frac{x^2}{2}}$$

The standard normal cumulative distribution function $N(x)$ is:
$$N(x) = \frac{1}{\sqrt{2\pi}} \int_{-\infty}^{x} e^{-\frac{u^2}{2}} \, du = \frac{1}{2} \left[ 1 + \text{erf}\left(\frac{x}{\sqrt{2}}\right) \right]$$

---

## 9. Greek Conventions & Unit Conversions

### 9.1 Delta ($\Delta$)

#### USD Notional Delta:

For standard Black-Scholes pricing with $r=0$:
$$\Delta_{\text{USD}}^{\text{Call}} = N(d_1)$$
$$\Delta_{\text{USD}}^{\text{Put}} = N(d_1) - 1 = -N(-d_1)$$

- $\Delta_{\text{USD}}^{\text{Call}} \in (0, 1)$
- $\Delta_{\text{USD}}^{\text{Put}} \in (-1, 0)$

#### BTC-Denominated Delta (Coin Delta):

Because the option contract value is settled in BTC ($V_{\text{BTC}} = V_{\text{USD}} / S$):
$$\Delta_{\text{BTC}} = \frac{\partial V_{\text{BTC}}}{\partial S} = \frac{\partial (V_{\text{USD}} / S)}{\partial S} = \frac{\Delta_{\text{USD}} \cdot S - V_{\text{USD}}}{S^2} = \frac{\Delta_{\text{USD}} - V_{\text{BTC}}}{S}$$

Deribit publishes standard $\Delta_{\text{USD}}$ (commonly known as Black-Scholes Delta) in instrument ticker summaries.

---

### 9.2 Gamma ($\Gamma$)

#### Standard Black-Scholes Gamma ($\Gamma_{\text{USD}}$):

$$\Gamma = \frac{\partial^2 V_{\text{USD}}}{\partial S^2} = \frac{N'(d_1)}{S \sigma \sqrt{T}}$$

- **Units**: $1 / \text{USD}$ (change in delta per \$1 move in spot).
- **Properties**:
  - Always strictly positive for long vanilla positions ($\Gamma > 0$).
  - Identical for Calls and Puts at the same strike and expiration ($\Gamma_{\text{Call}} = \Gamma_{\text{Put}}$).
  - Maximized At-The-Money ($S \approx K$) as $T \to 0$.

#### Deribit API Gamma Publication:

Deribit publishes $\Gamma$ in units of $1/\text{USD}$ in its REST/WebSocket ticker and book summary feeds.

```typescript
// packages/options-engine/src/black-scholes/gamma.ts
export const calculateDeribitInverseGamma = (
  spotPrice: number,
  strike: number,
  timeToExpiryYears: number,
  volatilityDecimal: number,
  interestRateDecimal = 0,
): number => {
  const { d1 } = calculateBlackScholesD1D2(
    spotPrice,
    strike,
    timeToExpiryYears,
    volatilityDecimal,
    interestRateDecimal,
  );

  return (
    standardNormalPdf(d1) /
    (spotPrice * volatilityDecimal * Math.sqrt(timeToExpiryYears))
  );
};
```

---

### 9.3 Gamma Exposure (GEX / Modeled GEX)

Gamma Exposure measures the aggregate dollar notional of underlying BTC that option market makers must buy or sell to maintain delta neutrality for a **1% move** in spot price.

#### Mathematical Derivation:

1. Standard instantaneous dollar gamma for 1 contract ($1\text{ BTC}$ notional):
   $$\text{Dollar Gamma per contract} = \Gamma \times S^2$$
2. Sensitivity for a 1% ($0.01$) relative price movement:
   $$\text{Gross GEX}_{1\%} = \Gamma \times \text{OI}_{\text{BTC}} \times S^2 \times 0.01$$
3. Modeled Directional Sign Convention:
   - **Calls** represent positive dealer gamma (market makers long gamma when public buys calls): $\text{sign} = +1$.
   - **Puts** represent negative dealer gamma (market makers short gamma when public buys puts): $\text{sign} = -1$.

$$\text{Modeled GEX}_{\text{contract}} = \text{sign} \times \Gamma \times \text{OI}_{\text{BTC}} \times S^2 \times 0.01$$

$$\text{Total GEX}(S) = \sum_{i \in \text{Calls}} \Gamma_i(S) \cdot \text{OI}_i \cdot S^2 \cdot 0.01 - \sum_{j \in \text{Puts}} \Gamma_j(S) \cdot \text{OI}_j \cdot S^2 \cdot 0.01$$

#### Unit Dimensionality Analysis:

$$\left[ \frac{1}{\$} \right] \times [\text{BTC}] \times \left[ \$^2 \right] \times [0.01] = [\$ \cdot \text{BTC}] \times 0.01 = \text{USD hedge notional per 1\% move}$$

---

### 9.4 Vega ($\nu$)

Vega measures the change in option value in response to a change in implied volatility.

$$\nu_{\text{USD}} = \frac{\partial V_{\text{USD}}}{\partial \sigma} = S \sqrt{T} N'(d_1)$$

- **Per 1.0 (100%) Volatility**: $\nu_{\text{USD}} = S \sqrt{T} N'(d_1)$ (USD per $1.0\text{ vol}$).
- **Per 1 Percentage Point Volatility (1% IV)**:
  $$\nu_{1\%} = \frac{S \sqrt{T} N'(d_1)}{100}$$
- **BTC-Denominated Vega**:
  $$\nu_{\text{BTC}} = \frac{\nu_{\text{USD}}}{S} = \sqrt{T} N'(d_1)$$

---

### 9.5 Theta ($\Theta$)

Theta measures the rate of time decay of the option value. With $r = 0$:

$$\Theta_{\text{USD}} = -\frac{\partial V_{\text{USD}}}{\partial T} = -\frac{S N'(d_1) \sigma}{2 \sqrt{T}}$$

- **Annual Theta**: $\Theta_{\text{annual}} = -\frac{S N'(d_1) \sigma}{2 \sqrt{T}}$ (USD per year).
- **Daily Theta (1-Day Decay)**:
  $$\Theta_{\text{1-day}} = \frac{\Theta_{\text{annual}}}{365.0} = -\frac{S N'(d_1) \sigma}{2 \times 365.0 \times \sqrt{T}}$$
- **BTC-Denominated Theta**:
  $$\Theta_{\text{BTC, 1-day}} = \frac{\Theta_{\text{1-day}}}{S} = -\frac{N'(d_1) \sigma}{730.0 \sqrt{T}}$$

---

### 9.6 Rho ($\rho$)

Under Deribit's $r = 0$ convention:
$$\rho = \frac{\partial V}{\partial r} = 0$$

---

## 10. Greek Summary & Dimensionality Table

| Metric                       | Symbol                | Mathematical Expression ($r=0$)                                 | Canonical Unit        | Deribit Published Unit   |
| ---------------------------- | --------------------- | --------------------------------------------------------------- | --------------------- | ------------------------ |
| **Spot Index**               | $S$                   | `btc_usd` index                                                 | USD                   | USD                      |
| **Strike**                   | $K$                   | Contract strike                                                 | USD                   | USD                      |
| **Implied Volatility**       | $\sigma$              | $\text{mark\_iv} / 100$                                         | Decimal (e.g. $0.80$) | Percentage (e.g. $80.0$) |
| **Time to Expiry**           | $T$                   | $\Delta t_{\text{ms}} / 31,536,000,000$                         | Years (ACT/365)       | Milliseconds / Dates     |
| **Call Delta**               | $\Delta_C$            | $N(d_1)$                                                        | Unitless $[0, 1]$     | Unitless / BTC           |
| **Put Delta**                | $\Delta_P$            | $N(d_1) - 1$                                                    | Unitless $[-1, 0]$    | Unitless / BTC           |
| **Gamma**                    | $\Gamma$              | $\frac{N'(d_1)}{S \sigma \sqrt{T}}$                             | $1 / \text{USD}$      | $1 / \text{USD}$         |
| **Contract GEX ($1\%$)**     | $\text{GEX}$          | $\text{sign} \cdot \Gamma \cdot \text{OI} \cdot S^2 \cdot 0.01$ | USD / 1% move         | USD / 1% move            |
| **Vega ($1\text{ vol pt}$)** | $\nu_{1\%}$           | $\frac{S \sqrt{T} N'(d_1)}{100}$                                | USD / 1% IV           | USD / 1% IV              |
| **Theta ($1\text{ day}$)**   | $\Theta_{\text{day}}$ | $-\frac{S N'(d_1) \sigma}{730.0 \sqrt{T}}$                      | USD / day             | USD / day                |
| **Rho**                      | $\rho$                | $0.00$                                                          | USD / 100% rate       | $0.00$                   |

---

## 11. Edge Cases, Numerical Stability & Guardrails

### 11.1 Near-Expiry Time Floor ($15\text{ Minutes}$)

As $T \to 0$, the denominator $\sqrt{T} \to 0$. For At-The-Money options, $\Gamma \to \infty$. To prevent numerical explosion and false spikes in the Gamma Profile:

- Contracts with $T < 15\text{ minutes}$ ($900,000\text{ ms}$) are **excluded from continuous Gamma metrics and profiles**.
- These contracts **remain active** for Open Interest aggregation and valid Max Pain calculations.

```typescript
export const minimumProfileTimeToExpiryMs = 15 * 60 * 1_000; // 900,000 ms
```

### 11.2 Deep ITM and OTM Stability ($|d_1| \ge 38$)

For deeply out-of-the-money or in-the-money strikes:

- When $d_1 > 38$: $N(d_1) = 1.0$, $N'(d_1) = 0.0$, $\Gamma = 0.0$.
- When $d_1 < -38$: $N(d_1) = 0.0$, $N'(d_1) = 0.0$, $\Gamma = 0.0$.
- The engine uses standard IEEE 754 float64 arithmetic, ensuring proper zero underflow without generating `NaN` or unhandled exceptions.

### 11.3 Extreme Implied Volatility ($\sigma > 5.0$)

Crypto options occasionally experience extreme volatility spikes (e.g., $500\%$ IV). The implementation remains strictly finite and bounded for all finite $\sigma > 0$.

---

## 12. Verification & Reconciliation Tolerances (for M4.7)

When comparing the TypeScript production engine against the Python reference model and Deribit-published API quotes:

1. **TypeScript Engine vs. Python Reference**:
   - Relative Error Tolerance: $\epsilon_{\text{rel}} \le 1.0 \times 10^{-7}$
   - Absolute Error Tolerance: $\epsilon_{\text{abs}} \le 1.0 \times 10^{-10}$
2. **TypeScript Engine vs. Deribit API Published Gamma**:
   - Deribit publishes `gamma` rounded to $4\text{--}5$ decimal places in JSON-RPC quotes.
   - Tolerance: $\Delta \le 1.0 \times 10^{-4}$ or relative difference $\le 0.1\%$ accounting for published precision truncation.

---

## 13. Reference Implementation: Python vs. TypeScript

### TypeScript Reference (Production Engine)

```typescript
export const calculateBlackScholesD1D2 = (
  spotPrice: number,
  strike: number,
  timeToExpiryYears: number,
  volatilityDecimal: number,
  interestRateDecimal = 0,
) => {
  const volatilityTime = volatilityDecimal * Math.sqrt(timeToExpiryYears);
  const d1 =
    (Math.log(spotPrice / strike) +
      (interestRateDecimal + 0.5 * volatilityDecimal * volatilityDecimal) *
        timeToExpiryYears) /
    volatilityTime;
  return { d1, d2: d1 - volatilityTime };
};

export const calculateDeribitGamma = (
  spot: number,
  strike: number,
  timeYears: number,
  volDecimal: number,
): number => {
  const { d1 } = calculateBlackScholesD1D2(
    spot,
    strike,
    timeYears,
    volDecimal,
    0,
  );
  const pdf = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
  return pdf / (spot * volDecimal * Math.sqrt(timeYears));
};
```

### Python Reference (M4 Validation)

```python
import math

YEAR_BASIS = 365.0
YEAR_MS = 365.0 * 86_400.0 * 1000.0

def calculate_time_to_expiry_years(expiry_ms: int, calc_ms: int) -> float:
    remaining_ms = expiry_ms - calc_ms
    if remaining_ms <= 0:
        raise ValueError("Contract expired")
    return remaining_ms / YEAR_MS

def calculate_deribit_gamma(spot: float, strike: float, time_years: float, vol_decimal: float) -> float:
    vol_time = vol_decimal * math.sqrt(time_years)
    d1 = (math.log(spot / strike) + 0.5 * (vol_decimal ** 2) * time_years) / vol_time
    pdf = math.exp(-0.5 * (d1 ** 2)) / math.sqrt(2.0 * math.pi)
    return pdf / (spot * vol_decimal * math.sqrt(time_years))

def calculate_contract_gex_one_percent(
    option_type: str,
    gamma: float,
    open_interest_btc: float,
    spot: float
) -> float:
    sign = 1.0 if option_type.lower() == "call" else -1.0
    return sign * gamma * open_interest_btc * (spot ** 2) * 0.01
```

---

## 14. Conclusion & Frozen Conventions

The reverse-engineered conventions documented above are **FROZEN** for the Milestone 4 mathematical verification suite:

- **Contract Size**: $1\text{ BTC}$ per contract.
- **Year Basis**: $365.0\text{ days}$ ($31,536,000,000\text{ ms}$).
- **Settlement**: $08:00:00\text{ UTC}$ daily expiry.
- **Interest Rate**: $r = 0.0$.
- **Index**: `btc_usd` spot composite.
- **IV Normalization**: $\sigma = \text{mark\_iv} / 100.0$.
- **GEX Definition**: $\text{sign} \times \Gamma \times \text{OI}_{\text{BTC}} \times S^2 \times 0.01$.
