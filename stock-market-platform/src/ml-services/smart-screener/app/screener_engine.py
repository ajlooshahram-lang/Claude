"""
Smart Stock Screener Engine — Risk-First Scoring for Small Investors.

This engine is specifically designed for investors with limited capital who
cannot afford to lose money. It prioritizes:
  1. CAPITAL PRESERVATION — low downside risk above all else
  2. MARGIN OF SAFETY — buy only when price << intrinsic value
  3. QUALITY — financially strong companies that won't go bankrupt
  4. ACCESSIBILITY — stocks affordable for small budgets
  5. DIVERSIFICATION POTENTIAL — low-correlation opportunities

The scoring inverts the typical "maximize return" paradigm into a
"minimize probability of permanent capital loss" framework.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional, List
import math


# ---------------------------------------------------------------------------
# Core primitives
# ---------------------------------------------------------------------------

def clamp(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, x))


def sigmoid(x: float, midpoint: float, steepness: float = 1.0) -> float:
    """Smooth S-curve mapping: returns 0-100."""
    z = steepness * (x - midpoint)
    return clamp(100.0 / (1.0 + math.exp(-z)))



def inverse_sigmoid(x: float, midpoint: float, steepness: float = 1.0) -> float:
    """Inverse S-curve: LOWER input is BETTER (e.g., volatility, debt)."""
    return 100.0 - sigmoid(x, midpoint, steepness)


# ---------------------------------------------------------------------------
# Stock data model
# ---------------------------------------------------------------------------

@dataclass
class StockData:
    """All data needed to score a stock for a small investor."""
    symbol: str
    name: str
    exchange: str = "US"
    sector: str = "Unknown"
    currency: str = "USD"
    # Price & accessibility
    current_price: float = 0.0
    market_cap: float = 0.0            # in millions
    avg_daily_volume: float = 0.0
    # Valuation
    pe_ratio: Optional[float] = None
    pb_ratio: Optional[float] = None
    ps_ratio: Optional[float] = None
    peg_ratio: Optional[float] = None
    ev_ebitda: Optional[float] = None
    fcf_yield: Optional[float] = None
    intrinsic_value: Optional[float] = None  # From DCF/DDM
    # Quality / Financial Strength
    current_ratio: Optional[float] = None
    debt_equity: Optional[float] = None
    interest_coverage: Optional[float] = None
    roe: Optional[float] = None
    roic: Optional[float] = None
    gross_margin: Optional[float] = None
    operating_margin: Optional[float] = None
    net_margin: Optional[float] = None
    fcf_conversion: Optional[float] = None

    # Growth
    revenue_growth_yoy: Optional[float] = None
    eps_growth_yoy: Optional[float] = None
    revenue_growth_3y_cagr: Optional[float] = None
    # Risk
    beta: Optional[float] = None
    annualized_volatility: Optional[float] = None
    max_drawdown_1y: Optional[float] = None
    sharpe_ratio: Optional[float] = None
    sortino_ratio: Optional[float] = None
    # Income
    dividend_yield: Optional[float] = None
    payout_ratio: Optional[float] = None
    dividend_growth_5y: Optional[float] = None
    consecutive_dividend_years: int = 0
    # Momentum
    price_vs_52w_high: Optional[float] = None  # % below 52-week high
    price_vs_200dma: Optional[float] = None
    # ESG (optional)
    esg_score: Optional[float] = None


# ---------------------------------------------------------------------------
# Risk-First Scoring Categories (weights favor capital preservation)
# ---------------------------------------------------------------------------

# These weights are the SECRET SAUCE for small investors:
# Traditional funds weight growth/momentum highly.
# We weight SAFETY and VALUE much more heavily.
SMALL_INVESTOR_CATEGORY_WEIGHTS = {
    "safety_shield": 0.28,        # Can this company survive & protect my capital?
    "margin_of_safety": 0.22,     # Am I buying below fair value?
    "quality_moat": 0.18,         # Does the business have durable advantages?
    "income_stability": 0.12,     # Does it pay me while I wait?
    "growth_potential": 0.10,     # Can it compound my money?
    "accessibility": 0.06,        # Can I afford it and trade it easily?
    "momentum_timing": 0.04,      # Is the timing reasonable?
}



# ---------------------------------------------------------------------------
# Individual scoring functions
# ---------------------------------------------------------------------------

def score_safety_shield(stock: StockData) -> dict:
    """
    SAFETY SHIELD (28% weight) — the #1 priority for small investors.
    Measures: can this company survive a recession? Will it protect my capital?
    
    Factors:
      - Low volatility (smooth ride, less panic selling)
      - Low beta (less market sensitivity)
      - Strong balance sheet (won't go bankrupt)
      - Low max drawdown (historical capital protection)
      - High interest coverage (can pay its debts)
    """
    scores = {}
    weights = {}
    
    if stock.annualized_volatility is not None:
        # Ideal: <20% annual vol. Bad: >50%
        scores["low_volatility"] = inverse_sigmoid(
            stock.annualized_volatility * 100 if stock.annualized_volatility < 1 else stock.annualized_volatility,
            midpoint=25.0, steepness=0.12
        )
        weights["low_volatility"] = 2.0
    
    if stock.beta is not None:
        # Ideal beta: 0.5-0.9 (less volatile than market but not dead)
        if 0.5 <= stock.beta <= 0.9:
            scores["defensive_beta"] = 90.0 + (0.7 - abs(stock.beta - 0.7)) * 30
        elif stock.beta < 0.5:
            scores["defensive_beta"] = 60.0 + stock.beta * 60
        else:
            scores["defensive_beta"] = clamp(100.0 - (stock.beta - 0.9) * 50)
        weights["defensive_beta"] = 1.8


    if stock.debt_equity is not None:
        # Low debt = safety. D/E < 0.5 is fortress, > 2.0 is risky
        scores["low_leverage"] = inverse_sigmoid(stock.debt_equity, midpoint=1.0, steepness=1.5)
        weights["low_leverage"] = 1.5
    
    if stock.max_drawdown_1y is not None:
        # Max drawdown as positive number (e.g., 0.25 = 25% loss)
        dd = abs(stock.max_drawdown_1y)
        scores["drawdown_protection"] = inverse_sigmoid(dd * 100, midpoint=20.0, steepness=0.1)
        weights["drawdown_protection"] = 1.5
    
    if stock.interest_coverage is not None:
        # Can easily pay interest. >8x is strong.
        scores["debt_serviceability"] = sigmoid(stock.interest_coverage, midpoint=5.0, steepness=0.3)
        weights["debt_serviceability"] = 1.2
    
    if stock.current_ratio is not None:
        # Liquidity: can pay short-term bills. 1.5-3.0 is healthy.
        if 1.5 <= stock.current_ratio <= 3.0:
            scores["liquidity"] = 85.0
        elif stock.current_ratio > 3.0:
            scores["liquidity"] = 70.0  # Too much cash might mean poor capital allocation
        else:
            scores["liquidity"] = clamp(stock.current_ratio / 1.5 * 70.0)
        weights["liquidity"] = 1.0
    
    return _weighted_average(scores, weights, "safety_shield")



def score_margin_of_safety(stock: StockData) -> dict:
    """
    MARGIN OF SAFETY (22% weight) — only buy when price is BELOW fair value.
    
    Warren Buffett's #1 rule: "Never lose money."
    Rule #2: "Never forget rule #1."
    
    This measures HOW MUCH cheaper the stock is vs. intrinsic value.
    A small investor can't afford to buy overvalued stocks.
    """
    scores = {}
    weights = {}
    
    # Intrinsic value discount (the gold standard)
    if stock.intrinsic_value is not None and stock.current_price > 0:
        discount = (stock.intrinsic_value - stock.current_price) / stock.intrinsic_value
        # 30%+ discount = amazing, 0% = fair value, negative = overvalued
        if discount >= 0.30:
            scores["intrinsic_discount"] = 95.0
        elif discount >= 0.15:
            scores["intrinsic_discount"] = 70.0 + (discount - 0.15) / 0.15 * 25.0
        elif discount >= 0.0:
            scores["intrinsic_discount"] = 50.0 + discount / 0.15 * 20.0
        else:
            scores["intrinsic_discount"] = clamp(50.0 + discount * 100.0)
        weights["intrinsic_discount"] = 3.0
    
    # P/E relative to growth (PEG)
    if stock.peg_ratio is not None and stock.peg_ratio > 0:
        # PEG < 1 = growth at a discount, PEG > 2 = expensive
        scores["peg_value"] = inverse_sigmoid(stock.peg_ratio, midpoint=1.5, steepness=1.5)
        weights["peg_value"] = 1.5
    
    # FCF Yield (what cash return am I buying?)
    if stock.fcf_yield is not None:
        # FCF yield > 8% = excellent, < 2% = expensive
        scores["fcf_yield"] = sigmoid(
            stock.fcf_yield * 100 if stock.fcf_yield < 1 else stock.fcf_yield,
            midpoint=5.0, steepness=0.4
        )
        weights["fcf_yield"] = 1.5


    # EV/EBITDA (capital-structure neutral valuation)
    if stock.ev_ebitda is not None and stock.ev_ebitda > 0:
        scores["ev_ebitda_value"] = inverse_sigmoid(stock.ev_ebitda, midpoint=12.0, steepness=0.2)
        weights["ev_ebitda_value"] = 1.2
    
    # P/B for asset-heavy sectors
    if stock.pb_ratio is not None and stock.pb_ratio > 0:
        scores["book_value"] = inverse_sigmoid(stock.pb_ratio, midpoint=2.5, steepness=0.5)
        weights["book_value"] = 0.8
    
    # Distance from 52-week high (contrarian entry signal)
    if stock.price_vs_52w_high is not None:
        # 20-40% below high = potential value opportunity
        drop = abs(stock.price_vs_52w_high)
        if 15.0 <= drop <= 40.0:
            scores["pullback_opportunity"] = 60.0 + (drop - 15.0) / 25.0 * 30.0
        elif drop > 40.0:
            scores["pullback_opportunity"] = 50.0  # Could be value trap
        else:
            scores["pullback_opportunity"] = 30.0 + drop * 2.0
        weights["pullback_opportunity"] = 0.8
    
    return _weighted_average(scores, weights, "margin_of_safety")


def score_quality_moat(stock: StockData) -> dict:
    """
    QUALITY & MOAT (18% weight) — durable business advantages.
    High-quality businesses compound wealth over time and survive downturns.
    """
    scores = {}
    weights = {}
    
    if stock.roic is not None:
        # ROIC > WACC (assume ~9%) means value creation
        scores["return_on_capital"] = sigmoid(
            stock.roic * 100 if stock.roic < 1 else stock.roic,
            midpoint=12.0, steepness=0.2
        )
        weights["return_on_capital"] = 2.0


    if stock.gross_margin is not None:
        # High gross margins = pricing power = moat
        scores["pricing_power"] = sigmoid(
            stock.gross_margin * 100 if stock.gross_margin < 1 else stock.gross_margin,
            midpoint=40.0, steepness=0.08
        )
        weights["pricing_power"] = 1.5
    
    if stock.operating_margin is not None:
        scores["operating_efficiency"] = sigmoid(
            stock.operating_margin * 100 if stock.operating_margin < 1 else stock.operating_margin,
            midpoint=15.0, steepness=0.12
        )
        weights["operating_efficiency"] = 1.2
    
    if stock.roe is not None:
        scores["equity_returns"] = sigmoid(
            stock.roe * 100 if stock.roe < 1 else stock.roe,
            midpoint=15.0, steepness=0.15
        )
        weights["equity_returns"] = 1.0
    
    if stock.fcf_conversion is not None:
        # FCF/Net Income > 1.0 means earnings are real cash
        scores["cash_quality"] = sigmoid(stock.fcf_conversion * 100, midpoint=80.0, steepness=0.05)
        weights["cash_quality"] = 1.5
    
    if stock.net_margin is not None:
        scores["profitability"] = sigmoid(
            stock.net_margin * 100 if stock.net_margin < 1 else stock.net_margin,
            midpoint=10.0, steepness=0.12
        )
        weights["profitability"] = 0.8
    
    return _weighted_average(scores, weights, "quality_moat")



def score_income_stability(stock: StockData) -> dict:
    """
    INCOME STABILITY (12% weight) — pay me while I wait.
    Dividends provide downside protection and compound returns for patient investors.
    """
    scores = {}
    weights = {}
    
    if stock.dividend_yield is not None:
        # Sweet spot: 2-5%. Too high (>7%) often signals unsustainability
        dy = stock.dividend_yield * 100 if stock.dividend_yield < 1 else stock.dividend_yield
        if 2.0 <= dy <= 5.0:
            scores["yield_quality"] = 80.0 + (dy - 2.0) / 3.0 * 15.0
        elif dy > 5.0:
            scores["yield_quality"] = 80.0 - (dy - 5.0) * 5.0  # Penalize yield traps
        elif dy > 0:
            scores["yield_quality"] = 40.0 + dy * 20.0
        else:
            scores["yield_quality"] = 20.0  # No dividend isn't terrible for growth
        weights["yield_quality"] = 1.5
    
    if stock.payout_ratio is not None:
        # Sustainable: 30-60%. >80% is risky. <20% = could pay more
        pr = stock.payout_ratio * 100 if stock.payout_ratio < 1 else stock.payout_ratio
        if 30.0 <= pr <= 60.0:
            scores["payout_sustainability"] = 90.0
        elif pr < 30.0:
            scores["payout_sustainability"] = 50.0 + pr
        else:
            scores["payout_sustainability"] = clamp(90.0 - (pr - 60.0) * 2.0)
        weights["payout_sustainability"] = 1.2
    
    if stock.dividend_growth_5y is not None:
        # Growing dividends = compounding income
        dg = stock.dividend_growth_5y * 100 if stock.dividend_growth_5y < 1 else stock.dividend_growth_5y
        scores["dividend_growth"] = sigmoid(dg, midpoint=5.0, steepness=0.3)
        weights["dividend_growth"] = 1.0
    
    if stock.consecutive_dividend_years > 0:
        # Dividend aristocrat bonus: 25+ years = incredibly reliable
        years = stock.consecutive_dividend_years
        scores["track_record"] = clamp(min(years / 25.0, 1.0) * 95.0 + 5.0)
        weights["track_record"] = 1.0
    
    return _weighted_average(scores, weights, "income_stability")



def score_growth_potential(stock: StockData) -> dict:
    """
    GROWTH POTENTIAL (10% weight) — can it compound my money?
    Important but weighted LESS than safety for small investors.
    """
    scores = {}
    weights = {}
    
    if stock.revenue_growth_yoy is not None:
        rg = stock.revenue_growth_yoy * 100 if abs(stock.revenue_growth_yoy) < 2 else stock.revenue_growth_yoy
        scores["revenue_momentum"] = sigmoid(rg, midpoint=8.0, steepness=0.15)
        weights["revenue_momentum"] = 1.3
    
    if stock.eps_growth_yoy is not None:
        eg = stock.eps_growth_yoy * 100 if abs(stock.eps_growth_yoy) < 2 else stock.eps_growth_yoy
        scores["earnings_growth"] = sigmoid(eg, midpoint=10.0, steepness=0.12)
        weights["earnings_growth"] = 1.5
    
    if stock.revenue_growth_3y_cagr is not None:
        cg = stock.revenue_growth_3y_cagr * 100 if abs(stock.revenue_growth_3y_cagr) < 2 else stock.revenue_growth_3y_cagr
        scores["sustained_growth"] = sigmoid(cg, midpoint=7.0, steepness=0.15)
        weights["sustained_growth"] = 1.2
    
    return _weighted_average(scores, weights, "growth_potential")


def score_accessibility(stock: StockData) -> dict:
    """
    ACCESSIBILITY (6% weight) — can a small investor actually buy this?
    Considers price per share, liquidity, and market cap stability.
    """
    scores = {}
    weights = {}
    
    # Price per share (lower = more accessible for fractional-free brokers)
    if stock.current_price > 0:
        if stock.current_price <= 50:
            scores["affordable_price"] = 95.0
        elif stock.current_price <= 150:
            scores["affordable_price"] = 75.0
        elif stock.current_price <= 500:
            scores["affordable_price"] = 55.0
        else:
            scores["affordable_price"] = clamp(55.0 - (stock.current_price - 500) / 50.0)
        weights["affordable_price"] = 1.5


    # Market cap (mid-large cap = more stable, less manipulation)
    if stock.market_cap > 0:
        cap_b = stock.market_cap / 1000.0  # Convert to billions
        if cap_b >= 10.0:
            scores["stability_size"] = 85.0
        elif cap_b >= 2.0:
            scores["stability_size"] = 65.0 + (cap_b - 2.0) / 8.0 * 20.0
        elif cap_b >= 0.3:
            scores["stability_size"] = 40.0 + (cap_b - 0.3) / 1.7 * 25.0
        else:
            scores["stability_size"] = 20.0  # Micro-caps too risky for beginners
        weights["stability_size"] = 1.2
    
    # Liquidity (can I sell when I need to?)
    if stock.avg_daily_volume > 0:
        if stock.avg_daily_volume >= 1_000_000:
            scores["liquidity"] = 90.0
        elif stock.avg_daily_volume >= 100_000:
            scores["liquidity"] = 60.0 + (stock.avg_daily_volume - 100_000) / 900_000 * 30.0
        else:
            scores["liquidity"] = clamp(stock.avg_daily_volume / 100_000 * 60.0)
        weights["liquidity"] = 1.0
    
    return _weighted_average(scores, weights, "accessibility")


def score_momentum_timing(stock: StockData) -> dict:
    """
    MOMENTUM & TIMING (4% weight) — is the timing reasonable?
    Low weight because we're long-term investors, but avoid catching falling knives.
    """
    scores = {}
    weights = {}
    
    if stock.price_vs_200dma is not None:
        # Prefer stocks near or slightly above 200DMA (uptrend but not overextended)
        pct = stock.price_vs_200dma * 100 if abs(stock.price_vs_200dma) < 2 else stock.price_vs_200dma
        if -5.0 <= pct <= 15.0:
            scores["trend_alignment"] = 80.0
        elif pct > 15.0:
            scores["trend_alignment"] = clamp(80.0 - (pct - 15.0) * 1.5)
        else:
            scores["trend_alignment"] = clamp(80.0 + pct * 2.0)  # Penalize deep downtrend
        weights["trend_alignment"] = 1.2
    
    if stock.sharpe_ratio is not None:
        # Risk-adjusted returns: Sharpe > 1 is good
        scores["risk_adjusted"] = sigmoid(stock.sharpe_ratio, midpoint=0.8, steepness=1.5)
        weights["risk_adjusted"] = 1.0
    
    return _weighted_average(scores, weights, "momentum_timing")



# ---------------------------------------------------------------------------
# Helper & Aggregation
# ---------------------------------------------------------------------------

def _weighted_average(scores: dict, weights: dict, category: str) -> dict:
    """Compute weighted average with explanations."""
    if not scores:
        return {"category": category, "score": None, "factors": {}, "data_coverage": 0.0}
    
    total_weight = sum(weights[k] for k in scores)
    weighted_sum = sum(scores[k] * weights[k] / total_weight for k in scores)
    
    return {
        "category": category,
        "score": round(clamp(weighted_sum), 1),
        "factors": {k: round(v, 1) for k, v in scores.items()},
        "data_coverage": round(len(scores) / max(len(weights), 1), 2),
    }


# ---------------------------------------------------------------------------
# Risk Classification
# ---------------------------------------------------------------------------

@dataclass
class RiskClassification:
    """Risk level assignment with explanation."""
    level: str              # "very_low", "low", "moderate", "high", "very_high"
    score: float            # 0 (safest) to 100 (riskiest)
    factors: List[str]      # What's driving the risk
    recommendation: str     # Human-readable guidance


def classify_risk(stock: StockData) -> RiskClassification:
    """
    Classify a stock's risk level specifically for small investors.
    Uses multiple signals to avoid false safety.
    """
    risk_points = 0.0
    max_points = 0.0
    factors = []
    
    # Volatility risk
    if stock.annualized_volatility is not None:
        vol = stock.annualized_volatility * 100 if stock.annualized_volatility < 1 else stock.annualized_volatility
        max_points += 25
        if vol > 40:
            risk_points += 25
            factors.append(f"Very high volatility ({vol:.0f}% annualized)")
        elif vol > 30:
            risk_points += 18
            factors.append(f"High volatility ({vol:.0f}%)")
        elif vol > 20:
            risk_points += 10
        else:
            risk_points += 3


    # Leverage risk
    if stock.debt_equity is not None:
        max_points += 20
        if stock.debt_equity > 2.0:
            risk_points += 20
            factors.append(f"High leverage (D/E={stock.debt_equity:.1f})")
        elif stock.debt_equity > 1.0:
            risk_points += 12
            factors.append(f"Moderate leverage (D/E={stock.debt_equity:.1f})")
        elif stock.debt_equity > 0.5:
            risk_points += 5
        else:
            risk_points += 1
    
    # Valuation risk (overvaluation = risk of mean reversion)
    if stock.pe_ratio is not None:
        max_points += 15
        if stock.pe_ratio > 40:
            risk_points += 15
            factors.append(f"Very expensive (P/E={stock.pe_ratio:.0f})")
        elif stock.pe_ratio > 25:
            risk_points += 8
        elif stock.pe_ratio > 0:
            risk_points += 3
        else:
            risk_points += 12  # Negative earnings
            factors.append("Unprofitable (negative P/E)")
    
    # Size risk
    if stock.market_cap > 0:
        max_points += 15
        cap_b = stock.market_cap / 1000.0
        if cap_b < 0.3:
            risk_points += 15
            factors.append("Micro-cap: high manipulation risk")
        elif cap_b < 2.0:
            risk_points += 10
            factors.append("Small-cap: higher volatility expected")
        elif cap_b < 10.0:
            risk_points += 5
        else:
            risk_points += 2
    
    # Drawdown risk
    if stock.max_drawdown_1y is not None:
        max_points += 15
        dd = abs(stock.max_drawdown_1y) * 100 if abs(stock.max_drawdown_1y) < 1 else abs(stock.max_drawdown_1y)
        if dd > 40:
            risk_points += 15
            factors.append(f"Severe recent drawdown ({dd:.0f}%)")
        elif dd > 25:
            risk_points += 10
        elif dd > 15:
            risk_points += 5
        else:
            risk_points += 2


    # Liquidity risk
    if stock.avg_daily_volume > 0:
        max_points += 10
        if stock.avg_daily_volume < 50_000:
            risk_points += 10
            factors.append("Very low liquidity: hard to sell quickly")
        elif stock.avg_daily_volume < 200_000:
            risk_points += 5
        else:
            risk_points += 1
    
    # Compute risk score
    if max_points > 0:
        risk_score = round(risk_points / max_points * 100, 1)
    else:
        risk_score = 50.0  # Unknown = moderate risk
        factors.append("Insufficient data to assess risk fully")
    
    # Classify
    if risk_score <= 20:
        level, rec = "very_low", "Suitable for conservative investors. Low expected volatility."
    elif risk_score <= 35:
        level, rec = "low", "Good for risk-averse investors. Moderate stability expected."
    elif risk_score <= 55:
        level, rec = "moderate", "Acceptable risk. Consider position sizing carefully."
    elif risk_score <= 75:
        level, rec = "high", "Significant risk. Only allocate a small % of portfolio."
    else:
        level, rec = "very_high", "Very risky for small investors. Consider avoiding or minimal exposure."
    
    return RiskClassification(level=level, score=risk_score, factors=factors, recommendation=rec)


# ---------------------------------------------------------------------------
# Main Composite Score
# ---------------------------------------------------------------------------

@dataclass
class SmartPickResult:
    """Complete analysis result for a stock."""
    symbol: str
    name: str
    exchange: str
    sector: str
    current_price: float
    # Composite
    smart_score: float                  # 0-100, risk-adjusted quality
    risk_classification: RiskClassification
    # Category breakdown
    category_scores: dict
    # Decision support
    verdict: str                        # "Strong Buy", "Buy", "Hold", "Avoid"
    confidence: float                   # 0-100
    reasons_to_buy: List[str]
    reasons_to_avoid: List[str]
    ideal_position_pct: float           # Suggested max portfolio %
    # Metadata
    data_coverage: float
    disclaimer: str



def compute_smart_pick_score(stock: StockData) -> SmartPickResult:
    """
    The master scoring function. Combines all category scores into a single
    risk-adjusted "Smart Pick Score" optimized for small investors.
    
    This is NOT a traditional stock screener. It answers:
    "Given my small budget and inability to absorb losses, is THIS stock
     a smart place to put my money?"
    """
    # Score each category
    safety = score_safety_shield(stock)
    margin = score_margin_of_safety(stock)
    quality = score_quality_moat(stock)
    income = score_income_stability(stock)
    growth = score_growth_potential(stock)
    access = score_accessibility(stock)
    momentum = score_momentum_timing(stock)
    
    category_scores = {
        "safety_shield": safety,
        "margin_of_safety": margin,
        "quality_moat": quality,
        "income_stability": income,
        "growth_potential": growth,
        "accessibility": access,
        "momentum_timing": momentum,
    }
    
    # Composite: weighted by SMALL_INVESTOR_CATEGORY_WEIGHTS
    scored_categories = {k: v for k, v in category_scores.items() if v["score"] is not None}
    
    if not scored_categories:
        smart_score = 0.0
    else:
        # Renormalize weights over available categories
        total_weight = sum(SMALL_INVESTOR_CATEGORY_WEIGHTS[k] for k in scored_categories)
        smart_score = sum(
            scored_categories[k]["score"] * SMALL_INVESTOR_CATEGORY_WEIGHTS[k] / total_weight
            for k in scored_categories
        )
    
    smart_score = round(clamp(smart_score), 1)
    
    # Risk classification
    risk = classify_risk(stock)
    
    # Apply risk penalty: even a high-scoring stock with very high risk gets penalized
    risk_penalty = 0.0
    if risk.level == "very_high":
        risk_penalty = 20.0
    elif risk.level == "high":
        risk_penalty = 10.0
    elif risk.level == "moderate":
        risk_penalty = 3.0
    
    adjusted_score = round(clamp(smart_score - risk_penalty), 1)


    # Data coverage
    all_coverages = [v.get("data_coverage", 0) for v in category_scores.values()]
    data_coverage = round(sum(all_coverages) / len(all_coverages), 2) if all_coverages else 0.0
    confidence = round(clamp(data_coverage * 95.0, 0, 95), 0)
    
    # Verdict
    if adjusted_score >= 75 and risk.level in ("very_low", "low"):
        verdict = "Strong Buy"
    elif adjusted_score >= 60 and risk.level in ("very_low", "low", "moderate"):
        verdict = "Buy"
    elif adjusted_score >= 45:
        verdict = "Hold"
    elif adjusted_score >= 30:
        verdict = "Weak — Consider Alternatives"
    else:
        verdict = "Avoid"
    
    # Build reasons
    reasons_to_buy = []
    reasons_to_avoid = []
    
    if safety.get("score") and safety["score"] >= 70:
        reasons_to_buy.append(f"Strong safety profile ({safety['score']:.0f}/100)")
    if margin.get("score") and margin["score"] >= 65:
        reasons_to_buy.append(f"Trading below fair value (margin of safety: {margin['score']:.0f}/100)")
    if quality.get("score") and quality["score"] >= 70:
        reasons_to_buy.append(f"High-quality business with durable moat ({quality['score']:.0f}/100)")
    if income.get("score") and income["score"] >= 60:
        reasons_to_buy.append(f"Reliable income while you wait ({income['score']:.0f}/100)")
    if growth.get("score") and growth["score"] >= 60:
        reasons_to_buy.append(f"Good growth potential ({growth['score']:.0f}/100)")
    
    if safety.get("score") and safety["score"] < 40:
        reasons_to_avoid.append(f"Weak safety ({safety['score']:.0f}/100) — high chance of capital loss")
    if risk.level in ("high", "very_high"):
        reasons_to_avoid.append(f"Risk level: {risk.level.replace('_', ' ')} — {risk.recommendation}")
    if margin.get("score") and margin["score"] < 35:
        reasons_to_avoid.append("Expensive: no margin of safety if things go wrong")
    for factor in risk.factors[:3]:
        reasons_to_avoid.append(factor)
    
    # Position sizing suggestion based on risk
    position_pcts = {"very_low": 8.0, "low": 5.0, "moderate": 3.0, "high": 1.5, "very_high": 0.5}
    ideal_position = position_pcts.get(risk.level, 3.0)


    return SmartPickResult(
        symbol=stock.symbol,
        name=stock.name,
        exchange=stock.exchange,
        sector=stock.sector,
        current_price=stock.current_price,
        smart_score=adjusted_score,
        risk_classification=risk,
        category_scores=category_scores,
        verdict=verdict,
        confidence=confidence,
        reasons_to_buy=reasons_to_buy[:5],
        reasons_to_avoid=reasons_to_avoid[:5],
        ideal_position_pct=ideal_position,
        data_coverage=data_coverage,
        disclaimer=(
            "This Smart Pick Score is an AI-driven, risk-first analysis designed "
            "for educational purposes. It does NOT constitute financial advice. "
            "All investing carries risk of loss. Past performance does not "
            "guarantee future results. Always do your own research."
        ),
    )


def result_to_dict(result: SmartPickResult) -> dict:
    """Serialize a SmartPickResult to a JSON-safe dict."""
    return {
        "symbol": result.symbol,
        "name": result.name,
        "exchange": result.exchange,
        "sector": result.sector,
        "current_price": result.current_price,
        "smart_score": result.smart_score,
        "verdict": result.verdict,
        "confidence": result.confidence,
        "risk_classification": {
            "level": result.risk_classification.level,
            "score": result.risk_classification.score,
            "factors": result.risk_classification.factors,
            "recommendation": result.risk_classification.recommendation,
        },
        "category_scores": {
            k: {"score": v["score"], "factors": v.get("factors", {}), "data_coverage": v.get("data_coverage", 0)}
            for k, v in result.category_scores.items()
        },
        "reasons_to_buy": result.reasons_to_buy,
        "reasons_to_avoid": result.reasons_to_avoid,
        "ideal_position_pct": result.ideal_position_pct,
        "data_coverage": result.data_coverage,
        "disclaimer": result.disclaimer,
    }
