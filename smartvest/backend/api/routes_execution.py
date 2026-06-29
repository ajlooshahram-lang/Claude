"""
Order Execution Simulator (TWAP & VWAP)

Simulates institutional execution algorithms using real intraday data.
Shows theoretical savings vs single market order.
Educational only — does not place real orders.
"""

import math
from datetime import datetime

import numpy as np
import yfinance as yf
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/execution", tags=["execution"])


class ExecutionRequest(BaseModel):
    symbol: str
    shares: int
    side: str = "buy"  # buy or sell
    strategy: str = "twap"  # twap or vwap
    duration_hours: int = 4  # execution window
    dkk_rate: float = 6.85


@router.post("/simulate")
def simulate_execution(req: ExecutionRequest):
    """Simulate TWAP or VWAP execution using real intraday volume patterns."""
    try:
        ticker = yf.Ticker(req.symbol.upper())

        # Get intraday data (1-minute intervals, last 5 days)
        intraday = ticker.history(period="5d", interval="5m")
        if intraday.empty or len(intraday) < 50:
            # Fallback: use daily data with simulated intraday pattern
            daily = ticker.history(period="1mo")
            if daily.empty:
                raise HTTPException(status_code=404, detail=f"No data for {req.symbol}")
            return _simulate_from_daily(req, daily)

        # Use the most recent full trading day
        intraday = intraday.tail(78)  # ~78 five-minute bars in a trading day
        if len(intraday) < 20:
            daily = ticker.history(period="1mo")
            return _simulate_from_daily(req, daily)

        prices = intraday["Close"].values
        volumes = intraday["Volume"].values
        current_price = float(prices[-1])

        # ─── Market Order (baseline) ─────────────────────────────────────
        market_price = current_price
        market_cost = market_price * req.shares

        # ─── TWAP Execution ──────────────────────────────────────────────
        num_slices = min(req.duration_hours * 12, len(prices))  # 5-min intervals
        slice_size = req.shares / num_slices
        step = max(1, len(prices) // num_slices)

        twap_fills = []
        twap_total_cost = 0
        for i in range(0, min(len(prices), num_slices * step), step):
            fill_price = float(prices[i])
            fill_shares = slice_size
            twap_fills.append({"time_slot": i, "price": round(fill_price, 2), "shares": round(fill_shares, 2)})
            twap_total_cost += fill_price * fill_shares

        twap_avg_price = twap_total_cost / req.shares if req.shares > 0 else current_price

        # ─── VWAP Execution ──────────────────────────────────────────────
        # Weight execution by volume profile
        total_volume = float(np.sum(volumes[:num_slices * step:step])) or 1
        vwap_fills = []
        vwap_total_cost = 0

        for i in range(0, min(len(prices), num_slices * step), step):
            vol_weight = float(volumes[i]) / total_volume if total_volume > 0 else 1 / num_slices
            fill_shares = req.shares * vol_weight
            fill_price = float(prices[i])
            vwap_fills.append({"time_slot": i, "price": round(fill_price, 2), "shares": round(fill_shares, 2), "volume_weight": round(vol_weight * 100, 1)})
            vwap_total_cost += fill_price * fill_shares

        vwap_avg_price = vwap_total_cost / req.shares if req.shares > 0 else current_price

        # ─── Calculate true VWAP benchmark ────────────────────────────────
        true_vwap = float(np.sum(prices * volumes)) / float(np.sum(volumes)) if np.sum(volumes) > 0 else current_price

        # ─── Results ──────────────────────────────────────────────────────
        chosen = twap_avg_price if req.strategy == "twap" else vwap_avg_price
        chosen_cost = chosen * req.shares

        if req.side == "buy":
            savings_vs_market = (market_price - chosen) * req.shares
        else:
            savings_vs_market = (chosen - market_price) * req.shares

        savings_dkk = savings_vs_market * req.dkk_rate
        chosen_cost_dkk = chosen_cost * req.dkk_rate
        market_cost_dkk = market_cost * req.dkk_rate

        # Summary
        if savings_vs_market > 0:
            summary = (
                f"Using {req.strategy.upper()}, you would have {'bought' if req.side == 'buy' else 'sold'} "
                f"{req.shares} shares of {req.symbol.upper()} at an average price of ${chosen:.2f} "
                f"instead of ${market_price:.2f} (market order). "
                f"That saves you ${abs(savings_vs_market):.2f} ({abs(savings_dkk):.0f} DKK). "
                f"The algorithm {'spread your buying over time to avoid pushing the price up' if req.side == 'buy' else 'spread your selling to avoid pushing the price down'}."
            )
        else:
            summary = (
                f"In this case, {req.strategy.upper()} would have resulted in a slightly worse price: "
                f"${chosen:.2f} vs ${market_price:.2f} market. The difference is ${abs(savings_vs_market):.2f} "
                f"({abs(savings_dkk):.0f} DKK). This happens when price moves against you during execution. "
                f"Over many trades, algorithms still tend to save money on average by reducing market impact."
            )

        return {
            "symbol": req.symbol.upper(),
            "shares": req.shares,
            "side": req.side,
            "strategy": req.strategy,
            "duration_hours": req.duration_hours,
            "market_order": {
                "price": round(market_price, 2),
                "total_usd": round(market_cost, 2),
                "total_dkk": round(market_cost_dkk, 2),
            },
            "twap": {
                "avg_price": round(twap_avg_price, 4),
                "total_usd": round(twap_total_cost, 2),
                "total_dkk": round(twap_total_cost * req.dkk_rate, 2),
                "num_slices": len(twap_fills),
                "fills": twap_fills[:20],
            },
            "vwap": {
                "avg_price": round(vwap_avg_price, 4),
                "total_usd": round(vwap_total_cost, 2),
                "total_dkk": round(vwap_total_cost * req.dkk_rate, 2),
                "num_slices": len(vwap_fills),
                "fills": vwap_fills[:20],
                "true_vwap_benchmark": round(true_vwap, 4),
            },
            "chosen_strategy": {
                "avg_price": round(chosen, 4),
                "total_usd": round(chosen_cost, 2),
                "total_dkk": round(chosen_cost_dkk, 2),
            },
            "savings": {
                "vs_market_usd": round(savings_vs_market, 2),
                "vs_market_dkk": round(savings_dkk, 2),
                "positive": savings_vs_market > 0,
            },
            "summary": summary,
            "education": {
                "twap": "TWAP splits your order into equal pieces at regular intervals. Simple and predictable. Best when you don't know the volume pattern.",
                "vwap": "VWAP executes more shares during high-volume periods (market open, close) and fewer during quiet midday. Gets you closer to the day's average price.",
                "why_it_matters": "If you buy 100 shares all at once, your order itself can push the price up (market impact). Spreading over time reduces this. For small retail orders (<$10K) the impact is minimal, but understanding this helps you think like an institution.",
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _simulate_from_daily(req, daily):
    """Fallback when intraday data isn't available."""
    prices = daily["Close"].values[-20:]
    current_price = float(prices[-1])

    # Simulate using daily price variation
    noise = np.random.normal(0, 0.002, 12)  # Small random walk
    sim_prices = current_price * (1 + np.cumsum(noise))

    twap_price = float(np.mean(sim_prices))
    # Weight by typical intraday volume pattern (U-shaped)
    vol_pattern = np.array([1.5, 1.2, 1.0, 0.8, 0.7, 0.6, 0.6, 0.7, 0.8, 1.0, 1.3, 1.8])
    vol_weights = vol_pattern / vol_pattern.sum()
    vwap_price = float(np.sum(sim_prices * vol_weights))

    chosen = twap_price if req.strategy == "twap" else vwap_price
    savings = (current_price - chosen) * req.shares if req.side == "buy" else (chosen - current_price) * req.shares

    return {
        "symbol": req.symbol.upper(),
        "shares": req.shares,
        "side": req.side,
        "strategy": req.strategy,
        "duration_hours": req.duration_hours,
        "market_order": {"price": round(current_price, 2), "total_usd": round(current_price * req.shares, 2), "total_dkk": round(current_price * req.shares * req.dkk_rate, 2)},
        "twap": {"avg_price": round(twap_price, 4), "total_usd": round(twap_price * req.shares, 2), "total_dkk": round(twap_price * req.shares * req.dkk_rate, 2), "num_slices": 12, "fills": []},
        "vwap": {"avg_price": round(vwap_price, 4), "total_usd": round(vwap_price * req.shares, 2), "total_dkk": round(vwap_price * req.shares * req.dkk_rate, 2), "num_slices": 12, "fills": [], "true_vwap_benchmark": round(vwap_price, 4)},
        "chosen_strategy": {"avg_price": round(chosen, 4), "total_usd": round(chosen * req.shares, 2), "total_dkk": round(chosen * req.shares * req.dkk_rate, 2)},
        "savings": {"vs_market_usd": round(savings, 2), "vs_market_dkk": round(savings * req.dkk_rate, 2), "positive": savings > 0},
        "summary": f"Simulated {req.strategy.upper()} execution for {req.shares} shares of {req.symbol.upper()}. Estimated savings: ${abs(savings):.2f} ({abs(savings * req.dkk_rate):.0f} DKK).",
        "education": {"twap": "TWAP splits your order equally over time.", "vwap": "VWAP executes more during high-volume periods.", "why_it_matters": "Spreading orders reduces market impact — especially important for larger positions."},
    }
