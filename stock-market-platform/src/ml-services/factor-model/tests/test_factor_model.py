"""Unit tests for the Factor Model Service."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.main import (
    FactorInput,
    compute_value_score,
    compute_momentum_score,
    compute_quality_score,
    compute_size_score,
    compute_low_vol_score,
    score,
)


def test_value_score_cheap_stock_scores_high():
    """A stock with low P/E and P/B should score positive on value."""
    cheap = FactorInput(symbol="VAL", pe_ratio=8.0, pb_ratio=1.0, ev_ebitda=5.0)
    expensive = FactorInput(symbol="EXP", pe_ratio=45.0, pb_ratio=12.0, ev_ebitda=35.0)
    assert compute_value_score(cheap) > compute_value_score(expensive)
    assert compute_value_score(cheap) > 0


def test_momentum_score_strips_recent_month():
    """12-1 momentum should exclude the most recent month."""
    strong = FactorInput(symbol="MOM", return_12m=40.0, return_1m=2.0)
    weak = FactorInput(symbol="WEAK", return_12m=-15.0, return_1m=1.0)
    assert compute_momentum_score(strong) > compute_momentum_score(weak)
    assert compute_momentum_score(strong) > 0


def test_quality_score_high_profitability():
    """High ROE/ROIC and low debt should score high on quality."""
    high_q = FactorInput(symbol="Q", roe=35.0, roic=28.0, gross_margin=60.0, debt_equity=0.2)
    low_q = FactorInput(symbol="LQ", roe=3.0, roic=2.0, gross_margin=15.0, debt_equity=3.5)
    assert compute_quality_score(high_q) > compute_quality_score(low_q)


def test_size_score_small_cap_higher():
    """Smaller market cap should produce a higher size-factor score."""
    small = FactorInput(symbol="SM", market_cap=500_000_000)       # 0.5B
    large = FactorInput(symbol="LG", market_cap=2_000_000_000_000) # 2T
    assert compute_size_score(small) > compute_size_score(large)


def test_low_vol_score_prefers_calm():
    """Lower volatility should score higher on the low-vol factor."""
    calm = FactorInput(symbol="CALM", annualized_volatility=12.0)
    wild = FactorInput(symbol="WILD", annualized_volatility=65.0)
    assert compute_low_vol_score(calm) > compute_low_vol_score(wild)


def test_composite_score_in_range():
    """Composite score must always be within [0, 100]."""
    inp = FactorInput(
        symbol="TEST", pe_ratio=15, pb_ratio=2, ev_ebitda=10,
        return_12m=12, return_1m=1, roe=18, roic=14,
        debt_equity=0.5, gross_margin=45, market_cap=10_000_000_000,
        annualized_volatility=22,
    )
    result = score(inp)
    assert 0.0 <= result.composite_score <= 100.0
    assert all(-1.0 <= getattr(result, f) <= 1.0
               for f in ["value", "momentum", "quality", "size", "low_volatility"])


def test_empty_input_neutral():
    """With no data, all factor scores default to neutral (0)."""
    inp = FactorInput(symbol="EMPTY")
    result = score(inp)
    assert result.value == 0.0
    assert result.momentum == 0.0
    assert result.composite_score == 50.0  # neutral maps to midpoint


if __name__ == "__main__":
    # Lightweight runner without pytest dependency
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    passed = 0
    for t in tests:
        try:
            t()
            print(f"PASS: {t.__name__}")
            passed += 1
        except AssertionError as e:
            print(f"FAIL: {t.__name__} — {e}")
        except Exception as e:
            print(f"ERROR: {t.__name__} — {e}")
    print(f"\n{passed}/{len(tests)} tests passed")
    sys.exit(0 if passed == len(tests) else 1)
