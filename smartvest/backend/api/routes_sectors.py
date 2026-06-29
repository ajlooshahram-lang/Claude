"""
Sector Overview API Routes

Provides weekly sector performance and top stocks per sector.
Uses sector ETFs as proxies for sector-level performance,
and representative stocks for the "top 5" within each sector.

Endpoints:
    GET /api/sectors              — All sectors with weekly performance
    GET /api/sectors/{sector}     — Top 5 stocks in a sector by weekly performance
"""
from fastapi import APIRouter, HTTPException

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from market_data.yahoo_provider import YahooProvider

router = APIRouter(prefix="/api", tags=["Sectors"])

provider = YahooProvider()

# Sector ETFs (US sector SPDRs) — used to get sector-level weekly performance
SECTOR_ETFS = {
    "Technology": "XLK",
    "Healthcare": "XLV",
    "Energy": "XLE",
    "Finance": "XLF",
    "Consumer Goods": "XLP",
    "Industrials": "XLI",
}

# Representative stocks per sector (globally diversified, well-known names)
SECTOR_STOCKS = {
    "Technology": ["AAPL", "MSFT", "NVDA", "GOOG", "META", "TSM", "ASML"],
    "Healthcare": ["JNJ", "UNH", "PFE", "NOVO-B.CO", "AZN.L", "LLY", "MRK"],
    "Energy": ["XOM", "CVX", "SHEL.L", "TTE", "COP", "ENB", "SLB"],
    "Finance": ["JPM", "BAC", "V", "MA", "GS", "BRK-B", "HSBA.L"],
    "Consumer Goods": ["PG", "KO", "PEP", "NESN.SW", "WMT", "COST", "UL.L"],
    "Industrials": ["CAT", "HON", "UPS", "BA", "GE", "7203.T", "SIE.DE"],
}


@router.get("/sectors")
def get_all_sectors():
    """
    Get weekly performance for all 6 main sectors.
    Uses sector ETFs (XLK, XLV, etc.) to calculate the weekly change.
    """
    results = []

    for sector, etf_symbol in SECTOR_ETFS.items():
        try:
            trend = provider.get_trend_14d(etf_symbol)
            # We want 5-day (1 week) but 14-day trend is what we have.
            # Fetch 5-day specifically for accuracy:
            import yfinance as yf
            ticker = yf.Ticker(etf_symbol)
            hist = ticker.history(period="5d")

            if hist is not None and not hist.empty and len(hist) >= 2:
                start = float(hist["Close"].iloc[0])
                end = float(hist["Close"].iloc[-1])
                change_pct = round(((end - start) / start) * 100, 2)
            elif trend:
                # Fallback to 14-day trend, roughly halved
                change_pct = round(trend["change_pct"] * 0.5, 2)
            else:
                change_pct = 0.0

            results.append({
                "sector": sector,
                "etf": etf_symbol,
                "weekly_change_pct": change_pct,
                "direction": "up" if change_pct > 0.2 else ("down" if change_pct < -0.2 else "flat"),
            })
        except Exception as e:
            results.append({
                "sector": sector,
                "etf": etf_symbol,
                "weekly_change_pct": 0.0,
                "direction": "flat",
            })

    return {
        "count": len(results),
        "sectors": results,
    }


@router.get("/sectors/{sector}")
def get_sector_stocks(sector: str):
    """
    Get top 5 stocks in a sector ranked by weekly performance.
    """
    # Normalize sector name
    sector_key = None
    for key in SECTOR_STOCKS:
        if key.lower() == sector.lower():
            sector_key = key
            break

    if not sector_key:
        raise HTTPException(status_code=404, detail=f"Sector '{sector}' not found. Available: {list(SECTOR_STOCKS.keys())}")

    symbols = SECTOR_STOCKS[sector_key]
    stock_results = []

    import yfinance as yf

    for symbol in symbols:
        try:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period="5d")
            info = ticker.info

            if hist is None or hist.empty or len(hist) < 2:
                continue

            start = float(hist["Close"].iloc[0])
            end = float(hist["Close"].iloc[-1])
            change_pct = round(((end - start) / start) * 100, 2)

            stock_results.append({
                "symbol": symbol,
                "name": info.get("shortName") or info.get("longName") or symbol,
                "price": round(end, 2),
                "currency": info.get("currency", "USD"),
                "weekly_change_pct": change_pct,
                "direction": "up" if change_pct > 0 else "down",
            })
        except Exception:
            continue

    # Sort by weekly change (best performers first)
    stock_results.sort(key=lambda x: x["weekly_change_pct"], reverse=True)

    return {
        "sector": sector_key,
        "count": len(stock_results[:5]),
        "stocks": stock_results[:5],
    }
