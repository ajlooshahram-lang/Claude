# InvestorIQ — Explainable Investment Score Methodology

**Version:** 1.0  
**Date:** 2026-06-23  
**Status:** Approved · Implemented & Tested  
**Implementation:** `src/ml-services/investment-score/` (31 factors, 19 passing tests)

---

## 1. Philosophy

The Investment Score is a transparent, multi-factor measure of a company's **investment quality and attractiveness** on a 0–100 scale. It is explicitly **not** a price target, a prediction, or a probability of gains.

Three non-negotiable principles:

1. **Never a bare number.** Every score decomposes into category scores, factor sub-scores, ranked strengths, ranked risks, the assumptions/weights used, a confidence level, and forward-looking watch items.
2. **Fully auditable.** Every scoring function is an explicit, deterministic mapping from a raw financial value to a 0–100 sub-score. There is no opaque model weight a user cannot inspect.
3. **Honest about uncertainty.** Missing data lowers confidence; the score is capped at 95% confidence even with full data. Thresholds are documented and calibrated to broad-market norms.

---

## 2. Architecture

```
Raw company metrics (dict)
        │
        ▼
┌─────────────────────────────────────────────────┐
│ 1. FACTOR SCORING                                │
│    Each factor → 0-100 sub-score via an explicit │
│    scorer: higher_better / lower_better / band   │
└───────────────────────┬─────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────┐
│ 2. CATEGORY AGGREGATION                          │
│    Weighted average of available factors;        │
│    weights renormalized when data is missing     │
└───────────────────────┬─────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────┐
│ 3. COMPOSITE                                     │
│    Weighted average of category scores;          │
│    category weights renormalized over available  │
└───────────────────────┬─────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────┐
│ 4. EXPLAINABILITY LAYER                          │
│    rating · confidence · strengths · risks ·     │
│    assumptions · what_could_change · disclaimer  │
└──────────────────────────────────────────────────┘
```

---

## 3. Scoring Primitives

All raw values map to a 0–100 sub-score (higher = better for the investor) using three auditable functions:

| Primitive | Use Case | Behavior |
|-----------|----------|----------|
| `higher_better(v, low, high)` | ROE, growth, FCF yield | `v≤low → 0`, `v≥high → 100`, linear between |
| `lower_better(v, low, high)` | P/E, debt/equity, volatility | `v≤low → 100`, `v≥high → 0`, linear between |
| `band(v, ideal_lo, ideal_hi, hard_lo, hard_hi)` | Payout ratio, beta, current ratio | `100` inside ideal range, decays to `0` at hard bounds |

The `band` function captures metrics with an **optimal range** — e.g., a payout ratio that is too low (not returning capital) or too high (unsustainable) both score poorly, while 30–60% scores 100.

---

## 4. Factor Library (31 Factors, 8 Categories)

| Category | Weight | Factors |
|----------|:------:|---------|
| **Financial Strength** | 18% | Current Ratio, Debt/Equity, Interest Coverage, Quick Ratio |
| **Profitability** | 18% | ROE, ROIC, Net Margin, Gross Margin, Operating Margin |
| **Growth** | 16% | Revenue Growth, EPS Growth, FCF Growth, Revenue 3Y CAGR |
| **Valuation** | 16% | P/E, PEG, EV/EBITDA, FCF Yield, P/B |
| **Quality** | 12% | FCF Conversion, Accruals Ratio, ROIC Stability, Share Count Change |
| **Momentum** | 8% | 12M Price Return, Price vs 200-DMA, Analyst EPS Revision |
| **Income** | 6% | Dividend Yield, Payout Ratio, Dividend Growth 5Y |
| **Risk** | 6% | Beta, Annualized Volatility, Max Drawdown |

Category weights sum to **100%** (verified by test `test_category_weights_sum_to_one`). The full library with thresholds and per-factor explanations is exposed at the `/factors` API endpoint for complete transparency.

---

## 5. Worked Example

A quality-growth large-cap (Apple-like: elite profitability, premium valuation, low yield):

