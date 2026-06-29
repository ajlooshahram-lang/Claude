"""
Options Trading Education API

Provides:
- Black-Scholes option pricing
- Simulated option trades with fake money
- Real-time P&L calculations
- Educational explanations

NO real money is ever involved. This is purely educational.
"""

import math
from datetime import datetime, timedelta
from typing import Optional

import yfinance as yf
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/options", tags=["options"])


# ─── Black-Scholes Model ─────────────────────────────────────────────────────

def norm_cdf(x: float) -> float:
    """Standard normal cumulative distribution (approximation)."""
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def black_scholes(
    S: float,       # Current stock price
    K: float,       # Strike price
    T: float,       # Time to expiry in years
    r: float,       # Risk-free rate (annualized)
    sigma: float,   # Volatility (annualized)
    option_type: str = "call",
) -> dict:
    """Calculate option price and Greeks using Black-Scholes model."""
    if T <= 0:
        # At expiry
        if option_type == "call":
            intrinsic = max(S - K, 0)
        else:
            intrinsic = max(K - S, 0)
        return {
            "price": intrinsic,
            "intrinsic_value": intrinsic,
            "time_value": 0,
            "delta": 1.0 if intrinsic > 0 else 0.0,
            "theta": 0,
            "in_the_money": intrinsic > 0,
        }

    d1 = (math.log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)

    if option_type == "call":
        price = S * norm_cdf(d1) - K * math.exp(-r * T) * norm_cdf(d2)
        delta = norm_cdf(d1)
        intrinsic = max(S - K, 0)
        in_the_money = S > K
    else:
        price = K * math.exp(-r * T) * norm_cdf(-d2) - S * norm_cdf(-d1)
        delta = norm_cdf(d1) - 1
        intrinsic = max(K - S, 0)
        in_the_money = S < K

    time_value = price - intrinsic

    # Theta (daily decay)
    theta_annual = -(S * sigma * math.exp(-0.5 * d1**2) / (2 * math.sqrt(2 * math.pi * T)))
    if option_type == "call":
        theta_annual -= r * K * math.exp(-r * T) * norm_cdf(d2)
    else:
        theta_annual += r * K * math.exp(-r * T) * norm_cdf(-d2)
    theta_daily = theta_annual / 365

    return {
        "price": round(price, 4),
        "intrinsic_value": round(intrinsic, 4),
        "time_value": round(max(time_value, 0), 4),
        "delta": round(delta, 4),
        "theta_daily": round(theta_daily, 4),
        "in_the_money": in_the_money,
    }


# ─── API Endpoints ───────────────────────────────────────────────────────────

