"""
Weekly Summary API

Generates a weekly performance summary for the user's portfolio.
Includes: weekly gain/loss, biggest mover, sector insight, suggestion.

Endpoint:
    POST /api/weekly-summary
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List
import yfinance as yf

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

router = APIRouter(prefix="/api", tags=["Weekly Summary"])


class Position(BaseModel):
    symbol: str
    shares: float
    avg_cost: float


class WeeklySummaryRequest(BaseModel):
    positions: List[Position]
    risk_profile: str = "moderate"


# Sector ETFs for market insight
SECTOR_ETFS = {
    "Technology": "XLK",
    "Healthcare": "XLV",
    "Energy": "XLE",
    "Finance": "XLF",
    "Consumer Goods": "XLP",
    "Industrials": "XLI",
}


@router.post("/weekly-summary")
def get_weekly_summary(req: WeeklySummaryRequest):
    """
    Generate this week's portfolio summary.
    """
    stocks_performance = []
    total_start = 0.0
    total_end = 0.0

    for pos in req.positions:
        try:
            ticker = yf.Ticker(pos.symbol)
            hist = ticker.history(period="5d")
            info = ticker.info

            if hist is None or hist.empty or len(hist) < 2:
                continue

            start_price = float(hist["Close"].iloc[0])
            end_price = float(hist["Close"].iloc[-1])
            change_pct = ((end_price - start_price) / start_price) * 100

            name = info.get("shortName") or info.get("longName") or pos.symbol
            currency = info.get("currency", "USD")

            value_start = pos.shares * start_price
            value_end = pos.shares * end_price

            total_start += value_start
            total_end += value_end

            stocks_performance.append({
                "symbol": pos.symbol,
                "name": name,
                "currency": currency,
                "weekly_change_pct": round(change_pct, 2),
                "value_change": round(value_end - value_start, 2),
            })
        except Exception:
            continue

    # Sort by absolute change to find biggest mover
    stocks_performance.sort(key=lambda s: abs(s["weekly_change_pct"]), reverse=True)
    biggest_mover = stocks_performance[0] if stocks_performance else None

    # Total portfolio weekly performance
    total_change = total_end - total_start
    total_change_pct = ((total_change / total_start) * 100) if total_start > 0 else 0.0

    # Market insight — find the best and worst performing sector this week
    sector_changes = []
    for sector, etf in SECTOR_ETFS.items():
        try:
            t = yf.Ticker(etf)
            h = t.history(period="5d")
            if h is not None and not h.empty and len(h) >= 2:
                s = float(h["Close"].iloc[0])
                e = float(h["Close"].iloc[-1])
                pct = ((e - s) / s) * 100
                sector_changes.append({"sector": sector, "change_pct": round(pct, 2)})
        except Exception:
            continue

    sector_changes.sort(key=lambda s: s["change_pct"], reverse=True)
    best_sector = sector_changes[0] if sector_changes else None
    worst_sector = sector_changes[-1] if sector_changes else None

    # Generate market insight
    if best_sector and worst_sector:
        if best_sector["change_pct"] > 2:
            market_insight = f"{best_sector['sector']} led the market this week (+{best_sector['change_pct']:.1f}%), while {worst_sector['sector']} lagged ({worst_sector['change_pct']:+.1f}%). Consider whether your portfolio has exposure to the sectors that are working."
        elif worst_sector["change_pct"] < -2:
            market_insight = f"Tough week for {worst_sector['sector']} ({worst_sector['change_pct']:+.1f}%). If you hold stocks in that sector, remember that weekly drops are normal and don't require action unless fundamentals have changed."
        else:
            market_insight = f"Markets were relatively calm this week. {best_sector['sector']} slightly outperformed ({best_sector['change_pct']:+.1f}%). Quiet weeks are a good time to research new opportunities without pressure."
    else:
        market_insight = "Market data unavailable for this week's sector analysis."

    # Generate suggestion based on profile
    profile = req.risk_profile.lower()
    if total_change_pct > 5:
        if profile == "conservative":
            suggestion = "Great week! Consider whether any single stock has grown too large in your portfolio. If one stock is now >20% of your total, trimming it back locks in some gains safely."
        else:
            suggestion = "Strong performance! Resist the urge to add more to winners that have run up fast — rebalancing after big moves keeps your risk in check."
    elif total_change_pct < -3:
        if profile == "conservative":
            suggestion = "Your portfolio dipped this week. Check that your holdings are still fundamentally strong companies. If they are, this is likely temporary — avoid panic selling."
        elif profile == "growth":
            suggestion = "Dips like this create buying opportunities for growth investors. If you have cash reserves, consider adding to your highest-conviction positions at these lower prices."
        else:
            suggestion = "A small pullback — normal market behavior. Stick to your monthly investment plan and avoid making emotional decisions based on one week's movement."
    else:
        if profile == "conservative":
            suggestion = "Steady week. Continue your regular DCA contributions. Consistency is more important than timing — your patience will compound over time."
        elif profile == "growth":
            suggestion = "Flat week. Good time to review your Smart Picks and see if any high-momentum stocks have emerged that align with your growth targets."
        else:
            suggestion = "Quiet week — no action needed. Use the time to learn something new (check the Sectors page) or review whether your portfolio is still well-diversified."

    return {
        "portfolio_change": round(total_change, 2),
        "portfolio_change_pct": round(total_change_pct, 2),
        "biggest_mover": biggest_mover,
        "market_insight": market_insight,
        "suggestion": suggestion,
        "stocks_count": len(stocks_performance),
    }
