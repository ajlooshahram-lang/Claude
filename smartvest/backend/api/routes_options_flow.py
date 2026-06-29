"""
Options Activity Scanner

Uses free yfinance options data to detect unusual activity:
- Contracts with volume >> open interest (new positioning)
- Put/call ratio analysis
- Large open interest concentrations
- Volume spikes indicating institutional interest

NOTE: Real-time flow (sweep orders, bid/ask fills) requires paid feeds.
This scanner uses the best available free data.
"""

import math
from datetime import datetime, timedelta

import yfinance as yf
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/options-flow", tags=["options-flow"])


class FlowRequest(BaseModel):
    symbols: list[str]


@router.post("/scan")
def scan_options_activity(req: FlowRequest):
    """Scan watchlist for unusual options activity."""
    results = []

    for sym in req.symbols[:10]:
        try:
            ticker = yf.Ticker(sym.upper())
            info = ticker.info
            hist = ticker.history(period="1mo")

            if hist.empty:
                continue

            current_price = hist["Close"].iloc[-1]
            name = info.get("shortName", sym)

            # Get price trend (14 day)
            if len(hist) >= 14:
                sma14 = hist["Close"].rolling(14).mean().iloc[-1]
                trend = "bullish" if current_price > sma14 else "bearish"
            else:
                trend = "neutral"

            # Get options expiration dates
            try:
                expirations = ticker.options
            except:
                continue

            if not expirations:
                continue

            # Analyze the nearest 2 expiry dates
            signals = []
            total_call_volume = 0
            total_put_volume = 0
            total_call_oi = 0
            total_put_oi = 0

            for exp_date in expirations[:2]:
                try:
                    chain = ticker.option_chain(exp_date)
                    calls = chain.calls
                    puts = chain.puts

                    if calls.empty and puts.empty:
                        continue

                    # Aggregate volumes
                    c_vol = int(calls["volume"].sum()) if "volume" in calls.columns else 0
                    p_vol = int(puts["volume"].sum()) if "volume" in puts.columns else 0
                    c_oi = int(calls["openInterest"].sum()) if "openInterest" in calls.columns else 0
                    p_oi = int(puts["openInterest"].sum()) if "openInterest" in puts.columns else 0

                    total_call_volume += c_vol
                    total_put_volume += p_vol
                    total_call_oi += c_oi
                    total_put_oi += p_oi

                    # Find unusual call activity (volume > 3x open interest)
                    for _, row in calls.iterrows():
                        vol = int(row.get("volume", 0) or 0)
                        oi = int(row.get("openInterest", 0) or 0)
                        strike = float(row.get("strike", 0))
                        last_price = float(row.get("lastPrice", 0) or 0)
                        implied_vol = float(row.get("impliedVolatility", 0) or 0)

                        if vol > 0 and oi > 0 and vol > oi * 3 and vol >= 100:
                            premium = vol * last_price * 100
                            # Determine if bullish or contradicts trend
                            is_otm = strike > current_price
                            contradicts = (trend == "bearish")

                            signals.append({
                                "type": "call",
                                "strike": strike,
                                "expiry": exp_date,
                                "volume": vol,
                                "open_interest": oi,
                                "vol_oi_ratio": round(vol / oi, 1) if oi > 0 else vol,
                                "premium_usd": round(premium, 0),
                                "implied_vol": round(implied_vol * 100, 1),
                                "is_otm": is_otm,
                                "contradicts_trend": contradicts,
                                "signal_strength": "strong" if vol > oi * 5 else "moderate",
                                "explanation": _explain_call(vol, oi, strike, current_price, trend, contradicts),
                            })

                    # Find unusual put activity
                    for _, row in puts.iterrows():
                        vol = int(row.get("volume", 0) or 0)
                        oi = int(row.get("openInterest", 0) or 0)
                        strike = float(row.get("strike", 0))
                        last_price = float(row.get("lastPrice", 0) or 0)
                        implied_vol = float(row.get("impliedVolatility", 0) or 0)

                        if vol > 0 and oi > 0 and vol > oi * 3 and vol >= 100:
                            premium = vol * last_price * 100
                            is_otm = strike < current_price
                            contradicts = (trend == "bullish")

                            signals.append({
                                "type": "put",
                                "strike": strike,
                                "expiry": exp_date,
                                "volume": vol,
                                "open_interest": oi,
                                "vol_oi_ratio": round(vol / oi, 1) if oi > 0 else vol,
                                "premium_usd": round(premium, 0),
                                "implied_vol": round(implied_vol * 100, 1),
                                "is_otm": is_otm,
                                "contradicts_trend": contradicts,
                                "signal_strength": "strong" if vol > oi * 5 else "moderate",
                                "explanation": _explain_put(vol, oi, strike, current_price, trend, contradicts),
                            })
                except:
                    continue

            # Put/call ratio
            pc_ratio = total_put_volume / total_call_volume if total_call_volume > 0 else 1.0
            pc_oi_ratio = total_put_oi / total_call_oi if total_call_oi > 0 else 1.0

            # Determine overall sentiment
            if pc_ratio < 0.5:
                options_sentiment = "Very Bullish"
                sent_explanation = "Call volume dominates — traders are positioning for upside."
            elif pc_ratio < 0.8:
                options_sentiment = "Bullish"
                sent_explanation = "More calls than puts are being traded."
            elif pc_ratio < 1.2:
                options_sentiment = "Neutral"
                sent_explanation = "Balanced call and put activity."
            elif pc_ratio < 2.0:
                options_sentiment = "Bearish"
                sent_explanation = "Put volume exceeds calls — traders hedging or betting on downside."
            else:
                options_sentiment = "Very Bearish"
                sent_explanation = "Heavy put activity — significant downside protection or bets."

            # Sort signals by premium (most expensive first)
            signals.sort(key=lambda x: x["premium_usd"], reverse=True)

            results.append({
                "symbol": sym.upper(),
                "name": name,
                "price": round(current_price, 2),
                "trend": trend,
                "put_call_ratio": round(pc_ratio, 2),
                "put_call_oi_ratio": round(pc_oi_ratio, 2),
                "options_sentiment": options_sentiment,
                "sentiment_explanation": sent_explanation,
                "total_call_volume": total_call_volume,
                "total_put_volume": total_put_volume,
                "unusual_signals": signals[:8],  # Top 8 by premium
                "has_contradiction": any(s["contradicts_trend"] for s in signals),
                "signal_count": len(signals),
            })
        except:
            continue

    # Sort by number of signals (most active first)
    results.sort(key=lambda x: x["signal_count"], reverse=True)

    return {
        "stocks_scanned": len(req.symbols),
        "stocks_with_signals": len([r for r in results if r["signal_count"] > 0]),
        "results": results,
        "disclaimer": "Options activity analysis uses volume and open interest data. It does NOT show real-time order flow, sweep orders, or bid/ask fills (those require paid institutional feeds). Use as one input among many.",
        "scanned_at": datetime.now().isoformat(),
    }