@router.get("/chain/{symbol}")
def get_option_chain(symbol: str):
    """
    Generate a simulated option chain for education purposes.
    Uses real current stock price + calculated volatility to price options.
    """
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info
        hist = ticker.history(period="3mo")

        if hist.empty:
            raise HTTPException(status_code=404, detail=f"No data for {symbol}")

        current_price = hist["Close"].iloc[-1]
        name = info.get("shortName", symbol)

        # Calculate historical volatility
        returns = hist["Close"].pct_change().dropna()
        daily_vol = returns.std()
        annual_vol = daily_vol * math.sqrt(252)

        # Risk-free rate (approximate US Treasury)
        risk_free = 0.045

        # Generate strike prices around current price (every $5 for stocks > $50, every $2.50 otherwise)
        step = 5.0 if current_price > 50 else 2.5 if current_price > 20 else 1.0
        strikes = []
        base = round(current_price / step) * step
        for i in range(-5, 6):
            strike = base + i * step
            if strike > 0:
                strikes.append(round(strike, 2))

        # Generate expiry dates (weekly for 4 weeks, then monthly for 3 months)
        today = datetime.now()
        expiries = []
        for weeks in [1, 2, 3, 4]:
            exp = today + timedelta(weeks=weeks)
            expiries.append(exp.strftime("%Y-%m-%d"))
        for months in [2, 3, 4]:
            exp = today + timedelta(days=months * 30)
            expiries.append(exp.strftime("%Y-%m-%d"))

        # Price the first expiry (2 weeks out) for the chain display
        default_expiry = today + timedelta(weeks=2)
        T = (default_expiry - today).days / 365

        chain = []
        for strike in strikes:
            call = black_scholes(current_price, strike, T, risk_free, annual_vol, "call")
            put = black_scholes(current_price, strike, T, risk_free, annual_vol, "put")
            chain.append({
                "strike": strike,
                "call_price": call["price"],
                "call_delta": call["delta"],
                "call_itm": call["in_the_money"],
                "call_intrinsic": call["intrinsic_value"],
                "call_time_value": call["time_value"],
                "put_price": put["price"],
                "put_delta": put["delta"],
                "put_itm": put["in_the_money"],
                "put_intrinsic": put["intrinsic_value"],
                "put_time_value": put["time_value"],
            })

        return {
            "symbol": symbol.upper(),
            "name": name,
            "current_price": round(current_price, 2),
            "volatility": round(annual_vol * 100, 1),
            "risk_free_rate": risk_free,
            "expiries": expiries,
            "default_expiry": default_expiry.strftime("%Y-%m-%d"),
            "days_to_expiry": (default_expiry - today).days,
            "chain": chain,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class SimulateRequest(BaseModel):
    symbol: str
    option_type: str  # "call" or "put"
    strike: float
    days_to_expiry: int
    contracts: int = 1  # Each contract = 100 shares
    price_change_pct: Optional[float] = None  # Simulate a price move


@router.post("/simulate")
def simulate_option_trade(req: SimulateRequest):
    """
    Simulate buying an option and show what happens over time or with price changes.
    Uses real current price and calculated volatility.
    Returns educational explanation of the result.
    """
    try:
        ticker = yf.Ticker(req.symbol)
        hist = ticker.history(period="3mo")

        if hist.empty:
            raise HTTPException(status_code=404, detail=f"No data for {req.symbol}")

        current_price = hist["Close"].iloc[-1]

        # Calculate volatility
        returns = hist["Close"].pct_change().dropna()
        annual_vol = returns.std() * math.sqrt(252)
        risk_free = 0.045

        T = req.days_to_expiry / 365

        # Price at entry
        entry = black_scholes(current_price, req.strike, T, risk_free, annual_vol, req.option_type)
        entry_cost = entry["price"] * 100 * req.contracts  # Options are per 100 shares

        # Simulate scenarios
        scenarios = []

        # Scenario 1: Stock doesn't move, time passes (show time decay)
        for days_passed in [1, 3, 7, 14]:
            if days_passed >= req.days_to_expiry:
                break
            T_new = (req.days_to_expiry - days_passed) / 365
            result = black_scholes(current_price, req.strike, T_new, risk_free, annual_vol, req.option_type)
            value = result["price"] * 100 * req.contracts
            pnl = value - entry_cost
            scenarios.append({
                "label": f"Day {days_passed} (price unchanged)",
                "stock_price": round(current_price, 2),
                "option_value": round(value, 2),
                "pnl": round(pnl, 2),
                "pnl_pct": round((pnl / entry_cost) * 100, 1) if entry_cost > 0 else 0,
                "time_remaining_days": req.days_to_expiry - days_passed,
                "explanation": f"The stock didn't move but your option lost ${abs(round(pnl, 2))} because of time decay. Every day that passes, your option loses a little value — this is called theta.",
            })

        # Scenario 2: Stock moves up/down by various amounts
        for move_pct in [-10, -5, -2, 2, 5, 10]:
            new_price = current_price * (1 + move_pct / 100)
            # After 7 days
            T_7 = max((req.days_to_expiry - 7) / 365, 0.001)
            result = black_scholes(new_price, req.strike, T_7, risk_free, annual_vol, req.option_type)
            value = result["price"] * 100 * req.contracts
            pnl = value - entry_cost

            # Generate explanation
            if req.option_type == "call":
                if move_pct > 0 and pnl > 0:
                    explanation = f"The stock went up {move_pct}% and your call option gained value because a call profits when the stock rises above your strike price of ${req.strike}."
                elif move_pct > 0 and pnl < 0:
                    explanation = f"The stock went up {move_pct}% but your call still lost money. The stock didn't rise enough to overcome the time decay and the premium you paid."
                elif move_pct < 0:
                    explanation = f"The stock dropped {abs(move_pct)}% and your call lost value. Calls lose money when the stock falls because it moves further from your strike price."
                else:
                    explanation = "The stock barely moved."
            else:
                if move_pct < 0 and pnl > 0:
                    explanation = f"The stock dropped {abs(move_pct)}% and your put option gained value because a put profits when the stock falls below your strike price of ${req.strike}."
                elif move_pct < 0 and pnl < 0:
                    explanation = f"The stock dropped {abs(move_pct)}% but your put still lost money. The drop wasn't enough to overcome time decay and the premium you paid."
                elif move_pct > 0:
                    explanation = f"The stock went up {move_pct}% and your put lost value. Puts lose money when the stock rises because it moves further from your strike price."
                else:
                    explanation = "The stock barely moved."

            scenarios.append({
                "label": f"Day 7 with {move_pct:+}% move",
                "stock_price": round(new_price, 2),
                "option_value": round(value, 2),
                "pnl": round(pnl, 2),
                "pnl_pct": round((pnl / entry_cost) * 100, 1) if entry_cost > 0 else 0,
                "time_remaining_days": max(req.days_to_expiry - 7, 0),
                "explanation": explanation,
            })

        # At expiry
        if req.option_type == "call":
            expiry_value = max(current_price - req.strike, 0) * 100 * req.contracts
        else:
            expiry_value = max(req.strike - current_price, 0) * 100 * req.contracts

        expiry_pnl = expiry_value - entry_cost

        if expiry_value == 0:
            expiry_explanation = f"At expiry the option expired worthless. You lost your entire premium of ${round(entry_cost, 2)}. This is the maximum you can ever lose buying options — unlike stocks, your loss is capped at what you paid."
        else:
            expiry_explanation = f"At expiry the option was worth ${round(expiry_value, 2)} (intrinsic value only, no time value left). Your {'profit' if expiry_pnl > 0 else 'loss'} is ${abs(round(expiry_pnl, 2))}."

        scenarios.append({
            "label": "At expiry (price unchanged)",
            "stock_price": round(current_price, 2),
            "option_value": round(expiry_value, 2),
            "pnl": round(expiry_pnl, 2),
            "pnl_pct": round((expiry_pnl / entry_cost) * 100, 1) if entry_cost > 0 else 0,
            "time_remaining_days": 0,
            "explanation": expiry_explanation,
        })

        # Overall summary
        itm_label = "in the money" if entry["in_the_money"] else "out of the money"
        summary = (
            f"You bought {req.contracts} {req.option_type} contract{'s' if req.contracts > 1 else ''} "
            f"on {req.symbol.upper()} with a ${req.strike} strike price, expiring in {req.days_to_expiry} days. "
            f"This cost you ${round(entry_cost, 2)} in fake money (premium). "
            f"The option is currently {itm_label}. "
            f"The maximum you can lose is ${round(entry_cost, 2)} (the premium you paid). "
        )

        if req.option_type == "call":
            summary += f"You profit if {req.symbol.upper()} rises above ${req.strike + entry['price']:.2f} (strike + premium) before expiry."
        else:
            summary += f"You profit if {req.symbol.upper()} falls below ${req.strike - entry['price']:.2f} (strike - premium) before expiry."

        return {
            "symbol": req.symbol.upper(),
            "current_price": round(current_price, 2),
            "option_type": req.option_type,
            "strike": req.strike,
            "days_to_expiry": req.days_to_expiry,
            "contracts": req.contracts,
            "entry_price_per_share": round(entry["price"], 4),
            "total_cost": round(entry_cost, 2),
            "max_loss": round(entry_cost, 2),
            "breakeven": round(req.strike + entry["price"], 2) if req.option_type == "call" else round(req.strike - entry["price"], 2),
            "in_the_money": entry["in_the_money"],
            "intrinsic_value": round(entry["intrinsic_value"], 4),
            "time_value": round(entry["time_value"], 4),
            "delta": entry["delta"],
            "theta_daily": entry["theta_daily"],
            "scenarios": scenarios,
            "summary": summary,
            "disclaimer": "This is a SIMULATION using fake money. No real trades are placed. This is for learning only.",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/price/{symbol}")
def get_option_price(
    symbol: str,
    strike: float,
    days: int,
    option_type: str = "call",
):
    """Quick price lookup for a single option."""
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period="3mo")

        if hist.empty:
            raise HTTPException(status_code=404, detail=f"No data for {symbol}")

        current_price = hist["Close"].iloc[-1]
        returns = hist["Close"].pct_change().dropna()
        annual_vol = returns.std() * math.sqrt(252)

        T = days / 365
        result = black_scholes(current_price, strike, T, 0.045, annual_vol, option_type)

        return {
            "symbol": symbol.upper(),
            "stock_price": round(current_price, 2),
            "strike": strike,
            "days_to_expiry": days,
            "option_type": option_type,
            **result,
            "cost_per_contract": round(result["price"] * 100, 2),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
