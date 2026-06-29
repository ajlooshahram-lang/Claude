"""
SmartVest Scoring Engine

Rates every stock on a scale of 1 to 10 based on three pillars:
  1. SAFETY (40% weight)  — How likely is this stock to protect your money?
  2. VALUE  (35% weight)  — Is the stock cheap relative to what the company earns?
  3. MOMENTUM (25% weight) — Is the price trending in the right direction recently?

Each pillar produces a sub-score from 0 to 10, then they're combined with
weights that favor safety (because this app is for beginners who can't
afford big losses).

HOW TO READ THE FINAL SCORE:
  9-10: Excellent — strong on all three dimensions
  7-8:  Good — solid pick with minor weaknesses
  5-6:  Average — some concerns, proceed with caution
  3-4:  Below average — significant risks or red flags
  1-2:  Poor — avoid unless you have a specific reason
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass
class ScoreBreakdown:
    """Full scoring result with explanation."""
    symbol: str
    # Final composite score (1-10)
    total_score: float
    # Sub-scores (each 0-10)
    safety_score: float
    value_score: float
    momentum_score: float
    # Human-readable explanations
    safety_explanation: str
    value_explanation: str
    momentum_explanation: str
    # Label
    label: str  # "Excellent", "Good", "Average", "Below Average", "Poor"


# ─── Weights ──────────────────────────────────────────────────────────────────
# Safety gets the highest weight because this app is for beginners
# who prioritize not losing money over maximizing gains.

WEIGHT_SAFETY = 0.40
WEIGHT_VALUE = 0.35
WEIGHT_MOMENTUM = 0.25


# ─── Safety Score (0-10) ──────────────────────────────────────────────────────
#
# Measures: "How likely is this stock to protect my capital?"
#
# Factors:
#   - Beta: How much the stock moves vs the market.
#     Beta < 0.8 = defensive (good), Beta > 1.5 = aggressive (bad for beginners)
#   - Volatility: How wildly the price swings day-to-day.
#     Low vol (<20% annual) = smooth ride, High vol (>40%) = scary drops
#   - Market cap: Bigger companies are generally more stable.
#     >$100B = blue chip safe, <$2B = small and risky
#
# Each factor contributes equally to the safety score.

def score_safety(
    beta: Optional[float],
    annualized_volatility: Optional[float],
    market_cap: Optional[float],  # in USD (or local currency)
) -> tuple[float, str]:
    """
    Calculate safety score (0-10).

    Logic:
      - Beta < 0.6 → 10 points (very defensive)
      - Beta 0.6-1.0 → 6-10 (normal to defensive)
      - Beta 1.0-1.5 → 3-6 (average to aggressive)
      - Beta > 1.5 → 0-3 (very aggressive, risky)

      - Volatility < 15% → 10 (super steady)
      - Volatility 15-25% → 6-10 (normal)
      - Volatility 25-40% → 3-6 (bumpy)
      - Volatility > 40% → 0-3 (wild swings)

      - Market cap > 100B → 10 (blue chip)
      - Market cap 10-100B → 6-9 (large cap)
      - Market cap 2-10B → 4-6 (mid cap)
      - Market cap < 2B → 1-4 (small, riskier)
    """
    scores = []
    explanations = []

    # --- Beta ---
    if beta is not None:
        # Guard: beta=0 or negative is suspicious (stale/invalid data)
        if beta <= 0.05:
            s = 5.0
            explanations.append(f"beta near zero ({beta:.2f}) — possibly stale data")
        elif beta <= 0.6:
            s = 10.0
            explanations.append(f"very defensive beta ({beta:.2f})")
        elif beta <= 1.0:
            # Linear: 0.6→10, 1.0→6
            s = 10.0 - (beta - 0.6) / 0.4 * 4.0
            explanations.append(f"moderate beta ({beta:.2f})")
        elif beta <= 1.5:
            # Linear: 1.0→6, 1.5→3
            s = 6.0 - (beta - 1.0) / 0.5 * 3.0
            explanations.append(f"above-market beta ({beta:.2f})")
        else:
            s = max(0.0, 3.0 - (beta - 1.5) * 2.0)
            explanations.append(f"high beta ({beta:.2f}) = big swings")
        scores.append(s)
    else:
        scores.append(5.0)  # Unknown = assume average
        explanations.append("beta unknown")

    # --- Volatility ---
    if annualized_volatility is not None:
        vol_pct = annualized_volatility * 100 if annualized_volatility < 1 else annualized_volatility
        # Guard: 0% volatility is suspicious (stale data, halted, or delisted)
        if vol_pct < 1.0:
            s = 5.0
            explanations.append(f"near-zero volatility ({vol_pct:.1f}%) — possibly stale data")
        elif vol_pct <= 15:
            s = 10.0
            explanations.append(f"very low volatility ({vol_pct:.0f}%)")
        elif vol_pct <= 25:
            s = 10.0 - (vol_pct - 15) / 10.0 * 4.0
            explanations.append(f"normal volatility ({vol_pct:.0f}%)")
        elif vol_pct <= 40:
            s = 6.0 - (vol_pct - 25) / 15.0 * 3.0
            explanations.append(f"elevated volatility ({vol_pct:.0f}%)")
        else:
            s = max(0.0, 3.0 - (vol_pct - 40) / 20.0 * 3.0)
            explanations.append(f"high volatility ({vol_pct:.0f}%) = risky")
        scores.append(s)
    else:
        scores.append(5.0)
        explanations.append("volatility unknown")

    # --- Market Cap ---
    if market_cap is not None:
        # Guard: market cap = 0 is invalid/delisted
        if market_cap <= 0:
            s = 1.0
            explanations.append("market cap zero or invalid — possibly delisted")
            scores.append(s)
        else:
            # Normalize to billions
            cap_b = market_cap / 1e9 if market_cap > 1000 else market_cap / 1e6
            # Rough heuristic: assume if > 1000 it's in millions, else billions
            if market_cap > 1e9:
                cap_b = market_cap / 1e9
            else:
                cap_b = market_cap / 1e6  # Might be in millions already

            if cap_b >= 100:
                s = 10.0
                explanations.append(f"blue-chip ({cap_b:.0f}B)")
            elif cap_b >= 10:
                s = 6.0 + (cap_b - 10) / 90.0 * 4.0
                explanations.append(f"large-cap ({cap_b:.0f}B)")
            elif cap_b >= 2:
                s = 4.0 + (cap_b - 2) / 8.0 * 2.0
                explanations.append(f"mid-cap ({cap_b:.1f}B)")
            else:
                s = max(1.0, 1.0 + cap_b / 2.0 * 3.0)
                explanations.append(f"small-cap ({cap_b:.1f}B) = riskier")
            scores.append(s)
    else:
        scores.append(5.0)
        explanations.append("market cap unknown")

    # Average the three factors
    safety = sum(scores) / len(scores)

    # WORST FACTOR CAP: if any single factor is catastrophically bad,
    # cap the total safety score. Prevents averaging from hiding extreme danger.
    worst = min(scores) if scores else 5.0
    if worst <= 1.0:
        safety = min(safety, 3.0)  # Something is very wrong
    elif worst <= 3.0:
        safety = min(safety, 5.0)  # Something is concerning

    explanation = "Safety: " + ", ".join(explanations)
    return round(min(10.0, max(0.0, safety)), 1), explanation


# ─── Value Score (0-10) ───────────────────────────────────────────────────────
#
# Measures: "Am I paying a fair price for this company's earnings?"
#
# Factors:
#   - P/E ratio: Price divided by annual earnings per share.
#     P/E < 15 = cheap (high score), P/E > 35 = expensive (low score)
#     Negative P/E (losses) = 0 score (company is unprofitable)
#   - Dividend yield: Cash paid to you every year as a % of the stock price.
#     Yield > 3% = great for income, 0% = no income (lower score)
#
# Why these two? They're the simplest value metrics a beginner can understand:
# "Am I paying too much?" and "Does it pay me back while I wait?"

def score_value(
    pe_ratio: Optional[float],
    dividend_yield: Optional[float],
) -> tuple[float, str]:
    """
    Calculate value score (0-10).

    P/E scoring logic:
      - P/E negative (unprofitable) → 0 points
      - P/E 0-12 → 9-10 (very cheap)
      - P/E 12-18 → 7-9 (fairly valued)
      - P/E 18-25 → 5-7 (getting expensive)
      - P/E 25-40 → 2-5 (expensive)
      - P/E > 40 → 0-2 (very expensive for a beginner)

    Dividend scoring logic:
      - Yield > 4% → 10 (great income)
      - Yield 2-4% → 6-10 (solid)
      - Yield 0.5-2% → 3-6 (some income)
      - Yield 0-0.5% → 1-3 (minimal)
      - No dividend → 1 (no income while you wait)
    """
    scores = []
    explanations = []

    # --- P/E Ratio ---
    if pe_ratio is not None:
        if pe_ratio <= 0:
            # Negative or zero P/E means the company is unprofitable or data is invalid
            s = 0.0
            explanations.append("unprofitable or invalid (P/E <= 0)")
        elif pe_ratio <= 12:
            s = 9.0 + (12.0 - pe_ratio) / 12.0
            explanations.append(f"cheap (P/E {pe_ratio:.1f})")
        elif pe_ratio <= 18:
            s = 7.0 + (18.0 - pe_ratio) / 6.0 * 2.0
            explanations.append(f"fair value (P/E {pe_ratio:.1f})")
        elif pe_ratio <= 25:
            s = 5.0 + (25.0 - pe_ratio) / 7.0 * 2.0
            explanations.append(f"moderately priced (P/E {pe_ratio:.1f})")
        elif pe_ratio <= 40:
            s = 2.0 + (40.0 - pe_ratio) / 15.0 * 3.0
            explanations.append(f"expensive (P/E {pe_ratio:.1f})")
        else:
            s = max(0.0, 2.0 - (pe_ratio - 40) / 20.0 * 2.0)
            explanations.append(f"very expensive (P/E {pe_ratio:.0f})")
        scores.append(s)
    else:
        scores.append(5.0)
        explanations.append("P/E unknown")

    # --- Dividend Yield ---
    if dividend_yield is not None:
        # Normalize: Yahoo sometimes returns as decimal (0.03) or percentage (3.0)
        dy = dividend_yield if dividend_yield < 1 else dividend_yield / 100.0
        dy_pct = dy * 100

        if dy_pct >= 4.0:
            s = 10.0
            explanations.append(f"strong dividend ({dy_pct:.1f}%)")
        elif dy_pct >= 2.0:
            s = 6.0 + (dy_pct - 2.0) / 2.0 * 4.0
            explanations.append(f"solid dividend ({dy_pct:.1f}%)")
        elif dy_pct >= 0.5:
            s = 3.0 + (dy_pct - 0.5) / 1.5 * 3.0
            explanations.append(f"small dividend ({dy_pct:.1f}%)")
        elif dy_pct > 0:
            s = 1.0 + dy_pct / 0.5 * 2.0
            explanations.append(f"tiny dividend ({dy_pct:.2f}%)")
        else:
            s = 1.0
            explanations.append("no dividend")
        scores.append(s)
    else:
        scores.append(3.0)
        explanations.append("dividend info unknown")

    value = sum(scores) / len(scores)
    explanation = "Value: " + ", ".join(explanations)
    return round(min(10.0, max(0.0, value)), 1), explanation


# ─── Momentum Score (0-10) ────────────────────────────────────────────────────
#
# Measures: "Is the stock price moving in the right direction recently?"
#
# Based on:
#   - 14-day price change (the same data as the traffic light)
#     > +5% in 14 days → strong momentum (8-10)
#     > +2% → positive (6-8)
#     -2% to +2% → flat (4-6)
#     < -2% → negative (2-4)
#     < -5% → strong negative (0-2)
#
# Why momentum matters for beginners:
# Buying a stock that's already falling can be scary and lead to panic selling.
# A stock with positive momentum is psychologically easier to hold.

def score_momentum(
    change_14d_pct: Optional[float],
) -> tuple[float, str]:
    """
    Calculate momentum score (0-10).

    Logic:
      - Change > +10% in 14 days → 10 (very strong uptrend)
      - Change +5% to +10% → 8-10 (strong uptrend)
      - Change +2% to +5% → 6-8 (positive)
      - Change -2% to +2% → 4-6 (flat, neutral)
      - Change -5% to -2% → 2-4 (negative)
      - Change < -5% → 0-2 (strong downtrend)
    """
    if change_14d_pct is None:
        return 5.0, "Momentum: no recent price data available"

    pct = change_14d_pct

    if pct >= 10.0:
        s = 10.0
        explanation = f"Momentum: strong uptrend (+{pct:.1f}% in 14 days)"
    elif pct >= 5.0:
        s = 8.0 + (pct - 5.0) / 5.0 * 2.0
        explanation = f"Momentum: solid uptrend (+{pct:.1f}% in 14 days)"
    elif pct >= 2.0:
        s = 6.0 + (pct - 2.0) / 3.0 * 2.0
        explanation = f"Momentum: positive trend (+{pct:.1f}% in 14 days)"
    elif pct >= -2.0:
        s = 4.0 + (pct + 2.0) / 4.0 * 2.0
        explanation = f"Momentum: flat ({pct:+.1f}% in 14 days)"
    elif pct >= -5.0:
        s = 2.0 + (pct + 5.0) / 3.0 * 2.0
        explanation = f"Momentum: negative ({pct:.1f}% in 14 days)"
    else:
        s = max(0.0, 2.0 + (pct + 10.0) / 5.0 * 2.0)
        explanation = f"Momentum: strong downtrend ({pct:.1f}% in 14 days)"

    return round(min(10.0, max(0.0, s)), 1), explanation


# ─── Composite Score ──────────────────────────────────────────────────────────

def compute_score(
    symbol: str,
    beta: Optional[float],
    annualized_volatility: Optional[float],
    market_cap: Optional[float],
    pe_ratio: Optional[float],
    dividend_yield: Optional[float],
    change_14d_pct: Optional[float],
) -> ScoreBreakdown:
    """
    Compute the full 1-10 score for a stock.

    Final score = (safety × 0.40) + (value × 0.35) + (momentum × 0.25)

    The weights favor safety because this app is for beginners
    who need capital preservation more than maximum returns.
    """
    safety, safety_exp = score_safety(beta, annualized_volatility, market_cap)
    value, value_exp = score_value(pe_ratio, dividend_yield)
    momentum, momentum_exp = score_momentum(change_14d_pct)

    # Weighted composite
    total = (safety * WEIGHT_SAFETY) + (value * WEIGHT_VALUE) + (momentum * WEIGHT_MOMENTUM)
    total = round(min(10.0, max(1.0, total)), 1)

    # Label
    if total >= 8.5:
        label = "Excellent"
    elif total >= 7.0:
        label = "Good"
    elif total >= 5.0:
        label = "Average"
    elif total >= 3.0:
        label = "Below Average"
    else:
        label = "Poor"

    return ScoreBreakdown(
        symbol=symbol,
        total_score=total,
        safety_score=round(safety, 1),
        value_score=round(value, 1),
        momentum_score=round(momentum, 1),
        safety_explanation=safety_exp,
        value_explanation=value_exp,
        momentum_explanation=momentum_exp,
        label=label,
    )