def _explain_call(vol, oi, strike, price, trend, contradicts):
    ratio = vol / oi if oi > 0 else vol
    parts = []
    parts.append(f"Someone bought {vol:,} call contracts at ${strike} strike ({ratio:.0f}× normal activity).")

    if strike > price:
        parts.append(f"This is out-of-the-money (stock needs to rise above ${strike} for profit).")
    else:
        parts.append(f"This is in-the-money (already has intrinsic value).")

    if contradicts:
        parts.append("⚠️ This CONTRADICTS the current downtrend — someone is betting against the trend, which can signal a reversal is expected.")
    else:
        parts.append("This aligns with the current uptrend — reinforcing bullish momentum.")

    return " ".join(parts)


def _explain_put(vol, oi, strike, price, trend, contradicts):
    ratio = vol / oi if oi > 0 else vol
    parts = []
    parts.append(f"Someone bought {vol:,} put contracts at ${strike} strike ({ratio:.0f}× normal activity).")

    if strike < price:
        parts.append(f"This is out-of-the-money (stock needs to fall below ${strike} for profit).")
    else:
        parts.append(f"This is in-the-money (already has intrinsic value — likely a hedge).")

    if contradicts:
        parts.append("⚠️ This CONTRADICTS the current uptrend — someone is buying downside protection while the stock is rising, which could signal insiders expect trouble ahead.")
    else:
        parts.append("This aligns with the current downtrend — traders adding to bearish bets.")

    return " ".join(parts)
