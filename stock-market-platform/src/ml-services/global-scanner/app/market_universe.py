"""
Global Market Universe — Defines the investable universe across regions.

Covers major exchanges worldwide with metadata for each market:
- Trading hours, currency, regulatory quality
- Accessibility for retail investors
- Tax treaty considerations
- Liquidity profiles

The scanner uses this to prioritize markets that are actually accessible
and safe for small retail investors (not just theoretically investable).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional


@dataclass
class MarketInfo:
    """Metadata about a stock market/exchange."""
    code: str                    # Exchange code (NYSE, LSE, TSE, etc.)
    name: str
    region: str                  # US, EU, ASIA, OTHER
    country: str
    currency: str
    timezone: str
    # Accessibility for small investors
    fractional_shares: bool      # Can buy partial shares?
    min_investment_usd: float    # Minimum practical investment
    commission_free: bool        # Zero-commission available?
    accessibility_score: float   # 0-100, how easy for retail
    # Market quality
    liquidity_tier: str          # 'high', 'medium', 'low'
    regulatory_quality: float    # 0-100 (investor protection)
    currency_risk: float         # 0-100 (0=no risk for USD investor)
    # Index membership (quality filter)
    major_index: str             # S&P 500, FTSE 100, Nikkei 225, etc.
    index_constituents: int      # How many stocks in the index


# The global market universe accessible to retail investors
GLOBAL_MARKETS: List[MarketInfo] = [
    # --- UNITED STATES ---
    MarketInfo(
        code="NYSE", name="New York Stock Exchange", region="US",
        country="United States", currency="USD", timezone="America/New_York",
        fractional_shares=True, min_investment_usd=1.0, commission_free=True,
        accessibility_score=98, liquidity_tier="high", regulatory_quality=95,
        currency_risk=0, major_index="S&P 500", index_constituents=500,
    ),
    MarketInfo(
        code="NASDAQ", name="NASDAQ", region="US",
        country="United States", currency="USD", timezone="America/New_York",
        fractional_shares=True, min_investment_usd=1.0, commission_free=True,
        accessibility_score=98, liquidity_tier="high", regulatory_quality=95,
        currency_risk=0, major_index="NASDAQ-100", index_constituents=100,
    ),

    # --- EUROPE ---
    MarketInfo(
        code="LSE", name="London Stock Exchange", region="EU",
        country="United Kingdom", currency="GBP", timezone="Europe/London",
        fractional_shares=True, min_investment_usd=5.0, commission_free=True,
        accessibility_score=88, liquidity_tier="high", regulatory_quality=92,
        currency_risk=15, major_index="FTSE 100", index_constituents=100,
    ),
    MarketInfo(
        code="XETRA", name="Frankfurt (Xetra)", region="EU",
        country="Germany", currency="EUR", timezone="Europe/Berlin",
        fractional_shares=True, min_investment_usd=10.0, commission_free=False,
        accessibility_score=80, liquidity_tier="high", regulatory_quality=90,
        currency_risk=12, major_index="DAX 40", index_constituents=40,
    ),
    MarketInfo(
        code="EPA", name="Euronext Paris", region="EU",
        country="France", currency="EUR", timezone="Europe/Paris",
        fractional_shares=False, min_investment_usd=50.0, commission_free=False,
        accessibility_score=72, liquidity_tier="medium", regulatory_quality=88,
        currency_risk=12, major_index="CAC 40", index_constituents=40,
    ),
    MarketInfo(
        code="AMS", name="Euronext Amsterdam", region="EU",
        country="Netherlands", currency="EUR", timezone="Europe/Amsterdam",
        fractional_shares=True, min_investment_usd=10.0, commission_free=False,
        accessibility_score=78, liquidity_tier="medium", regulatory_quality=90,
        currency_risk=12, major_index="AEX 25", index_constituents=25,
    ),
    MarketInfo(
        code="SIX", name="SIX Swiss Exchange", region="EU",
        country="Switzerland", currency="CHF", timezone="Europe/Zurich",
        fractional_shares=False, min_investment_usd=100.0, commission_free=False,
        accessibility_score=65, liquidity_tier="medium", regulatory_quality=95,
        currency_risk=10, major_index="SMI 20", index_constituents=20,
    ),
    # --- ASIA ---
    MarketInfo(
        code="TSE", name="Tokyo Stock Exchange", region="ASIA",
        country="Japan", currency="JPY", timezone="Asia/Tokyo",
        fractional_shares=False, min_investment_usd=50.0, commission_free=False,
        accessibility_score=70, liquidity_tier="high", regulatory_quality=88,
        currency_risk=20, major_index="Nikkei 225", index_constituents=225,
    ),
    MarketInfo(
        code="HKEX", name="Hong Kong Exchange", region="ASIA",
        country="Hong Kong", currency="HKD", timezone="Asia/Hong_Kong",
        fractional_shares=False, min_investment_usd=100.0, commission_free=False,
        accessibility_score=65, liquidity_tier="high", regulatory_quality=82,
        currency_risk=8, major_index="Hang Seng", index_constituents=80,
    ),
    MarketInfo(
        code="ASX", name="Australian Securities Exchange", region="ASIA",
        country="Australia", currency="AUD", timezone="Australia/Sydney",
        fractional_shares=True, min_investment_usd=20.0, commission_free=False,
        accessibility_score=75, liquidity_tier="medium", regulatory_quality=90,
        currency_risk=18, major_index="ASX 200", index_constituents=200,
    ),
    MarketInfo(
        code="KRX", name="Korea Exchange", region="ASIA",
        country="South Korea", currency="KRW", timezone="Asia/Seoul",
        fractional_shares=False, min_investment_usd=50.0, commission_free=False,
        accessibility_score=60, liquidity_tier="medium", regulatory_quality=80,
        currency_risk=22, major_index="KOSPI", index_constituents=200,
    ),
]

MARKET_INDEX = {m.code: m for m in GLOBAL_MARKETS}


def get_markets_for_budget(budget_usd: float, max_currency_risk: float = 25.0) -> List[MarketInfo]:
    """Filter markets accessible for a given budget and currency risk tolerance."""
    return [
        m for m in GLOBAL_MARKETS
        if m.min_investment_usd <= budget_usd * 0.1  # Can buy at least 10 positions
        and m.currency_risk <= max_currency_risk
    ]


def get_region_markets(region: str) -> List[MarketInfo]:
    """Get all markets in a region."""
    return [m for m in GLOBAL_MARKETS if m.region == region]
