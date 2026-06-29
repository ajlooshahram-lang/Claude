"""
Global Market Opportunity Scanner — FastAPI Service

Scans stocks across US, Europe, and Asia to find the best risk-adjusted
opportunities for small investors worldwide.

Endpoints:
  POST /scan           — Scan a universe of stocks and return ranked opportunities
  POST /scan-region    — Scan stocks in a specific region
  GET  /markets        — List available global markets and accessibility info
  GET  /health         — Health check
"""
from fastapi import FastAPI
from pydantic import BaseModel, Field
from typing import Optional, List

from .scanner_engine import GlobalStock, scan_stock, scan_universe, _result_to_dict
from .market_universe import GLOBAL_MARKETS, get_markets_for_budget

app = FastAPI(
    title="InvestorIQ Global Scanner",
    version="1.0.0",
    description="Global market opportunity scanner for small investors",
)


class StockInput(BaseModel):
    symbol: str
    name: str = ""
    exchange: str = "NYSE"
    region: str = "US"
    country: str = "United States"
    currency: str = "USD"
    sector: str = "Unknown"
    price_local: float = 0.0
    price_usd: float = 0.0
    market_cap_usd: float = 0.0
    avg_daily_volume: float = 0.0
    pe_ratio: Optional[float] = None
    pb_ratio: Optional[float] = None
    ev_ebitda: Optional[float] = None
    fcf_yield: Optional[float] = None
    dividend_yield: Optional[float] = None
    payout_ratio: Optional[float] = None
    roe: Optional[float] = None
    roic: Optional[float] = None
    debt_equity: Optional[float] = None
    current_ratio: Optional[float] = None
    gross_margin: Optional[float] = None
    net_margin: Optional[float] = None
    beta: Optional[float] = None
    annualized_volatility: Optional[float] = None
    max_drawdown_1y: Optional[float] = None
    sharpe_ratio: Optional[float] = None
    revenue_growth_yoy: Optional[float] = None
    eps_growth_yoy: Optional[float] = None
    years_profitable: int = 0
    dividend_years: int = 0
    index_member: bool = False



class ScanRequest(BaseModel):
    stocks: List[StockInput]
    budget_usd: float = Field(default=1000.0, gt=0)
    max_results: int = Field(default=20, ge=1, le=50)
    max_risk: str = Field(default="moderate")
    min_score: float = Field(default=40.0, ge=0, le=100)
    target_regions: Optional[List[str]] = None


class RegionScanRequest(BaseModel):
    stocks: List[StockInput]
    region: str = Field(..., description="US, EU, or ASIA")
    budget_usd: float = Field(default=1000.0, gt=0)
    max_results: int = Field(default=10, ge=1, le=30)
    max_risk: str = Field(default="moderate")


def _to_global_stock(inp: StockInput) -> GlobalStock:
    return GlobalStock(**inp.model_dump())


@app.get("/health")
def health():
    return {"status": "ok", "service": "global-scanner", "version": "1.0.0",
            "markets_covered": len(GLOBAL_MARKETS)}


@app.get("/markets")
def list_markets(budget_usd: float = 1000.0):
    """List all accessible global markets for a given budget."""
    accessible = get_markets_for_budget(budget_usd)
    return {
        "total_markets": len(GLOBAL_MARKETS),
        "accessible_for_budget": len(accessible),
        "markets": [
            {
                "code": m.code,
                "name": m.name,
                "region": m.region,
                "country": m.country,
                "currency": m.currency,
                "accessibility_score": m.accessibility_score,
                "fractional_shares": m.fractional_shares,
                "commission_free": m.commission_free,
                "major_index": m.major_index,
                "currency_risk": m.currency_risk,
                "regulatory_quality": m.regulatory_quality,
            }
            for m in accessible
        ],
    }


@app.post("/scan")
def scan_global(req: ScanRequest) -> dict:
    """Scan a universe of global stocks and return ranked opportunities."""
    stocks = [_to_global_stock(s) for s in req.stocks]
    return scan_universe(
        stocks=stocks,
        budget_usd=req.budget_usd,
        max_results=req.max_results,
        max_risk=req.max_risk,
        min_score=req.min_score,
        target_regions=req.target_regions,
    )


@app.post("/scan-region")
def scan_region(req: RegionScanRequest) -> dict:
    """Scan stocks in a specific region."""
    stocks = [_to_global_stock(s) for s in req.stocks if s.region == req.region]
    return scan_universe(
        stocks=stocks,
        budget_usd=req.budget_usd,
        max_results=req.max_results,
        max_risk=req.max_risk,
        min_score=0.0,
        target_regions=[req.region],
    )


@app.post("/score-single")
def score_single(stock: StockInput, budget_usd: float = 1000.0) -> dict:
    """Score a single stock through the global opportunity lens."""
    gs = _to_global_stock(stock)
    result = scan_stock(gs, budget_usd)
    return _result_to_dict(result)
