"""
Investment Score Engine tests — pure stdlib, no pytest/fastapi required.

Validates scoring primitives, factor scoring, category aggregation, composite
calculation, missing-data handling, and full explainability output.
Run: python3 tests/test_scoring.py
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.scoring_core import (  # noqa: E402
    clamp, higher_better, lower_better, band,
    compute_investment_score, score_to_dict,
    FACTORS, CATEGORY_WEIGHTS, FACTOR_INDEX,
)


def approx(a, b, tol=0.5):
    return abs(a - b) <= tol


# --- Scoring primitives ---

def test_clamp_bounds():
    assert clamp(-10) == 0.0
    assert clamp(150) == 100.0
    assert clamp(50) == 50.0


def test_higher_better_endpoints():
    assert higher_better(5, 10, 30) == 0.0     # at/below low
    assert higher_better(30, 10, 30) == 100.0  # at/above high
    assert approx(higher_better(20, 10, 30), 50.0)


def test_lower_better_inverts():
    assert lower_better(10, 10, 45) == 100.0   # at low -> best
    assert lower_better(45, 10, 45) == 0.0     # at high -> worst
    assert approx(lower_better(27.5, 10, 45), 50.0)


def test_band_peaks_in_ideal_range():
    # payout ratio band: ideal 0.30-0.60, hard 0.0-1.0
    assert band(0.45, 0.30, 0.60, 0.0, 1.0) == 100.0
    assert band(0.30, 0.30, 0.60, 0.0, 1.0) == 100.0
    assert band(0.0, 0.30, 0.60, 0.0, 1.0) == 0.0
    assert band(1.0, 0.30, 0.60, 0.0, 1.0) == 0.0
    # Halfway below ideal
    assert approx(band(0.15, 0.30, 0.60, 0.0, 1.0), 50.0)


# --- Factor library integrity ---

def test_category_weights_sum_to_one():
    assert approx(sum(CATEGORY_WEIGHTS.values()), 1.0, tol=0.001)


def test_every_factor_has_valid_category():
    for f in FACTORS:
        assert f.category in CATEGORY_WEIGHTS, f"{f.key} has unknown category {f.category}"


def test_factor_count_substantial():
    # Master prompt calls for many factors across categories
    assert len(FACTORS) >= 25
    # Every category must have at least 2 factors
    from collections import Counter
    counts = Counter(f.category for f in FACTORS)
    for cat in CATEGORY_WEIGHTS:
        assert counts[cat] >= 2, f"Category {cat} has too few factors"


# --- Composite scoring ---

def _excellent_company():
    return {
        "current_ratio": 2.2, "debt_equity": 0.3, "interest_coverage": 20, "quick_ratio": 1.8,
        "roe": 0.35, "roic": 0.28, "net_margin": 0.28, "gross_margin": 0.62, "operating_margin": 0.32,
        "revenue_growth": 0.22, "eps_growth": 0.28, "fcf_growth": 0.24, "revenue_growth_3y": 0.19,
        "pe_ratio": 18, "peg_ratio": 0.9, "ev_ebitda": 11, "fcf_yield": 0.06, "pb_ratio": 3.0,
        "fcf_conversion": 1.05, "accruals_ratio": 0.05, "roic_stability": 0.9, "shares_change": -0.02,
        "price_return_12m": 0.30, "price_vs_200dma": 0.12, "earnings_revision": 0.08,
        "dividend_yield": 0.025, "payout_ratio": 0.45, "dividend_growth_5y": 0.10,
        "beta": 0.95, "volatility": 0.22, "max_drawdown": 0.18,
    }


def _weak_company():
    return {
        "current_ratio": 0.6, "debt_equity": 3.5, "interest_coverage": 1.2, "quick_ratio": 0.4,
        "roe": 0.01, "roic": 0.02, "net_margin": 0.01, "gross_margin": 0.18, "operating_margin": 0.02,
        "revenue_growth": -0.05, "eps_growth": -0.10, "fcf_growth": -0.15, "revenue_growth_3y": -0.02,
        "pe_ratio": 55, "peg_ratio": 4.5, "ev_ebitda": 30, "fcf_yield": 0.005, "pb_ratio": 9,
        "fcf_conversion": 0.3, "accruals_ratio": 0.35, "roic_stability": 0.1, "shares_change": 0.08,
        "price_return_12m": -0.35, "price_vs_200dma": -0.25, "earnings_revision": -0.12,
        "dividend_yield": 0.0, "payout_ratio": 0.0, "dividend_growth_5y": 0.0,
        "beta": 2.2, "volatility": 0.70, "max_drawdown": 0.65,
    }


def test_excellent_scores_high():
    s = compute_investment_score(_excellent_company())
    assert s.composite_score >= 75, f"Expected >=75, got {s.composite_score}"
    assert s.rating in ("Strong", "Exceptional")
    assert len(s.strengths) > 0


def test_weak_scores_low():
    s = compute_investment_score(_weak_company())
    assert s.composite_score <= 35, f"Expected <=35, got {s.composite_score}"
    assert s.rating in ("Weak", "Below Average")
    assert len(s.risks) > 0


def test_excellent_beats_weak():
    strong = compute_investment_score(_excellent_company()).composite_score
    weak = compute_investment_score(_weak_company()).composite_score
    assert strong > weak + 30  # Large, unambiguous separation


def test_composite_in_range():
    for metrics in (_excellent_company(), _weak_company()):
        s = compute_investment_score(metrics)
        assert 0 <= s.composite_score <= 100


# --- Explainability ---

def test_full_explainability_present():
    s = compute_investment_score(_excellent_company())
    assert s.assumptions and len(s.assumptions) >= 3
    assert s.what_could_change and len(s.what_could_change) >= 1
    assert s.disclaimer and "not constitute financial advice" in s.disclaimer
    # Every category should be present
    assert len(s.category_scores) == len(CATEGORY_WEIGHTS)


def test_strengths_and_risks_directionally_correct():
    s = compute_investment_score(_excellent_company())
    # An excellent company's strengths should reference high-scoring factors
    assert all(item["score"] >= 65 for item in s.strengths)
    w = compute_investment_score(_weak_company())
    assert all(item["score"] <= 40 for item in w.risks)


# --- Missing data handling ---

def test_missing_data_excluded_and_renormalized():
    """Providing only profitability factors should still yield a valid score."""
    partial = {"roe": 0.30, "roic": 0.25, "net_margin": 0.22, "gross_margin": 0.60, "operating_margin": 0.28}
    s = compute_investment_score(partial)
    assert s.composite_score is not None
    assert s.composite_score > 0
    assert s.data_coverage < 0.5  # Only a fraction of factors supplied
    # Confidence must reflect thin data
    assert s.confidence < 50


def test_no_data_returns_insufficient():
    s = compute_investment_score({})
    assert s.composite_score is None
    assert s.rating == "Insufficient Data"
    assert s.confidence == 0


def test_confidence_scales_with_coverage():
    full = compute_investment_score(_excellent_company())
    partial = compute_investment_score({"roe": 0.3, "roic": 0.25})
    assert full.confidence > partial.confidence


def test_category_renormalization_correct():
    """Composite must equal weighted avg of available category scores (renormalized)."""
    s = compute_investment_score(_excellent_company())
    scored = [c for c in s.category_scores if c.score is not None]
    total_w = sum(c.weight for c in scored)
    expected = round(sum(c.score * (c.weight / total_w) for c in scored), 1)
    assert approx(s.composite_score, expected, tol=0.2)


# --- Serialization ---

def test_score_to_dict_serializable():
    import json
    s = compute_investment_score(_excellent_company())
    d = score_to_dict(s)
    # Must be JSON-serializable (no dataclass/Callable leakage)
    json_str = json.dumps(d)
    assert "composite_score" in json_str
    assert "category_scores" in d
    assert len(d["category_scores"]) == len(CATEGORY_WEIGHTS)


def test_band_factor_payout_ratio_integration():
    """A healthy payout ratio (45%) should score the income category well."""
    metrics = {"dividend_yield": 0.03, "payout_ratio": 0.45, "dividend_growth_5y": 0.10}
    s = compute_investment_score(metrics)
    income = next(c for c in s.category_scores if c.category == "income")
    assert income.score is not None and income.score >= 70


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    passed = 0
    failed = []
    for t in tests:
        try:
            t()
            print(f"PASS: {t.__name__}")
            passed += 1
        except AssertionError as e:
            print(f"FAIL: {t.__name__} — {e}")
            failed.append(t.__name__)
        except Exception as e:
            print(f"ERROR: {t.__name__} — {type(e).__name__}: {e}")
            failed.append(t.__name__)
    print(f"\n{passed}/{len(tests)} investment-score tests passed")
    sys.exit(0 if not failed else 1)
