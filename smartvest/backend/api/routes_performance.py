"""
Performance Review API

Calculates portfolio performance over time using historical price data.
Returns gain/loss, best/worst stock, and generates an AI summary.

Endpoint:
    POST /api/performance — Calculate performance for given positions
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List
import yfinance as yf

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.routes_chat import get_fallback_response

router = APIRouter(prefix="/api", tags=["Performance"])


class Position(BaseModel):
    symbol: str
    shares: float
    avg_cost: float


class PerformanceRequest(BaseModel):
    positions: List[Position]
    risk_profile: str = "moderate"


@router.post("/performance")
def get_performance(req: PerformanceRequest):
    """
    Calculate portfolio performance: total gain/loss, per-stock breakdown,
    historical value series, and an AI-generated summary.
    """
    stocks = []
    total_cost = 0.0
    total_value = 0.0
    history_points = []  # [{week, value}]

    for pos in req.positions:
        try:
            ticker = yf.Ticker(pos.symbol)
            info = ticker.info
            hist = ticker.history(period="3mo")

            current_price = info.get("regularMarketPrice") or info.get("currentPrice") or 0.0
            name = info.get("shortName") or info.get("longName") or pos.symbol
            currency = info.get("currency", "USD")

            cost = pos.shares * pos.avg_cost
            value = pos.shares * current_price
            gain_loss = value - cost
            gain_loss_pct = ((gain_loss / cost) * 100) if cost > 0 else 0.0

            total_cost += cost
            total_value += value

            stocks.append({
                "symbol": pos.symbol,
                "name": name,
                "currency": currency,
                "shares": pos.shares,
                "avg_cost": pos.avg_cost,
                "current_price": round(current_price, 2),
                "cost": round(cost, 2),
                "value": round(value, 2),
                "gain_loss": round(gain_loss, 2),
                "gain_loss_pct": round(gain_loss_pct, 2),
            })
        except Exception:
            continue

    # Sort for best/worst
    stocks_sorted = sorted(stocks, key=lambda s: s["gain_loss_pct"], reverse=True)
    best = stocks_sorted[0] if stocks_sorted else None
    worst = stocks_sorted[-1] if stocks_sorted else None

    # Total
    total_gain_loss = total_value - total_cost
    total_gain_loss_pct = ((total_gain_loss / total_cost) * 100) if total_cost > 0 else 0.0

    # Build historical value series (weekly, last 3 months)
    # Use the first stock's history length as reference
    try:
        ref_ticker = yf.Ticker(req.positions[0].symbol)
        ref_hist = ref_ticker.history(period="3mo")
        if ref_hist is not None and not ref_hist.empty:
            # Sample weekly
            weeks = ref_hist.iloc[::5]  # Every 5 trading days ~ 1 week
            for idx, row in weeks.iterrows():
                week_date = str(idx.date())
                week_value = 0.0
                for pos in req.positions:
                    try:
                        t = yf.Ticker(pos.symbol)
                        h = t.history(start=str(idx.date()), end=str(idx.date() + __import__('datetime').timedelta(days=1)))
                        if h is not None and not h.empty:
                            week_value += pos.shares * float(h["Close"].iloc[0])
                        else:
                            week_value += pos.shares * pos.avg_cost
                    except Exception:
                        week_value += pos.shares * pos.avg_cost
                history_points.append({"date": week_date, "value": round(week_value, 0)})
    except Exception:
        pass

    # If history computation is too slow/fails, provide at least start + end
    if len(history_points) < 2:
        history_points = [
            {"date": "Start", "value": round(total_cost, 0)},
            {"date": "Now", "value": round(total_value, 0)},
        ]

    # Generate summary
    summary = _generate_summary(
        total_gain_loss, total_gain_loss_pct, best, worst,
        len(stocks), req.risk_profile
    )

    return {
        "total_cost": round(total_cost, 2),
        "total_value": round(total_value, 2),
        "total_gain_loss": round(total_gain_loss, 2),
        "total_gain_loss_pct": round(total_gain_loss_pct, 2),
        "stocks": stocks,
        "best": best,
        "worst": worst,
        "history": history_points,
        "summary": summary,
    }


def _generate_summary(
    gain_loss: float, gain_loss_pct: float,
    best: dict | None, worst: dict | None,
    num_stocks: int, profile: str,
) -> dict:
    """Generate a plain-English performance summary with one suggestion."""
    # Assessment
    if gain_loss_pct > 10:
        assessment = f"Your portfolio is doing very well — up {gain_loss_pct:.1f}% overall. That's strong performance, especially for a {profile} investor."
    elif gain_loss_pct > 0:
        assessment = f"Your portfolio is in positive territory at +{gain_loss_pct:.1f}%. You're making progress and your picks are working."
    elif gain_loss_pct > -5:
        assessment = f"Your portfolio is slightly down ({gain_loss_pct:.1f}%), which is completely normal — markets fluctuate and this is a small dip."
    else:
        assessment = f"Your portfolio is down {abs(gain_loss_pct):.1f}%. This can feel uncomfortable, but remember that temporary drops are normal if your stocks are fundamentally strong."

    # Best/worst context
    if best and worst and best["symbol"] != worst["symbol"]:
        context = f" Your best performer is {best['name']} ({best['symbol']}) at {best['gain_loss_pct']:+.1f}%, while {worst['name']} ({worst['symbol']}) is lagging at {worst['gain_loss_pct']:+.1f}%."
    else:
        context = ""

    # Suggestion
    if num_stocks < 5:
        suggestion = "Consider adding more stocks to improve diversification — aim for 5-8 across different sectors."
    elif gain_loss_pct < -10:
        suggestion = "Review whether any of your holdings have changed fundamentally. If the companies are still profitable, consider holding through this dip rather than selling at a loss."
    elif worst and worst["gain_loss_pct"] < -15:
        suggestion = f"Look into why {worst['symbol']} is underperforming. If the company's fundamentals are still solid, it might recover. If not, consider whether that money would work harder elsewhere."
    elif gain_loss_pct > 15:
        suggestion = "Strong performance! Consider whether any single stock has grown to dominate your portfolio — if so, trimming it back to 15-20% would lock in some gains and improve diversification."
    else:
        suggestion = "Stay the course. Continue your regular monthly investments and let compound growth work in your favor over time."

    return {
        "text": assessment + context,
        "suggestion": suggestion,
    }
