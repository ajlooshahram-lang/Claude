"""
Yahoo Finance Market Data Provider

Fetches real stock data from Yahoo Finance — prices, fundamentals, dividends.
This is the primary data source for SmartVest. Free, no API key needed,
covers all global markets including Danish stocks (OMX Copenhagen).

Usage:
    provider = YahooProvider()
    quote = provider.get_quote("NOVO-B.CO")    # Novo Nordisk
    quotes = provider.get_quotes(["AAPL", "MSFT", "NOVO-B.CO"])
"""
from __future__ import annotations

import yfinance as yf
from dataclasses import dataclass, field
from typing import Optional, List, Dict
from datetime import datetime, timedelta
import time

from market_data.cache import get as cache_get, set as cache_set


@dataclass
class StockQuote:
    """A single stock price quote with key info."""
    symbol: str
    name: str
    currency: str
    exchange: str
    # Price
    current_price: float
    previous_close: float
    day_change: float             # Absolute change today
    day_change_pct: float         # Percentage change today
    day_high: float
    day_low: float
    # Volume
    volume: int
    avg_volume: int
    # Key stats
    market_cap: Optional[float] = None          # In local currency
    pe_ratio: Optional[float] = None
    dividend_yield: Optional[float] = None      # As decimal (0.03 = 3%)
    fifty_two_week_high: Optional[float] = None
    fifty_two_week_low: Optional[float] = None
    beta: Optional[float] = None
    # Metadata
    sector: str = "Unknown"
    industry: str = "Unknown"
    country: str = "Unknown"
    timestamp: str = ""


@dataclass
class StockFundamentals:
    """Deeper fundamental data for scoring."""
    symbol: str
    name: str
    # Valuation
    pe_ratio: Optional[float] = None
    forward_pe: Optional[float] = None
    pb_ratio: Optional[float] = None
    ps_ratio: Optional[float] = None
    peg_ratio: Optional[float] = None
    ev_ebitda: Optional[float] = None
    # Profitability
    profit_margin: Optional[float] = None
    operating_margin: Optional[float] = None
    gross_margin: Optional[float] = None
    roe: Optional[float] = None
    roa: Optional[float] = None
    # Growth
    revenue_growth: Optional[float] = None
    earnings_growth: Optional[float] = None
    # Financial Health
    debt_to_equity: Optional[float] = None
    current_ratio: Optional[float] = None
    # Dividends
    dividend_yield: Optional[float] = None
    dividend_rate: Optional[float] = None
    payout_ratio: Optional[float] = None
    ex_dividend_date: Optional[str] = None
    # Risk
    beta: Optional[float] = None
    # Size
    market_cap: Optional[float] = None
    enterprise_value: Optional[float] = None


