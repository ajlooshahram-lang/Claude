"""
Value at Risk (VaR) Calculator

Calculates VaR at 95%, 99%, and 99.9% confidence using:
1. Historical simulation (actual past returns)
2. Parametric method (normal distribution assumption)

Shows results in DKK with plain English explanation.
"""

import math
from datetime import datetime

import numpy as np
import yfinance as yf
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/var", tags=["var"])

DKK_USD_RATE = 6.85


class Holding(BaseModel):
    symbol: str
    shares: float
    current_value: float = 0


class VaRRequest(BaseModel):
    holdings: list[Holding]
    total_value_usd: float = 0
    dkk_rate: float = 6.85


@router.post("/calculate")
def calculate_var(req: VaRRequest):
    """Calculate VaR using historical and parametric methods."""

    # Fetch 2 years of daily returns for each holding
    all_returns = {}
    holding_values = {}
    total_value = 0

    for h in req.holdings:
        try:
            ticker = yf.Ticker(h.symbol.upper())
            hist = ticker.history(period="2y")
            if hist.empty or len(hist) < 60:
                continue

            price = hist["Close"].iloc[-1]
            value = h.current_value if h.current_value > 0 else price * h.shares
            holding_values[h.symbol.upper()] = value
            total_value += value

            daily_returns = hist["Close"].pct_change().dropna().values
            all_returns[h.symbol.upper()] = daily_returns
        except:
            continue

    if not all_returns or total_value == 0:
        raise HTTPException(status_code=400, detail="No valid holdings")

    # Calculate portfolio weights
    weights = {s: v / total_value for s, v in holding_values.items()}
    symbols = list(all_returns.keys())

    # Align return series to same length
    min_len = min(len(all_returns[s]) for s in symbols)
    aligned = np.array([all_returns[s][-min_len:] for s in symbols])

    # Portfolio daily returns (weighted sum)
    weight_arr = np.array([weights[s] for s in symbols])
    portfolio_returns = aligned.T @ weight_arr  # (days, assets) @ (assets,) = (days,)

    n_days = len(portfolio_returns)
    mean_return = float(np.mean(portfolio_returns))
    std_return = float(np.std(portfolio_returns))

    total_value_dkk = total_value * req.dkk_rate

    # ─── Historical Simulation VaR ────────────────────────────────────────
    # Sort returns and pick percentile
    sorted_returns = np.sort(portfolio_returns)

    hist_var_95 = -float(np.percentile(portfolio_returns, 5))
    hist_var_99 = -float(np.percentile(portfolio_returns, 1))
    hist_var_999 = -float(np.percentile(portfolio_returns, 0.1))

    hist_var_95_usd = hist_var_95 * total_value
    hist_var_99_usd = hist_var_99 * total_value
    hist_var_999_usd = hist_var_999 * total_value

    hist_var_95_dkk = hist_var_95_usd * req.dkk_rate
    hist_var_99_dkk = hist_var_99_usd * req.dkk_rate
    hist_var_999_dkk = hist_var_999_usd * req.dkk_rate

    # ─── Parametric VaR (Normal Distribution) ─────────────────────────────
    from scipy.stats import norm  # type: ignore

    z_95 = norm.ppf(0.05)   # -1.645
    z_99 = norm.ppf(0.01)   # -2.326
    z_999 = norm.ppf(0.001) # -3.090

    para_var_95 = -(mean_return + z_95 * std_return) * total_value
    para_var_99 = -(mean_return + z_99 * std_return) * total_value
    para_var_999 = -(mean_return + z_999 * std_return) * total_value

    para_var_95_dkk = para_var_95 * req.dkk_rate
    para_var_99_dkk = para_var_99 * req.dkk_rate
    para_var_999_dkk = para_var_999 * req.dkk_rate

    # ─── Worst actual days ────────────────────────────────────────────────
    worst_days = sorted_returns[:5]
    worst_day_pct = float(worst_days[0]) * 100
    worst_day_usd = float(worst_days[0]) * total_value
    worst_day_dkk = worst_day_usd * req.dkk_rate

    # ─── Summary ──────────────────────────────────────────────────────────
    diff_pct = abs(hist_var_99_dkk - para_var_99_dkk) / max(hist_var_99_dkk, 1) * 100

    explanation_difference = (
        "The two methods sometimes differ significantly because the parametric method assumes "
        "returns follow a perfect bell curve (normal distribution), but real stock markets have "
        "'fat tails' — extreme events happen more often than the bell curve predicts."
    )

    summary = (
        f"Based on {n_days} days of historical data for your {len(symbols)}-stock portfolio "
        f"worth {total_value_dkk:,.0f} DKK: "
        f"On a typical bad day (95% confidence), you should not lose more than "
        f"{hist_var_95_dkk:,.0f} DKK. On a very bad day (99%), losses could reach "
        f"{hist_var_99_dkk:,.0f} DKK. In extreme scenarios (99.9%), losses could hit "
        f"{hist_var_999_dkk:,.0f} DKK. "
        f"Your worst actual day in the past 2 years was a {abs(worst_day_pct):.1f}% drop "
        f"({abs(worst_day_dkk):,.0f} DKK at current portfolio size)."
    )

    return {
        "portfolio_value_usd": round(total_value, 2),
        "portfolio_value_dkk": round(total_value_dkk, 2),
        "dkk_rate": req.dkk_rate,
        "holdings_count": len(symbols),
        "data_days": n_days,
        "daily_volatility_pct": round(std_return * 100, 3),
        "annual_volatility_pct": round(std_return * math.sqrt(252) * 100, 1),
        "historical": {
            "var_95_dkk": round(hist_var_95_dkk, 0),
            "var_99_dkk": round(hist_var_99_dkk, 0),
            "var_999_dkk": round(hist_var_999_dkk, 0),
            "var_95_usd": round(hist_var_95_usd, 2),
            "var_99_usd": round(hist_var_99_usd, 2),
            "var_999_usd": round(hist_var_999_usd, 2),
            "var_95_pct": round(hist_var_95 * 100, 2),
            "var_99_pct": round(hist_var_99 * 100, 2),
            "var_999_pct": round(hist_var_999 * 100, 2),
        },
        "parametric": {
            "var_95_dkk": round(para_var_95_dkk, 0),
            "var_99_dkk": round(para_var_99_dkk, 0),
            "var_999_dkk": round(para_var_999_dkk, 0),
            "var_95_usd": round(para_var_95, 2),
            "var_99_usd": round(para_var_99, 2),
            "var_999_usd": round(para_var_999, 2),
            "var_95_pct": round(-(mean_return + z_95 * std_return) * 100, 2),
            "var_99_pct": round(-(mean_return + z_99 * std_return) * 100, 2),
            "var_999_pct": round(-(mean_return + z_999 * std_return) * 100, 2),
        },
        "worst_actual_day": {
            "return_pct": round(worst_day_pct, 2),
            "loss_usd": round(abs(worst_day_usd), 2),
            "loss_dkk": round(abs(worst_day_dkk), 0),
        },
        "explanation_difference": explanation_difference,
        "summary": summary,
    }
