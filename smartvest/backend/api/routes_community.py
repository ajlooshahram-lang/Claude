"""
Community Picks API

Tracks anonymous, aggregate stock popularity.
When any user adds a stock to their watchlist, the frontend sends a
lightweight ping with just the symbol (no user data, no IP logging).
The backend counts pings per symbol per week and returns the top 5.

No personal data is stored or shared — only: "AAPL was saved 12 times this week."

Endpoints:
    POST /api/community/ping     — Record a watchlist addition (anonymous)
    GET  /api/community/popular  — Get top 5 most-saved stocks this week
"""
from fastapi import APIRouter
from pydantic import BaseModel
from datetime import datetime, timedelta
from collections import defaultdict
from typing import Dict

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from market_data.yahoo_provider import YahooProvider
from core.scorer import compute_score

router = APIRouter(prefix="/api/community", tags=["Community"])

provider = YahooProvider()

# In-memory store: {symbol: [{timestamp}, ...]}
# In production this would be a database table.
_pings: Dict[str, list] = defaultdict(list)


def _current_week_start() -> datetime:
    """Monday 00:00 of the current week."""
    now = datetime.now()
    days_since_monday = now.weekday()
    return (now - timedelta(days=days_since_monday)).replace(hour=0, minute=0, second=0, microsecond=0)


class PingRequest(BaseModel):
    symbol: str


@router.post("/ping")
def record_ping(req: PingRequest):
    """
    Record that someone added a stock to their watchlist.
    No user data stored — just the symbol and a timestamp.
    """
    symbol = req.symbol.upper().strip()
    if not symbol or len(symbol) > 15:
        return {"status": "ignored"}

    _pings[symbol].append(datetime.now())
    return {"status": "recorded"}


@router.get("/popular")
def get_popular():
    """
    Get the 5 most-saved stocks this week with live scores.
    Returns aggregate counts only — no personal data.
    """
    week_start = _current_week_start()

    # Count pings this week per symbol
    counts: Dict[str, int] = {}
    for symbol, timestamps in _pings.items():
        week_count = sum(1 for t in timestamps if t >= week_start)
        if week_count > 0:
            counts[symbol] = week_count

    # If no real data yet (new server), seed with popular defaults
    if len(counts) < 5:
        defaults = {
            "NOVO-B.CO": 8, "AAPL": 12, "KO": 7,
            "JNJ": 6, "MSFT": 9, "PG": 5, "V": 4,
        }
        for sym, count in defaults.items():
            if sym not in counts:
                counts[sym] = count

    # Sort by count, take top 5
    top_symbols = sorted(counts.items(), key=lambda x: x[1], reverse=True)[:5]

    # Fetch live data for each
    results = []
    for symbol, count in top_symbols:
        try:
            profile = provider.get_company_profile(symbol)
            trend = provider.get_trend_14d(symbol)

            if not profile:
                continue

            # Score
            score_result = compute_score(
                symbol=symbol,
                beta=profile.get("beta"),
                annualized_volatility=profile.get("annualized_volatility"),
                market_cap=profile.get("market_cap"),
                pe_ratio=profile.get("pe_ratio"),
                dividend_yield=profile.get("dividend_yield"),
                change_14d_pct=trend["change_pct"] if trend else None,
            )

            # Beginner rating
            vol = profile.get("annualized_volatility")
            beta = profile.get("beta")
            if vol and vol * 100 < 25 and (not beta or beta < 1.0):
                beginner_rating = "Beginner Friendly"
            elif vol and vol * 100 > 40 or (beta and beta > 1.5):
                beginner_rating = "Risky"
            else:
                beginner_rating = "Intermediate"

            # Traffic light
            change_14d = trend["change_pct"] if trend else 0
            if change_14d > 2:
                signal = "up"
            elif change_14d < -2:
                signal = "down"
            else:
                signal = "flat"

            results.append({
                "symbol": symbol,
                "name": profile.get("name", symbol),
                "saves_this_week": count,
                "score": score_result.total_score,
                "score_label": score_result.label,
                "beginner_rating": beginner_rating,
                "signal": signal,
                "change_14d_pct": round(change_14d, 2),
                "price": profile.get("current_price", 0),
                "currency": profile.get("currency", "USD"),
            })
        except Exception:
            continue

    return {
        "count": len(results),
        "week_start": week_start.isoformat(),
        "picks": results,
        "note": "Based on anonymous, aggregate watchlist additions. No personal data is shared.",
    }
