"""
Dividend Reinvestment (DRIP) Simulation API

Simulates the compounding effect of reinvesting dividends vs taking cash
over 5, 10, 20, and 30 year periods. Shows both scenarios side by side.
"""

import math
from datetime import datetime

import yfinance as yf
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/drip", tags=["drip"])


class DripRequest(BaseModel):
    symbol: str
    initial_shares: float = 50
    monthly_contribution: float = 500
    price_growth_pct: float = 7.0  # Annual price appreciation
    years: int = 30


@router.post("/simulate")
def simulate_drip(req: DripRequest):
    """Simulate dividend reinvestment vs cash dividends over time."""
    try:
        ticker = yf.Ticker(req.symbol.upper())
        info = ticker.info
        hist = ticker.history(period="5d")

        if hist.empty:
            raise HTTPException(status_code=404, detail=f"No data for {req.symbol}")

        current_price = hist["Close"].iloc[-1]
        name = info.get("shortName", req.symbol.upper())

        # Get dividend yield
        div_yield = info.get("dividendYield") or info.get("yield") or info.get("trailingAnnualDividendYield")
        if div_yield is None or div_yield == 0:
            # Try calculating from trailing dividend
            trailing_div = info.get("trailingAnnualDividendRate") or info.get("lastDividendValue", 0) * 4
            if trailing_div and trailing_div > 0:
                div_yield = trailing_div / current_price
            else:
                div_yield = 0.025  # Default 2.5% for simulation

        annual_div_per_share = current_price * div_yield
        monthly_growth_rate = (1 + req.price_growth_pct / 100) ** (1/12) - 1
        quarterly_div_yield = div_yield / 4  # Dividends paid quarterly

        # ─── Simulation ───────────────────────────────────────────────────
        # Scenario A: Reinvest all dividends
        reinvest_shares = req.initial_shares
        reinvest_price = current_price

        # Scenario B: Take dividends as cash
        cash_shares = req.initial_shares
        cash_price = current_price
        cash_dividends_collected = 0

        yearly_data = []

        for year in range(0, req.years + 1):
            if year == 0:
                yearly_data.append({
                    "year": 0,
                    "reinvest_value": round(reinvest_shares * reinvest_price, 2),
                    "reinvest_shares": round(reinvest_shares, 2),
                    "reinvest_dividends_earned": 0,
                    "cash_value": round(cash_shares * cash_price + cash_dividends_collected, 2),
                    "cash_shares": round(cash_shares, 2),
                    "cash_dividends_taken": 0,
                    "gap_usd": 0,
                    "gap_pct": 0,
                })
                continue

            # Simulate 12 months
            yearly_divs_reinvested = 0
            yearly_divs_cashed = 0

            for month in range(12):
                # Price appreciation
                reinvest_price *= (1 + monthly_growth_rate)
                cash_price *= (1 + monthly_growth_rate)

                # Monthly contribution (buys shares at current price)
                if req.monthly_contribution > 0:
                    new_shares_r = req.monthly_contribution / reinvest_price
                    reinvest_shares += new_shares_r
                    new_shares_c = req.monthly_contribution / cash_price
                    cash_shares += new_shares_c

                # Quarterly dividend (every 3 months)
                if (month + 1) % 3 == 0:
                    # Reinvest scenario: dividends buy more shares
                    div_amount_r = reinvest_shares * reinvest_price * quarterly_div_yield
                    new_shares_from_div = div_amount_r / reinvest_price
                    reinvest_shares += new_shares_from_div
                    yearly_divs_reinvested += div_amount_r

                    # Cash scenario: dividends taken out
                    div_amount_c = cash_shares * cash_price * quarterly_div_yield
                    cash_dividends_collected += div_amount_c
                    yearly_divs_cashed += div_amount_c

            # End of year snapshot
            reinvest_value = reinvest_shares * reinvest_price
            cash_value = cash_shares * cash_price + cash_dividends_collected
            gap = reinvest_value - cash_value
            gap_pct = (gap / cash_value * 100) if cash_value > 0 else 0

            yearly_data.append({
                "year": year,
                "reinvest_value": round(reinvest_value, 2),
                "reinvest_shares": round(reinvest_shares, 2),
                "reinvest_dividends_earned": round(yearly_divs_reinvested, 2),
                "cash_value": round(cash_value, 2),
                "cash_shares": round(cash_shares, 2),
                "cash_dividends_taken": round(yearly_divs_cashed, 2),
                "gap_usd": round(gap, 2),
                "gap_pct": round(gap_pct, 1),
            })

        # Extract summaries at key milestones
        def get_summary(year: int) -> dict:
            if year < len(yearly_data):
                d = yearly_data[year]
                return {
                    "reinvest": d["reinvest_value"],
                    "cash": d["cash_value"],
                    "gap": d["gap_usd"],
                    "gap_pct": d["gap_pct"],
                }
            return {"reinvest": 0, "cash": 0, "gap": 0, "gap_pct": 0}

        # Explanation
        final = yearly_data[-1] if yearly_data else yearly_data[0]
        explanation = (
            f"After 30 years, reinvesting dividends gives you {formatMoney(final['reinvest_value'])} "
            f"compared to {formatMoney(final['cash_value'])} if you took dividends as cash. "
            f"That is {formatMoney(final['gap_usd'])} MORE — a {final['gap_pct']:.0f}% advantage. "
            f"The gap grows dramatically because of compound growth: each reinvested dividend buys "
            f"more shares, those new shares earn their own dividends, which buy even more shares. "
            f"In early years the difference is small. But over decades, this snowball effect becomes "
            f"enormous. This is why Warren Buffett says 'My wealth has come from a combination of "
            f"living in America, some lucky genes, and compound interest.' The longer you let "
            f"dividends compound, the harder your money works for you without any extra effort."
        )

        return {
            "symbol": req.symbol.upper(),
            "name": name,
            "current_price": round(current_price, 2),
            "dividend_yield": round(div_yield * 100, 2),
            "annual_dividend_per_share": round(annual_div_per_share, 2),
            "initial_shares": req.initial_shares,
            "monthly_contribution": req.monthly_contribution,
            "yearly_data": yearly_data,
            "summary_5y": get_summary(5),
            "summary_10y": get_summary(10),
            "summary_20y": get_summary(20),
            "summary_30y": get_summary(30),
            "explanation": explanation,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def formatMoney(amount: float) -> str:
    if amount >= 1_000_000:
        return f"${amount/1_000_000:.1f}M"
    if amount >= 1_000:
        return f"${amount/1_000:.0f}K"
    return f"${amount:.0f}"
