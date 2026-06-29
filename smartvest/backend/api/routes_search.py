"""
Stock Search API Routes

Endpoints:
    GET /api/search?q=...          — Search for stocks by name or ticker
    GET /api/profile/{symbol}      — Get company profile with description + live price
"""
from fastapi import APIRouter, HTTPException, Query

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from market_data.yahoo_provider import YahooProvider
from core.scorer import compute_score

router = APIRouter(prefix="/api", tags=["Search"])

provider = YahooProvider()


@router.get("/search")
def search_stocks(q: str = Query(..., min_length=1, description="Search query")):
    """
    Search for stocks by company name or ticker symbol.

    Examples:
        /api/search?q=apple
        /api/search?q=novo nordisk
        /api/search?q=MSFT
        /api/search?q=toyota
    """
    results = provider.search(q)
    return {
        "query": q,
        "count": len(results),
        "results": results,
    }


@router.get("/profile/{symbol}")
def get_profile(symbol: str):
    """
    Get full company profile: what it does, live price, key stats.

    Examples:
        /api/profile/AAPL
        /api/profile/NOVO-B.CO
    """
    profile = provider.get_company_profile(symbol.upper())
    if not profile:
        raise HTTPException(
            status_code=404,
            detail=f"Company '{symbol}' not found."
        )
    return profile


@router.get("/trend/{symbol}")
def get_trend(symbol: str):
    """
    Get 14-day price trend for traffic light signal.
    Returns: direction (up/down/flat), change_pct, start/end prices.

    Examples:
        /api/trend/AAPL
        /api/trend/NOVO-B.CO
    """
    trend = provider.get_trend_14d(symbol.upper())
    if not trend:
        raise HTTPException(
            status_code=404,
            detail=f"Trend data for '{symbol}' not available."
        )
    return trend


@router.get("/news/{symbol}")
def get_news(symbol: str):
    """
    Get the 3 most recent news headlines for a stock.

    Examples:
        /api/news/AAPL
        /api/news/NOVO-B.CO
    """
    news = provider.get_news(symbol.upper(), max_items=3)
    return {
        "symbol": symbol.upper(),
        "count": len(news),
        "articles": news,
    }


@router.get("/chart/{symbol}")
def get_chart(symbol: str, period: str = "1mo"):
    """
    Get daily price data points for charting.
    period: 1mo (30 days), 3mo (90 days), 1y (1 year)

    Examples:
        /api/chart/AAPL?period=1mo
        /api/chart/NOVO-B.CO?period=3mo
    """
    valid = ["1mo", "3mo", "1y"]
    if period not in valid:
        raise HTTPException(status_code=400, detail=f"Period must be one of: {', '.join(valid)}")

    data = provider.get_chart_data(symbol.upper(), period=period)
    if not data:
        raise HTTPException(status_code=404, detail=f"Chart data for '{symbol}' not available.")
    return data


@router.get("/score/{symbol}")
def get_score(symbol: str):
    """
    Get the SmartVest score (1-10) for a stock.
    Combines safety, value, and momentum from real data.

    Examples:
        /api/score/AAPL
        /api/score/NOVO-B.CO
    """
    sym = symbol.upper()

    # Fetch the data needed for scoring
    profile = provider.get_company_profile(sym)
    trend = provider.get_trend_14d(sym)

    if not profile:
        raise HTTPException(status_code=404, detail=f"Stock '{symbol}' not found.")

    # Extract scoring inputs from real data
    beta = profile.get("beta")
    volatility = profile.get("annualized_volatility")
    market_cap = profile.get("market_cap")
    pe_ratio = profile.get("pe_ratio")
    dividend_yield = profile.get("dividend_yield")
    change_14d = trend["change_pct"] if trend else None

    # Compute the score
    result = compute_score(
        symbol=sym,
        beta=beta,
        annualized_volatility=volatility,
        market_cap=market_cap,
        pe_ratio=pe_ratio,
        dividend_yield=dividend_yield,
        change_14d_pct=change_14d,
    )

    return {
        "symbol": result.symbol,
        "total_score": result.total_score,
        "label": result.label,
        "breakdown": {
            "safety": {"score": result.safety_score, "weight": "40%", "explanation": result.safety_explanation},
            "value": {"score": result.value_score, "weight": "35%", "explanation": result.value_explanation},
            "momentum": {"score": result.momentum_score, "weight": "25%", "explanation": result.momentum_explanation},
        },
    }
