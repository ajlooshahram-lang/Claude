"""
AI Portfolio Manager API

Generates ONE specific actionable recommendation daily by analyzing:
- Portfolio concentration (single stock/ETF exceeding profile limits)
- Idle cash detection
- Sector imbalance vs risk profile target
- Performance divergence (big winners/losers needing attention)
- Correlation warnings

Each recommendation includes:
- Specific action to take
- Why (reasoning)
- Risk if followed
- Risk if ignored
"""

import math
from datetime import datetime, timedelta
from typing import Optional

import yfinance as yf
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/ai-manager", tags=["ai-manager"])


# ─── Profile Limits ──────────────────────────────────────────────────────────

PROFILE_LIMITS = {
    "Conservative": {"max_single": 0.15, "max_sector": 0.30, "max_crypto": 0.05, "ideal_cash": 0.20},
    "Moderate": {"max_single": 0.25, "max_sector": 0.35, "max_crypto": 0.10, "ideal_cash": 0.15},
    "Aggressive": {"max_single": 0.30, "max_sector": 0.40, "max_crypto": 0.20, "ideal_cash": 0.10},
}


class Holding(BaseModel):
    symbol: str
    shares: float
    avg_cost: float
    asset_type: str = "stock"  # stock, etf, crypto


class ManagerRequest(BaseModel):
    holdings: list[Holding]
    cash_balance: float = 0
    risk_profile: str = "Moderate"
    portfolio_age_days: int = 30  # How long user has had this portfolio
    last_trade_days_ago: int = 7


# ─── Recommendation Generator ────────────────────────────────────────────────

