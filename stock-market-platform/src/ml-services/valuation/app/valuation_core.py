"""
Valuation Engine — Core Models (pure standard library, no external deps).

Implements institutional-grade intrinsic-value models:
  - Discounted Cash Flow (DCF) with two-stage growth + Gordon terminal value
  - Dividend Discount Model (DDM): Gordon + two-stage
  - Comparable Company Analysis (relative valuation via peer multiples)
  - Monte Carlo simulation of intrinsic value under uncertainty
  - Sensitivity analysis (WACC x terminal growth grid)

All functions are deterministic (Monte Carlo accepts a seed) so results are
fully testable and explainable. Every model returns the assumptions used so the
output is never a black box.

Engineering conventions:
  - All rates are decimals (0.08 == 8%)
  - All monetary values in the reporting currency, absolute units
  - Per-share values returned alongside enterprise/equity value
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Optional
import math
import random
import statistics


# ---------------------------------------------------------------------------
# Discounted Cash Flow (DCF)
# ---------------------------------------------------------------------------

@dataclass
class DCFInputs:
    """Inputs for a two-stage DCF model."""
    base_fcf: float                      # Most recent annual free cash flow
    shares_outstanding: float
    net_debt: float = 0.0                # Total debt - cash & equivalents
    wacc: float = 0.09                   # Weighted average cost of capital
    high_growth_rate: float = 0.10       # FCF growth during high-growth stage
    high_growth_years: int = 5
    terminal_growth_rate: float = 0.025  # Perpetual growth (<= long-run GDP)

    def validate(self) -> None:
        if self.wacc <= self.terminal_growth_rate:
            raise ValueError(
                f"WACC ({self.wacc:.4f}) must exceed terminal growth "
                f"({self.terminal_growth_rate:.4f}) for a finite valuation."
            )
        if self.shares_outstanding <= 0:
            raise ValueError("shares_outstanding must be positive.")
        if self.high_growth_years < 1:
            raise ValueError("high_growth_years must be >= 1.")


@dataclass
class DCFResult:
    enterprise_value: float
    equity_value: float
    intrinsic_value_per_share: float
    pv_explicit_fcf: float
    pv_terminal_value: float
    terminal_value: float
    projected_fcf: list
    discount_factors: list
    assumptions: dict
    terminal_value_pct: float            # % of EV from terminal value (risk flag)


def dcf_valuation(inputs: DCFInputs) -> DCFResult:
    """
    Two-stage DCF:
      Stage 1: project FCF for `high_growth_years` at `high_growth_rate`,
               discount each year's FCF at WACC.
      Stage 2: terminal value via Gordon growth = FCF_{n+1} / (WACC - g),
               discounted back to present.
    Enterprise Value = PV(explicit FCF) + PV(terminal value).
    Equity Value = EV - net debt.  Per share = Equity / shares.
    """
    inputs.validate()

    projected_fcf = []
    discount_factors = []
    pv_explicit = 0.0
    fcf = inputs.base_fcf

    for year in range(1, inputs.high_growth_years + 1):
        fcf = fcf * (1.0 + inputs.high_growth_rate)
        discount_factor = 1.0 / ((1.0 + inputs.wacc) ** year)
        pv = fcf * discount_factor
        projected_fcf.append(round(fcf, 2))
        discount_factors.append(round(discount_factor, 6))
        pv_explicit += pv

    # Terminal value at end of explicit period (Gordon growth)
    terminal_fcf = fcf * (1.0 + inputs.terminal_growth_rate)
    terminal_value = terminal_fcf / (inputs.wacc - inputs.terminal_growth_rate)
    terminal_discount = 1.0 / ((1.0 + inputs.wacc) ** inputs.high_growth_years)
    pv_terminal = terminal_value * terminal_discount

    enterprise_value = pv_explicit + pv_terminal
    equity_value = enterprise_value - inputs.net_debt
    per_share = equity_value / inputs.shares_outstanding

    return DCFResult(
        enterprise_value=round(enterprise_value, 2),
        equity_value=round(equity_value, 2),
        intrinsic_value_per_share=round(per_share, 2),
        pv_explicit_fcf=round(pv_explicit, 2),
        pv_terminal_value=round(pv_terminal, 2),
        terminal_value=round(terminal_value, 2),
        projected_fcf=projected_fcf,
        discount_factors=discount_factors,
        assumptions=asdict(inputs),
        terminal_value_pct=round(pv_terminal / enterprise_value * 100, 1)
        if enterprise_value else 0.0,
    )


def dcf_sensitivity(
    inputs: DCFInputs,
    wacc_range: Optional[list] = None,
    terminal_growth_range: Optional[list] = None,
) -> dict:
    """
    Build a sensitivity grid of intrinsic value per share across WACC and
    terminal growth assumptions. This is the single most important risk-aware
    output: it shows how fragile the valuation is to its core assumptions.
    """
    wacc_range = wacc_range or [
        round(inputs.wacc + d, 4) for d in (-0.02, -0.01, 0.0, 0.01, 0.02)
    ]
    terminal_growth_range = terminal_growth_range or [
        round(inputs.terminal_growth_rate + d, 4)
        for d in (-0.01, -0.005, 0.0, 0.005, 0.01)
    ]

    grid = []
    for w in wacc_range:
        row = []
        for g in terminal_growth_range:
            if w <= g:
                row.append(None)  # Invalid combination
                continue
            trial = DCFInputs(
                base_fcf=inputs.base_fcf,
                shares_outstanding=inputs.shares_outstanding,
                net_debt=inputs.net_debt,
                wacc=w,
                high_growth_rate=inputs.high_growth_rate,
                high_growth_years=inputs.high_growth_years,
                terminal_growth_rate=g,
            )
            row.append(dcf_valuation(trial).intrinsic_value_per_share)
        grid.append(row)

    return {
        "wacc_range": wacc_range,
        "terminal_growth_range": terminal_growth_range,
        "grid": grid,
    }


# ---------------------------------------------------------------------------
# Dividend Discount Model (DDM)
# ---------------------------------------------------------------------------

@dataclass
class DDMInputs:
    current_dividend: float              # Most recent annual dividend per share
    cost_of_equity: float = 0.09
    growth_rate: float = 0.04            # Gordon (single-stage) growth
    # Two-stage parameters (optional)
    high_growth_rate: Optional[float] = None
    high_growth_years: int = 0
    terminal_growth_rate: float = 0.025


def gordon_ddm(inputs: DDMInputs) -> dict:
    """
    Single-stage Gordon Growth DDM:
      Value = D1 / (r - g),  where D1 = D0 * (1 + g)
    """
    if inputs.cost_of_equity <= inputs.growth_rate:
        raise ValueError("Cost of equity must exceed dividend growth rate.")
    d1 = inputs.current_dividend * (1.0 + inputs.growth_rate)
    value = d1 / (inputs.cost_of_equity - inputs.growth_rate)
    return {
        "model": "gordon_growth",
        "intrinsic_value_per_share": round(value, 2),
        "next_year_dividend": round(d1, 4),
        "assumptions": asdict(inputs),
    }


def two_stage_ddm(inputs: DDMInputs) -> dict:
    """
    Two-stage DDM: high-growth dividends for N years, then Gordon terminal value.
    Useful for companies with an above-trend payout growth phase.
    """
    if inputs.high_growth_rate is None or inputs.high_growth_years < 1:
        raise ValueError("Two-stage DDM requires high_growth_rate and high_growth_years >= 1.")
    if inputs.cost_of_equity <= inputs.terminal_growth_rate:
        raise ValueError("Cost of equity must exceed terminal growth rate.")

    pv = 0.0
    dividend = inputs.current_dividend
    for year in range(1, inputs.high_growth_years + 1):
        dividend = dividend * (1.0 + inputs.high_growth_rate)
        pv += dividend / ((1.0 + inputs.cost_of_equity) ** year)

    terminal_dividend = dividend * (1.0 + inputs.terminal_growth_rate)
    terminal_value = terminal_dividend / (inputs.cost_of_equity - inputs.terminal_growth_rate)
    pv_terminal = terminal_value / ((1.0 + inputs.cost_of_equity) ** inputs.high_growth_years)

    total = pv + pv_terminal
    return {
        "model": "two_stage_ddm",
        "intrinsic_value_per_share": round(total, 2),
        "pv_high_growth_dividends": round(pv, 2),
        "pv_terminal_value": round(pv_terminal, 2),
        "assumptions": asdict(inputs),
    }


# ---------------------------------------------------------------------------
# Comparable Company Analysis (relative valuation)
# ---------------------------------------------------------------------------

def comparable_valuation(
    target_metrics: dict,
    peer_multiples: dict,
    shares_outstanding: float,
    net_debt: float = 0.0,
) -> dict:
    """
    Relative valuation via peer-median multiples.

    target_metrics: e.g. {"earnings": 5e9, "ebitda": 8e9, "revenue": 20e9, "book_value": 30e9}
    peer_multiples: e.g. {"pe": [25, 28, 30], "ev_ebitda": [15, 17, 18], "ps": [4, 5, 6], "pb": [3, 4]}

    For each available multiple, derive an implied equity value, then per-share.
    Returns per-multiple estimates plus a blended median estimate.
    """
    estimates = {}

    def median(xs):
        return statistics.median(xs) if xs else None

    # P/E -> equity value = earnings * median(P/E)
    if "pe" in peer_multiples and target_metrics.get("earnings"):
        m = median(peer_multiples["pe"])
        if m:
            equity = target_metrics["earnings"] * m
            estimates["pe"] = {
                "multiple": round(m, 2),
                "implied_equity_value": round(equity, 2),
                "per_share": round(equity / shares_outstanding, 2),
            }

    # EV/EBITDA -> enterprise value = ebitda * median; equity = EV - net debt
    if "ev_ebitda" in peer_multiples and target_metrics.get("ebitda"):
        m = median(peer_multiples["ev_ebitda"])
        if m:
            ev = target_metrics["ebitda"] * m
            equity = ev - net_debt
            estimates["ev_ebitda"] = {
                "multiple": round(m, 2),
                "implied_enterprise_value": round(ev, 2),
                "implied_equity_value": round(equity, 2),
                "per_share": round(equity / shares_outstanding, 2),
            }

    # P/S -> equity value = revenue * median(P/S)
    if "ps" in peer_multiples and target_metrics.get("revenue"):
        m = median(peer_multiples["ps"])
        if m:
            equity = target_metrics["revenue"] * m
            estimates["ps"] = {
                "multiple": round(m, 2),
                "implied_equity_value": round(equity, 2),
                "per_share": round(equity / shares_outstanding, 2),
            }

    # P/B -> equity value = book_value * median(P/B)
    if "pb" in peer_multiples and target_metrics.get("book_value"):
        m = median(peer_multiples["pb"])
        if m:
            equity = target_metrics["book_value"] * m
            estimates["pb"] = {
                "multiple": round(m, 2),
                "implied_equity_value": round(equity, 2),
                "per_share": round(equity / shares_outstanding, 2),
            }

    per_shares = [v["per_share"] for v in estimates.values()]
    blended = round(statistics.median(per_shares), 2) if per_shares else None

    return {
        "model": "comparable_company_analysis",
        "estimates": estimates,
        "blended_per_share": blended,
        "methods_used": list(estimates.keys()),
    }


# ---------------------------------------------------------------------------
# Monte Carlo simulation of intrinsic value
# ---------------------------------------------------------------------------

@dataclass
class MonteCarloInputs:
    base: DCFInputs
    # Standard deviations (absolute, in decimal) for the uncertain drivers
    growth_std: float = 0.03
    wacc_std: float = 0.01
    terminal_growth_std: float = 0.005
    iterations: int = 10000
    seed: Optional[int] = 42


def monte_carlo_dcf(mc: MonteCarloInputs) -> dict:
    """
    Monte Carlo over DCF: sample high-growth rate, WACC, and terminal growth
    from normal distributions around the base case, compute intrinsic value for
    each draw, and report the distribution (percentiles).

    This converts a single-point estimate into a probability distribution of
    fair value — communicating uncertainty honestly rather than false precision.
    """
    rng = random.Random(mc.seed)
    values = []

    for _ in range(mc.iterations):
        g = rng.gauss(mc.base.high_growth_rate, mc.growth_std)
        w = rng.gauss(mc.base.wacc, mc.wacc_std)
        tg = rng.gauss(mc.base.terminal_growth_rate, mc.terminal_growth_std)

        # Enforce model constraints; skip invalid draws (WACC must exceed tg)
        tg = max(min(tg, w - 0.005), -0.02)  # clamp so WACC > terminal growth
        g = max(g, -0.20)

        try:
            trial = DCFInputs(
                base_fcf=mc.base.base_fcf,
                shares_outstanding=mc.base.shares_outstanding,
                net_debt=mc.base.net_debt,
                wacc=max(w, tg + 0.005),
                high_growth_rate=g,
                high_growth_years=mc.base.high_growth_years,
                terminal_growth_rate=tg,
            )
            values.append(dcf_valuation(trial).intrinsic_value_per_share)
        except ValueError:
            continue

    values.sort()

    def pct(p: float) -> float:
        if not values:
            return 0.0
        idx = min(int(p * len(values)), len(values) - 1)
        return round(values[idx], 2)

    return {
        "model": "monte_carlo_dcf",
        "iterations": len(values),
        "mean": round(statistics.fmean(values), 2) if values else 0.0,
        "median": pct(0.50),
        "std_dev": round(statistics.pstdev(values), 2) if len(values) > 1 else 0.0,
        "percentiles": {
            "p5": pct(0.05),
            "p10": pct(0.10),
            "p25": pct(0.25),
            "p50": pct(0.50),
            "p75": pct(0.75),
            "p90": pct(0.90),
            "p95": pct(0.95),
        },
        "assumptions": {
            "growth_std": mc.growth_std,
            "wacc_std": mc.wacc_std,
            "terminal_growth_std": mc.terminal_growth_std,
            "seed": mc.seed,
        },
    }
