"""
Fama-French Factor Exposure Analysis

Calculates portfolio exposure to 5 classic investment factors:
1. Market Beta - overall market sensitivity
2. Size - small vs large cap tilt
3. Value - cheap vs expensive stocks
4. Momentum - recent winners vs losers
5. Quality - profitable stable vs speculative

Uses yfinance fundamentals to estimate factor loadings.
"""

import math
from datetime import datetime

import numpy as np
import yfinance as yf
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/factors", tags=["factors"])

# Target factor profiles by risk profile
TARGET_FACTORS = {
    "Conservative": {"beta": 0.7, "size": 0.3, "value": 0.7, "momentum": 0.4, "quality": 0.9},
    "Moderate": {"beta": 1.0, "size": 0.5, "value": 0.5, "momentum": 0.6, "quality": 0.7},
    "Aggressive": {"beta": 1.3, "size": 0.7, "value": 0.3, "momentum": 0.8, "quality": 0.4},
}

FACTOR_EXPLANATIONS = {
    "beta": {
        "name": "Market Beta",
        "description": "How much your portfolio moves with the overall stock market. Beta of 1.0 means you move exactly with the market. Above 1.0 means you amplify market moves (both up and down).",
        "high_means": "You gain more in bull markets but lose more in crashes.",
        "low_means": "You are more protected in downturns but capture less upside.",
    },
    "size": {
        "name": "Size Factor",
        "description": "Whether you tilt toward small companies (which historically outperform but with more risk) or large stable companies.",
        "high_means": "Tilted toward smaller, riskier companies with higher growth potential.",
        "low_means": "Concentrated in large, established companies — safer but potentially lower growth.",
    },
    "value": {
        "name": "Value Factor",
        "description": "Whether you own cheap stocks (low P/E, high dividends) or expensive growth stocks. Historically, cheap stocks outperform over very long periods.",
        "high_means": "You own fundamentally cheap stocks — may lag in growth-driven markets.",
        "low_means": "You own expensive growth stocks — vulnerable if growth disappoints.",
    },
    "momentum": {
        "name": "Momentum Factor",
        "description": "Whether your stocks have been recent winners (price trending up) or losers. Stocks that have gone up tend to keep going up in the short term.",
        "high_means": "You are riding winners — works until the trend reverses.",
        "low_means": "You hold laggards — may be catching falling knives or finding value.",
    },
    "quality": {
        "name": "Quality Factor",
        "description": "Whether you own profitable, stable companies with strong balance sheets or speculative companies burning cash. Quality tends to outperform during uncertainty.",
        "high_means": "You own solid, profitable businesses — defensive in downturns.",
        "low_means": "You own speculative companies — high reward potential but fragile.",
    },
}


class Holding(BaseModel):
    symbol: str
    shares: float
    current_value: float = 0


class FactorRequest(BaseModel):
    holdings: list[Holding]
    risk_profile: str = "Moderate"


