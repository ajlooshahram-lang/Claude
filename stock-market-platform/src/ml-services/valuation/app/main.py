"""
Valuation Service — FastAPI microservice.

Exposes intrinsic-value models (DCF, DDM, comparables, Monte Carlo) used by the
Valuation AI agent and the interactive financial-model UI. Every response
includes the assumptions used, keeping the platform fully explainable.
"""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List, Dict

from .valuation_core import (
    DCFInputs, dcf_valuation, dcf_sensitivity,
    DDMInputs, gordon_ddm, two_stage_ddm,
    comparable_valuation,
    MonteCarloInputs, monte_carlo_dcf,
)

app = FastAPI(
    title="InvestorIQ Valuation Service",
    version="1.0.0",
    description="Intrinsic-value models: DCF, DDM, comparables, Monte Carlo",
)


# --- Request schemas ---

class DCFRequest(BaseModel):
    base_fcf: float = Field(..., description="Most recent annual free cash flow")
    shares_outstanding: float = Field(..., gt=0)
    net_debt: float = 0.0
    wacc: float = Field(0.09, gt=0, lt=1)
    high_growth_rate: float = 0.10
    high_growth_years: int = Field(5, ge=1, le=20)
    terminal_growth_rate: float = 0.025
    include_sensitivity: bool = True


class DDMRequest(BaseModel):
    current_dividend: float = Field(..., ge=0)
    cost_of_equity: float = Field(0.09, gt=0, lt=1)
    growth_rate: float = 0.04
    high_growth_rate: Optional[float] = None
    high_growth_years: int = 0
    terminal_growth_rate: float = 0.025


class ComparableRequest(BaseModel):
    target_metrics: Dict[str, float]
    peer_multiples: Dict[str, List[float]]
    shares_outstanding: float = Field(..., gt=0)
    net_debt: float = 0.0


class MonteCarloRequest(BaseModel):
    dcf: DCFRequest
    growth_std: float = 0.03
    wacc_std: float = 0.01
    terminal_growth_std: float = 0.005
    iterations: int = Field(10000, ge=100, le=100000)
    seed: Optional[int] = 42


def _to_dcf_inputs(r: DCFRequest) -> DCFInputs:
    return DCFInputs(
        base_fcf=r.base_fcf,
        shares_outstanding=r.shares_outstanding,
        net_debt=r.net_debt,
        wacc=r.wacc,
        high_growth_rate=r.high_growth_rate,
        high_growth_years=r.high_growth_years,
        terminal_growth_rate=r.terminal_growth_rate,
    )


@app.get("/health")
def health():
    return {"status": "ok", "service": "valuation", "models": ["dcf", "ddm", "comparables", "monte_carlo"]}


@app.post("/dcf")
def post_dcf(req: DCFRequest):
    try:
        inputs = _to_dcf_inputs(req)
        result = dcf_valuation(inputs)
        payload = result.__dict__.copy()
        if req.include_sensitivity:
            payload["sensitivity"] = dcf_sensitivity(inputs)
        return payload
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.post("/ddm")
def post_ddm(req: DDMRequest):
    try:
        inputs = DDMInputs(
            current_dividend=req.current_dividend,
            cost_of_equity=req.cost_of_equity,
            growth_rate=req.growth_rate,
            high_growth_rate=req.high_growth_rate,
            high_growth_years=req.high_growth_years,
            terminal_growth_rate=req.terminal_growth_rate,
        )
        if req.high_growth_rate is not None and req.high_growth_years >= 1:
            return two_stage_ddm(inputs)
        return gordon_ddm(inputs)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.post("/comparables")
def post_comparables(req: ComparableRequest):
    return comparable_valuation(
        target_metrics=req.target_metrics,
        peer_multiples=req.peer_multiples,
        shares_outstanding=req.shares_outstanding,
        net_debt=req.net_debt,
    )


@app.post("/monte-carlo")
def post_monte_carlo(req: MonteCarloRequest):
    try:
        mc = MonteCarloInputs(
            base=_to_dcf_inputs(req.dcf),
            growth_std=req.growth_std,
            wacc_std=req.wacc_std,
            terminal_growth_std=req.terminal_growth_std,
            iterations=req.iterations,
            seed=req.seed,
        )
        return monte_carlo_dcf(mc)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
