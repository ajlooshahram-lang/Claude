"""
Global Opportunity Scanner Engine

Scans across multiple markets to find the BEST risk-adjusted opportunities
for small investors worldwide. Combines:
  1. Smart Screener scoring (risk-first)
  2. Currency risk adjustment
  3. Accessibility weighting
  4. Cross-market relative value
  5. Geopolitical diversification bonus

The goal: find stocks anywhere in the world that give the HIGHEST probability
of growing capital with the LOWEST probability of losing it.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional, Dict
import math

from .market_universe import MarketInfo, MARKET_INDEX, get_markets_for_budget


@dataclass
class GlobalStock:
    """A stock from any global market with standardized metrics."""
    symbol: str
    name: str
    exchange: str
    region: str
    country: str
    currency: str
    sector: str
    # Price (all converted to USD for comparison)
    price_local: float
    price_usd: float
    market_cap_usd: float           # in millions
    avg_daily_volume: float
    # Fundamentals (standardized)
    pe_ratio: Optional[float] = None
    pb_ratio: Optional[float] = None
    ev_ebitda: Optional[float] = None
    fcf_yield: Optional[float] = None
    dividend_yield: Optional[float] = None
    payout_ratio: Optional[float] = None
    roe: Optional[float] = None
    roic: Optional[float] = None
    debt_equity: Optional[float] = None
    current_ratio: Optional[float] = None
    gross_margin: Optional[float] = None
    net_margin: Optional[float] = None
    # Risk
    beta: Optional[float] = None
    annualized_volatility: Optional[float] = None
    max_drawdown_1y: Optional[float] = None
    sharpe_ratio: Optional[float] = None
    # Growth
    revenue_growth_yoy: Optional[float] = None
    eps_growth_yoy: Optional[float] = None
    # Quality
    years_profitable: int = 0
    dividend_years: int = 0
    index_member: bool = False       # Part of a major index



@dataclass
class ScanResult:
    """Result of scanning a stock through the global opportunity lens."""
    stock: GlobalStock
    # Scores
    opportunity_score: float         # 0-100, final risk-adjusted global score
    safety_score: float              # 0-100, capital preservation
    value_score: float               # 0-100, undervaluation
    quality_score: float             # 0-100, business quality
    accessibility_score: float       # 0-100, how easy to buy
    # Adjustments
    currency_risk_penalty: float     # Points deducted for FX risk
    geo_diversification_bonus: float # Points added for non-correlated market
    # Verdict
    verdict: str
    risk_level: str
    reasons: List[str]
    warnings: List[str]
    # Position guidance
    max_allocation_pct: float        # Max % of portfolio for this stock
    suggested_entry: str             # Timing suggestion


def _clamp(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, x))


def _sigmoid(x: float, mid: float, steep: float = 1.0) -> float:
    z = steep * (x - mid)
    return _clamp(100.0 / (1.0 + math.exp(-z)))


def _inv_sigmoid(x: float, mid: float, steep: float = 1.0) -> float:
    return 100.0 - _sigmoid(x, mid, steep)


def score_safety(stock: GlobalStock) -> float:
    """Score how safe the stock is for capital preservation."""
    scores = []
    
    if stock.annualized_volatility is not None:
        vol = stock.annualized_volatility * 100 if stock.annualized_volatility < 1 else stock.annualized_volatility
        scores.append(_inv_sigmoid(vol, 25.0, 0.12) * 2.0)  # Weight 2x
    
    if stock.beta is not None:
        # Ideal: 0.5-0.9
        if 0.5 <= stock.beta <= 0.9:
            scores.append(88.0)
        elif stock.beta < 0.5:
            scores.append(65.0)
        else:
            scores.append(_clamp(90.0 - (stock.beta - 0.9) * 40.0))
    
    if stock.debt_equity is not None:
        scores.append(_inv_sigmoid(stock.debt_equity, 1.0, 1.5))
    
    if stock.max_drawdown_1y is not None:
        dd = abs(stock.max_drawdown_1y) * 100 if abs(stock.max_drawdown_1y) < 1 else abs(stock.max_drawdown_1y)
        scores.append(_inv_sigmoid(dd, 20.0, 0.1))
    
    if stock.current_ratio is not None:
        if 1.5 <= stock.current_ratio <= 3.0:
            scores.append(85.0)
        elif stock.current_ratio > 0.8:
            scores.append(50.0 + stock.current_ratio * 15.0)
        else:
            scores.append(20.0)
    
    if stock.index_member:
        scores.append(80.0)  # Index membership = quality filter
    
    if stock.years_profitable >= 10:
        scores.append(90.0)
    elif stock.years_profitable >= 5:
        scores.append(70.0)
    elif stock.years_profitable > 0:
        scores.append(50.0)
    
    return round(sum(scores) / len(scores), 1) if scores else 50.0



def score_value(stock: GlobalStock) -> float:
    """Score how undervalued the stock is (margin of safety)."""
    scores = []
    
    if stock.pe_ratio is not None and stock.pe_ratio > 0:
        scores.append(_inv_sigmoid(stock.pe_ratio, 18.0, 0.12))
    
    if stock.pb_ratio is not None and stock.pb_ratio > 0:
        scores.append(_inv_sigmoid(stock.pb_ratio, 2.5, 0.5))
    
    if stock.ev_ebitda is not None and stock.ev_ebitda > 0:
        scores.append(_inv_sigmoid(stock.ev_ebitda, 12.0, 0.15))
    
    if stock.fcf_yield is not None:
        fy = stock.fcf_yield * 100 if stock.fcf_yield < 1 else stock.fcf_yield
        scores.append(_sigmoid(fy, 5.0, 0.4))
    
    if stock.dividend_yield is not None and stock.dividend_yield > 0:
        dy = stock.dividend_yield * 100 if stock.dividend_yield < 1 else stock.dividend_yield
        # Sweet spot 2-5%
        if 2.0 <= dy <= 5.0:
            scores.append(80.0)
        elif dy > 5.0:
            scores.append(65.0)  # Might be yield trap
        else:
            scores.append(40.0 + dy * 15.0)
    
    return round(sum(scores) / len(scores), 1) if scores else 50.0


def score_quality(stock: GlobalStock) -> float:
    """Score business quality and durability."""
    scores = []
    
    if stock.roic is not None:
        roic = stock.roic * 100 if stock.roic < 1 else stock.roic
        scores.append(_sigmoid(roic, 12.0, 0.2) * 1.5)
    
    if stock.roe is not None:
        roe = stock.roe * 100 if stock.roe < 1 else stock.roe
        scores.append(_sigmoid(roe, 15.0, 0.15))
    
    if stock.gross_margin is not None:
        gm = stock.gross_margin * 100 if stock.gross_margin < 1 else stock.gross_margin
        scores.append(_sigmoid(gm, 40.0, 0.08))
    
    if stock.net_margin is not None:
        nm = stock.net_margin * 100 if stock.net_margin < 1 else stock.net_margin
        scores.append(_sigmoid(nm, 10.0, 0.12))
    
    if stock.revenue_growth_yoy is not None:
        rg = stock.revenue_growth_yoy * 100 if abs(stock.revenue_growth_yoy) < 2 else stock.revenue_growth_yoy
        scores.append(_sigmoid(rg, 8.0, 0.15))
    
    if stock.dividend_years >= 25:
        scores.append(95.0)  # Dividend Aristocrat
    elif stock.dividend_years >= 10:
        scores.append(75.0)
    elif stock.dividend_years >= 5:
        scores.append(60.0)
    
    return round(sum(scores) / len(scores), 1) if scores else 50.0


def score_accessibility(stock: GlobalStock, budget_usd: float) -> float:
    """Score how accessible the stock is for a small investor."""
    market = MARKET_INDEX.get(stock.exchange)
    scores = []
    
    # Price accessibility
    if stock.price_usd <= 50:
        scores.append(95.0)
    elif stock.price_usd <= 150:
        scores.append(75.0)
    elif stock.price_usd <= 500:
        scores.append(55.0)
    else:
        scores.append(max(20.0, 55.0 - (stock.price_usd - 500) / 50.0))
    
    # Can they buy at least 1 share with 5% of budget?
    max_single_position = budget_usd * 0.05
    if stock.price_usd <= max_single_position:
        scores.append(90.0)
    else:
        scores.append(30.0)
    
    # Market accessibility
    if market:
        scores.append(market.accessibility_score)
        if market.commission_free:
            scores.append(90.0)
        if market.fractional_shares:
            scores.append(85.0)
    
    # Liquidity
    if stock.avg_daily_volume >= 1_000_000:
        scores.append(90.0)
    elif stock.avg_daily_volume >= 100_000:
        scores.append(65.0)
    else:
        scores.append(30.0)
    
    return round(sum(scores) / len(scores), 1) if scores else 50.0



def calculate_currency_penalty(stock: GlobalStock) -> float:
    """
    Currency risk penalty for non-USD investors (or USD investors buying foreign).
    FX volatility can add 5-20% annual volatility to returns.
    """
    market = MARKET_INDEX.get(stock.exchange)
    if not market:
        return 5.0  # Unknown market = small penalty
    
    # Scale penalty: 0 for USD, up to 15 points for high-risk currencies
    return market.currency_risk * 0.6  # Max ~15 point penalty


def calculate_geo_bonus(stock: GlobalStock, existing_regions: List[str]) -> float:
    """
    Geographic diversification bonus.
    Investing in non-correlated markets reduces portfolio risk.
    """
    if stock.region not in existing_regions:
        # New region = diversification benefit
        return 5.0
    elif stock.country not in [stock.country for _ in existing_regions]:
        return 2.0
    return 0.0


def scan_stock(
    stock: GlobalStock,
    budget_usd: float = 1000.0,
    existing_regions: Optional[List[str]] = None,
) -> ScanResult:
    """
    Master scanning function: evaluates a global stock through the complete lens.
    
    Produces a single opportunity_score that answers:
    "Is this stock a smart place for a small investor to put money?"
    """
    existing_regions = existing_regions or []
    
    # Core scores
    safety = score_safety(stock)
    value = score_value(stock)
    quality = score_quality(stock)
    accessibility = score_accessibility(stock, budget_usd)
    
    # Adjustments
    currency_penalty = calculate_currency_penalty(stock)
    geo_bonus = calculate_geo_bonus(stock, existing_regions)
    
    # Composite: safety-first weighting
    # Safety 35%, Value 25%, Quality 20%, Accessibility 10%, Momentum 10%
    raw_score = (
        safety * 0.35 +
        value * 0.25 +
        quality * 0.20 +
        accessibility * 0.10 +
        50.0 * 0.10  # Momentum placeholder
    )
    
    # Apply adjustments
    opportunity_score = _clamp(raw_score - currency_penalty + geo_bonus)
    
    # Risk level
    if safety >= 75:
        risk_level = "low"
    elif safety >= 55:
        risk_level = "moderate"
    elif safety >= 35:
        risk_level = "high"
    else:
        risk_level = "very_high"
    
    # Verdict
    if opportunity_score >= 75 and risk_level in ("low",):
        verdict = "Strong Opportunity"
    elif opportunity_score >= 60 and risk_level in ("low", "moderate"):
        verdict = "Good Opportunity"
    elif opportunity_score >= 45:
        verdict = "Fair — Monitor"
    else:
        verdict = "Pass — Better Options Available"
    
    # Build reasons
    reasons = []
    if safety >= 70: reasons.append(f"Strong safety profile ({safety:.0f}/100)")
    if value >= 65: reasons.append(f"Attractively valued ({value:.0f}/100)")
    if quality >= 70: reasons.append(f"High-quality business ({quality:.0f}/100)")
    if stock.dividend_years >= 10: reasons.append(f"Reliable dividend ({stock.dividend_years}yr track record)")
    if stock.index_member: reasons.append(f"Major index constituent ({stock.exchange})")
    if geo_bonus > 0: reasons.append("Adds geographic diversification")
    
    warnings = []
    if safety < 50: warnings.append(f"Safety concerns ({safety:.0f}/100)")
    if currency_penalty > 8: warnings.append(f"Significant currency risk ({currency_penalty:.0f}pt penalty)")
    if accessibility < 50: warnings.append("Limited accessibility for small investors")
    if stock.debt_equity and stock.debt_equity > 1.5: warnings.append(f"Elevated debt (D/E={stock.debt_equity:.1f})")
    if stock.annualized_volatility and stock.annualized_volatility > 0.35:
        warnings.append("High volatility — expect large price swings")


    # Position sizing: lower risk = larger allowed position
    position_limits = {"low": 6.0, "moderate": 4.0, "high": 2.0, "very_high": 1.0}
    max_alloc = position_limits.get(risk_level, 3.0)
    # Reduce for foreign stocks (FX adds risk)
    if stock.currency != "USD":
        max_alloc *= 0.8
    
    # Entry timing
    if stock.annualized_volatility and stock.annualized_volatility > 0.30:
        suggested_entry = "DCA over 4-6 weeks due to high volatility"
    elif value >= 70:
        suggested_entry = "Current price offers good margin of safety — can buy now"
    else:
        suggested_entry = "Consider DCA over 2-4 weeks"
    
    return ScanResult(
        stock=stock,
        opportunity_score=round(opportunity_score, 1),
        safety_score=round(safety, 1),
        value_score=round(value, 1),
        quality_score=round(quality, 1),
        accessibility_score=round(accessibility, 1),
        currency_risk_penalty=round(currency_penalty, 1),
        geo_diversification_bonus=round(geo_bonus, 1),
        verdict=verdict,
        risk_level=risk_level,
        reasons=reasons[:5],
        warnings=warnings[:4],
        max_allocation_pct=round(max_alloc, 1),
        suggested_entry=suggested_entry,
    )


def scan_universe(
    stocks: List[GlobalStock],
    budget_usd: float = 1000.0,
    max_results: int = 20,
    max_risk: str = "moderate",
    min_score: float = 40.0,
    target_regions: Optional[List[str]] = None,
) -> Dict:
    """
    Scan a universe of global stocks and return ranked opportunities.
    
    Filters by risk tolerance and returns diversified recommendations
    across regions and sectors.
    """
    risk_order = ["low", "moderate", "high", "very_high"]
    max_risk_idx = risk_order.index(max_risk) if max_risk in risk_order else 1
    
    results: List[ScanResult] = []
    regions_seen: List[str] = []
    
    for stock in stocks:
        if target_regions and stock.region not in target_regions:
            continue
        
        result = scan_stock(stock, budget_usd, regions_seen)
        
        # Filter by risk
        result_risk_idx = risk_order.index(result.risk_level) if result.risk_level in risk_order else 3
        if result_risk_idx > max_risk_idx:
            continue
        
        # Filter by score
        if result.opportunity_score < min_score:
            continue
        
        results.append(result)
        if result.stock.region not in regions_seen:
            regions_seen.append(result.stock.region)
    
    # Sort by opportunity score
    results.sort(key=lambda r: r.opportunity_score, reverse=True)
    top_results = results[:max_results]
    
    # Summary stats
    regions = list(set(r.stock.region for r in top_results))
    sectors = list(set(r.stock.sector for r in top_results))
    avg_score = sum(r.opportunity_score for r in top_results) / len(top_results) if top_results else 0
    avg_safety = sum(r.safety_score for r in top_results) / len(top_results) if top_results else 0
    
    return {
        "opportunities": [_result_to_dict(r) for r in top_results],
        "scan_summary": {
            "total_scanned": len(stocks),
            "passed_filters": len(results),
            "returned": len(top_results),
            "avg_opportunity_score": round(avg_score, 1),
            "avg_safety_score": round(avg_safety, 1),
            "regions_covered": regions,
            "sectors_covered": sectors,
            "budget_usd": budget_usd,
            "risk_filter": max_risk,
        },
        "diversification": {
            "region_breakdown": {r: sum(1 for x in top_results if x.stock.region == r) for r in regions},
            "sector_breakdown": {s: sum(1 for x in top_results if x.stock.sector == s) for s in sectors},
            "geographic_diversification": len(regions) >= 2,
            "sector_diversification": len(sectors) >= 4,
        },
    }


def _result_to_dict(r: ScanResult) -> dict:
    return {
        "symbol": r.stock.symbol,
        "name": r.stock.name,
        "exchange": r.stock.exchange,
        "region": r.stock.region,
        "country": r.stock.country,
        "sector": r.stock.sector,
        "price_usd": r.stock.price_usd,
        "currency": r.stock.currency,
        "opportunity_score": r.opportunity_score,
        "safety_score": r.safety_score,
        "value_score": r.value_score,
        "quality_score": r.quality_score,
        "accessibility_score": r.accessibility_score,
        "currency_risk_penalty": r.currency_risk_penalty,
        "geo_diversification_bonus": r.geo_diversification_bonus,
        "verdict": r.verdict,
        "risk_level": r.risk_level,
        "reasons": r.reasons,
        "warnings": r.warnings,
        "max_allocation_pct": r.max_allocation_pct,
        "suggested_entry": r.suggested_entry,
    }
