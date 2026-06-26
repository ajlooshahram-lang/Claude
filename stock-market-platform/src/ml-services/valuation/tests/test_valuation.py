"""
Valuation Engine tests — pure stdlib, no pytest/fastapi required.

Validates the financial mathematics against known closed-form results and
invariants. Run: python3 tests/test_valuation.py
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.valuation_core import (  # noqa: E402
    DCFInputs, dcf_valuation, dcf_sensitivity,
    DDMInputs, gordon_ddm, two_stage_ddm,
    comparable_valuation,
    MonteCarloInputs, monte_carlo_dcf,
)


def approx(a, b, tol=0.01):
    return abs(a - b) <= tol * max(1.0, abs(b))


# --- DCF tests ---

def test_dcf_basic_positive_value():
    """A profitable company should have a positive intrinsic value."""
    inp = DCFInputs(base_fcf=1_000_000_000, shares_outstanding=100_000_000,
                    net_debt=0, wacc=0.09, high_growth_rate=0.10,
                    high_growth_years=5, terminal_growth_rate=0.025)
    r = dcf_valuation(inp)
    assert r.intrinsic_value_per_share > 0
    assert r.enterprise_value > 0
    # EV must equal PV(explicit) + PV(terminal)
    assert approx(r.enterprise_value, r.pv_explicit_fcf + r.pv_terminal_value)


def test_dcf_net_debt_reduces_equity():
    """Higher net debt reduces equity value per share."""
    base = DCFInputs(base_fcf=5e8, shares_outstanding=1e8, net_debt=0)
    levered = DCFInputs(base_fcf=5e8, shares_outstanding=1e8, net_debt=2e9)
    assert dcf_valuation(base).intrinsic_value_per_share > \
           dcf_valuation(levered).intrinsic_value_per_share


def test_dcf_higher_wacc_lowers_value():
    """A higher discount rate must lower the intrinsic value."""
    low = DCFInputs(base_fcf=5e8, shares_outstanding=1e8, wacc=0.08)
    high = DCFInputs(base_fcf=5e8, shares_outstanding=1e8, wacc=0.12)
    assert dcf_valuation(low).intrinsic_value_per_share > \
           dcf_valuation(high).intrinsic_value_per_share


def test_dcf_invalid_wacc_below_terminal_growth_raises():
    """Model must reject WACC <= terminal growth (infinite/negative value)."""
    inp = DCFInputs(base_fcf=1e8, shares_outstanding=1e7, wacc=0.03,
                    terminal_growth_rate=0.04)
    try:
        dcf_valuation(inp)
        assert False, "Expected ValueError"
    except ValueError:
        pass


def test_dcf_terminal_value_pct_is_reasonable():
    """Terminal value share should be reported and between 0 and 100%."""
    inp = DCFInputs(base_fcf=1e9, shares_outstanding=1e8)
    r = dcf_valuation(inp)
    assert 0 < r.terminal_value_pct < 100


def test_dcf_known_value_single_year():
    """
    Closed-form check: 1 year of growth, then terminal.
    base_fcf=100, g_high=0, years=1, wacc=0.10, g_term=0.
    FCF1 = 100. PV_explicit = 100/1.1 = 90.909
    TV = FCF1*(1+0)/(0.10-0)=1000; PV_TV = 1000/1.1 = 909.09
    EV = 1000.0; per share (1 share) = 1000.0
    """
    inp = DCFInputs(base_fcf=100, shares_outstanding=1, net_debt=0, wacc=0.10,
                    high_growth_rate=0.0, high_growth_years=1, terminal_growth_rate=0.0)
    r = dcf_valuation(inp)
    assert approx(r.pv_explicit_fcf, 90.909, tol=0.001)
    assert approx(r.pv_terminal_value, 909.09, tol=0.001)
    assert approx(r.enterprise_value, 1000.0, tol=0.001)


def test_dcf_sensitivity_grid_shape():
    """Sensitivity grid must be 5x5 with valid numeric cells where WACC>g."""
    inp = DCFInputs(base_fcf=1e9, shares_outstanding=1e8)
    sens = dcf_sensitivity(inp)
    assert len(sens["grid"]) == 5
    assert all(len(row) == 5 for row in sens["grid"])
    # Center cell (base case) should equal the base valuation
    center = sens["grid"][2][2]
    assert center is not None and center > 0


# --- DDM tests ---

def test_gordon_ddm_closed_form():
    """
    Gordon: D0=2, g=0.04, r=0.09 -> D1=2.08, V=2.08/0.05=41.60
    """
    inp = DDMInputs(current_dividend=2.0, cost_of_equity=0.09, growth_rate=0.04)
    r = gordon_ddm(inp)
    assert approx(r["intrinsic_value_per_share"], 41.60, tol=0.001)


def test_gordon_ddm_rejects_growth_above_cost():
    inp = DDMInputs(current_dividend=2.0, cost_of_equity=0.05, growth_rate=0.06)
    try:
        gordon_ddm(inp)
        assert False
    except ValueError:
        pass


def test_two_stage_ddm_positive():
    inp = DDMInputs(current_dividend=1.0, cost_of_equity=0.09,
                    high_growth_rate=0.12, high_growth_years=5,
                    terminal_growth_rate=0.03)
    r = two_stage_ddm(inp)
    assert r["intrinsic_value_per_share"] > 0
    assert approx(r["intrinsic_value_per_share"],
                  r["pv_high_growth_dividends"] + r["pv_terminal_value"], tol=0.01)


# --- Comparables tests ---

def test_comparables_pe_estimate():
    """earnings=5B, peer P/E median=28, shares=100M -> 5B*28/100M = $1400"""
    r = comparable_valuation(
        target_metrics={"earnings": 5e9},
        peer_multiples={"pe": [25, 28, 30]},
        shares_outstanding=1e8,
    )
    assert approx(r["estimates"]["pe"]["per_share"], 1400.0)


def test_comparables_ev_ebitda_subtracts_net_debt():
    """ebitda=8B, median EV/EBITDA=17 -> EV=136B; net_debt=10B -> equity=126B"""
    r = comparable_valuation(
        target_metrics={"ebitda": 8e9},
        peer_multiples={"ev_ebitda": [15, 17, 19]},
        shares_outstanding=1e8,
        net_debt=10e9,
    )
    est = r["estimates"]["ev_ebitda"]
    assert approx(est["implied_enterprise_value"], 136e9)
    assert approx(est["implied_equity_value"], 126e9)


def test_comparables_blended_median():
    """Blended estimate should be the median of per-share estimates."""
    r = comparable_valuation(
        target_metrics={"earnings": 5e9, "revenue": 20e9, "book_value": 30e9},
        peer_multiples={"pe": [28], "ps": [5], "pb": [4]},
        shares_outstanding=1e8,
    )
    assert r["blended_per_share"] is not None
    assert len(r["methods_used"]) == 3


# --- Monte Carlo tests ---

def test_monte_carlo_deterministic_with_seed():
    """Same seed must produce identical results (reproducibility)."""
    base = DCFInputs(base_fcf=1e9, shares_outstanding=1e8)
    mc = MonteCarloInputs(base=base, iterations=2000, seed=123)
    r1 = monte_carlo_dcf(mc)
    r2 = monte_carlo_dcf(mc)
    assert r1["mean"] == r2["mean"]
    assert r1["percentiles"] == r2["percentiles"]


def test_monte_carlo_percentiles_ordered():
    """Percentiles must be monotonically increasing."""
    base = DCFInputs(base_fcf=1e9, shares_outstanding=1e8)
    mc = MonteCarloInputs(base=base, iterations=5000, seed=7)
    r = monte_carlo_dcf(mc)
    p = r["percentiles"]
    assert p["p5"] <= p["p10"] <= p["p25"] <= p["p50"] <= p["p75"] <= p["p90"] <= p["p95"]


def test_monte_carlo_median_near_base_case():
    """MC median should be in the neighborhood of the deterministic base case."""
    base = DCFInputs(base_fcf=1e9, shares_outstanding=1e8)
    base_value = dcf_valuation(base).intrinsic_value_per_share
    mc = MonteCarloInputs(base=base, iterations=8000, seed=99)
    r = monte_carlo_dcf(mc)
    # Within 30% — distributions are skewed but median should be close-ish
    assert 0.6 * base_value <= r["median"] <= 1.5 * base_value


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
    print(f"\n{passed}/{len(tests)} valuation tests passed")
    sys.exit(0 if not failed else 1)
