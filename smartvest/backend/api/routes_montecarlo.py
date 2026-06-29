"""
Monte Carlo Simulation Engine

Runs 10,000 simulated outcomes for the next 12 months using:
- Historical volatility for each asset
- Correlation data between assets
- Geometric Brownian Motion model

Returns probability distribution, percentiles, and fan chart data.
"""

import math
import random
from datetime import datetime, timedelta

import numpy as np
import yfinance as yf
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/montecarlo", tags=["montecarlo"])

NUM_SIMULATIONS = 10000
TRADING_DAYS = 252  # Days to simulate (1 year)
STEPS = 52  # Weekly data points for chart


class Holding(BaseModel):
    symbol: str
    shares: float
    current_value: float = 0  # Will be filled if 0


class MonteCarloRequest(BaseModel):
    holdings: list[Holding]
    total_portfolio_value: float = 0
    months: int = 12


@router.post("/simulate")
def run_monte_carlo(req: MonteCarloRequest):
    """Run 10,000 Monte Carlo simulations of portfolio over next 12 months."""

    # Fetch historical data for each holding
    symbols = [h.symbol.upper() for h in req.holdings]
    if not symbols:
        raise HTTPException(status_code=400, detail="No holdings provided")

    # Get 2 years of historical data for volatility calculation
    returns_data = {}
    current_prices = {}
    holding_values = {}
    total_value = 0

    for h in req.holdings:
        sym = h.symbol.upper()
        try:
            ticker = yf.Ticker(sym)
            hist = ticker.history(period="2y")
            if hist.empty or len(hist) < 60:
                continue

            current_price = hist["Close"].iloc[-1]
            current_prices[sym] = current_price

            # Calculate daily returns
            daily_returns = hist["Close"].pct_change().dropna().values
            returns_data[sym] = daily_returns

            # Calculate holding value
            value = h.current_value if h.current_value > 0 else current_price * h.shares
            holding_values[sym] = value
            total_value += value
        except:
            continue

    if not returns_data:
        raise HTTPException(status_code=400, detail="Could not fetch data for any holdings")

    if total_value == 0:
        total_value = req.total_portfolio_value or 10000

    # Calculate weights
    weights = {}
    for sym, val in holding_values.items():
        weights[sym] = val / total_value if total_value > 0 else 1 / len(holding_values)

    # Calculate portfolio statistics
    active_symbols = list(returns_data.keys())
    n_assets = len(active_symbols)

    # Mean returns and volatilities (annualized)
    mean_returns = {}
    volatilities = {}
    for sym in active_symbols:
        rets = returns_data[sym]
        mean_returns[sym] = float(np.mean(rets)) * 252
        volatilities[sym] = float(np.std(rets)) * math.sqrt(252)

    # Portfolio mean return and volatility (simplified)
    port_mean = sum(weights.get(s, 0) * mean_returns.get(s, 0) for s in active_symbols)
    port_vol = sum(weights.get(s, 0) * volatilities.get(s, 0) for s in active_symbols)

    # Add correlation effect (simplified — use average pairwise correlation)
    if n_assets > 1:
        # Calculate correlation matrix
        min_len = min(len(returns_data[s]) for s in active_symbols)
        aligned_returns = np.array([returns_data[s][-min_len:] for s in active_symbols])
        corr_matrix = np.corrcoef(aligned_returns)
        avg_corr = float((np.sum(corr_matrix) - n_assets) / (n_assets * (n_assets - 1))) if n_assets > 1 else 1.0

        # Diversification benefit
        diversification_factor = math.sqrt(
            sum(weights.get(s, 0)**2 * volatilities.get(s, 0)**2 for s in active_symbols) +
            2 * avg_corr * sum(
                weights.get(active_symbols[i], 0) * weights.get(active_symbols[j], 0) *
                volatilities.get(active_symbols[i], 0) * volatilities.get(active_symbols[j], 0)
                for i in range(n_assets) for j in range(i+1, n_assets)
            )
        )
        port_vol = diversification_factor
    else:
        avg_corr = 1.0

    # ─── Run Monte Carlo Simulations ──────────────────────────────────────
    daily_mean = port_mean / 252
    daily_vol = port_vol / math.sqrt(252)
    days_to_simulate = int(req.months * 21)  # ~21 trading days per month

    # Store weekly snapshots for fan chart
    weeks = req.months * 4 + 1
    week_interval = max(1, days_to_simulate // (weeks - 1))

    all_final_values = []
    weekly_percentiles_data = [[] for _ in range(weeks)]

    random.seed(42)  # Reproducible
    np.random.seed(42)

    for sim in range(NUM_SIMULATIONS):
        portfolio_value = total_value
        week_idx = 0

        for day in range(days_to_simulate):
            # Geometric Brownian Motion
            shock = np.random.normal(0, 1)
            daily_return = (daily_mean - 0.5 * daily_vol**2) + daily_vol * shock
            portfolio_value *= math.exp(daily_return)

            # Record weekly snapshot
            if day % week_interval == 0 and week_idx < weeks:
                weekly_percentiles_data[week_idx].append(portfolio_value)
                week_idx += 1

        # Final value
        all_final_values.append(portfolio_value)
        if week_idx < weeks:
            weekly_percentiles_data[week_idx - 1 if week_idx > 0 else 0].append(portfolio_value)

    # Ensure first week has starting value
    if weekly_percentiles_data[0]:
        weekly_percentiles_data[0] = [total_value] * NUM_SIMULATIONS

    # ─── Calculate Statistics ─────────────────────────────────────────────
    final_arr = np.array(all_final_values)
    final_returns = (final_arr - total_value) / total_value * 100

    # Probabilities
    prob_gain_10 = float(np.mean(final_returns > 10)) * 100
    prob_gain_20 = float(np.mean(final_returns > 20)) * 100
    prob_loss_10 = float(np.mean(final_returns < -10)) * 100
    prob_loss_20 = float(np.mean(final_returns < -20)) * 100
    prob_loss_30 = float(np.mean(final_returns < -30)) * 100

    # Percentiles
    p5 = float(np.percentile(final_arr, 5))
    p10 = float(np.percentile(final_arr, 10))
    p25 = float(np.percentile(final_arr, 25))
    p50 = float(np.percentile(final_arr, 50))
    p75 = float(np.percentile(final_arr, 75))
    p90 = float(np.percentile(final_arr, 90))
    p95 = float(np.percentile(final_arr, 95))

    median_return = ((p50 - total_value) / total_value) * 100
    worst_5_return = ((p5 - total_value) / total_value) * 100
    best_5_return = ((p95 - total_value) / total_value) * 100

    # ─── Fan Chart Data (percentile bands by week) ────────────────────────
    fan_chart = []
    for w in range(weeks):
        if not weekly_percentiles_data[w]:
            continue
        arr = np.array(weekly_percentiles_data[w])
        fan_chart.append({
            "week": w,
            "p5": round(float(np.percentile(arr, 5)), 0),
            "p10": round(float(np.percentile(arr, 10)), 0),
            "p25": round(float(np.percentile(arr, 25)), 0),
            "p50": round(float(np.percentile(arr, 50)), 0),
            "p75": round(float(np.percentile(arr, 75)), 0),
            "p90": round(float(np.percentile(arr, 90)), 0),
            "p95": round(float(np.percentile(arr, 95)), 0),
        })

    # ─── Plain English Summary ────────────────────────────────────────────
    summary_parts = []
    summary_parts.append(
        f"Based on 10,000 simulated scenarios using your portfolio's historical volatility:"
    )
    summary_parts.append(
        f"The most likely outcome (median) is your portfolio grows to "
        f"${p50:,.0f} — a {median_return:.1f}% return over {req.months} months."
    )
    if prob_loss_20 > 0:
        summary_parts.append(
            f"There is a 1 in {max(1, round(100/prob_loss_20))} chance your portfolio could lose "
            f"more than 20%, falling below ${total_value * 0.8:,.0f}."
        )
    summary_parts.append(
        f"The worst 5% of outcomes show your portfolio at ${p5:,.0f} or less "
        f"(a {worst_5_return:.0f}% loss). This is the realistic worst case."
    )
    summary_parts.append(
        f"There is a {prob_gain_10:.0f}% chance of gaining more than 10%, "
        f"reaching ${total_value * 1.1:,.0f}+."
    )
    if avg_corr > 0.6:
        summary_parts.append(
            f"Your holdings have high correlation ({avg_corr:.2f}) — they tend to move together. "
            f"Adding uncorrelated assets would narrow the range of possible outcomes."
        )

    return {
        "portfolio_value": round(total_value, 2),
        "months": req.months,
        "simulations": NUM_SIMULATIONS,
        "holdings_analyzed": len(active_symbols),
        "portfolio_volatility_annual": round(port_vol * 100, 1),
        "portfolio_mean_return_annual": round(port_mean * 100, 1),
        "avg_correlation": round(avg_corr, 3),
        "probabilities": {
            "gain_10_pct": round(prob_gain_10, 1),
            "gain_20_pct": round(prob_gain_20, 1),
            "loss_10_pct": round(prob_loss_10, 1),
            "loss_20_pct": round(prob_loss_20, 1),
            "loss_30_pct": round(prob_loss_30, 1),
        },
        "percentiles": {
            "p5": round(p5, 2),
            "p10": round(p10, 2),
            "p25": round(p25, 2),
            "p50": round(p50, 2),
            "p75": round(p75, 2),
            "p90": round(p90, 2),
            "p95": round(p95, 2),
        },
        "returns": {
            "median_pct": round(median_return, 1),
            "worst_5_pct": round(worst_5_return, 1),
            "best_5_pct": round(best_5_return, 1),
        },
        "fan_chart": fan_chart,
        "summary": " ".join(summary_parts),
    }
