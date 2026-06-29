"""
Portfolio Rebalancing Engine

Calculates:
- Target allocation based on risk profile (Conservative/Moderate/Aggressive)
- Current actual allocation by sector
- Overweight/underweight positions
- Specific rebalancing plan (what to sell, what to buy, how much)
- Tax implications on sells (Danish aktieindkomst rules)
"""

from typing import Optional
from datetime import datetime

import yfinance as yf
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/rebalance", tags=["rebalance"])


# ─── Target Allocations by Risk Profile ───────────────────────────────────────

SECTOR_CATEGORIES = {
    # Stable sectors
    "Consumer Defensive": "stable",
    "Utilities": "stable",
    "Healthcare": "stable",
    "Real Estate": "stable",
    # Growth sectors
    "Technology": "growth",
    "Communication Services": "growth",
    "Consumer Cyclical": "growth",
    "Industrials": "growth",
    # Volatile/speculative
    "Energy": "growth",
    "Basic Materials": "growth",
    "Financial Services": "growth",
}

TARGET_ALLOCATIONS = {
    "Conservative": {
        "stable": 0.55,
        "growth": 0.25,
        "cash": 0.20,
        "description": "55% stable sectors, 25% growth sectors, 20% cash",
        "max_single_stock": 0.15,  # No single stock > 15%
        "max_sector": 0.30,  # No single sector > 30%
    },
    "Moderate": {
        "stable": 0.40,
        "growth": 0.40,
        "cash": 0.20,
        "description": "40% stable sectors, 40% growth sectors, 20% cash",
        "max_single_stock": 0.20,
        "max_sector": 0.35,
    },
    "Aggressive": {
        "stable": 0.20,
        "growth": 0.60,
        "cash": 0.20,
        "description": "20% stable sectors, 60% growth sectors, 20% cash",
        "max_single_stock": 0.25,
        "max_sector": 0.40,
    },
}

# Danish tax rates for aktieindkomst
DANISH_TAX_THRESHOLD = 61000  # DKK (2024 threshold for single person)
DANISH_TAX_LOW = 0.27  # 27% on gains up to threshold
DANISH_TAX_HIGH = 0.42  # 42% on gains above threshold


# ─── Request Models ───────────────────────────────────────────────────────────

class HoldingInput(BaseModel):
    symbol: str
    shares: float
    avg_cost: float  # Average purchase price per share


class RebalanceRequest(BaseModel):
    holdings: list[HoldingInput]
    risk_profile: str  # Conservative, Moderate, Aggressive
    cash_balance: float = 0  # Current cash in portfolio (DKK)
    total_realized_gains_ytd: float = 0  # Already realized gains this year (DKK)
    currency: str = "DKK"
    dkk_usd_rate: float = 6.85  # Default DKK/USD rate


# ─── Helper Functions ─────────────────────────────────────────────────────────

def get_sector_category(sector: str) -> str:
    """Map a sector to stable/growth category."""
    return SECTOR_CATEGORIES.get(sector, "growth")


def calculate_tax_on_gain(gain_dkk: float, existing_gains_ytd: float) -> dict:
    """Calculate Danish aktieindkomst tax on a capital gain."""
    if gain_dkk <= 0:
        return {"tax": 0, "rate_applied": 0, "explanation": "No tax on losses"}

    total_after = existing_gains_ytd + gain_dkk

    if existing_gains_ytd >= DANISH_TAX_THRESHOLD:
        # All new gains at high rate
        tax = gain_dkk * DANISH_TAX_HIGH
        rate = DANISH_TAX_HIGH
        explanation = f"All at 42% (you already exceeded the {DANISH_TAX_THRESHOLD:,.0f} DKK threshold)"
    elif total_after <= DANISH_TAX_THRESHOLD:
        # All at low rate
        tax = gain_dkk * DANISH_TAX_LOW
        rate = DANISH_TAX_LOW
        explanation = f"All at 27% (within {DANISH_TAX_THRESHOLD:,.0f} DKK threshold)"
    else:
        # Split between rates
        low_portion = DANISH_TAX_THRESHOLD - existing_gains_ytd
        high_portion = gain_dkk - low_portion
        tax = low_portion * DANISH_TAX_LOW + high_portion * DANISH_TAX_HIGH
        rate = tax / gain_dkk
        explanation = f"Split: {low_portion:,.0f} DKK at 27% + {high_portion:,.0f} DKK at 42%"

    return {
        "tax": round(tax, 2),
        "rate_applied": round(rate, 4),
        "explanation": explanation,
    }


