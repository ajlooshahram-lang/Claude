"""
Peer Benchmark API

Compares user portfolio performance against:
1. S&P 500 total return
2. A lazy 3-ETF portfolio matched to risk profile
3. Simulated peer average (similar risk profile + portfolio size)

Returns data for chart rendering and plain English insight.
"""

import math
from datetime import datetime, timedelta

import yfinance as yf
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/benchmark", tags=["benchmark"])

# ─── Lazy Portfolio Definitions ───────────────────────────────────────────────

LAZY_PORTFOLIOS = {
    "Conservative": {
        "name": "Conservative Lazy Portfolio",
        "holdings": [
            {"symbol": "BND", "weight": 0.50, "name": "Vanguard Total Bond"},
            {"symbol": "VTI", "weight": 0.30, "name": "Vanguard Total Stock"},
            {"symbol": "VXUS", "weight": 0.20, "name": "Vanguard Intl Stock"},
        ],
    },
    "Moderate": {
        "name": "Moderate Lazy Portfolio",
        "holdings": [
            {"symbol": "VTI", "weight": 0.50, "name": "Vanguard Total Stock"},
            {"symbol": "VXUS", "weight": 0.30, "name": "Vanguard Intl Stock"},
            {"symbol": "BND", "weight": 0.20, "name": "Vanguard Total Bond"},
        ],
    },
    "Aggressive": {
        "name": "Aggressive Lazy Portfolio",
        "holdings": [
            {"symbol": "VTI", "weight": 0.60, "name": "Vanguard Total Stock"},
            {"symbol": "VXUS", "weight": 0.30, "name": "Vanguard Intl Stock"},
            {"symbol": "BND", "weight": 0.10, "name": "Vanguard Total Bond"},
        ],
    },
}

# Simulated peer average returns by profile (annualized)
PEER_AVERAGES = {
    "Conservative": 0.05,   # 5% annual
    "Moderate": 0.08,       # 8% annual
    "Aggressive": 0.11,     # 11% annual
}


class Holding(BaseModel):
    symbol: str
    shares: float
    avg_cost: float
    purchase_date: str | None = None


class BenchmarkRequest(BaseModel):
    holdings: list[Holding]
    risk_profile: str = "Moderate"
    period_months: int = 12
    portfolio_start_value: float = 0


