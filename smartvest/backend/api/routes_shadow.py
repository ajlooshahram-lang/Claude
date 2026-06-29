"""
Shadow Portfolio API

Provides:
- Virtual portfolio performance calculation
- Real vs shadow comparison
- P&L tracking for shadow holdings
- Tax estimation on shadow trades

All data is stored client-side (localStorage). This API only calculates
current values and comparisons using real market prices.
"""

from datetime import datetime, timedelta
from typing import Optional

import yfinance as yf
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/shadow", tags=["shadow"])


# ─── Models ───────────────────────────────────────────────────────────────────

class ShadowHolding(BaseModel):
    symbol: str
    shares: float
    avg_cost: float  # Price per share at purchase
    purchase_date: Optional[str] = None


class ShadowPortfolioRequest(BaseModel):
    holdings: list[ShadowHolding]
    cash_balance: float = 0
    initial_capital: float = 100000  # Starting capital


class CompareRequest(BaseModel):
    shadow_holdings: list[ShadowHolding]
    shadow_cash: float = 0
    shadow_initial: float = 100000
    real_holdings: list[ShadowHolding]
    real_cash: float = 0
    real_initial: float = 100000


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/value")
def get_shadow_portfolio_value(req: ShadowPortfolioRequest):
    """Calculate current value of shadow portfolio with full breakdown."""
    holdings_data = []
    total_market_value = 0
    total_cost_basis = 0
    sectors = {}

    for h in req.holdings:
        try:
            ticker = yf.Ticker(h.symbol)
            hist = ticker.history(period="5d")
            info = ticker.info

            if hist.empty:
                continue

            current_price = hist["Close"].iloc[-1]
            name = info.get("shortName", h.symbol)
            sector = info.get("sector", "Unknown")

            market_value = current_price * h.shares
            cost_basis = h.avg_cost * h.shares
            unrealized_pnl = market_value - cost_basis
            pnl_pct = ((market_value / cost_basis) - 1) * 100 if cost_basis > 0 else 0

            # Day change
            if len(hist) >= 2:
                prev_close = hist["Close"].iloc[-2]
                day_change = (current_price - prev_close) * h.shares
                day_change_pct = ((current_price / prev_close) - 1) * 100
            else:
                day_change = 0
                day_change_pct = 0

            holdings_data.append({
                "symbol": h.symbol.upper(),
                "name": name,
                "sector": sector,
                "shares": h.shares,
                "avg_cost": round(h.avg_cost, 2),
                "current_price": round(current_price, 2),
                "market_value": round(market_value, 2),
                "cost_basis": round(cost_basis, 2),
                "unrealized_pnl": round(unrealized_pnl, 2),
                "pnl_pct": round(pnl_pct, 1),
                "day_change": round(day_change, 2),
                "day_change_pct": round(day_change_pct, 2),
                "weight_pct": 0,  # Calculated after totals
            })

            total_market_value += market_value
            total_cost_basis += cost_basis
            sectors[sector] = sectors.get(sector, 0) + market_value

        except Exception:
            continue

    # Calculate weights
    total_portfolio = total_market_value + req.cash_balance
    for h in holdings_data:
        h["weight_pct"] = round((h["market_value"] / total_portfolio) * 100, 1) if total_portfolio > 0 else 0

    # Overall performance
    total_return = total_portfolio - req.initial_capital
    total_return_pct = ((total_portfolio / req.initial_capital) - 1) * 100 if req.initial_capital > 0 else 0

    # Sector breakdown
    sector_breakdown = [
        {"sector": s, "value": round(v, 2), "pct": round((v / total_portfolio) * 100, 1) if total_portfolio > 0 else 0}
        for s, v in sorted(sectors.items(), key=lambda x: x[1], reverse=True)
    ]

    return {
        "total_value": round(total_portfolio, 2),
        "invested_value": round(total_market_value, 2),
        "cash_balance": round(req.cash_balance, 2),
        "initial_capital": req.initial_capital,
        "total_return": round(total_return, 2),
        "total_return_pct": round(total_return_pct, 2),
        "total_unrealized_pnl": round(total_market_value - total_cost_basis, 2),
        "holdings_count": len(holdings_data),
        "holdings": holdings_data,
        "sector_breakdown": sector_breakdown,
    }