# ─── API Endpoints ───────────────────────────────────────────────────────────

@router.post("/analyze")
def analyze_and_rebalance(req: RebalanceRequest):
    """
    Full rebalancing analysis:
    1. Calculate current allocation
    2. Compare to target
    3. Generate specific sell/buy plan
    4. Include tax impact on sells
    """
    risk_profile = req.risk_profile
    if risk_profile not in TARGET_ALLOCATIONS:
        raise HTTPException(status_code=400, detail=f"Invalid risk profile: {risk_profile}")

    target = TARGET_ALLOCATIONS[risk_profile]

    # ─── Step 1: Fetch current prices and sectors ─────────────────────────────
    holdings_data = []
    total_invested_value = 0
    sector_values = {}
    category_values = {"stable": 0, "growth": 0}

    for holding in req.holdings:
        try:
            ticker = yf.Ticker(holding.symbol)
            info = ticker.info
            hist = ticker.history(period="5d")

            if hist.empty:
                continue

            current_price = hist["Close"].iloc[-1]
            sector = info.get("sector", "Unknown")
            name = info.get("shortName", holding.symbol)
            currency = info.get("currency", "USD")

            # Convert to DKK if USD
            price_dkk = current_price * req.dkk_usd_rate if currency == "USD" else current_price
            cost_dkk = holding.avg_cost * req.dkk_usd_rate if currency == "USD" else holding.avg_cost

            current_value = price_dkk * holding.shares
            cost_basis = cost_dkk * holding.shares
            unrealized_gain = current_value - cost_basis
            gain_pct = ((current_value / cost_basis) - 1) * 100 if cost_basis > 0 else 0

            category = get_sector_category(sector)

            holdings_data.append({
                "symbol": holding.symbol.upper(),
                "name": name,
                "sector": sector,
                "category": category,
                "shares": holding.shares,
                "current_price": round(current_price, 2),
                "current_price_dkk": round(price_dkk, 2),
                "current_value_dkk": round(current_value, 2),
                "cost_basis_dkk": round(cost_basis, 2),
                "unrealized_gain_dkk": round(unrealized_gain, 2),
                "gain_pct": round(gain_pct, 1),
                "currency": currency,
            })

            total_invested_value += current_value

            # Track by sector
            sector_values[sector] = sector_values.get(sector, 0) + current_value

            # Track by category
            category_values[category] = category_values.get(category, 0) + current_value

        except Exception:
            continue

    if not holdings_data:
        return {
            "error": "No valid holdings found",
            "holdings": [],
            "rebalancing_plan": [],
        }

    # ─── Step 2: Calculate total portfolio value ──────────────────────────────
    total_portfolio = total_invested_value + req.cash_balance
    cash_pct = req.cash_balance / total_portfolio if total_portfolio > 0 else 0

    # ─── Step 3: Current allocation vs target ─────────────────────────────────
    current_allocation = {
        "stable": category_values["stable"] / total_portfolio if total_portfolio > 0 else 0,
        "growth": category_values["growth"] / total_portfolio if total_portfolio > 0 else 0,
        "cash": cash_pct,
    }

    allocation_diff = {
        "stable": current_allocation["stable"] - target["stable"],
        "growth": current_allocation["growth"] - target["growth"],
        "cash": current_allocation["cash"] - target["cash"],
    }

    # ─── Step 4: Identify overweight/underweight positions ────────────────────
    overweight = []
    underweight_sectors = []

    for h in holdings_data:
        weight = h["current_value_dkk"] / total_portfolio if total_portfolio > 0 else 0
        h["weight_pct"] = round(weight * 100, 1)

        if weight > target["max_single_stock"]:
            overweight.append({
                "symbol": h["symbol"],
                "name": h["name"],
                "current_weight": round(weight * 100, 1),
                "max_weight": round(target["max_single_stock"] * 100, 1),
                "excess_pct": round((weight - target["max_single_stock"]) * 100, 1),
                "excess_value_dkk": round((weight - target["max_single_stock"]) * total_portfolio, 2),
            })

    # Check sector concentration
    for sector, value in sector_values.items():
        sector_weight = value / total_portfolio if total_portfolio > 0 else 0
        if sector_weight > target["max_sector"]:
            overweight.append({
                "symbol": f"SECTOR:{sector}",
                "name": f"{sector} sector",
                "current_weight": round(sector_weight * 100, 1),
                "max_weight": round(target["max_sector"] * 100, 1),
                "excess_pct": round((sector_weight - target["max_sector"]) * 100, 1),
                "excess_value_dkk": round((sector_weight - target["max_sector"]) * total_portfolio, 2),
            })

    # ─── Step 5: Generate rebalancing plan ────────────────────────────────────
    rebalancing_plan = []
    total_tax_impact = 0

    # Sort holdings by how much they need to be trimmed (overweight first)
    sorted_holdings = sorted(
        holdings_data,
        key=lambda h: h["current_value_dkk"] / total_portfolio - target["max_single_stock"],
        reverse=True,
    )

    # Sells — trim overweight positions
    sells = []
    for h in sorted_holdings:
        weight = h["current_value_dkk"] / total_portfolio
        category = h["category"]

        # Should sell if: individual position too large OR category overweight
        should_sell = False
        sell_amount = 0

        if weight > target["max_single_stock"]:
            # Position too concentrated
            excess = (weight - target["max_single_stock"]) * total_portfolio
            sell_amount = excess
            should_sell = True
            reason = f"Position is {h['weight_pct']}% of portfolio (max {target['max_single_stock']*100:.0f}%)"
        elif allocation_diff.get(category, 0) > 0.05:
            # Category overweight by more than 5%
            category_excess = allocation_diff[category] * total_portfolio
            # Sell proportional share from this holding
            category_total = category_values[category]
            holding_share = h["current_value_dkk"] / category_total if category_total > 0 else 0
            sell_amount = category_excess * holding_share * 0.5  # Sell half the excess
            should_sell = sell_amount > 500  # Min 500 DKK to bother
            reason = f"{category.capitalize()} sector overweight by {allocation_diff[category]*100:.1f}%"

        if should_sell and sell_amount > 0:
            # Calculate shares to sell
            shares_to_sell = sell_amount / h["current_price_dkk"] if h["current_price_dkk"] > 0 else 0
            shares_to_sell = min(shares_to_sell, h["shares"] * 0.8)  # Never sell more than 80%
            shares_to_sell = round(shares_to_sell, 2)

            if shares_to_sell <= 0:
                continue

            actual_sell_value = shares_to_sell * h["current_price_dkk"]

            # Tax calculation on the gain portion
            cost_per_share = h["cost_basis_dkk"] / h["shares"] if h["shares"] > 0 else 0
            gain_on_sell = (h["current_price_dkk"] - cost_per_share) * shares_to_sell
            tax_info = calculate_tax_on_gain(
                max(gain_on_sell, 0),
                req.total_realized_gains_ytd + total_tax_impact,
            )
            total_tax_impact += tax_info["tax"]

            sells.append({
                "action": "SELL",
                "symbol": h["symbol"],
                "name": h["name"],
                "shares": shares_to_sell,
                "value_dkk": round(actual_sell_value, 2),
                "reason": reason,
                "gain_on_sell_dkk": round(gain_on_sell, 2),
                "tax_dkk": tax_info["tax"],
                "tax_rate": tax_info["rate_applied"],
                "tax_explanation": tax_info["explanation"],
                "net_after_tax_dkk": round(actual_sell_value - tax_info["tax"], 2),
                "priority": "high" if weight > target["max_single_stock"] else "medium",
            })

    # Calculate freed cash from sells
    freed_cash = sum(s["net_after_tax_dkk"] for s in sells)
    available_for_buys = freed_cash

    # Buys — invest in underweight categories
    buys = []
    for category in ["stable", "growth"]:
        diff = allocation_diff.get(category, 0)
        if diff < -0.05:  # Underweight by more than 5%
            buy_amount = min(abs(diff) * total_portfolio, available_for_buys * 0.5)
            if buy_amount > 500:
                # Suggest sector ETFs for simplicity
                if category == "stable":
                    suggestions = [
                        {"symbol": "VHT", "name": "Vanguard Health Care ETF", "sector": "Healthcare"},
                        {"symbol": "VPU", "name": "Vanguard Utilities ETF", "sector": "Utilities"},
                        {"symbol": "VDC", "name": "Vanguard Consumer Staples ETF", "sector": "Consumer Defensive"},
                    ]
                else:
                    suggestions = [
                        {"symbol": "VGT", "name": "Vanguard Info Tech ETF", "sector": "Technology"},
                        {"symbol": "VOX", "name": "Vanguard Communication Services ETF", "sector": "Communication Services"},
                        {"symbol": "VCR", "name": "Vanguard Consumer Discretionary ETF", "sector": "Consumer Cyclical"},
                    ]

                per_suggestion = buy_amount / len(suggestions)
                for sug in suggestions:
                    buys.append({
                        "action": "BUY",
                        "symbol": sug["symbol"],
                        "name": sug["name"],
                        "value_dkk": round(per_suggestion, 2),
                        "reason": f"{category.capitalize()} sectors underweight by {abs(diff)*100:.1f}%. {sug['sector']} adds diversification.",
                        "sector": sug["sector"],
                        "priority": "high" if abs(diff) > 0.10 else "medium",
                    })
                available_for_buys -= buy_amount

    # Cash adjustment
    cash_diff = allocation_diff.get("cash", 0)
    cash_action = None
    if cash_diff < -0.05:
        # Need more cash
        cash_action = {
            "action": "HOLD_CASH",
            "amount_dkk": round(abs(cash_diff) * total_portfolio, 2),
            "reason": f"You should hold more cash ({target['cash']*100:.0f}% target). Keep {round(abs(cash_diff)*total_portfolio):,.0f} DKK uninvested as a safety buffer.",
        }
    elif cash_diff > 0.10:
        # Too much cash
        cash_action = {
            "action": "DEPLOY_CASH",
            "amount_dkk": round(cash_diff * total_portfolio * 0.5, 2),
            "reason": f"You have excess cash ({current_allocation['cash']*100:.1f}% vs {target['cash']*100:.0f}% target). Consider investing {round(cash_diff*total_portfolio*0.5):,.0f} DKK into underweight sectors.",
        }

    rebalancing_plan = sells + buys

    # ─── Step 6: Build sector breakdown ───────────────────────────────────────
    sector_breakdown = []
    for sector, value in sorted(sector_values.items(), key=lambda x: x[1], reverse=True):
        pct = value / total_portfolio * 100 if total_portfolio > 0 else 0
        sector_breakdown.append({
            "sector": sector,
            "category": get_sector_category(sector),
            "value_dkk": round(value, 2),
            "weight_pct": round(pct, 1),
        })

    # ─── Build response ──────────────────────────────────────────────────────
    # Overall health score (0-100)
    deviation = (
        abs(allocation_diff["stable"]) +
        abs(allocation_diff["growth"]) +
        abs(allocation_diff["cash"])
    )
    health_score = max(0, round(100 - deviation * 200))

    return {
        "risk_profile": risk_profile,
        "target_allocation": {
            "stable_pct": target["stable"] * 100,
            "growth_pct": target["growth"] * 100,
            "cash_pct": target["cash"] * 100,
            "description": target["description"],
            "max_single_stock_pct": target["max_single_stock"] * 100,
            "max_sector_pct": target["max_sector"] * 100,
        },
        "current_allocation": {
            "stable_pct": round(current_allocation["stable"] * 100, 1),
            "growth_pct": round(current_allocation["growth"] * 100, 1),
            "cash_pct": round(current_allocation["cash"] * 100, 1),
        },
        "allocation_diff": {
            "stable_pct": round(allocation_diff["stable"] * 100, 1),
            "growth_pct": round(allocation_diff["growth"] * 100, 1),
            "cash_pct": round(allocation_diff["cash"] * 100, 1),
        },
        "total_portfolio_dkk": round(total_portfolio, 2),
        "total_invested_dkk": round(total_invested_value, 2),
        "cash_balance_dkk": round(req.cash_balance, 2),
        "health_score": health_score,
        "holdings": holdings_data,
        "sector_breakdown": sector_breakdown,
        "overweight_positions": overweight,
        "rebalancing_plan": rebalancing_plan,
        "cash_action": cash_action,
        "tax_summary": {
            "total_tax_on_sells_dkk": round(total_tax_impact, 2),
            "existing_gains_ytd_dkk": req.total_realized_gains_ytd,
            "threshold_dkk": DANISH_TAX_THRESHOLD,
            "low_rate": DANISH_TAX_LOW,
            "high_rate": DANISH_TAX_HIGH,
            "warning": "Tax estimates are approximations based on Danish aktieindkomst rules. Consult a tax advisor for exact figures.",
        },
        "summary": _generate_summary(
            risk_profile, allocation_diff, overweight, len(sells), len(buys),
            total_tax_impact, health_score,
        ),
    }