class YahooProvider:
    """
    Fetches stock data from Yahoo Finance.
    
    Covers all markets SmartVest needs:
      - US: AAPL, MSFT, JNJ, KO (no suffix)
      - Denmark: NOVO-B.CO, MAERSK-B.CO, VWS.CO (suffix .CO)
      - UK: AZN.L, SHEL.L (suffix .L)
      - Germany: SAP.DE, SIE.DE (suffix .DE)
      - Switzerland: NESN.SW (suffix .SW)
      - Japan: 7203.T (suffix .T)
      - Hong Kong: 9988.HK (suffix .HK)
    """

    def get_quote(self, symbol: str) -> Optional[StockQuote]:
        """
        Fetch current quote for a single stock.
        Returns None if the stock can't be found.
        """
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info

            if not info or info.get("regularMarketPrice") is None:
                # Try fast_info as fallback
                fi = ticker.fast_info
                if not hasattr(fi, "last_price") or fi.last_price is None:
                    return None

                return StockQuote(
                    symbol=symbol,
                    name=info.get("shortName", symbol),
                    currency=info.get("currency", "USD"),
                    exchange=info.get("exchange", "Unknown"),
                    current_price=fi.last_price,
                    previous_close=fi.previous_close or 0.0,
                    day_change=round(fi.last_price - (fi.previous_close or fi.last_price), 2),
                    day_change_pct=round(((fi.last_price - (fi.previous_close or fi.last_price)) / (fi.previous_close or 1)) * 100, 2),
                    day_high=fi.day_high or fi.last_price,
                    day_low=fi.day_low or fi.last_price,
                    volume=int(fi.last_volume or 0),
                    avg_volume=0,
                    market_cap=fi.market_cap,
                    timestamp=datetime.now().isoformat(),
                )

            current_price = info.get("regularMarketPrice") or info.get("currentPrice") or 0.0
            prev_close = info.get("regularMarketPreviousClose") or info.get("previousClose") or current_price
            change = round(current_price - prev_close, 2)
            change_pct = round((change / prev_close * 100) if prev_close else 0.0, 2)

            return StockQuote(
                symbol=symbol,
                name=info.get("shortName") or info.get("longName") or symbol,
                currency=info.get("currency", "USD"),
                exchange=info.get("exchange", "Unknown"),
                current_price=current_price,
                previous_close=prev_close,
                day_change=change,
                day_change_pct=change_pct,
                day_high=info.get("dayHigh") or current_price,
                day_low=info.get("dayLow") or current_price,
                volume=int(info.get("volume") or 0),
                avg_volume=int(info.get("averageVolume") or 0),
                market_cap=info.get("marketCap"),
                pe_ratio=info.get("trailingPE"),
                dividend_yield=info.get("dividendYield"),
                fifty_two_week_high=info.get("fiftyTwoWeekHigh"),
                fifty_two_week_low=info.get("fiftyTwoWeekLow"),
                beta=info.get("beta"),
                sector=info.get("sector", "Unknown"),
                industry=info.get("industry", "Unknown"),
                country=info.get("country", "Unknown"),
                timestamp=datetime.now().isoformat(),
            )
        except Exception as e:
            print(f"  [ERROR] Failed to fetch {symbol}: {e}")
            return None

    def get_quotes(self, symbols: List[str]) -> Dict[str, StockQuote]:
        """
        Fetch quotes for multiple stocks.
        Returns a dict of symbol -> StockQuote (skips failures).
        """
        results = {}
        for symbol in symbols:
            quote = self.get_quote(symbol)
            if quote:
                results[symbol] = quote
            # Small delay to be polite to Yahoo's servers
            time.sleep(0.2)
        return results

    def get_fundamentals(self, symbol: str) -> Optional[StockFundamentals]:
        """
        Fetch deeper fundamental data for scoring/analysis.
        """
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info

            if not info:
                return None

            return StockFundamentals(
                symbol=symbol,
                name=info.get("shortName") or info.get("longName") or symbol,
                pe_ratio=info.get("trailingPE"),
                forward_pe=info.get("forwardPE"),
                pb_ratio=info.get("priceToBook"),
                ps_ratio=info.get("priceToSalesTrailing12Months"),
                peg_ratio=info.get("pegRatio"),
                ev_ebitda=info.get("enterpriseToEbitda"),
                profit_margin=info.get("profitMargins"),
                operating_margin=info.get("operatingMargins"),
                gross_margin=info.get("grossMargins"),
                roe=info.get("returnOnEquity"),
                roa=info.get("returnOnAssets"),
                revenue_growth=info.get("revenueGrowth"),
                earnings_growth=info.get("earningsGrowth"),
                debt_to_equity=info.get("debtToEquity"),
                current_ratio=info.get("currentRatio"),
                dividend_yield=info.get("dividendYield"),
                dividend_rate=info.get("dividendRate"),
                payout_ratio=info.get("payoutRatio"),
                ex_dividend_date=str(info.get("exDividendDate", "")) if info.get("exDividendDate") else None,
                beta=info.get("beta"),
                market_cap=info.get("marketCap"),
                enterprise_value=info.get("enterpriseValue"),
            )
        except Exception as e:
            print(f"  [ERROR] Failed to fetch fundamentals for {symbol}: {e}")
            return None

    def get_price_history(self, symbol: str, period: str = "6mo") -> Optional[Dict]:
        """
        Fetch historical price data.
        period: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, max
        """
        try:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period=period)

            if hist.empty:
                return None

            return {
                "symbol": symbol,
                "period": period,
                "data_points": len(hist),
                "start_date": str(hist.index[0].date()),
                "end_date": str(hist.index[-1].date()),
                "start_price": round(float(hist["Close"].iloc[0]), 2),
                "end_price": round(float(hist["Close"].iloc[-1]), 2),
                "high": round(float(hist["High"].max()), 2),
                "low": round(float(hist["Low"].min()), 2),
                "total_return_pct": round(
                    ((float(hist["Close"].iloc[-1]) - float(hist["Close"].iloc[0])) / float(hist["Close"].iloc[0])) * 100, 2
                ),
            }
        except Exception as e:
            print(f"  [ERROR] Failed to fetch history for {symbol}: {e}")
            return None


    def search(self, query: str) -> List[Dict]:
        """
        Search for stocks by name or ticker symbol.
        Returns a list of matches with basic info.
        """
        try:
            search_result = yf.Search(query)
            quotes = search_result.quotes or []

            matches = []
            for item in quotes:
                if item.get("quoteType") not in ("EQUITY", "ETF"):
                    continue
                matches.append({
                    "symbol": item.get("symbol", ""),
                    "name": item.get("shortname") or item.get("longname") or item.get("symbol", ""),
                    "exchange": item.get("exchDisp") or item.get("exchange", ""),
                    "type": item.get("quoteType", ""),
                    "sector": item.get("sector", ""),
                    "industry": item.get("industry", ""),
                })
            return matches[:8]
        except Exception as e:
            print(f"  [ERROR] Search failed for '{query}': {e}")
            return []

    def get_company_profile(self, symbol: str) -> Optional[Dict]:
        """
        Get company profile: description, price, and key stats.
        Used by the search page to show what a company does.
        CACHED for 2 minutes to avoid redundant Yahoo calls.
        """
        cache_key = f"profile:{symbol}"
        cached = cache_get(cache_key)
        if cached is not None:
            return cached

        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info

            if not info:
                return None

            current_price = info.get("regularMarketPrice") or info.get("currentPrice") or 0.0
            prev_close = info.get("regularMarketPreviousClose") or info.get("previousClose") or current_price
            change = round(current_price - prev_close, 2)
            change_pct = round((change / prev_close * 100) if prev_close else 0.0, 2)

            # Calculate annualized volatility from 6 months of daily returns
            annualized_volatility = None
            try:
                hist = ticker.history(period="6mo")
                if not hist.empty and len(hist) > 20:
                    daily_returns = hist["Close"].pct_change().dropna()
                    annualized_volatility = round(float(daily_returns.std() * (252 ** 0.5)), 4)
            except Exception:
                pass

            result = {
                "symbol": symbol,
                "name": info.get("shortName") or info.get("longName") or symbol,
                "description": info.get("longBusinessSummary") or "No description available.",
                "currency": info.get("currency", "USD"),
                "exchange": info.get("exchange", "Unknown"),
                "current_price": current_price,
                "previous_close": prev_close,
                "day_change": change,
                "day_change_pct": change_pct,
                "market_cap": info.get("marketCap"),
                "pe_ratio": info.get("trailingPE"),
                "dividend_yield": info.get("dividendYield"),
                "beta": info.get("beta"),
                "annualized_volatility": annualized_volatility,
                "sector": info.get("sector", "Unknown"),
                "industry": info.get("industry", "Unknown"),
                "country": info.get("country", "Unknown"),
                "employees": info.get("fullTimeEmployees"),
                "website": info.get("website"),
                "fifty_two_week_high": info.get("fiftyTwoWeekHigh"),
                "fifty_two_week_low": info.get("fiftyTwoWeekLow"),
            }
            cache_set(cache_key, result, ttl=120)
            return result
        except Exception as e:
            print(f"  [ERROR] Failed to get profile for {symbol}: {e}")
            return None


    def get_trend_14d(self, symbol: str) -> Optional[Dict]:
        """
        Get the 14-day price trend for traffic light signals.
        Returns: direction ('up', 'down', 'flat'), change_pct, start/end prices.
        CACHED for 5 minutes (trend doesn't change every second).
        """
        cache_key = f"trend:{symbol}"
        cached = cache_get(cache_key)
        if cached is not None:
            return cached

        try:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period="1mo")

            if hist.empty or len(hist) < 5:
                return None

            # Use last 14 trading days (or whatever is available up to 14)
            recent = hist.tail(min(14, len(hist)))
            start_price = float(recent["Close"].iloc[0])
            end_price = float(recent["Close"].iloc[-1])
            change_pct = ((end_price - start_price) / start_price) * 100

            # Classify: > +2% = up, < -2% = down, else flat
            if change_pct > 2.0:
                direction = "up"
            elif change_pct < -2.0:
                direction = "down"
            else:
                direction = "flat"

            result = {
                "symbol": symbol,
                "direction": direction,
                "change_pct": round(change_pct, 2),
                "start_price": round(start_price, 2),
                "end_price": round(end_price, 2),
                "days": len(recent),
            }
            cache_set(cache_key, result, ttl=300)
            return result
        except Exception as e:
            print(f"  [ERROR] Failed to get 14d trend for {symbol}: {e}")
            return None


    def get_news(self, symbol: str, max_items: int = 3) -> List[Dict]:
        """
        Get recent news headlines for a stock.
        Returns title, source, date, and URL.
        """
        try:
            ticker = yf.Ticker(symbol)
            news = ticker.news

            if not news:
                return []

            results = []
            for item in news[:max_items]:
                content = item.get("content", {})
                if not content:
                    continue

                provider = content.get("provider", {})
                canonical = content.get("canonicalUrl", {}) or content.get("clickThroughUrl", {})

                results.append({
                    "title": content.get("title", ""),
                    "source": provider.get("displayName", "Unknown"),
                    "date": content.get("pubDate", ""),
                    "url": canonical.get("url", ""),
                    "summary": content.get("summary", ""),
                })

            return results
        except Exception as e:
            print(f"  [ERROR] Failed to get news for {symbol}: {e}")
            return []


    def get_chart_data(self, symbol: str, period: str = "1mo") -> Optional[Dict]:
        """
        Get daily closing prices for charting.
        Returns a list of {date, price} points.
        period: 1mo, 3mo, 1y
        """
        try:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period=period)

            if hist is None or hist.empty:
                return None

            points = []
            for idx, row in hist.iterrows():
                points.append({
                    "date": str(idx.date()),
                    "price": round(float(row["Close"]), 2),
                })

            return {
                "symbol": symbol,
                "period": period,
                "points": points,
                "count": len(points),
            }
        except Exception as e:
            print(f"  [ERROR] Failed to get chart data for {symbol}: {e}")
            return None
