"""
Smart Stock Screener Service — FastAPI microservice.

The risk-first stock screener for small investors. Analyzes stocks and ranks
them by probability of protecting capital while still generating returns.

Endpoints:
  POST /score          — Score a single stock
  POST /screen         — Score multiple stocks and rank them
  POST /top-picks      — Get top N picks given a budget and risk tolerance
  GET  /health         — Health check
"""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
from .screener_engine import (
    StockData, compute_smart_pick_score, result_to_dict, classify_risk
)

app = FastAPI(
    title="InvestorIQ Smart Screener",
    version="2.0.0",
    description="Risk-first stock screener optimized for small investors",
)


class StockInput(BaseModel):
    """Input model for scoring a single stock."""
    symbol: str
    name: str = ""
    exchange: str = "US"
    sector: str = "Unknown"
    currency: str = "USD"
    current_price: float = 0.0
    market_cap: float = 0.0
    avg_daily_volume: float = 0.0
    pe_ratio: Optional[float] = None
    pb_ratio: Optional[float] = None
    ps_ratio: Optional[float] = None
    peg_ratio: Optional[float] = None
    ev_ebitda: Optional[float] = None
    fcf_yield: Optional[float] = None
    intrinsic_value: Optional[float] = None
    current_ratio: Optional[float] = None
    debt_equity: Optional[float] = None
    interest_coverage: Optional[float] = None
    roe: Optional[float] = None
    roic: Optional[float] = None
    gross_margin: Optional[float] = None
    operating_margin: Optional[float] = None
    net_margin: Optional[float] = None
    fcf_conversion: Optional[float] = None

    revenue_growth_yoy: Optional[float] = None
    eps_growth_yoy: Optional[float] = None
    revenue_growth_3y_cagr: Optional[float] = None
    beta: Optional[float] = None
    annualized_volatility: Optional[float] = None
    max_drawdown_1y: Optional[float] = None
    sharpe_ratio: Optional[float] = None
    sortino_ratio: Optional[float] = None
    dividend_yield: Optional[float] = None
    payout_ratio: Optional[float] = None
    dividend_growth_5y: Optional[float] = None
    consecutive_dividend_years: int = 0
    price_vs_52w_high: Optional[float] = None
    price_vs_200dma: Optional[float] = None
    esg_score: Optional[float] = None


class ScreenRequest(BaseModel):
    """Request to screen multiple stocks."""
    stocks: List[StockInput]
    max_results: int = Field(default=20, ge=1, le=100)
    min_score: float = Field(default=0.0, ge=0, le=100)
    max_risk_level: str = Field(default="moderate",
        description="Maximum acceptable risk: very_low, low, moderate, high, very_high")
    budget: Optional[float] = Field(default=None,
        description="Total investment budget in USD")


class TopPicksRequest(BaseModel):
    """Request for top picks given investor profile."""
    stocks: List[StockInput]
    budget: float = Field(..., gt=0, description="Total investment budget in USD")
    risk_tolerance: str = Field(default="low",
        description="Risk tolerance: very_low, low, moderate, high")
    max_picks: int = Field(default=10, ge=1, le=30)
    min_diversification_sectors: int = Field(default=3, ge=1, le=11)


RISK_ORDER = ["very_low", "low", "moderate", "high", "very_high"]



def _input_to_stock_data(inp: StockInput) -> StockData:
    return StockData(**inp.model_dump())


@app.get("/health")
def health():
    return {"status": "ok", "service": "smart-screener", "version": "2.0.0"}


@app.post("/score")
def score_stock(inp: StockInput) -> dict:
    """Score a single stock with full analysis."""
    stock = _input_to_stock_data(inp)
    result = compute_smart_pick_score(stock)
    return result_to_dict(result)


