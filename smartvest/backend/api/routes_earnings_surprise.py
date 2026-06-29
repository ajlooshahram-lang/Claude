"""
Earnings Surprise Prediction Model

Combines three signals into a Surprise Probability score (1-100):
1. Analyst estimate revision trend (30 days)
2. Options market implied move
3. Historical earnings surprise rate (last 8 quarters)
"""

import math
from datetime import datetime, timedelta

import yfinance as yf
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/earnings-surprise", tags=["earnings-surprise"])


class SurpriseRequest(BaseModel):
    symbols: list[str]


@router.post("/analyze")
def analyze_surprise_probability(req: SurpriseRequest):
    """Analyze earnings surprise probability for watchlist stocks."""
    results = []

    for sym in req.symbols[:10]:
        try:
            ticker = yf.Ticker(sym.upper())
            info = ticker.info
            hist = ticker.history(period="6mo")

            if hist.empty:
                continue

            name = info.get("shortName", sym)
            price = hist["Close"].iloc[-1]

            # ─── Signal 1: Analyst Estimate Revision Trend ────────────────
            # Use recommendation trends and target price vs current
            target_price = info.get("targetMeanPrice")
            current_rec = info.get("recommendationMean")  # 1=Strong Buy, 5=Sell
            num_analysts = info.get("numberOfAnalystOpinions", 0)

            revision_score = 50  # neutral default
            revision_reasoning = ""

            if target_price and target_price > 0:
                upside = ((target_price - price) / price) * 100
                if upside > 20:
                    revision_score = 80
                    revision_reasoning = f"Analysts target ${target_price:.0f} ({upside:.0f}% upside) — strong positive bias."
                elif upside > 10:
                    revision_score = 65
                    revision_reasoning = f"Analysts target ${target_price:.0f} ({upside:.0f}% upside) — moderately positive."
                elif upside > 0:
                    revision_score = 55
                    revision_reasoning = f"Analysts target ${target_price:.0f} ({upside:.0f}% upside) — slightly positive."
                elif upside > -10:
                    revision_score = 40
                    revision_reasoning = f"Analysts target ${target_price:.0f} ({upside:.0f}%) — slightly negative."
                else:
                    revision_score = 25
                    revision_reasoning = f"Analysts target ${target_price:.0f} ({upside:.0f}%) — negative outlook."
            else:
                revision_reasoning = "No analyst target available."

            if current_rec:
                if current_rec < 2.0:
                    revision_score = min(90, revision_score + 15)
                    revision_reasoning += " Consensus: Strong Buy."
                elif current_rec < 2.5:
                    revision_score = min(85, revision_score + 10)
                    revision_reasoning += " Consensus: Buy."
                elif current_rec > 3.5:
                    revision_score = max(15, revision_score - 15)
                    revision_reasoning += " Consensus: Sell/Underperform."

            # ─── Signal 2: Options Implied Move ───────────────────────────
            implied_score = 50
            implied_reasoning = ""
            implied_move = None

            try:
                exps = ticker.options
                if exps:
                    # Get nearest expiry
                    chain = ticker.option_chain(exps[0])
                    if not chain.calls.empty:
                        # ATM straddle approximation
                        atm_calls = chain.calls.iloc[(chain.calls['strike'] - price).abs().argsort()[:1]]
                        atm_puts = chain.puts.iloc[(chain.puts['strike'] - price).abs().argsort()[:1]]

                        call_price = float(atm_calls['lastPrice'].iloc[0]) if not atm_calls.empty else 0
                        put_price = float(atm_puts['lastPrice'].iloc[0]) if not atm_puts.empty else 0
                        straddle = call_price + put_price
                        implied_move = (straddle / price) * 100

                        # Average implied vol
                        avg_iv = float(chain.calls['impliedVolatility'].mean()) * 100

                        if implied_move < 3:
                            implied_score = 60
                            implied_reasoning = f"Market expects only ±{implied_move:.1f}% move. Low expectations make a positive surprise more impactful."
                        elif implied_move < 6:
                            implied_score = 50
                            implied_reasoning = f"Market pricing ±{implied_move:.1f}% move — moderate expectations."
                        elif implied_move < 10:
                            implied_score = 45
                            implied_reasoning = f"Market pricing ±{implied_move:.1f}% move — expectations are elevated."
                        else:
                            implied_score = 35
                            implied_reasoning = f"Market expects ±{implied_move:.1f}% — very high expectations make it hard to surprise positively."
            except:
                implied_reasoning = "Options data not available for implied move calculation."

            # ─── Signal 3: Historical Earnings Beat Rate ──────────────────
            beat_score = 50
            beat_reasoning = ""
            beats = 0
            total_quarters = 0
            avg_surprise_pct = 0

            try:
                earnings = ticker.earnings_history
                if earnings is not None and not earnings.empty:
                    recent = earnings.tail(8)
                    total_quarters = len(recent)

                    for _, row in recent.iterrows():
                        actual = row.get("epsActual")
                        estimate = row.get("epsEstimate") or row.get("epsDifference")
                        if actual is not None and estimate is not None and estimate != 0:
                            if actual > estimate:
                                beats += 1
                            surprise = ((actual - estimate) / abs(estimate)) * 100
                            avg_surprise_pct += surprise

                    if total_quarters > 0:
                        beat_rate = (beats / total_quarters) * 100
                        avg_surprise_pct /= total_quarters

                        if beat_rate >= 87.5:  # 7/8 or 8/8
                            beat_score = 85
                            beat_reasoning = f"Beat estimates {beats}/{total_quarters} quarters ({beat_rate:.0f}%). Avg surprise: {avg_surprise_pct:+.1f}%. Consistent outperformer."
                        elif beat_rate >= 62.5:  # 5/8+
                            beat_score = 65
                            beat_reasoning = f"Beat estimates {beats}/{total_quarters} quarters ({beat_rate:.0f}%). Avg surprise: {avg_surprise_pct:+.1f}%. Tends to beat."
                        elif beat_rate >= 37.5:
                            beat_score = 45
                            beat_reasoning = f"Beat estimates {beats}/{total_quarters} quarters ({beat_rate:.0f}%). Mixed track record."
                        else:
                            beat_score = 25
                            beat_reasoning = f"Beat estimates only {beats}/{total_quarters} quarters ({beat_rate:.0f}%). Tends to miss."
                    else:
                        beat_reasoning = "No earnings history available."
                else:
                    beat_reasoning = "No earnings history data."
            except:
                beat_reasoning = "Could not retrieve earnings history."

            # ─── Combined Score ───────────────────────────────────────────
            # Weighted: Beat rate 40%, Revision trend 35%, Implied move 25%
            combined = (beat_score * 0.40) + (revision_score * 0.35) + (implied_score * 0.25)
            combined = max(1, min(100, round(combined)))

            # Generate overall reasoning
            if combined >= 70:
                overall = "Conditions historically associated with positive earnings surprises are strongly present."
            elif combined >= 55:
                overall = "Moderate indicators of a potential positive surprise. Not a guarantee."
            elif combined >= 40:
                overall = "Mixed signals. No clear lean toward beat or miss."
            else:
                overall = "Conditions suggest elevated risk of missing expectations."

            results.append({
                "symbol": sym.upper(),
                "name": name,
                "price": round(price, 2),
                "surprise_score": combined,
                "overall_reasoning": overall,
                "signals": {
                    "revision_trend": {
                        "score": revision_score,
                        "reasoning": revision_reasoning,
                        "weight": "35%",
                    },
                    "implied_move": {
                        "score": implied_score,
                        "implied_move_pct": round(implied_move, 1) if implied_move else None,
                        "reasoning": implied_reasoning,
                        "weight": "25%",
                    },
                    "historical_beats": {
                        "score": beat_score,
                        "beats": beats,
                        "total_quarters": total_quarters,
                        "avg_surprise_pct": round(avg_surprise_pct, 1) if total_quarters > 0 else None,
                        "reasoning": beat_reasoning,
                        "weight": "40%",
                    },
                },
            })
        except:
            continue

    results.sort(key=lambda x: x["surprise_score"], reverse=True)

    return {
        "stocks_analyzed": len(results),
        "results": results,
        "methodology": "Score combines: Historical beat rate (40% weight), Analyst revision trend (35%), Options implied move (25%). Higher score = conditions historically associated with positive surprises.",
        "disclaimer": "This is NOT a prediction. It identifies conditions statistically associated with surprises. Companies can miss despite high scores.",
    }