```
COMPOSITE SCORE: 60.8/100  (Above Average)  | Confidence: 87%  | Coverage: 87%

CATEGORY SCORES:
  financial_strength      63.6  ############
  profitability           94.0  ##################   ← elite ROE/ROIC/margins
  growth                  36.0  #######              ← mature, single-digit revenue growth
  valuation               24.6  ####                 ← premium multiples
  quality                 94.6  ##################   ← strong FCF conversion, buybacks
  momentum                58.0  ###########
  income                  36.2  #######              ← low dividend yield
  risk                    75.7  ###############

TOP STRENGTHS:  Interest Coverage, ROE, ROIC, Net Margin (all 100/100)
KEY RISKS:      P/B Ratio (0), EV/EBITDA (5), Dividend Yield (10), FCF Yield (16)
WHAT COULD CHANGE:
  • An acceleration in revenue or EPS growth would lift the growth score.
  • A price pullback or earnings growth would improve valuation attractiveness.
```

This is the desired behavior: a great *business* that is *expensively priced* earns a strong-but-not-perfect score, with the tension between quality and valuation made explicit — exactly what an experienced analyst would conclude.

---

## 6. Missing-Data Handling

Real-world data is incomplete. The engine:

1. **Excludes** factors with no value (no penalty, no zero-substitution that would bias the score).
2. **Renormalizes** the remaining factor weights within each category, and category weights within the composite.
3. **Reports `data_coverage`** (fraction of factors available) and **scales `confidence`** accordingly — confidence is capped at 95% even with full data, and a thin dataset yields low confidence.

Verified by tests: `test_missing_data_excluded_and_renormalized`, `test_confidence_scales_with_coverage`, `test_no_data_returns_insufficient`.

---

## 7. Output Schema (`/score`)

```jsonc
{
  "symbol": "AAPL",
  "composite_score": 60.8,        // 0-100, or null if no data
  "rating": "Above Average",      // Exceptional/Strong/Above Average/Average/Below Average/Weak
  "confidence": 87,               // 0-95, driven by data coverage
  "data_coverage": 0.87,
  "category_scores": [
    { "category": "profitability", "score": 94.0, "weight": 0.18,
      "data_coverage": 1.0,
      "factors": [ { "key": "roe", "label": "Return on Equity",
                     "raw_value": 1.47, "sub_score": 100.0,
                     "contribution": 28.3, "available": true,
                     "explanation": "Net income / equity..." } ] }
  ],
  "strengths": [ { "factor": "...", "category": "...", "score": 100, "value": 1.47, "why": "..." } ],
  "risks":     [ { "factor": "...", "category": "...", "score": 0,   "value": 48,   "why": "..." } ],
  "assumptions": [ "Category weights: ...", "Thresholds calibrated to ...", "..." ],
  "what_could_change": [ "An acceleration in revenue growth would..." ],
  "disclaimer": "This score is an evidence-based, multi-factor analysis..."
}
```

---

## 8. Roadmap Enhancements

The current engine is a rigorous, tested v1. Planned improvements (all preserving full explainability):

1. **Sector-relative scoring.** Calibrate thresholds per GICS sector (a 31× P/E is rich for a utility, cheap for software). Today's note in `assumptions` flags that sector context is not yet applied.
2. **Peer-percentile normalization.** Score factors as cross-sectional percentiles within a peer set, not just absolute thresholds.
3. **Time-series factor trends.** Reward improving trajectories (rising margins, falling leverage), not just point-in-time levels.
4. **Personalized weights.** Let users tilt category weights to match their objective (value vs. growth vs. income), with the change shown transparently.
5. **Confidence from data recency.** Penalize stale fundamentals (e.g., last filing > 1 quarter old).

---

## 9. Ethical Guardrails

- The score is labeled as **investment quality/attractiveness**, never a prediction.
- Every response carries a **disclaimer** (verified by `test_full_explainability_present`).
- **Risk flags** are surfaced prominently, never buried.
- **No buy/sell language** is generated by this engine; it produces analysis, the user decides.

---

*End of Investment Score Methodology*
