"""
Market Data API Routes

Endpoints for fetching real stock prices, fundamentals, and history.
These are the first endpoints in SmartVest — everything else builds on this data.

Endpoints:
    GET  /api/quote/{symbol}        — Get current price for one stock
    POST /api/quotes                — Get prices for multiple stocks at once
    GET  /api/fundamentals/{symbol} — Get deeper financial data for one stock
    GET  /api/history/{symbol}      — Get price history (chart data)
    GET  /api/health                — Health check
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from dataclasses import asdict

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from market_data.yahoo_provider import YahooProvider

router = APIRouter(prefix="/api", tags=["Market Data"])

# Single shared provider instance
provider = YahooProvider()


# --- Request/Response Models ---

class MultiQuoteRequest(BaseModel):
    """Request body for fetching multiple quotes."""
    symbols: List[str]


# --- Endpoints ---

@router.get("/health")
def health_check():
    """Check if the API is running."""
    return {
        "status": "ok",
        "service": "SmartVest API",
        "version": "0.1.0",
        "data_source": "Yahoo Finance",
    }


@router.get("/quote/{symbol}")
def get_quote(symbol: str):
    """
    Get the current price and key stats for a single stock.
    
    Examples:
        /api/quote/AAPL          — Apple (US)
        /api/quote/NOVO-B.CO     — Novo Nordisk (Denmark)
        /api/quote/AZN.L         — AstraZeneca (UK)
        /api/quote/7203.T        — Toyota (Japan)
    """
    quote = provider.get_quote(symbol.upper())
    if not quote:
        raise HTTPException(
            status_code=404,
            detail=f"Stock '{symbol}' not found. Check the symbol and try again."
        )
    return asdict(quote)


@router.post("/quotes")
def get_multiple_quotes(request: MultiQuoteRequest):
    """
    Get current prices for multiple stocks at once.
    
    Request body:
        {"symbols": ["AAPL", "NOVO-B.CO", "MSFT"]}
    
    Returns a dict of symbol -> quote data (skips any that fail).
    """
    if len(request.symbols) > 20:
        raise HTTPException(
            status_code=400,
            detail="Maximum 20 symbols per request. Split into multiple calls."
        )
    
    quotes = provider.get_quotes(request.symbols)
    return {
        "count": len(quotes),
        "quotes": {symbol: asdict(quote) for symbol, quote in quotes.items()},
    }


@router.get("/fundamentals/{symbol}")
def get_fundamentals(symbol: str):
    """
    Get detailed fundamental data for a stock (P/E, margins, growth, dividends, etc.)
    Used by the scoring engine to evaluate stock quality.
    
    Examples:
        /api/fundamentals/NOVO-B.CO  — Novo Nordisk financials
        /api/fundamentals/JNJ        — Johnson & Johnson financials
    """
    fundamentals = provider.get_fundamentals(symbol.upper())
    if not fundamentals:
        raise HTTPException(
            status_code=404,
            detail=f"Fundamentals for '{symbol}' not found."
        )
    return asdict(fundamentals)


@router.get("/history/{symbol}")
def get_price_history(symbol: str, period: str = "6mo"):
    """
    Get historical price data for charts.
    
    Query params:
        period: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, max (default: 6mo)
    
    Examples:
        /api/history/AAPL?period=1y     — Apple, last year
        /api/history/NOVO-B.CO?period=6mo — Novo Nordisk, last 6 months
    """
    valid_periods = ["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "max"]
    if period not in valid_periods:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid period '{period}'. Must be one of: {', '.join(valid_periods)}"
        )
    
    history = provider.get_price_history(symbol.upper(), period=period)
    if not history:
        raise HTTPException(
            status_code=404,
            detail=f"Price history for '{symbol}' not found."
        )
    return history
