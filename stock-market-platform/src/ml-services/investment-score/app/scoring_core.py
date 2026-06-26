"""
Explainable Investment Score Engine — Core (pure standard library).

Computes a transparent, multi-factor investment quality score (0-100) from
fundamental, valuation, growth, quality, momentum, risk, and income factors.

Design principles (from the master prompt):
  - The score is NEVER a bare number. Every output explains:
      * which factors increased confidence
      * which risks reduced it
      * the assumptions and weights used
      * what could change the outlook
  - Each raw factor is normalized to a 0-100 sub-score via explicit, auditable
    scoring functions (higher = better for an investor), then aggregated by
    category, then into a weighted composite.
  - Missing data is handled gracefully: a factor with no value is excluded and
    its category weight is renormalized, with a `data_coverage` metric reported.

This is an analytical/decision-support tool. It never asserts a stock will rise;
it expresses evidence-based quality with explicit confidence and risk flags.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional, Callable
import math


# ---------------------------------------------------------------------------
# Scoring primitives
# ---------------------------------------------------------------------------

def clamp(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, x))


def higher_better(value: float, low: float, high: float) -> float:
    """Linear map: value<=low -> 0, value>=high -> 100. Higher input is better."""
    if high == low:
        return 50.0
    return clamp((value - low) / (high - low) * 100.0)


def lower_better(value: float, low: float, high: float) -> float:
    """Linear map where a LOWER input is better (e.g. valuation multiples, debt)."""
    if high == low:
        return 50.0
    return clamp((high - value) / (high - low) * 100.0)


def band(value: float, ideal_low: float, ideal_high: float, hard_low: float, hard_high: float) -> float:
    """
    Score peaks (100) inside [ideal_low, ideal_high] and falls to 0 outside
    [hard_low, hard_high]. Used for metrics with an optimal RANGE (e.g. payout
    ratio: too low = not returning capital, too high = unsustainable).
    """
    if ideal_low <= value <= ideal_high:
        return 100.0
    if value < ideal_low:
        return clamp((value - hard_low) / (ideal_low - hard_low) * 100.0) if ideal_low != hard_low else 0.0
    return clamp((hard_high - value) / (hard_high - ideal_high) * 100.0) if hard_high != ideal_high else 0.0


# ---------------------------------------------------------------------------
# Factor definitions
# ---------------------------------------------------------------------------

@dataclass
class FactorDef:
    """Definition of a single scoring factor."""
    key: str
    label: str
    category: str
    weight: float                       # Relative weight within its category
    scorer: Callable[[float], float]    # Maps raw value -> 0-100 sub-score
    explain: str                        # Human-readable meaning
    higher_is_better: bool = True


@dataclass
class FactorResult:
    key: str
    label: str
    category: str
    raw_value: Optional[float]
    sub_score: Optional[float]
    weight: float
    contribution: float                 # Weighted points contributed to category
    explanation: str
    available: bool


# Category weights in the composite (must sum to 1.0)
CATEGORY_WEIGHTS = {
    "financial_strength": 0.18,
    "profitability": 0.18,
    "growth": 0.16,
    "valuation": 0.16,
    "quality": 0.12,
    "momentum": 0.08,
    "income": 0.06,
    "risk": 0.06,
}


# The factor library. Thresholds are derived from broad-market norms for
# large/mid-cap equities. Each scorer is explicit and auditable.
FACTORS: list = [
    # --- Financial Strength ---
    FactorDef("current_ratio", "Current Ratio", "financial_strength", 1.0,
              lambda v: band(v, 1.5, 3.0, 0.5, 6.0),
              "Short-term liquidity: current assets / current liabilities. Ideal 1.5-3.0."),
    FactorDef("debt_equity", "Debt / Equity", "financial_strength", 1.5,
              lambda v: lower_better(v, 0.2, 2.5), False,
              "Leverage. Lower is safer; >2.5 is high for most sectors."),
    FactorDef("interest_coverage", "Interest Coverage", "financial_strength", 1.2,
              lambda v: higher_better(v, 1.5, 12.0),
              "EBIT / interest expense. Ability to service debt. >12x is very strong."),
    FactorDef("quick_ratio", "Quick Ratio", "financial_strength", 0.8,
              lambda v: band(v, 1.0, 2.5, 0.3, 5.0),
              "Liquidity excluding inventory. Ideal 1.0-2.5."),

    # --- Profitability ---
    FactorDef("roe", "Return on Equity", "profitability", 1.3,
              lambda v: higher_better(v, 0.05, 0.30),
              "Net income / equity. >30% is excellent (watch for leverage distortion)."),
    FactorDef("roic", "Return on Invested Capital", "profitability", 1.5,
              lambda v: higher_better(v, 0.05, 0.25),
              "Returns on all invested capital. The cleanest profitability signal."),
    FactorDef("net_margin", "Net Margin", "profitability", 1.0,
              lambda v: higher_better(v, 0.02, 0.25),
              "Net income / revenue. Pricing power and cost discipline."),
    FactorDef("gross_margin", "Gross Margin", "profitability", 0.8,
              lambda v: higher_better(v, 0.20, 0.65),
              "Revenue minus COGS. Structural advantage / moat indicator."),
    FactorDef("operating_margin", "Operating Margin", "profitability", 1.0,
              lambda v: higher_better(v, 0.05, 0.30),
              "Core operating efficiency before financing and taxes."),

    # --- Growth ---
    FactorDef("revenue_growth", "Revenue Growth (YoY)", "growth", 1.2,
              lambda v: higher_better(v, 0.0, 0.25),
              "Top-line expansion. Sustainable demand for the business."),
    FactorDef("eps_growth", "EPS Growth (YoY)", "growth", 1.3,
              lambda v: higher_better(v, 0.0, 0.30),
              "Per-share earnings growth — what owners actually capture."),
    FactorDef("fcf_growth", "Free Cash Flow Growth", "growth", 1.0,
              lambda v: higher_better(v, -0.05, 0.25),
              "Growth in cash the business generates after capex."),
    FactorDef("revenue_growth_3y", "Revenue Growth (3Y CAGR)", "growth", 0.9,
              lambda v: higher_better(v, 0.0, 0.20),
              "Durability of growth over a full cycle, not a single year."),

    # --- Valuation (lower multiples score higher) ---
    FactorDef("pe_ratio", "P/E Ratio", "valuation", 1.2,
              lambda v: lower_better(v, 10.0, 45.0), False,
              "Price / earnings. Context vs. growth and sector matters."),
    FactorDef("peg_ratio", "PEG Ratio", "valuation", 1.3,
              lambda v: lower_better(v, 0.8, 3.0), False,
              "P/E relative to growth. <1 often signals value; >3 is rich."),
    FactorDef("ev_ebitda", "EV / EBITDA", "valuation", 1.1,
              lambda v: lower_better(v, 6.0, 25.0), False,
              "Capital-structure-neutral valuation multiple."),
    FactorDef("fcf_yield", "Free Cash Flow Yield", "valuation", 1.2,
              lambda v: higher_better(v, 0.02, 0.10),
              "FCF / market cap. The cash return you buy at today's price."),
    FactorDef("pb_ratio", "P/B Ratio", "valuation", 0.7,
              lambda v: lower_better(v, 1.0, 8.0), False,
              "Price / book value. Most relevant for asset-heavy businesses."),

    # --- Quality ---
    FactorDef("fcf_conversion", "FCF Conversion", "quality", 1.2,
              lambda v: higher_better(v, 0.5, 1.1),
              "FCF / net income. >1 means earnings are backed by real cash."),
    FactorDef("accruals_ratio", "Accruals Ratio", "quality", 0.8,
              lambda v: lower_better(v, 0.0, 0.25), False,
              "Non-cash share of earnings. High accruals can flag aggressive accounting."),
    FactorDef("roic_stability", "ROIC Stability", "quality", 1.0,
              lambda v: higher_better(v, 0.0, 1.0),
              "Consistency of returns over time (0-1). Moats produce stable ROIC."),
    FactorDef("shares_change", "Share Count Change (YoY)", "quality", 0.9,
              lambda v: lower_better(v, -0.03, 0.05), False,
              "Negative = buybacks (good); positive = dilution (bad)."),

    # --- Momentum ---
    FactorDef("price_return_12m", "12-Month Price Return", "momentum", 1.0,
              lambda v: higher_better(v, -0.20, 0.40),
              "Trailing 12-month total return — the classic momentum factor."),
    FactorDef("price_vs_200dma", "Price vs 200-Day MA", "momentum", 0.8,
              lambda v: higher_better(v, -0.15, 0.20),
              "Distance above/below long-term trend. Positive = uptrend."),
    FactorDef("earnings_revision", "Analyst EPS Revision", "momentum", 1.0,
              lambda v: higher_better(v, -0.05, 0.10),
              "Direction of consensus estimate changes — leading indicator."),

    # --- Income ---
    FactorDef("dividend_yield", "Dividend Yield", "income", 1.0,
              lambda v: higher_better(v, 0.0, 0.05),
              "Annual dividend / price. Income return component."),
    FactorDef("payout_ratio", "Payout Ratio", "income", 1.0,
              lambda v: band(v, 0.30, 0.60, 0.0, 1.0),
              "Dividend / earnings. Ideal 30-60%: rewards owners yet sustainable."),
    FactorDef("dividend_growth_5y", "Dividend Growth (5Y)", "income", 0.9,
              lambda v: higher_better(v, 0.0, 0.12),
              "Track record of raising the dividend — signals confidence."),

    # --- Risk (each scored so higher sub-score = lower risk) ---
    FactorDef("beta", "Beta", "risk", 1.0,
              lambda v: band(v, 0.7, 1.1, 0.0, 2.5),
              "Sensitivity to the market. Near 1.0 is balanced; >2 is aggressive."),
    FactorDef("volatility", "Annualized Volatility", "risk", 1.0,
              lambda v: lower_better(v, 0.15, 0.60), False,
              "Standard deviation of returns. Lower = steadier."),
    FactorDef("max_drawdown", "Max Drawdown (abs)", "risk", 0.9,
              lambda v: lower_better(v, 0.10, 0.60), False,
              "Worst peak-to-trough loss (as a positive fraction). Lower is safer."),
]


FACTOR_INDEX = {f.key: f for f in FACTORS}



# ---------------------------------------------------------------------------
# Aggregation & explainability
# ---------------------------------------------------------------------------

@dataclass
class CategoryScore:
    category: str
    score: Optional[float]              # 0-100, None if no data
    weight: float                       # Weight in composite (renormalized)
    factors: list                       # list[FactorResult]
    data_coverage: float                # Fraction of category factors with data


@dataclass
class InvestmentScore:
    composite_score: Optional[float]    # 0-100
    rating: str                         # Plain-language quality band
    confidence: float                   # 0-100, based on data coverage
    category_scores: list               # list[CategoryScore]
    strengths: list                     # Top positive contributors
    risks: list                         # Top negative contributors / risk flags
    assumptions: list                   # Explicit assumptions / weights used
    what_could_change: list             # Forward-looking watch items
    data_coverage: float                # Overall fraction of factors available
    disclaimer: str


def _score_factor(fdef: FactorDef, raw: Optional[float]) -> FactorResult:
    if raw is None or (isinstance(raw, float) and math.isnan(raw)):
        return FactorResult(
            key=fdef.key, label=fdef.label, category=fdef.category,
            raw_value=None, sub_score=None, weight=fdef.weight,
            contribution=0.0, explanation=fdef.explain, available=False,
        )
    sub = round(fdef.scorer(float(raw)), 1)
    return FactorResult(
        key=fdef.key, label=fdef.label, category=fdef.category,
        raw_value=float(raw), sub_score=sub, weight=fdef.weight,
        contribution=0.0,  # filled during category aggregation
        explanation=fdef.explain, available=True,
    )


def _aggregate_category(category: str, results: list) -> CategoryScore:
    cat_factors = [r for r in results if r.category == category]
    available = [r for r in cat_factors if r.available]
    total_weight = sum(r.weight for r in available)

    if not available or total_weight == 0:
        return CategoryScore(category=category, score=None,
                             weight=CATEGORY_WEIGHTS[category], factors=cat_factors,
                             data_coverage=0.0)

    weighted_sum = 0.0
    for r in available:
        normalized_weight = r.weight / total_weight
        r.contribution = round(r.sub_score * normalized_weight, 2)
        weighted_sum += r.sub_score * normalized_weight

    return CategoryScore(
        category=category,
        score=round(weighted_sum, 1),
        weight=CATEGORY_WEIGHTS[category],
        factors=cat_factors,
        data_coverage=round(len(available) / len(cat_factors), 2),
    )


def _rating_band(score: float) -> str:
    if score >= 80: return "Exceptional"
    if score >= 70: return "Strong"
    if score >= 60: return "Above Average"
    if score >= 45: return "Average"
    if score >= 30: return "Below Average"
    return "Weak"


def compute_investment_score(metrics: dict) -> InvestmentScore:
    """
    Compute the explainable investment score from a dict of raw factor values.
    `metrics` keys correspond to FactorDef.key; missing keys are handled.

    Returns a fully-explained InvestmentScore: composite, per-category scores,
    ranked strengths and risks, assumptions, and forward watch items.
    """
    # 1. Score every factor
    results = [_score_factor(f, metrics.get(f.key)) for f in FACTORS]

    # 2. Aggregate by category
    categories = [_aggregate_category(c, results) for c in CATEGORY_WEIGHTS]

    # 3. Composite: renormalize category weights over those WITH data
    scored_cats = [c for c in categories if c.score is not None]
    total_cat_weight = sum(c.weight for c in scored_cats)

    if not scored_cats or total_cat_weight == 0:
        composite = None
    else:
        composite = round(
            sum(c.score * (c.weight / total_cat_weight) for c in scored_cats), 1
        )

    # 4. Data coverage & confidence
    available_factors = [r for r in results if r.available]
    coverage = round(len(available_factors) / len(results), 2)
    # Confidence: coverage drives it, capped — never claim high confidence on thin data
    confidence = round(clamp(coverage * 100, 0, 95), 0)

    # 5. Strengths: highest sub-score factors that materially help
    ranked = sorted(available_factors, key=lambda r: r.sub_score, reverse=True)
    strengths = [
        {"factor": r.label, "category": r.category, "score": r.sub_score,
         "value": r.raw_value, "why": r.explanation}
        for r in ranked if r.sub_score >= 65
    ][:6]

    # 6. Risks: lowest sub-score factors (drag on the thesis)
    risks = [
        {"factor": r.label, "category": r.category, "score": r.sub_score,
         "value": r.raw_value, "why": r.explanation}
        for r in sorted(available_factors, key=lambda r: r.sub_score) if r.sub_score <= 40
    ][:6]

    # 7. Assumptions (explicit, auditable)
    assumptions = [
        f"Category weights: " + ", ".join(f"{k}={int(v*100)}%" for k, v in CATEGORY_WEIGHTS.items()),
        "Factor thresholds calibrated to broad large/mid-cap equity norms; "
        "sector context is NOT yet applied (a high P/E may be justified for high growth).",
        "Missing factors are excluded and remaining weights renormalized "
        f"(overall data coverage: {int(coverage*100)}%).",
        "Scores measure relative quality/attractiveness — they are NOT price targets "
        "or probability of gains.",
    ]

    # 8. What could change the outlook
    what_could_change = []
    cat_map = {c.category: c for c in categories}
    if cat_map.get("growth") and cat_map["growth"].score is not None and cat_map["growth"].score < 50:
        what_could_change.append("An acceleration in revenue or EPS growth would materially lift the growth score.")
    if cat_map.get("valuation") and cat_map["valuation"].score is not None and cat_map["valuation"].score < 40:
        what_could_change.append("A price pullback or earnings growth would improve valuation attractiveness.")
    if cat_map.get("financial_strength") and cat_map["financial_strength"].score is not None and cat_map["financial_strength"].score < 50:
        what_could_change.append("Debt reduction or improved liquidity would strengthen the balance-sheet score.")
    if coverage < 0.6:
        what_could_change.append("More complete fundamental data would raise confidence in this score.")
    if not what_could_change:
        what_could_change.append("Watch upcoming earnings, guidance revisions, and macro shifts for changes to the thesis.")

    rating = _rating_band(composite) if composite is not None else "Insufficient Data"

    return InvestmentScore(
        composite_score=composite,
        rating=rating,
        confidence=confidence,
        category_scores=categories,
        strengths=strengths,
        risks=risks,
        assumptions=assumptions,
        what_could_change=what_could_change,
        data_coverage=coverage,
        disclaimer=(
            "This score is an evidence-based, multi-factor analysis for research and "
            "education. It does not constitute financial advice, a price target, or a "
            "guarantee of future performance. All investing involves risk of loss."
        ),
    )


def score_to_dict(score: InvestmentScore) -> dict:
    """Serialize an InvestmentScore (including nested dataclasses) to a dict."""
    return {
        "composite_score": score.composite_score,
        "rating": score.rating,
        "confidence": score.confidence,
        "data_coverage": score.data_coverage,
        "category_scores": [
            {
                "category": c.category,
                "score": c.score,
                "weight": c.weight,
                "data_coverage": c.data_coverage,
                "factors": [
                    {
                        "key": f.key, "label": f.label, "raw_value": f.raw_value,
                        "sub_score": f.sub_score, "contribution": f.contribution,
                        "available": f.available, "explanation": f.explanation,
                    }
                    for f in c.factors
                ],
            }
            for c in score.category_scores
        ],
        "strengths": score.strengths,
        "risks": score.risks,
        "assumptions": score.assumptions,
        "what_could_change": score.what_could_change,
        "disclaimer": score.disclaimer,
    }