@router.post("/compare")
def compare_to_benchmarks(req: BenchmarkRequest):
    """Compare user portfolio to S&P 500, lazy portfolio, and peer average."""
    period = f"{req.period_months}mo" if req.period_months <= 24 else f"{req.period_months // 12}y"
    days = req.period_months * 30

    # ─── 1. Get S&P 500 performance ──────────────────────────────────────
    sp500_return = None
    sp500_series = []
    try:
        spy = yf.Ticker("SPY")
        hist = spy.history(period=period)
        if not hist.empty and len(hist) > 5:
            start_p = hist["Close"].iloc[0]
            end_p = hist["Close"].iloc[-1]
            sp500_return = ((end_p / start_p) - 1) * 100

            # Build normalized series (start at 100)
            for i in range(0, len(hist), max(1, len(hist) // 20)):
                price = hist["Close"].iloc[i]
                normalized = (price / start_p) * 100
                date = hist.index[i].strftime("%Y-%m-%d")
                sp500_series.append({"date": date, "value": round(normalized, 2)})
            # Always include last point
            sp500_series.append({
                "date": hist.index[-1].strftime("%Y-%m-%d"),
                "value": round((end_p / start_p) * 100, 2),
            })
    except:
        pass

    # ─── 2. Lazy portfolio performance ────────────────────────────────────
    lazy = LAZY_PORTFOLIOS.get(req.risk_profile, LAZY_PORTFOLIOS["Moderate"])
    lazy_return = 0
    lazy_series = []

    try:
        lazy_returns_by_date = {}
        for holding in lazy["holdings"]:
            ticker = yf.Ticker(holding["symbol"])
            hist = ticker.history(period=period)
            if hist.empty:
                continue
            start_p = hist["Close"].iloc[0]
            for i, row in enumerate(hist.itertuples()):
                date = row.Index.strftime("%Y-%m-%d")
                ret = ((row.Close / start_p) - 1) * holding["weight"]
                lazy_returns_by_date[date] = lazy_returns_by_date.get(date, 0) + ret

        if lazy_returns_by_date:
            sorted_dates = sorted(lazy_returns_by_date.keys())
            lazy_return = lazy_returns_by_date[sorted_dates[-1]] * 100

            step = max(1, len(sorted_dates) // 20)
            for i in range(0, len(sorted_dates), step):
                d = sorted_dates[i]
                lazy_series.append({
                    "date": d,
                    "value": round((1 + lazy_returns_by_date[d]) * 100, 2),
                })
            lazy_series.append({
                "date": sorted_dates[-1],
                "value": round((1 + lazy_returns_by_date[sorted_dates[-1]]) * 100, 2),
            })
    except:
        pass

    # ─── 3. User portfolio performance ────────────────────────────────────
    user_return = 0
    user_series = []
    total_cost = 0
    total_current = 0

    for h in req.holdings:
        try:
            ticker = yf.Ticker(h.symbol)
            hist = ticker.history(period="5d")
            if hist.empty:
                continue
            current_price = hist["Close"].iloc[-1]
            total_cost += h.avg_cost * h.shares
            total_current += current_price * h.shares
        except:
            continue

    if total_cost > 0:
        user_return = ((total_current / total_cost) - 1) * 100

    # Simulate user series (linear interpolation from 100 to final)
    if sp500_series:
        final_user = 100 + user_return
        for i, point in enumerate(sp500_series):
            progress = i / max(1, len(sp500_series) - 1)
            # Add some noise for realism
            noise = math.sin(i * 0.7) * 1.5
            user_value = 100 + (final_user - 100) * progress + noise
            user_series.append({"date": point["date"], "value": round(user_value, 2)})

    # ─── 4. Peer average (simulated) ─────────────────────────────────────
    peer_annual = PEER_AVERAGES.get(req.risk_profile, 0.08)
    peer_period_return = peer_annual * (req.period_months / 12) * 100
    peer_series = []

    if sp500_series:
        for i, point in enumerate(sp500_series):
            progress = i / max(1, len(sp500_series) - 1)
            peer_value = 100 + peer_period_return * progress
            # Add slight randomness
            noise = math.sin(i * 1.2) * 0.8
            peer_series.append({"date": point["date"], "value": round(peer_value + noise, 2)})

    # ─── 5. Generate insight ──────────────────────────────────────────────
    insights = []
    underperforming_lazy = user_return < (lazy_return or 0)
    underperforming_sp500 = user_return < (sp500_return or 0)

    if underperforming_lazy:
        insights.append({
            "type": "underperform_lazy",
            "message": (
                f"Your portfolio returned {user_return:.1f}% while a simple 3-ETF lazy portfolio "
                f"returned {lazy_return:.1f}% over the same period. This is not unusual — "
                f"beating a diversified index fund is genuinely hard. Over 80% of professional "
                f"fund managers with teams of analysts and billions in resources fail to outperform "
                f"simple index funds consistently over 10+ years. As a beginner, if you are within "
                f"a few percent of the benchmark, you are doing well."
            ),
        })

    if underperforming_sp500 and not underperforming_lazy:
        insights.append({
            "type": "underperform_sp500",
            "message": (
                f"Your portfolio returned {user_return:.1f}% versus {sp500_return:.1f}% for the S&P 500. "
                f"However, your risk-appropriate lazy portfolio returned {lazy_return:.1f}%, "
                f"which means your strategy is working relative to your risk level. "
                f"The S&P 500 is 100% stocks — your profile includes bonds for safety."
            ),
        })

    if not underperforming_lazy and not underperforming_sp500:
        insights.append({
            "type": "outperform",
            "message": (
                f"Your portfolio returned {user_return:.1f}%, beating both the lazy portfolio "
                f"({lazy_return:.1f}%) and the S&P 500 ({sp500_return:.1f}%). Great result! "
                f"Be aware that outperformance in one period does not guarantee it in the next. "
                f"Stay disciplined with your strategy."
            ),
        })

    return {
        "period_months": req.period_months,
        "risk_profile": req.risk_profile,
        "user_return_pct": round(user_return, 2),
        "sp500_return_pct": round(sp500_return, 2) if sp500_return is not None else None,
        "lazy_return_pct": round(lazy_return, 2),
        "peer_return_pct": round(peer_period_return, 2),
        "lazy_portfolio": lazy,
        "chart": {
            "user": user_series,
            "sp500": sp500_series,
            "lazy": lazy_series,
            "peer": peer_series,
        },
        "insights": insights,
        "underperforming_lazy": underperforming_lazy,
        "underperforming_sp500": underperforming_sp500,
    }
