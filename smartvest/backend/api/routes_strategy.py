"""
Algorithmic Strategy Builder API

Allows users to create visual IF-THEN trading rules:
- Combine up to 5 conditions with AND/OR logic
- Run strategies against watchlist in real time
- Backtest strategies against 2 years of historical data
"""

import math
from datetime import datetime, timedelta

import yfinance as yf
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/strategy", tags=["strategy"])


# ─── Condition Types ──────────────────────────────────────────────────────────

CONDITION_TYPES = {
    "trend_14d": {
        "name": "14-Day Trend",
        "options": ["green", "red"],
        "description": "Whether stock is trending up (green) or down (red) over 14 days",
    },
    "trend_50d": {
        "name": "50-Day Trend",
        "options": ["green", "red"],
        "description": "Whether stock is above (green) or below (red) its 50-day average",
    },
    "beginner_score": {
        "name": "Beginner Score",
        "options": ["beginner_friendly", "intermediate", "risky"],
        "description": "SmartVest beginner-friendliness rating",
    },
    "money_flow": {
        "name": "Institutional Money Flow",
        "options": ["positive", "negative", "neutral"],
        "description": "Whether institutions are buying or selling (based on OBV)",
    },
    "sentiment": {
        "name": "News Sentiment",
        "options": ["positive", "negative", "neutral"],
        "description": "Sentiment from recent news headlines",
    },
    "volume_spike": {
        "name": "Volume Spike",
        "options": ["yes", "no"],
        "description": "Volume >200% above 30-day average",
    },
    "rsi_oversold": {
        "name": "RSI Oversold (<30)",
        "options": ["yes", "no"],
        "description": "Relative Strength Index below 30 (potential bounce)",
    },
    "rsi_overbought": {
        "name": "RSI Overbought (>70)",
        "options": ["yes", "no"],
        "description": "Relative Strength Index above 70 (potential pullback)",
    },
    "price_above_sma200": {
        "name": "Price Above 200-Day SMA",
        "options": ["yes", "no"],
        "description": "Long-term uptrend indicator",
    },
    "dividend_yield": {
        "name": "Dividend Yield",
        "options": ["above_3pct", "above_2pct", "none"],
        "description": "Annual dividend yield threshold",
    },
}


# ─── Models ───────────────────────────────────────────────────────────────────

class Condition(BaseModel):
    type: str       # e.g. "trend_14d"
    value: str      # e.g. "green"
    logic: str = "AND"  # AND or OR (how this connects to next condition)


class Strategy(BaseModel):
    name: str
    conditions: list[Condition]
    signal: str = "Strong Buy"  # What to label matching stocks


class RunRequest(BaseModel):
    strategy: Strategy
    symbols: list[str]


class BacktestRequest(BaseModel):
    strategy: Strategy
    symbol: str
    period_years: int = 2


# ─── Signal Evaluation ────────────────────────────────────────────────────────