@router.post("/compare")
def compare_portfolios(req: CompareRequest):
    """Compare shadow portfolio vs real portfolio performance."""
    # Get shadow portfolio value
    shadow_result = get_shadow_portfolio_value(ShadowPortfolioRequest(
        holdings=req.shadow_holdings,
        cash_balance=req.shadow_cash,
        initial_capital=req.shadow_initial,
    ))

    # Get real portfolio value
    real_result = get_shadow_portfolio_value(ShadowPortfolioRequest(
        holdings=req.real_holdings,
        cash_balance=req.real_cash,
        initial_capital=req.real_initial,
    ))

    # Comparison metrics
    shadow_return_pct = shadow_result["total_return_pct"]
    real_return_pct = real_result["total_return_pct"]
    outperformance = shadow_return_pct - real_return_pct

    # Risk comparison (concentration)
    shadow_max_weight = max((h["weight_pct"] for h in shadow_result["holdings"]), default=0)
    real_max_weight = max((h["weight_pct"] for h in real_result["holdings"]), default=0)

    shadow_sectors = len(shadow_result["sector_breakdown"])
    real_sectors = len(real_result["sector_breakdown"])

    # Generate insight
    if outperformance > 5:
        insight = (
            f"Your shadow portfolio is outperforming your real portfolio by {outperformance:.1f}%. "
            f"This suggests your experimental strategy is working better. However, remember that "
            f"higher returns often come with higher risk — check if the shadow portfolio is more "
            f"concentrated or volatile before considering changes to your real strategy."
        )
    elif outperformance < -5:
        insight = (
            f"Your real portfolio is outperforming your shadow portfolio by {abs(outperformance):.1f}%. "
            f"Your cautious approach is actually doing better! This is a good sign that your "
            f"risk-appropriate strategy is working. Not every aggressive bet pays off."
        )
    else:
        insight = (
            f"Both portfolios are performing similarly (difference: {outperformance:.1f}%). "
            f"This suggests your current strategy is roughly as effective as the experimental one. "
            f"Keep monitoring — differences tend to appear during market volatility."
        )

    return {
        "shadow": {
            "total_value": shadow_result["total_value"],
            "total_return": shadow_result["total_return"],
            "total_return_pct": shadow_result["total_return_pct"],
            "holdings_count": shadow_result["holdings_count"],
            "sectors_count": shadow_sectors,
            "max_position_weight": shadow_max_weight,
        },
        "real": {
            "total_value": real_result["total_value"],
            "total_return": real_result["total_return"],
            "total_return_pct": real_result["total_return_pct"],
            "holdings_count": real_result["holdings_count"],
            "sectors_count": real_sectors,
            "max_position_weight": real_max_weight,
        },
        "comparison": {
            "outperformance_pct": round(outperformance, 2),
            "shadow_wins": outperformance > 0,
            "shadow_more_concentrated": shadow_max_weight > real_max_weight,
            "shadow_less_diversified": shadow_sectors < real_sectors,
        },
        "insight": insight,
    }


@router.get("/quote/{symbol}")
def get_quick_quote(symbol: str):
    """Quick quote for the shadow portfolio buy/sell interface."""
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period="5d")
        info = ticker.info

        if hist.empty:
            raise HTTPException(status_code=404, detail=f"No data for {symbol}")

        current_price = hist["Close"].iloc[-1]
        name = info.get("shortName", symbol)
        sector = info.get("sector", "Unknown")

        day_change_pct = 0
        if len(hist) >= 2:
            prev = hist["Close"].iloc[-2]
            day_change_pct = ((current_price / prev) - 1) * 100

        return {
            "symbol": symbol.upper(),
            "name": name,
            "sector": sector,
            "price": round(current_price, 2),
            "day_change_pct": round(day_change_pct, 2),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
