"""
Institutional Money Flow API

Analyzes institutional buying/selling signals using:
  1. Institutional holders data (from Yahoo Finance / 13F filings)
  2. Volume-weighted price movement (proxy for smart money)
  3. On-Balance Volume (OBV) divergence — a classic institutional signal

Endpoint:
    POST /api/money-flow — Analyze money flow for a list of stocks
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional
import yfinance as yf
import numpy as np

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from market_data.cache import get as cache_get, set as cache_set

router = APIRouter(prefix="/api", tags=["Money Flow"])


class FlowRequest(BaseModel):
    symbols: List[str]


class MoneyFlowResult(BaseModel):
    symbol: str
    name: str
    currency: str
    # Institutional data
    institutional_ownership_pct: Optional[float]
    institutional_holders_count: Optional[int]
    # Volume flow analysis (30 days)
    avg_volume_30d: int
    recent_volume_ratio: float         # Current vs 30-day avg (>1 = above normal)
    volume_trend: str                   # "accumulation", "distribution", "neutral"
    # OBV signal (on-balance volume)
    obv_signal: str                     # "buying", "selling", "neutral"
    obv_explanation: str
    # Net flow estimate
    net_flow: str                       # "net_buying", "net_selling", "neutral"
    flow_strength: float                # 0-100
    # Warning flag
    warning: Optional[str]             # Set if price stable + institutional selling
    # Bar chart data (last 5 weeks of relative volume)
    weekly_flow: List[dict]            # [{week, volume_ratio, direction}]


@router.post("/money-flow")
def analyze_money_flow(req: FlowRequest):
    """
    Analyze institutional money flow signals for watchlist stocks.
    """
    if len(req.symbols) > 15:
        req.symbols = req.symbols[:15]

    results = []
    for symbol in req.symbols:
        sym = symbol.upper().strip()
        cache_key = f"flow:{sym}"
        cached = cache_get(cache_key)
        if cached:
            results.append(cached)
            continue

        data = _analyze_flow(sym)
        if data:
            cache_set(cache_key, data, ttl=1800)  # 30 min cache
            results.append(data)

    # Sort: warnings first, then by flow strength
    results.sort(key=lambda x: (0 if x.get("warning") else 1, -(x.get("flow_strength") or 0)))

    return {
        "count": len(results),
        "results": results,
        "note": "Institutional flow is inferred from volume patterns and public filings. This is a signal, not certainty.",
    }


def _analyze_flow(symbol: str) -> Optional[dict]:
    """Full money flow analysis for one stock."""
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info
        hist = ticker.history(period="3mo")

        if hist is None or hist.empty or len(hist) < 30:
            return None

        name = info.get("shortName") or info.get("longName") or symbol
        currency = info.get("currency", "USD")

        closes = hist["Close"].values
        volumes = hist["Volume"].values

        # ─── Institutional Ownership ──────────────────────────────────
        inst_pct = info.get("heldPercentInstitutions")
        if inst_pct:
            inst_pct = round(inst_pct * 100, 1)
        inst_count = info.get("institutionCount") or info.get("numberOfInstitutionalHolders")

        # ─── Volume Analysis (30 days) ───────────────────────────────
        avg_vol_30d = int(np.mean(volumes[-30:])) if len(volumes) >= 30 else int(np.mean(volumes))
        recent_vol = int(np.mean(volumes[-5:])) if len(volumes) >= 5 else int(volumes[-1])
        vol_ratio = round(recent_vol / max(avg_vol_30d, 1), 2)

        # Volume trend: is recent volume on up days or down days?
        daily_returns = np.diff(closes[-30:])
        daily_volumes = volumes[-30:][:len(daily_returns)]

        up_volume = sum(v for r, v in zip(daily_returns, daily_volumes) if r > 0)
        down_volume = sum(v for r, v in zip(daily_returns, daily_volumes) if r < 0)
        total_vol = up_volume + down_volume

        if total_vol > 0:
            up_pct = up_volume / total_vol
            if up_pct > 0.6:
                volume_trend = "accumulation"
            elif up_pct < 0.4:
                volume_trend = "distribution"
            else:
                volume_trend = "neutral"
        else:
            volume_trend = "neutral"

        # ─── OBV (On-Balance Volume) Signal ──────────────────────────
        # OBV: cumulative volume, adding on up days, subtracting on down days
        obv = [0.0]
        for i in range(1, len(closes)):
            if closes[i] > closes[i-1]:
                obv.append(obv[-1] + volumes[i])
            elif closes[i] < closes[i-1]:
                obv.append(obv[-1] - volumes[i])
            else:
                obv.append(obv[-1])

        # OBV trend over last 14 days vs price trend
        obv_recent = obv[-14:]
        price_recent = closes[-14:]
        obv_direction = "up" if obv_recent[-1] > obv_recent[0] else "down"
        price_direction = "up" if price_recent[-1] > price_recent[0] else "down"

        if obv_direction == "up" and price_direction == "up":
            obv_signal = "buying"
            obv_explanation = "Volume confirms the price rise — institutional buying supports the uptrend."
        elif obv_direction == "up" and price_direction == "down":
            obv_signal = "buying"
            obv_explanation = "Smart money is accumulating: volume is flowing IN despite the price dropping. Insiders may be buying the dip."
        elif obv_direction == "down" and price_direction == "up":
            obv_signal = "selling"
            obv_explanation = "Warning: price is rising but volume is flowing OUT. Institutions may be selling into retail buying — a potential bull trap."
        else:
            obv_signal = "selling"
            obv_explanation = "Volume confirms the decline — institutional selling is pushing the price down."

        # ─── Net Flow Estimate ───────────────────────────────────────
        signals = []
        if volume_trend == "accumulation": signals.append(1)
        elif volume_trend == "distribution": signals.append(-1)
        else: signals.append(0)

        if obv_signal == "buying": signals.append(1)
        elif obv_signal == "selling": signals.append(-1)
        else: signals.append(0)

        if vol_ratio > 1.5: signals.append(1 if volume_trend == "accumulation" else -1)

        avg_signal = sum(signals) / len(signals) if signals else 0
        if avg_signal > 0.3:
            net_flow = "net_buying"
        elif avg_signal < -0.3:
            net_flow = "net_selling"
        else:
            net_flow = "neutral"

        flow_strength = round(abs(avg_signal) * 100, 1)

        # ─── Warning: Price stable + institutional selling ───────────
        warning = None
        price_change_30d = ((closes[-1] - closes[-30]) / closes[-30]) * 100 if len(closes) >= 30 else 0
        if net_flow == "net_selling" and abs(price_change_30d) < 5:
            warning = (
                f"Institutional investors appear to be selling {name} "
                f"while the price has barely moved ({price_change_30d:+.1f}% over 30 days). "
                f"This is a classic early warning: smart money exits before the drop becomes visible to everyone."
            )

        # ─── Weekly flow bars (last 5 weeks) ─────────────────────────
        weekly_flow = []
        for week in range(5):
            start_idx = max(0, len(volumes) - (week + 1) * 5)
            end_idx = max(0, len(volumes) - week * 5)
            week_vol = int(np.mean(volumes[start_idx:end_idx])) if end_idx > start_idx else 0
            week_ratio = round(week_vol / max(avg_vol_30d, 1), 2)
            week_returns = closes[start_idx:end_idx]
            direction = "up" if len(week_returns) >= 2 and week_returns[-1] > week_returns[0] else "down"
            weekly_flow.append({
                "week": 5 - week,
                "volume_ratio": week_ratio,
                "direction": direction,
            })
        weekly_flow.reverse()

        return {
            "symbol": symbol,
            "name": name,
            "currency": currency,
            "institutional_ownership_pct": inst_pct,
            "institutional_holders_count": inst_count,
            "avg_volume_30d": avg_vol_30d,
            "recent_volume_ratio": vol_ratio,
            "volume_trend": volume_trend,
            "obv_signal": obv_signal,
            "obv_explanation": obv_explanation,
            "net_flow": net_flow,
            "flow_strength": flow_strength,
            "warning": warning,
            "weekly_flow": weekly_flow,
        }

    except Exception:
        return None
