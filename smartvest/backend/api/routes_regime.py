"""
Market Regime Detection Engine

Classifies current market into one of four regimes:
- Risk On (growth outperforms, VIX low, yield curve steep)
- Risk Off (defensive outperforms, VIX high, flight to safety)
- Inflationary (commodities up, rates rising, real assets outperform)
- Deflationary (bonds up, rates falling, cash is king)

Uses VIX, sector rotation, yield curve proxy, and momentum signals.
"""

import math
from datetime import datetime

import numpy as np
import yfinance as yf
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/regime", tags=["regime"])

# Which sectors benefit in each regime
REGIME_SECTORS = {
    "Risk On": ["Technology", "Consumer Discretionary", "Communication Services", "Financials"],
    "Risk Off": ["Utilities", "Consumer Staples", "Healthcare", "Real Estate"],
    "Inflationary": ["Energy", "Materials", "Real Estate", "Industrials"],
    "Deflationary": ["Utilities", "Consumer Staples", "Healthcare"],
}

REGIME_DESCRIPTIONS = {
    "Risk On": "Investors are confident. Growth stocks, tech, and cyclicals outperform. VIX is low, credit spreads tight, money flows into equities.",
    "Risk Off": "Fear dominates. Investors flee to safety — bonds, gold, utilities. VIX spikes, correlations increase, cash hoarding.",
    "Inflationary": "Prices rising across the economy. Commodities, energy, and real assets benefit. Bonds suffer. Central banks tighten.",
    "Deflationary": "Economic contraction feared. Bonds rally, rates drop, cash outperforms. Growth and commodities suffer.",
}


class Holding(BaseModel):
    symbol: str
    shares: float
    current_value: float = 0


class RegimeRequest(BaseModel):
    holdings: list[Holding] = []


