"""
Backtesting API

Simulates a simple trading strategy on historical price data.
Strategy: Buy when 14-day trend turns green, sell when it turns red.
Position size limited to a % of total budget.

Endpoint:
    POST /api/backtest — Run a backtest simulation
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
import yfinance as yf
import numpy as np
from datetime import datetime, timedelta

router = APIRouter(prefix="/api", tags=["Backtest"])


class BacktestRequest(BaseModel):
    symbol: str
    budget: float = 10000            # Starting budget
    max_position_pct: float = 20     # Max % of budget in one trade
    period_months: int = 12          # How far back (max 24)
    trend_window: int = 14           # Days for trend calculation
    buy_threshold: float = 2.0       # Buy when trend > +2%
    sell_threshold: float = -2.0     # Sell when trend < -2%


@router.post("/backtest")
def run_backtest(req: BacktestRequest):
    """
    Simulate a trend-following strategy on historical data.

    Strategy rules:
      1. Calculate 14-day price change each day
      2. BUY when 14-day change crosses above +2% (green signal)
      3. SELL when 14-day change crosses below -2% (red signal)
      4. Never invest more than max_position_pct% of budget in one trade
      5. Must be out of position before buying again
    """
    symbol = req.symbol.upper()
    period_months = min(req.period_months, 24)

    # Fetch historical data
    try:
        ticker = yf.Ticker(symbol)
        # Fetch extra days for trend calculation warmup
        start_date = datetime.now() - timedelta(days=period_months * 30 + req.trend_window + 10)
        hist = ticker.history(start=start_date.strftime('%Y-%m-%d'))

        if hist is None or hist.empty or len(hist) < req.trend_window + 20:
            return {"error": f"Not enough historical data for {symbol}. Try a shorter period."}

        info = ticker.info
        name = info.get("shortName") or info.get("longName") or symbol
        currency = info.get("currency", "USD")
    except Exception as e:
        return {"error": f"Could not fetch data for {symbol}: {str(e)}"}

    # Trim to requested period
    cutoff = datetime.now() - timedelta(days=period_months * 30)
    prices = hist["Close"]

    # Calculate 14-day trend for each day
    trends = prices.pct_change(periods=req.trend_window) * 100  # As percentage

    # Simulation
    budget = req.budget
    position_shares = 0.0
    position_cost = 0.0
    cash = budget
    trades = []
    in_position = False

    # Only simulate within the requested period
    sim_prices = prices[prices.index >= cutoff.strftime('%Y-%m-%d')]
    sim_trends = trends[trends.index >= cutoff.strftime('%Y-%m-%d')]

    if len(sim_prices) < 10:
        return {"error": "Not enough data points for the requested period."}

    for i in range(len(sim_prices)):
        date = sim_prices.index[i]
        price = float(sim_prices.iloc[i])
        trend = float(sim_trends.iloc[i]) if i < len(sim_trends) and not np.isnan(sim_trends.iloc[i]) else 0.0

        if not in_position:
            # BUY signal: trend crosses above threshold
            if trend > req.buy_threshold:
                max_invest = cash * (req.max_position_pct / 100)
                shares = max_invest / price
                if shares > 0 and cash >= price:
                    position_shares = shares
                    position_cost = shares * price
                    cash -= position_cost
                    in_position = True
                    trades.append({
                        "type": "buy",
                        "date": str(date.date()),
                        "price": round(price, 2),
                        "shares": round(shares, 4),
                        "cost": round(position_cost, 2),
                        "trend_pct": round(trend, 2),
                    })
        else:
            # SELL signal: trend crosses below threshold
            if trend < req.sell_threshold:
                proceeds = position_shares * price
                gain = proceeds - position_cost
                cash += proceeds
                trades.append({
                    "type": "sell",
                    "date": str(date.date()),
                    "price": round(price, 2),
                    "shares": round(position_shares, 4),
                    "proceeds": round(proceeds, 2),
                    "gain_loss": round(gain, 2),
                    "gain_loss_pct": round((gain / position_cost) * 100, 2) if position_cost > 0 else 0,
                    "trend_pct": round(trend, 2),
                })
                position_shares = 0.0
                position_cost = 0.0
                in_position = False

    # Close any open position at the end
    final_price = float(sim_prices.iloc[-1])
    if in_position:
        proceeds = position_shares * final_price
        gain = proceeds - position_cost
        cash += proceeds
        trades.append({
            "type": "sell (end)",
            "date": str(sim_prices.index[-1].date()),
            "price": round(final_price, 2),
            "shares": round(position_shares, 4),
            "proceeds": round(proceeds, 2),
            "gain_loss": round(gain, 2),
            "gain_loss_pct": round((gain / position_cost) * 100, 2) if position_cost > 0 else 0,
            "trend_pct": 0,
        })

    # Results
    final_value = cash
    strategy_return = final_value - budget
    strategy_return_pct = (strategy_return / budget) * 100

    # Buy-and-hold comparison
    start_price = float(sim_prices.iloc[0])
    end_price = final_price
    bah_shares = budget / start_price
    bah_final = bah_shares * end_price
    bah_return = bah_final - budget
    bah_return_pct = (bah_return / budget) * 100

    # Trade statistics
    sell_trades = [t for t in trades if 'gain_loss' in t]
    gains = [t["gain_loss"] for t in sell_trades if t["gain_loss"] > 0]
    losses = [t["gain_loss"] for t in sell_trades if t["gain_loss"] < 0]

    biggest_gain = max(gains) if gains else 0
    biggest_loss = min(losses) if losses else 0
    win_rate = (len(gains) / len(sell_trades) * 100) if sell_trades else 0

    return {
        "symbol": symbol,
        "name": name,
        "currency": currency,
        "period_months": period_months,
        "start_date": str(sim_prices.index[0].date()),
        "end_date": str(sim_prices.index[-1].date()),
        "data_points": len(sim_prices),

        "strategy": {
            "name": f"Trend Following ({req.trend_window}-day, {req.buy_threshold}%/{req.sell_threshold}%)",
            "final_value": round(final_value, 2),
            "return": round(strategy_return, 2),
            "return_pct": round(strategy_return_pct, 2),
            "total_trades": len(trades),
            "winning_trades": len(gains),
            "losing_trades": len(losses),
            "win_rate": round(win_rate, 1),
            "biggest_gain": round(biggest_gain, 2),
            "biggest_loss": round(biggest_loss, 2),
            "max_position_pct": req.max_position_pct,
        },

        "buy_and_hold": {
            "name": "Buy and Hold",
            "final_value": round(bah_final, 2),
            "return": round(bah_return, 2),
            "return_pct": round(bah_return_pct, 2),
            "start_price": round(start_price, 2),
            "end_price": round(end_price, 2),
        },

        "comparison": {
            "strategy_beats_bah": strategy_return > bah_return,
            "difference_pct": round(strategy_return_pct - bah_return_pct, 2),
        },

        "trades": trades,
    }