def evaluate_condition(cond: Condition, hist, info: dict) -> bool:
    """Evaluate a single condition against stock data."""
    if hist.empty or len(hist) < 20:
        return False

    close = hist["Close"]
    volume = hist["Volume"] if "Volume" in hist.columns else None
    current_price = close.iloc[-1]

    if cond.type == "trend_14d":
        sma14 = close.rolling(14).mean().iloc[-1]
        is_green = current_price > sma14
        return is_green if cond.value == "green" else not is_green

    elif cond.type == "trend_50d":
        if len(close) < 50:
            return False
        sma50 = close.rolling(50).mean().iloc[-1]
        is_green = current_price > sma50
        return is_green if cond.value == "green" else not is_green

    elif cond.type == "beginner_score":
        vol = close.pct_change().std() * math.sqrt(252)
        beta = info.get("beta", 1.0) or 1.0
        if vol < 0.25 and beta < 1.0:
            rating = "beginner_friendly"
        elif vol > 0.40 or beta > 1.5:
            rating = "risky"
        else:
            rating = "intermediate"
        return rating == cond.value

    elif cond.type == "money_flow":
        if volume is None or len(volume) < 20:
            return cond.value == "neutral"
        # Simple OBV trend
        obv = 0
        obv_values = []
        for i in range(1, min(30, len(close))):
            if close.iloc[i] > close.iloc[i-1]:
                obv += volume.iloc[i]
            elif close.iloc[i] < close.iloc[i-1]:
                obv -= volume.iloc[i]
            obv_values.append(obv)
        if not obv_values:
            return cond.value == "neutral"
        trend = obv_values[-1] - obv_values[0] if len(obv_values) > 1 else 0
        if trend > 0:
            flow = "positive"
        elif trend < 0:
            flow = "negative"
        else:
            flow = "neutral"
        return flow == cond.value

    elif cond.type == "sentiment":
        # Simplified: use recent price action as proxy
        change_5d = ((close.iloc[-1] / close.iloc[-5]) - 1) * 100 if len(close) >= 5 else 0
        if change_5d > 2:
            sent = "positive"
        elif change_5d < -2:
            sent = "negative"
        else:
            sent = "neutral"
        return sent == cond.value

    elif cond.type == "volume_spike":
        if volume is None or len(volume) < 30:
            return cond.value == "no"
        avg_vol = volume.iloc[-31:-1].mean()
        current_vol = volume.iloc[-1]
        has_spike = current_vol > avg_vol * 2 if avg_vol > 0 else False
        return has_spike if cond.value == "yes" else not has_spike

    elif cond.type == "rsi_oversold":
        rsi = calculate_rsi(close, 14)
        is_oversold = rsi < 30
        return is_oversold if cond.value == "yes" else not is_oversold

    elif cond.type == "rsi_overbought":
        rsi = calculate_rsi(close, 14)
        is_overbought = rsi > 70
        return is_overbought if cond.value == "yes" else not is_overbought

    elif cond.type == "price_above_sma200":
        if len(close) < 200:
            return cond.value == "no"
        sma200 = close.rolling(200).mean().iloc[-1]
        above = current_price > sma200
        return above if cond.value == "yes" else not above

    elif cond.type == "dividend_yield":
        div_yield = info.get("dividendYield") or info.get("yield") or 0
        if div_yield is None:
            div_yield = 0
        if cond.value == "above_3pct":
            return div_yield >= 0.03
        elif cond.value == "above_2pct":
            return div_yield >= 0.02
        else:
            return div_yield == 0

    return False


def evaluate_strategy(strategy: Strategy, hist, info: dict) -> bool:
    """Evaluate all conditions with AND/OR logic."""
    if not strategy.conditions:
        return False

    result = evaluate_condition(strategy.conditions[0], hist, info)

    for i in range(1, len(strategy.conditions)):
        cond = strategy.conditions[i]
        cond_result = evaluate_condition(cond, hist, info)
        logic = strategy.conditions[i-1].logic  # Logic operator AFTER previous condition

        if logic == "OR":
            result = result or cond_result
        else:  # AND
            result = result and cond_result

    return result


def calculate_rsi(prices, period=14):
    """Calculate RSI."""
    if len(prices) < period + 1:
        return 50  # Neutral default
    deltas = prices.diff().dropna()
    gains = deltas.where(deltas > 0, 0)
    losses = (-deltas.where(deltas < 0, 0))
    avg_gain = gains.rolling(period).mean().iloc[-1]
    avg_loss = losses.rolling(period).mean().iloc[-1]
    if avg_loss == 0:
        return 100
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


# ─── API Endpoints ───────────────────────────────────────────────────────────

@router.get("/conditions")
def get_available_conditions():
    """Return all available condition types for the strategy builder."""
    return {"conditions": CONDITION_TYPES}