def _generate_summary(
    profile: str, diff: dict, overweight: list, sell_count: int,
    buy_count: int, tax: float, health: int,
) -> str:
    """Generate a plain English summary of the rebalancing analysis."""
    parts = []

    if health >= 80:
        parts.append(f"Your portfolio is well-balanced for a {profile} investor (health score: {health}/100).")
    elif health >= 50:
        parts.append(f"Your portfolio is somewhat off-balance (health score: {health}/100).")
    else:
        parts.append(f"Your portfolio needs significant rebalancing (health score: {health}/100).")

    if diff["stable"] > 0.05:
        parts.append(f"You are overweight in stable sectors by {diff['stable']*100:.1f}%.")
    elif diff["stable"] < -0.05:
        parts.append(f"You are underweight in stable sectors by {abs(diff['stable'])*100:.1f}%.")

    if diff["growth"] > 0.05:
        parts.append(f"You are overweight in growth sectors by {diff['growth']*100:.1f}%.")
    elif diff["growth"] < -0.05:
        parts.append(f"You are underweight in growth sectors by {abs(diff['growth'])*100:.1f}%.")

    if overweight:
        stock_ow = [o for o in overweight if not o["symbol"].startswith("SECTOR:")]
        if stock_ow:
            names = ", ".join(o["symbol"] for o in stock_ow[:3])
            parts.append(f"Individual positions too concentrated: {names}.")

    if sell_count > 0 or buy_count > 0:
        parts.append(f"Recommended actions: {sell_count} sell{'s' if sell_count != 1 else ''} and {buy_count} buy{'s' if buy_count != 1 else ''}.")

    if tax > 0:
        parts.append(f"Estimated tax on recommended sells: {tax:,.0f} DKK. Consider spreading sells across tax years if the amount is large.")

    return " ".join(parts)


@router.get("/targets/{risk_profile}")
def get_target_allocation(risk_profile: str):
    """Get target allocation for a given risk profile."""
    if risk_profile not in TARGET_ALLOCATIONS:
        raise HTTPException(status_code=400, detail=f"Invalid profile: {risk_profile}. Use Conservative, Moderate, or Aggressive.")

    target = TARGET_ALLOCATIONS[risk_profile]
    return {
        "risk_profile": risk_profile,
        "stable_pct": target["stable"] * 100,
        "growth_pct": target["growth"] * 100,
        "cash_pct": target["cash"] * 100,
        "description": target["description"],
        "max_single_stock_pct": target["max_single_stock"] * 100,
        "max_sector_pct": target["max_sector"] * 100,
        "sector_categories": SECTOR_CATEGORIES,
    }
