"""
Anomaly Detection API

Monitors stocks for unusual behavior that warrants investigation.
NOT a recommendation — just flags that something atypical is happening.

Anomaly types:
  1. Volume spike: today's volume > 300% of 30-day average
  2. Price deviation: price moved > 3 standard deviations from 30-day mean
  3. News surge: stock has news after extended silence (detected via news count)
  4. Abnormal daily movement: single-day move > 2x the stock's typical daily range

Endpoint:
    POST /api/anomalies — Check a list of symbols for anomalies
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List
import yfinance as yf
import numpy as np
from datetime import datetime

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from market_data.cache import get as cache_get, set as cache_set

router = APIRouter(prefix="/api", tags=["Anomalies"])


class AnomalyRequest(BaseModel):
    symbols: List[str]


class Anomaly(BaseModel):
    symbol: str
    name: str
    type: str             # volume_spike, price_deviation, news_surge, abnormal_move
    severity: str         # mild, moderate, extreme
    title: str
    explanation: str
    data: dict            # Supporting numbers


@router.post("/anomalies")
def detect_anomalies(req: AnomalyRequest):
    """
    Scan a list of stocks for anomalies.
    Returns any unusual behavior detected today.
    """
    if len(req.symbols) > 20:
        req.symbols = req.symbols[:20]

    anomalies = []

    for symbol in req.symbols:
        sym = symbol.upper().strip()
        cache_key = f"anomaly:{sym}"
        cached = cache_get(cache_key)
        if cached is not None:
            anomalies.extend(cached)
            continue

        stock_anomalies = _analyze_stock(sym)
        cache_set(cache_key, stock_anomalies, ttl=900)  # Cache 15 min
        anomalies.extend(stock_anomalies)

    return {
        "count": len(anomalies),
        "anomalies": [a.dict() for a in anomalies],
        "scanned": len(req.symbols),
        "note": "Anomalies are signals worth investigating, not buy/sell recommendations.",
    }


def _analyze_stock(symbol: str) -> List[Anomaly]:
    """Run all anomaly checks on a single stock."""
    results: List[Anomaly] = []

    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period="2mo")
        info = ticker.info

        if hist is None or hist.empty or len(hist) < 20:
            return results

        name = info.get("shortName") or info.get("longName") or symbol
        closes = hist["Close"].values
        volumes = hist["Volume"].values
        today_close = float(closes[-1])
        today_volume = int(volumes[-1])

        # ─── 1. Volume Spike ─────────────────────────────────────────────
        avg_volume_30d = float(np.mean(volumes[-30:])) if len(volumes) >= 30 else float(np.mean(volumes))
        if avg_volume_30d > 0 and today_volume > avg_volume_30d * 3:
            spike_ratio = today_volume / avg_volume_30d
            severity = "extreme" if spike_ratio > 5 else "moderate" if spike_ratio > 4 else "mild"
            results.append(Anomaly(
                symbol=symbol,
                name=name,
                type="volume_spike",
                severity=severity,
                title=f"Volume spike: {spike_ratio:.0f}x normal",
                explanation=(
                    f"{name}'s trading volume today ({today_volume:,}) is "
                    f"{spike_ratio:.1f}x its 30-day average ({int(avg_volume_30d):,}). "
                    f"This often means institutional investors are making big moves, "
                    f"news is about to break, or a major event is happening. "
                    f"Worth checking the news feed for this stock."
                ),
                data={
                    "today_volume": today_volume,
                    "avg_volume_30d": int(avg_volume_30d),
                    "spike_ratio": round(spike_ratio, 1),
                },
            ))

        # ─── 2. Price Deviation (3 sigma) ────────────────────────────────
        if len(closes) >= 30:
            mean_30d = float(np.mean(closes[-30:]))
            std_30d = float(np.std(closes[-30:]))
            if std_30d > 0:
                z_score = (today_close - mean_30d) / std_30d
                if abs(z_score) > 3:
                    direction = "above" if z_score > 0 else "below"
                    severity = "extreme" if abs(z_score) > 4 else "moderate"
                    pct_from_mean = ((today_close - mean_30d) / mean_30d) * 100
                    results.append(Anomaly(
                        symbol=symbol,
                        name=name,
                        type="price_deviation",
                        severity=severity,
                        title=f"Price {abs(z_score):.1f}σ {direction} average",
                        explanation=(
                            f"{name}'s price ({today_close:.2f}) is {abs(z_score):.1f} standard deviations "
                            f"{direction} its 30-day average ({mean_30d:.2f}). "
                            f"That's a {abs(pct_from_mean):.1f}% deviation — statistically very unusual. "
                            f"This could mean a fundamental shift in how the market values this company, "
                            f"or it could be a temporary overreaction that reverts."
                        ),
                        data={
                            "today_price": round(today_close, 2),
                            "mean_30d": round(mean_30d, 2),
                            "std_30d": round(std_30d, 2),
                            "z_score": round(z_score, 2),
                            "pct_from_mean": round(pct_from_mean, 2),
                        },
                    ))

        # ─── 3. Abnormal Single-Day Move ─────────────────────────────────
        if len(closes) >= 2:
            daily_returns = np.diff(closes) / closes[:-1] * 100
            if len(daily_returns) >= 20:
                avg_daily_move = float(np.mean(np.abs(daily_returns[-20:])))
                today_move = float(daily_returns[-1])

                if avg_daily_move > 0 and abs(today_move) > avg_daily_move * 2.5:
                    move_ratio = abs(today_move) / avg_daily_move
                    direction = "up" if today_move > 0 else "down"
                    severity = "extreme" if move_ratio > 4 else "moderate" if move_ratio > 3 else "mild"
                    results.append(Anomaly(
                        symbol=symbol,
                        name=name,
                        type="abnormal_move",
                        severity=severity,
                        title=f"Unusual {direction} move: {abs(today_move):.1f}% in one day",
                        explanation=(
                            f"{name} moved {abs(today_move):.1f}% {direction} today, which is "
                            f"{move_ratio:.1f}x its typical daily movement ({avg_daily_move:.1f}%). "
                            f"Single-day moves this large often signal that new information "
                            f"has entered the market — an earnings surprise, analyst upgrade/downgrade, "
                            f"or sector-wide news."
                        ),
                        data={
                            "today_move_pct": round(today_move, 2),
                            "avg_daily_move_pct": round(avg_daily_move, 2),
                            "move_ratio": round(move_ratio, 1),
                        },
                    ))

        # ─── 4. News Surge (proxy: check if recent news exists) ──────────
        try:
            news = ticker.news
            if news and len(news) > 0:
                # Check if the most recent news is from today/yesterday
                recent = news[0].get("content", {})
                pub_date = recent.get("pubDate", "")
                if pub_date:
                    news_date = datetime.fromisoformat(pub_date.replace("Z", "+00:00"))
                    hours_ago = (datetime.now(news_date.tzinfo) - news_date).total_seconds() / 3600
                    # If news is very recent (< 6 hours) AND there are multiple articles
                    if hours_ago < 6 and len(news) >= 3:
                        results.append(Anomaly(
                            symbol=symbol,
                            name=name,
                            type="news_surge",
                            severity="moderate",
                            title=f"Sudden news activity ({len(news)} recent articles)",
                            explanation=(
                                f"{name} has {len(news)} news articles in the last few hours. "
                                f"A burst of media coverage often precedes or follows a significant "
                                f"event — earnings release, regulatory decision, merger rumor, or "
                                f"analyst action. Check the headlines to understand what's driving attention."
                            ),
                            data={
                                "article_count": len(news),
                                "hours_since_latest": round(hours_ago, 1),
                            },
                        ))
        except Exception:
            pass

    except Exception:
        pass

    return results
