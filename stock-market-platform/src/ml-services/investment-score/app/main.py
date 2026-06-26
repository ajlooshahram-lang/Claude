"""
Investment Score Service — FastAPI microservice.

Computes the explainable, multi-factor investment quality score. Consumed by
the Investment Score AI agent and the company-overview UI. Every response is
fully transparent: per-factor sub-scores, category breakdowns, ranked strengths
and risks, assumptions, and forward-looking watch items.
"""
from fastapi import FastAPI
from pydantic import BaseModel, Field
from typing import Optional, Dict

from .scoring_core import compute_investment_score, score_to_dict, FACTORS, CATEGORY_WEIGHTS

app = FastAPI(
    title="InvestorIQ Investment Score Service",
    version="1.0.0",
    description="Explainable multi-factor investment quality scoring",
)


class ScoreRequest(BaseModel):
    symbol: Optional[str] = None
    # All factor values are optional; missing factors are handled gracefully.
    metrics: Dict[str, float] = Field(default_factory=dict)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "investment-score",
        "factor_count": len(FACTORS),
        "categories": list(CATEGORY_WEIGHTS.keys()),
    }


@app.get("/factors")
def list_factors():
    """Expose the full factor library and weights for transparency."""
    return {
        "category_weights": CATEGORY_WEIGHTS,
        "factors": [
            {
                "key": f.key, "label": f.label, "category": f.category,
                "weight": f.weight, "explanation": f.explain,
                "higher_is_better": f.higher_is_better,
            }
            for f in FACTORS
        ],
    }


@app.post("/score")
def post_score(req: ScoreRequest):
    score = compute_investment_score(req.metrics)
    result = score_to_dict(score)
    if req.symbol:
        result["symbol"] = req.symbol.upper()
    return result