@router.post("/analyze")
def analyze_factors(req: FactorRequest):
    """Calculate Fama-French factor exposures for portfolio."""
    holdings_data = []
    total_value = 0

    for h in req.holdings:
        try:
            ticker = yf.Ticker(h.symbol.upper())
            info = ticker.info
            hist = ticker.history(period="1y")
            if hist.empty:
                continue

            price = hist["Close"].iloc[-1]
            value = h.current_value if h.current_value > 0 else price * h.shares
            total_value += value

            # Extract factor data
            beta = info.get("beta") or 1.0
            market_cap = info.get("marketCap") or 0
            pe_ratio = info.get("trailingPE") or info.get("forwardPE") or 20
            pb_ratio = info.get("priceToBook") or 3.0
            dividend_yield = info.get("dividendYield") or 0
            profit_margin = info.get("profitMargins") or 0
            roe = info.get("returnOnEquity") or 0
            debt_equity = info.get("debtToEquity") or 50

            # 6-month momentum
            if len(hist) >= 126:
                momentum_6m = ((price / hist["Close"].iloc[-126]) - 1) * 100
            else:
                momentum_6m = 0

            holdings_data.append({
                "symbol": h.symbol.upper(),
                "value": value,
                "beta": float(beta) if beta else 1.0,
                "market_cap": market_cap,
                "pe_ratio": float(pe_ratio) if pe_ratio and pe_ratio > 0 else 20,
                "pb_ratio": float(pb_ratio) if pb_ratio else 3.0,
                "dividend_yield": float(dividend_yield) if dividend_yield else 0,
                "profit_margin": float(profit_margin) if profit_margin else 0,
                "roe": float(roe) if roe else 0,
                "debt_equity": float(debt_equity) if debt_equity else 50,
                "momentum_6m": momentum_6m,
            })
        except:
            continue

    if not holdings_data or total_value == 0:
        raise HTTPException(status_code=400, detail="No valid holdings")

    # Calculate weights
    for h in holdings_data:
        h["weight"] = h["value"] / total_value

    # ─── Calculate Factor Scores (0-1 scale) ──────────────────────────────

    # 1. Beta (market sensitivity)
    port_beta = sum(h["weight"] * h["beta"] for h in holdings_data)
    beta_score = min(2.0, max(0, port_beta))  # Raw beta

    # 2. Size (small vs large) — based on market cap
    # Score: 0 = all mega-cap, 1 = all small-cap
    size_scores = []
    for h in holdings_data:
        mc = h["market_cap"]
        if mc > 200_000_000_000:
            s = 0.1  # Mega cap
        elif mc > 50_000_000_000:
            s = 0.3  # Large
        elif mc > 10_000_000_000:
            s = 0.5  # Mid
        elif mc > 2_000_000_000:
            s = 0.7  # Small
        else:
            s = 0.9  # Micro
        size_scores.append(s * h["weight"])
    size_score = sum(size_scores)

    # 3. Value (cheap vs expensive) — based on P/E and P/B
    value_scores = []
    for h in holdings_data:
        pe = h["pe_ratio"]
        pb = h["pb_ratio"]
        div = h["dividend_yield"]
        # Low PE + Low PB + High dividend = value
        pe_val = max(0, min(1, (30 - pe) / 25)) if pe > 0 else 0.5
        pb_val = max(0, min(1, (5 - pb) / 4))
        div_val = min(1, div * 20)  # 5% yield = 1.0
        v = (pe_val * 0.4 + pb_val * 0.3 + div_val * 0.3)
        value_scores.append(v * h["weight"])
    value_score = sum(value_scores)

    # 4. Momentum (recent winners) — based on 6-month return
    mom_scores = []
    for h in holdings_data:
        m = h["momentum_6m"]
        # Normalize: -20% = 0, 0% = 0.5, +20% = 1.0
        mom = max(0, min(1, (m + 20) / 40))
        mom_scores.append(mom * h["weight"])
    momentum_score = sum(mom_scores)

    # 5. Quality — based on profit margin, ROE, low debt
    quality_scores = []
    for h in holdings_data:
        pm = h["profit_margin"]
        roe_val = h["roe"]
        de = h["debt_equity"]
        # High margins + High ROE + Low debt = quality
        pm_q = max(0, min(1, pm * 4)) if pm > 0 else 0.2
        roe_q = max(0, min(1, roe_val * 3)) if roe_val > 0 else 0.2
        de_q = max(0, min(1, (200 - de) / 200)) if de > 0 else 0.5
        q = (pm_q * 0.35 + roe_q * 0.35 + de_q * 0.3)
        quality_scores.append(q * h["weight"])
    quality_score = sum(quality_scores)

    # ─── Build factor profile ─────────────────────────────────────────────
    factors = {
        "beta": round(beta_score, 2),
        "size": round(size_score, 2),
        "value": round(value_score, 2),
        "momentum": round(momentum_score, 2),
        "quality": round(quality_score, 2),
    }

    target = TARGET_FACTORS.get(req.risk_profile, TARGET_FACTORS["Moderate"])

    # Compare to target
    comparisons = {}
    insights = []
    for factor_key, current_val in factors.items():
        target_val = target[factor_key]
        diff = current_val - target_val
        comparisons[factor_key] = {
            "current": current_val,
            "target": target_val,
            "diff": round(diff, 2),
            "status": "overweight" if diff > 0.15 else "underweight" if diff < -0.15 else "aligned",
        }

        exp = FACTOR_EXPLANATIONS[factor_key]
        if abs(diff) > 0.15:
            direction = "higher" if diff > 0 else "lower"
            implication = exp["high_means"] if diff > 0 else exp["low_means"]
            insights.append({
                "factor": exp["name"],
                "status": f"Your {exp['name'].lower()} is {direction} than target for {req.risk_profile} profile.",
                "implication": implication,
                "action": f"Consider {'reducing' if diff > 0 else 'increasing'} exposure to {factor_key} factor.",
            })

    return {
        "factors": factors,
        "target": target,
        "comparisons": comparisons,
        "risk_profile": req.risk_profile,
        "holdings_analyzed": len(holdings_data),
        "portfolio_beta": round(port_beta, 2),
        "insights": insights,
        "factor_explanations": FACTOR_EXPLANATIONS,
    }