@router.post("/detect")
def detect_regime(req: RegimeRequest):
    """Detect current market regime and analyze portfolio positioning."""

    signals = {}

    # ─── Signal 1: VIX Level (fear gauge) ─────────────────────────────────
    try:
        vix = yf.Ticker("^VIX")
        vix_hist = vix.history(period="3mo")
        if not vix_hist.empty:
            current_vix = float(vix_hist["Close"].iloc[-1])
            avg_vix = float(vix_hist["Close"].mean())
            signals["vix"] = current_vix
            signals["vix_avg"] = avg_vix
    except:
        current_vix = 18
        signals["vix"] = current_vix

    # ─── Signal 2: Growth vs Defensive (sector rotation) ──────────────────
    try:
        # QQQ (growth) vs XLU (defensive)
        qqq = yf.Ticker("QQQ").history(period="1mo")
        xlu = yf.Ticker("XLU").history(period="1mo")
        if not qqq.empty and not xlu.empty:
            qqq_ret = ((qqq["Close"].iloc[-1] / qqq["Close"].iloc[0]) - 1) * 100
            xlu_ret = ((xlu["Close"].iloc[-1] / xlu["Close"].iloc[0]) - 1) * 100
            signals["growth_vs_defensive"] = round(qqq_ret - xlu_ret, 2)
    except:
        signals["growth_vs_defensive"] = 0

    # ─── Signal 3: Yield curve proxy (TLT long bonds vs SHY short bonds) ──
    try:
        tlt = yf.Ticker("TLT").history(period="1mo")
        shy = yf.Ticker("SHY").history(period="1mo")
        if not tlt.empty and not shy.empty:
            tlt_ret = ((tlt["Close"].iloc[-1] / tlt["Close"].iloc[0]) - 1) * 100
            shy_ret = ((shy["Close"].iloc[-1] / shy["Close"].iloc[0]) - 1) * 100
            signals["long_vs_short_bonds"] = round(tlt_ret - shy_ret, 2)
    except:
        signals["long_vs_short_bonds"] = 0

    # ─── Signal 4: Commodity proxy (DBC or XLE vs SPY) ────────────────────
    try:
        xle = yf.Ticker("XLE").history(period="1mo")
        spy = yf.Ticker("SPY").history(period="1mo")
        if not xle.empty and not spy.empty:
            xle_ret = ((xle["Close"].iloc[-1] / xle["Close"].iloc[0]) - 1) * 100
            spy_ret = ((spy["Close"].iloc[-1] / spy["Close"].iloc[0]) - 1) * 100
            signals["commodities_vs_market"] = round(xle_ret - spy_ret, 2)
    except:
        signals["commodities_vs_market"] = 0

    # ─── Classify Regime ──────────────────────────────────────────────────
    vix_val = signals.get("vix", 18)
    growth_def = signals.get("growth_vs_defensive", 0)
    bonds = signals.get("long_vs_short_bonds", 0)
    commodities = signals.get("commodities_vs_market", 0)

    scores = {"Risk On": 0, "Risk Off": 0, "Inflationary": 0, "Deflationary": 0}

    # VIX scoring
    if vix_val < 15:
        scores["Risk On"] += 30
    elif vix_val < 20:
        scores["Risk On"] += 15
    elif vix_val < 25:
        scores["Risk Off"] += 15
    elif vix_val < 30:
        scores["Risk Off"] += 25
    else:
        scores["Risk Off"] += 35

    # Growth vs Defensive
    if growth_def > 3:
        scores["Risk On"] += 25
    elif growth_def > 0:
        scores["Risk On"] += 10
    elif growth_def > -3:
        scores["Risk Off"] += 10
    else:
        scores["Risk Off"] += 25

    # Bond signal
    if bonds > 2:
        scores["Deflationary"] += 25
        scores["Risk Off"] += 10
    elif bonds > 0:
        scores["Deflationary"] += 10
    elif bonds < -2:
        scores["Inflationary"] += 20
        scores["Risk On"] += 5
    else:
        scores["Inflationary"] += 5

    # Commodities
    if commodities > 3:
        scores["Inflationary"] += 30
    elif commodities > 0:
        scores["Inflationary"] += 10
    elif commodities < -3:
        scores["Deflationary"] += 15
    else:
        scores["Risk On"] += 5

    # Determine regime
    total = sum(scores.values()) or 1
    regime = max(scores, key=lambda k: scores[k])
    confidence = scores[regime] / total * 100

    # ─── Analyze Holdings ─────────────────────────────────────────────────
    well_positioned = []
    at_risk = []

    for h in req.holdings[:15]:
        try:
            ticker = yf.Ticker(h.symbol.upper())
            info = ticker.info
            sector = info.get("sector", "Unknown")
            name = info.get("shortName", h.symbol)

            favored_sectors = REGIME_SECTORS.get(regime, [])
            is_favored = sector in favored_sectors

            entry = {
                "symbol": h.symbol.upper(),
                "name": name,
                "sector": sector,
            }

            if is_favored:
                well_positioned.append({**entry, "reason": f"{sector} tends to outperform in {regime} regimes."})
            else:
                # Check if it's in a counter-regime
                counter_regime = "Risk Off" if regime == "Risk On" else "Risk On" if regime == "Risk Off" else "Deflationary" if regime == "Inflationary" else "Inflationary"
                counter_sectors = REGIME_SECTORS.get(counter_regime, [])
                if sector in counter_sectors:
                    at_risk.append({**entry, "reason": f"{sector} typically underperforms in {regime} regimes — it favors {counter_regime} conditions."})
                else:
                    well_positioned.append({**entry, "reason": f"{sector} is neutral in the current regime."})
        except:
            continue

    # Build explanation
    explanation_parts = []
    explanation_parts.append(f"The market is currently in a <strong>{regime}</strong> regime (confidence: {confidence:.0f}%).")
    explanation_parts.append(REGIME_DESCRIPTIONS[regime])
    if vix_val < 15:
        explanation_parts.append(f"VIX at {vix_val:.1f} indicates very low fear — complacency can precede corrections.")
    elif vix_val > 25:
        explanation_parts.append(f"VIX at {vix_val:.1f} signals elevated fear — historically a contrarian buying signal.")

    return {
        "regime": regime,
        "confidence_pct": round(confidence, 1),
        "regime_scores": {k: round(v / total * 100, 1) for k, v in scores.items()},
        "regime_description": REGIME_DESCRIPTIONS[regime],
        "signals": signals,
        "explanation": " ".join(explanation_parts),
        "well_positioned": well_positioned,
        "at_risk": at_risk,
        "regime_sectors": REGIME_SECTORS,
    }
