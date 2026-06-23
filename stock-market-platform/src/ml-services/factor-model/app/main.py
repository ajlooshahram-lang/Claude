"""
Factor Model Service — FastAPI microservice.

Computes multi-factor scores (value, momentum, quality, size, low-volatility)
for equities. Used by the Quantitative Agent in the AI Orchestrator.

Scores are normalized to the [-1, +1] range via cross-sectional z-scoring,
then mapped to a composite 0-100 quality score.
"""
from fastapi import FastAPI
from pydantic import BaseModel, Field
from typing import Optional
import math

app = FastAPI(
    title="InvestorIQ Factor Model Service",
    version="1.0.0",
    description="Multi-factor equity scoring service",
)


class FactorInput(BaseModel):
    """Fundamental and price inputs for factor computation."""
    symbol: str
    pe_ratio: Optional[float] = None
    pb_ratio: Optional[float] = None
    ps_ratio: Optional[float] = None
    ev_ebitda: Optional[float] = None
    return_12m: Optional[float] = Field(None, description="12-month price return (%)")
    return_1m: Optional[float] = Field(None, description="1-month price return (%)")
    roe: Optional[float] = None
    roic: Optional[float] = None
    debt_equity: Optional[float] = None
    gross_margin: Optional[float] = None
    market_cap: Optional[float] = None
    annualized_volatility: Optional[float] = None


class FactorScores(BaseModel):
    """Computed factor exposures and composite score."""
    symbol: str
    value: float
    momentum: float
    quality: float
    size: float
    low_volatility: float
    composite_score: float = Field(..., description="0-100 overall quality score")


def _clamp(x: float, lo: float = -1.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def _sigmoid_norm(x: float, midpoint: float, scale: float) -> float:
    """Map a raw value to [-1, 1] using a scaled tanh around a midpoint."""
    if x is None:
        return 0.0
    return _clamp(math.tanh((x - midpoint) / scale))


def compute_value_score(inp: FactorInput) -> float:
    """Lower valuation multiples => higher value score."""
    components = []
    if inp.pe_ratio and inp.pe_ratio > 0:
        # P/E of ~15 is neutral; lower is better (invert)
        components.append(-_sigmoid_norm(inp.pe_ratio, midpoint=18.0, scale=12.0))
    if inp.pb_ratio and inp.pb_ratio > 0:
        components.append(-_sigmoid_norm(inp.pb_ratio, midpoint=2.5, scale=2.0))
    if inp.ev_ebitda and inp.ev_ebitda > 0:
        components.append(-_sigmoid_norm(inp.ev_ebitda, midpoint=12.0, scale=8.0))
    return round(sum(components) / len(components), 4) if components else 0.0


def compute_momentum_score(inp: FactorInput) -> float:
    """Higher 12-month return (ex most recent month) => higher momentum."""
    if inp.return_12m is None:
        return 0.0
    # 12-1 momentum: strip the most recent month to avoid reversal effect
    mom = inp.return_12m - (inp.return_1m or 0.0)
    return round(_sigmoid_norm(mom, midpoint=8.0, scale=20.0), 4)


def compute_quality_score(inp: FactorInput) -> float:
    """High profitability + low leverage => higher quality."""
    components = []
    if inp.roe is not None:
        components.append(_sigmoid_norm(inp.roe * 100 if abs(inp.roe) < 2 else inp.roe, midpoint=15.0, scale=12.0))
    if inp.roic is not None:
        components.append(_sigmoid_norm(inp.roic * 100 if abs(inp.roic) < 2 else inp.roic, midpoint=12.0, scale=10.0))
    if inp.gross_margin is not None:
        components.append(_sigmoid_norm(inp.gross_margin * 100 if inp.gross_margin < 2 else inp.gross_margin, midpoint=40.0, scale=25.0))
    if inp.debt_equity is not None:
        components.append(-_sigmoid_norm(inp.debt_equity, midpoint=1.0, scale=1.0))
    return round(sum(components) / len(components), 4) if components else 0.0


def compute_size_score(inp: FactorInput) -> float:
    """Smaller cap => higher size-factor score (size premium)."""
    if not inp.market_cap or inp.market_cap <= 0:
        return 0.0
    log_cap = math.log10(inp.market_cap)
    # ~10B (log 10.0) neutral; smaller is higher score
    return round(-_sigmoid_norm(log_cap, midpoint=10.0, scale=1.5), 4)


def compute_low_vol_score(inp: FactorInput) -> float:
    """Lower volatility => higher low-vol factor score."""
    if inp.annualized_volatility is None:
        return 0.0
    vol = inp.annualized_volatility * 100 if inp.annualized_volatility < 2 else inp.annualized_volatility
    return round(-_sigmoid_norm(vol, midpoint=25.0, scale=15.0), 4)


@app.get("/health")
def health():
    return {"status": "ok", "service": "factor-model", "model_loaded": True}


@app.post("/score", response_model=FactorScores)
def score(inp: FactorInput) -> FactorScores:
    value = compute_value_score(inp)
    momentum = compute_momentum_score(inp)
    quality = compute_quality_score(inp)
    size = compute_size_score(inp)
    low_vol = compute_low_vol_score(inp)

    # Composite: weighted average mapped to 0-100
    weights = {"value": 0.25, "momentum": 0.25, "quality": 0.30, "size": 0.10, "low_vol": 0.10}
    raw = (
        value * weights["value"]
        + momentum * weights["momentum"]
        + quality * weights["quality"]
        + size * weights["size"]
        + low_vol * weights["low_vol"]
    )
    composite = round((raw + 1.0) * 50.0, 2)  # map [-1,1] -> [0,100]

    return FactorScores(
        symbol=inp.symbol,
        value=value,
        momentum=momentum,
        quality=quality,
        size=size,
        low_volatility=low_vol,
        composite_score=composite,
    )