@app.post("/screen")
def screen_stocks(req: ScreenRequest) -> dict:
    """Screen multiple stocks, filter by risk and score, return ranked list."""
    max_risk_idx = RISK_ORDER.index(req.max_risk_level) if req.max_risk_level in RISK_ORDER else 2
    
    results = []
    for inp in req.stocks:
        stock = _input_to_stock_data(inp)
        result = compute_smart_pick_score(stock)
        
        # Filter by risk tolerance
        result_risk_idx = RISK_ORDER.index(result.risk_classification.level)
        if result_risk_idx > max_risk_idx:
            continue
        
        # Filter by minimum score
        if result.smart_score < req.min_score:
            continue
        
        results.append(result_to_dict(result))
    
    # Sort by smart_score descending
    results.sort(key=lambda x: x["smart_score"], reverse=True)
    
    return {
        "results": results[:req.max_results],
        "total_screened": len(req.stocks),
        "passed_filters": len(results),
        "filters_applied": {
            "max_risk_level": req.max_risk_level,
            "min_score": req.min_score,
        },
    }



@app.post("/top-picks")
def top_picks(req: TopPicksRequest) -> dict:
    """
    Get optimized top picks for a given budget and risk tolerance.
    
    Algorithm:
    1. Score all stocks
    2. Filter by risk tolerance
    3. Ensure sector diversification
    4. Select top picks that fit the budget
    5. Suggest position sizes
    """
    max_risk_idx = RISK_ORDER.index(req.risk_tolerance) if req.risk_tolerance in RISK_ORDER else 1
    
    scored = []
    for inp in req.stocks:
        stock = _input_to_stock_data(inp)
        result = compute_smart_pick_score(stock)
        risk_idx = RISK_ORDER.index(result.risk_classification.level)
        if risk_idx <= max_risk_idx and result.smart_score >= 40:
            scored.append(result)
    
    # Sort by score
    scored.sort(key=lambda x: x.smart_score, reverse=True)
    
    # Diversification: ensure minimum sectors represented
    selected = []
    sectors_seen = set()
    
    # First pass: pick top from each unique sector
    for result in scored:
        if result.sector not in sectors_seen and len(sectors_seen) < req.min_diversification_sectors:
            selected.append(result)
            sectors_seen.add(result.sector)
    
    # Second pass: fill remaining slots with best scores
    for result in scored:
        if result not in selected and len(selected) < req.max_picks:
            selected.append(result)
    
    selected = selected[:req.max_picks]
    
    # Position sizing based on equal-risk contribution
    portfolio = []
    total_risk_weight = sum(1.0 / max(r.risk_classification.score, 5.0) for r in selected) if selected else 1.0
    
    for result in selected:
        inv_risk = 1.0 / max(result.risk_classification.score, 5.0)
        allocation_pct = inv_risk / total_risk_weight * 100.0
        allocation_usd = req.budget * allocation_pct / 100.0
        shares = int(allocation_usd / result.current_price) if result.current_price > 0 else 0
        actual_cost = shares * result.current_price


        portfolio.append({
            **result_to_dict(result),
            "allocation": {
                "target_pct": round(allocation_pct, 1),
                "target_usd": round(allocation_usd, 2),
                "shares": shares,
                "actual_cost": round(actual_cost, 2),
            },
        })
    
    total_invested = sum(p["allocation"]["actual_cost"] for p in portfolio)
    cash_remaining = req.budget - total_invested
    
    return {
        "picks": portfolio,
        "summary": {
            "total_picks": len(portfolio),
            "budget": req.budget,
            "total_invested": round(total_invested, 2),
            "cash_remaining": round(cash_remaining, 2),
            "sectors_covered": list(sectors_seen),
            "avg_smart_score": round(sum(r.smart_score for r in selected) / len(selected), 1) if selected else 0,
            "avg_risk_score": round(sum(r.risk_classification.score for r in selected) / len(selected), 1) if selected else 0,
            "risk_tolerance": req.risk_tolerance,
        },
        "guidance": {
            "diversification": f"Portfolio spans {len(sectors_seen)} sectors for protection",
            "position_sizing": "Positions sized inversely to risk: safer stocks get larger allocations",
            "next_steps": [
                "Review each pick's 'reasons_to_buy' and 'reasons_to_avoid'",
                "Consider dollar-cost averaging: invest 25% now, 25% each month",
                "Set a stop-loss at 15-20% below purchase price",
                "Rebalance quarterly or when any position grows beyond 2x its target weight",
            ],
        },
        "disclaimer": (
            "These picks are algorithmically generated for educational purposes. "
            "They do NOT constitute financial advice. Always do your own research "
            "and consider consulting a financial advisor. All investing carries risk."
        ),
    }