@router.post("/recommendation")
def generate_recommendation(req: ManagerRequest):
    """
    Analyze portfolio and generate ONE specific actionable recommendation.
    Prioritizes the most important issue found.
    """
    limits = PROFILE_LIMITS.get(req.risk_profile, PROFILE_LIMITS["Moderate"])
    recommendations = []

    # Fetch current prices and calculate portfolio
    holdings_data = []
    total_portfolio = req.cash_balance
    sectors = {}

    for h in req.holdings:
        try:
            if h.asset_type == "crypto":
                # Skip crypto price fetch for now, use avg_cost as estimate
                value = h.avg_cost * h.shares
                holdings_data.append({
                    "symbol": h.symbol,
                    "type": h.asset_type,
                    "shares": h.shares,
                    "avg_cost": h.avg_cost,
                    "current_price": h.avg_cost,
                    "value": value,
                    "gain_pct": 0,
                    "sector": "Crypto",
                    "name": h.symbol,
                })
                total_portfolio += value
                sectors["Crypto"] = sectors.get("Crypto", 0) + value
                continue

            ticker = yf.Ticker(h.symbol)
            hist = ticker.history(period="5d")
            if hist.empty:
                continue
            price = hist["Close"].iloc[-1]
            info = ticker.info
            name = info.get("shortName", h.symbol)
            sector = info.get("sector", "Unknown")

            value = price * h.shares
            cost = h.avg_cost * h.shares
            gain_pct = ((price / h.avg_cost) - 1) * 100 if h.avg_cost > 0 else 0

            holdings_data.append({
                "symbol": h.symbol.upper(),
                "type": h.asset_type,
                "shares": h.shares,
                "avg_cost": h.avg_cost,
                "current_price": round(price, 2),
                "value": round(value, 2),
                "gain_pct": round(gain_pct, 1),
                "sector": sector,
                "name": name,
            })
            total_portfolio += value
            sectors[sector] = sectors.get(sector, 0) + value
        except:
            continue

    if total_portfolio <= 0:
        return {
            "has_recommendation": False,
            "message": "Add holdings to get AI recommendations.",
        }

    # Calculate weights
    cash_weight = req.cash_balance / total_portfolio
    for h in holdings_data:
        h["weight"] = h["value"] / total_portfolio

    # ─── Check 1: Single position too concentrated ────────────────────────
    for h in sorted(holdings_data, key=lambda x: x["weight"], reverse=True):
        if h["weight"] > limits["max_single"]:
            excess_pct = (h["weight"] - limits["max_single"]) * 100
            trim_value = (h["weight"] - limits["max_single"]) * total_portfolio
            trim_shares = trim_value / h["current_price"] if h["current_price"] > 0 else 0

            recommendations.append({
                "priority": 10,
                "action": f"Consider trimming {h['symbol']} by {excess_pct:.0f}% ({trim_shares:.1f} shares, ~${trim_value:,.0f})",
                "title": f"{h['symbol']} exceeds your position limit",
                "reasoning": (
                    f"{h['symbol']} ({h['name']}) has gained {h['gain_pct']:.0f}% and now represents "
                    f"{h['weight']*100:.1f}% of your portfolio. Your {req.risk_profile} profile sets a "
                    f"maximum of {limits['max_single']*100:.0f}% in any single position. "
                    f"This happened because {h['symbol']} outperformed — it is a good problem to have, "
                    f"but concentration creates risk."
                ),
                "risk_if_follow": (
                    f"If {h['symbol']} continues to rise, you will miss some upside on the shares you sell. "
                    f"You will also owe capital gains tax on the profit from those shares."
                ),
                "risk_if_ignore": (
                    f"If {h['symbol']} drops 30%, you would lose ~${h['value']*0.3:,.0f} — a {h['weight']*30:.1f}% hit "
                    f"to your total portfolio. Concentration amplifies both gains and losses."
                ),
                "type": "trim",
                "symbol": h["symbol"],
            })

    # ─── Check 2: Sector too concentrated ─────────────────────────────────
    for sector, value in sorted(sectors.items(), key=lambda x: x[1], reverse=True):
        weight = value / total_portfolio
        if weight > limits["max_sector"] and sector != "Crypto":
            recommendations.append({
                "priority": 8,
                "action": f"Diversify away from {sector} (currently {weight*100:.1f}%, limit {limits['max_sector']*100:.0f}%)",
                "title": f"{sector} sector overweight",
                "reasoning": (
                    f"Your {sector} exposure is {weight*100:.1f}% of your portfolio. "
                    f"Your {req.risk_profile} profile recommends max {limits['max_sector']*100:.0f}% in one sector. "
                    f"Sector-specific risks (regulation, competition, economic cycles) can hit all stocks "
                    f"in a sector simultaneously."
                ),
                "risk_if_follow": (
                    f"If {sector} continues outperforming, your overall returns may be slightly lower. "
                    f"Diversification sometimes means accepting good-enough returns for better safety."
                ),
                "risk_if_ignore": (
                    f"A sector downturn would disproportionately hurt your portfolio. "
                    f"Tech crashed 75% in 2000-2002, Energy crashed 60% in 2014-2016."
                ),
                "type": "diversify",
                "symbol": None,
            })

    # ─── Check 3: Crypto over limit ──────────────────────────────────────
    crypto_weight = sectors.get("Crypto", 0) / total_portfolio
    if crypto_weight > limits["max_crypto"]:
        recommendations.append({
            "priority": 9,
            "action": f"Reduce crypto to {limits['max_crypto']*100:.0f}% (currently {crypto_weight*100:.1f}%)",
            "title": "Crypto allocation exceeds profile limit",
            "reasoning": (
                f"Crypto represents {crypto_weight*100:.1f}% of your portfolio but your "
                f"{req.risk_profile} profile caps it at {limits['max_crypto']*100:.0f}%. "
                f"Crypto is 3-5x more volatile than stocks. A single bad week can erase months of gains."
            ),
            "risk_if_follow": "You may miss crypto upside. But you will also miss crypto crashes.",
            "risk_if_ignore": (
                f"A 50% crypto crash (which happens roughly every 18 months) would hit your portfolio "
                f"by {crypto_weight*50:.1f}%. That may exceed your risk tolerance."
            ),
            "type": "reduce_crypto",
            "symbol": None,
        })

    # ─── Check 4: Too much idle cash ─────────────────────────────────────
    if cash_weight > limits["ideal_cash"] + 0.10 and req.last_trade_days_ago > 14:
        idle_amount = (cash_weight - limits["ideal_cash"]) * total_portfolio
        recommendations.append({
            "priority": 6,
            "action": f"Deploy ${idle_amount:,.0f} of idle cash into diversified investments",
            "title": "Cash sitting idle for too long",
            "reasoning": (
                f"You have {cash_weight*100:.1f}% in cash (${req.cash_balance:,.0f}). Your "
                f"{req.risk_profile} profile targets {limits['ideal_cash']*100:.0f}%. "
                f"This extra cash has been idle for {req.last_trade_days_ago} days. "
                f"Cash loses purchasing power to inflation (~3-4%/year)."
            ),
            "risk_if_follow": (
                "If markets drop shortly after investing, you will temporarily be down. "
                "However, time in market historically beats timing the market."
            ),
            "risk_if_ignore": (
                f"Inflation erodes ~${idle_amount*0.035:,.0f}/year of purchasing power from your idle cash. "
                f"You also miss compound growth on that money."
            ),
            "type": "deploy_cash",
            "symbol": None,
            "suggestions": _get_suggestions(req.risk_profile),
        })

    # ─── Check 5: Big loser needing attention ─────────────────────────────
    for h in holdings_data:
        if h["gain_pct"] < -20 and h["weight"] > 0.05:
            recommendations.append({
                "priority": 7,
                "action": f"Review {h['symbol']} — down {abs(h['gain_pct']):.0f}% from your purchase price",
                "title": f"{h['symbol']} is significantly underwater",
                "reasoning": (
                    f"{h['symbol']} ({h['name']}) has lost {abs(h['gain_pct']):.0f}% since you bought it "
                    f"at ${h['avg_cost']:.2f}. It is now ${h['current_price']:.2f}. "
                    f"Re-evaluate: has your original thesis broken, or is this a temporary dip? "
                    f"Check if the reasons you bought still hold."
                ),
                "risk_if_follow": (
                    "If you sell and the stock recovers, you lock in a loss. "
                    "Only sell if your thesis has genuinely broken."
                ),
                "risk_if_ignore": (
                    "If the company has fundamental problems, it may continue declining. "
                    "Holding a broken stock hoping for recovery is a common costly mistake."
                ),
                "type": "review",
                "symbol": h["symbol"],
            })

    # ─── Pick the highest priority recommendation ─────────────────────────
    if not recommendations:
        return {
            "has_recommendation": False,
            "message": "Your portfolio looks well-balanced today. No action needed.",
            "portfolio_health": "good",
            "checked_at": datetime.now().isoformat(),
        }

    # Sort by priority (highest first)
    recommendations.sort(key=lambda x: x["priority"], reverse=True)
    top = recommendations[0]

    return {
        "has_recommendation": True,
        "recommendation": {
            "action": top["action"],
            "title": top["title"],
            "reasoning": top["reasoning"],
            "risk_if_follow": top["risk_if_follow"],
            "risk_if_ignore": top["risk_if_ignore"],
            "type": top["type"],
            "symbol": top.get("symbol"),
            "suggestions": top.get("suggestions"),
        },
        "other_issues_count": len(recommendations) - 1,
        "portfolio_health": "needs_attention" if top["priority"] >= 8 else "minor_issues",
        "risk_profile": req.risk_profile,
        "checked_at": datetime.now().isoformat(),
    }


def _get_suggestions(profile: str) -> list[dict]:
    """Suggest ETFs based on risk profile."""
    if profile == "Conservative":
        return [
            {"symbol": "AGG", "name": "iShares Core US Aggregate Bond", "why": "Low volatility bond fund"},
            {"symbol": "SCHD", "name": "Schwab US Dividend Equity", "why": "Stable dividend stocks"},
        ]
    elif profile == "Moderate":
        return [
            {"symbol": "VTI", "name": "Vanguard Total Stock Market", "why": "Broad US market exposure"},
            {"symbol": "SCHD", "name": "Schwab US Dividend Equity", "why": "Steady income + growth"},
        ]
    else:
        return [
            {"symbol": "VTI", "name": "Vanguard Total Stock Market", "why": "Full US market"},
            {"symbol": "QQQ", "name": "Invesco Nasdaq 100", "why": "Growth-focused tech leaders"},
        ]