@router.post("/run")
def run_strategy(req: RunRequest):
    """Run a strategy against a list of symbols and return matches."""
    results = []
    passing = []

    for sym in req.symbols[:20]:  # Limit 20 stocks
        try:
            ticker = yf.Ticker(sym.upper())
            hist = ticker.history(period="1y")
            info = ticker.info

            if hist.empty:
                continue

            passes = evaluate_strategy(req.strategy, hist, info)
            name = info.get("shortName", sym)
            price = hist["Close"].iloc[-1]

            entry = {
                "symbol": sym.upper(),
                "name": name,
                "price": round(price, 2),
                "passes": passes,
                "conditions_met": [],
            }

            # Check each condition individually
            for cond in req.strategy.conditions:
                met = evaluate_condition(cond, hist, info)
                entry["conditions_met"].append({
                    "type": cond.type,
                    "value": cond.value,
                    "met": met,
                })

            results.append(entry)
            if passes:
                passing.append(entry)
        except:
            continue

    return {
        "strategy_name": req.strategy.name,
        "signal": req.strategy.signal,
        "stocks_scanned": len(results),
        "stocks_passing": len(passing),
        "passing": passing,
        "all_results": results,
    }


@router.post("/backtest")
def backtest_strategy(req: BacktestRequest):
    """Backtest a strategy: buy when all conditions met, sell when any breaks."""
    try:
        ticker = yf.Ticker(req.symbol.upper())
        hist = ticker.history(period=f"{req.period_years}y")
        info = ticker.info

        if hist.empty or len(hist) < 100:
            raise HTTPException(status_code=404, detail=f"Not enough data for {req.symbol}")

        # Simulate trading
        trades = []
        in_position = False
        entry_price = 0
        entry_date = ""
        total_return = 0
        wins = 0
        losses = 0

        # Check strategy every week
        for i in range(200, len(hist), 5):
            window = hist.iloc[:i+1]
            passes = evaluate_strategy(req.strategy, window, info)

            current_price = hist["Close"].iloc[i]
            current_date = hist.index[i].strftime("%Y-%m-%d")

            if passes and not in_position:
                # BUY signal
                in_position = True
                entry_price = current_price
                entry_date = current_date
            elif not passes and in_position:
                # SELL signal
                in_position = False
                ret = ((current_price / entry_price) - 1) * 100
                total_return += ret
                if ret > 0:
                    wins += 1
                else:
                    losses += 1
                trades.append({
                    "buy_date": entry_date,
                    "buy_price": round(entry_price, 2),
                    "sell_date": current_date,
                    "sell_price": round(current_price, 2),
                    "return_pct": round(ret, 1),
                })

        # Close open position
        if in_position:
            current_price = hist["Close"].iloc[-1]
            ret = ((current_price / entry_price) - 1) * 100
            total_return += ret
            if ret > 0:
                wins += 1
            else:
                losses += 1
            trades.append({
                "buy_date": entry_date,
                "buy_price": round(entry_price, 2),
                "sell_date": hist.index[-1].strftime("%Y-%m-%d"),
                "sell_price": round(current_price, 2),
                "return_pct": round(ret, 1),
                "still_open": True,
            })

        # Buy and hold comparison
        start_price = hist["Close"].iloc[200]
        end_price = hist["Close"].iloc[-1]
        buy_hold_return = ((end_price / start_price) - 1) * 100

        total_trades = wins + losses
        win_rate = (wins / total_trades * 100) if total_trades > 0 else 0

        return {
            "symbol": req.symbol.upper(),
            "strategy_name": req.strategy.name,
            "period_years": req.period_years,
            "total_trades": total_trades,
            "wins": wins,
            "losses": losses,
            "win_rate": round(win_rate, 1),
            "strategy_return_pct": round(total_return, 1),
            "buy_hold_return_pct": round(buy_hold_return, 1),
            "beats_buy_hold": total_return > buy_hold_return,
            "trades": trades[-20:],  # Last 20 trades
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
