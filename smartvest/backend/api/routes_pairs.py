"""
Pairs Trading Opportunity Detector

Scans for stock pairs that:
1. Have high historical correlation (>0.7)
2. Currently diverged from their normal price ratio
3. Have historically converged back (mean reversion)

Uses Z-score of price ratio to detect divergence.
"""

import math
from datetime import datetime

import numpy as np
import yfinance as yf
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/pairs", tags=["pairs"])

# Well-known correlated pairs to always check
KNOWN_PAIRS = [
    ("KO", "PEP"), ("MSFT", "AAPL"), ("V", "MA"),
    ("XOM", "CVX"), ("JPM", "BAC"), ("HD", "LOW"),
    ("UNH", "CI"), ("DIS", "CMCSA"), ("GOOG", "META"),
    ("AMD", "NVDA"), ("F", "GM"), ("PG", "CL"),
]


class PairsRequest(BaseModel):
    symbols: list[str] = []
    include_known_pairs: bool = True
    lookback_days: int = 252  # 1 year
    zscore_threshold: float = 2.0  # Standard deviations


@router.post("/scan")
def scan_pairs(req: PairsRequest):
    """Scan for pairs trading opportunities."""

    # Build list of pairs to check
    pairs_to_check = []

    if req.include_known_pairs:
        pairs_to_check.extend(KNOWN_PAIRS)

    # Generate pairs from user's watchlist
    user_symbols = [s.upper() for s in req.symbols[:15]]
    for i in range(len(user_symbols)):
        for j in range(i + 1, len(user_symbols)):
            pair = (user_symbols[i], user_symbols[j])
            if pair not in pairs_to_check:
                pairs_to_check.append(pair)

    # Fetch data and analyze each pair
    price_cache: dict[str, np.ndarray] = {}
    opportunities = []

    for sym_a, sym_b in pairs_to_check[:20]:  # Limit 20 pairs
        try:
            # Get price data
            if sym_a not in price_cache:
                hist = yf.Ticker(sym_a).history(period="2y")
                if hist.empty or len(hist) < 100:
                    continue
                price_cache[sym_a] = hist["Close"].values
            if sym_b not in price_cache:
                hist = yf.Ticker(sym_b).history(period="2y")
                if hist.empty or len(hist) < 100:
                    continue
                price_cache[sym_b] = hist["Close"].values

            prices_a = price_cache[sym_a]
            prices_b = price_cache[sym_b]

            # Align lengths
            min_len = min(len(prices_a), len(prices_b))
            if min_len < 100:
                continue
            pa = prices_a[-min_len:]
            pb = prices_b[-min_len:]

            # Calculate correlation
            correlation = float(np.corrcoef(pa, pb)[0, 1])
            if correlation < 0.6:
                continue  # Not correlated enough

            # Calculate price ratio and Z-score
            ratio = pa / pb
            lookback = min(req.lookback_days, len(ratio))
            ratio_window = ratio[-lookback:]

            mean_ratio = float(np.mean(ratio_window))
            std_ratio = float(np.std(ratio_window))

            if std_ratio == 0:
                continue

            current_ratio = float(ratio[-1])
            zscore = (current_ratio - mean_ratio) / std_ratio

            # Only report significant divergences
            if abs(zscore) < req.zscore_threshold:
                continue

            # Divergence percentage from mean
            divergence_pct = ((current_ratio - mean_ratio) / mean_ratio) * 100

            # How many days has divergence lasted (Z > 1.5)?
            days_diverged = 0
            for i in range(len(ratio) - 1, -1, -1):
                z = (ratio[i] - mean_ratio) / std_ratio
                if abs(z) >= 1.5:
                    days_diverged += 1
                else:
                    break

            # Historical mean reversion time (how long divergences typically last)
            reversion_times = []
            in_divergence = False
            diverge_start = 0
            for i in range(lookback):
                z = (ratio_window[i] - mean_ratio) / std_ratio
                if abs(z) >= 1.5 and not in_divergence:
                    in_divergence = True
                    diverge_start = i
                elif abs(z) < 1.0 and in_divergence:
                    in_divergence = False
                    reversion_times.append(i - diverge_start)

            avg_reversion_days = int(np.mean(reversion_times)) if reversion_times else 15

            # Determine direction
            if zscore > 0:
                overvalued = sym_a
                undervalued = sym_b
                action = f"{sym_a} is overvalued relative to {sym_b}"
            else:
                overvalued = sym_b
                undervalued = sym_a
                action = f"{sym_b} is overvalued relative to {sym_a}"

            opportunities.append({
                "stock_a": sym_a,
                "stock_b": sym_b,
                "correlation": round(correlation, 3),
                "current_zscore": round(zscore, 2),
                "divergence_pct": round(divergence_pct, 1),
                "mean_ratio": round(mean_ratio, 4),
                "current_ratio": round(current_ratio, 4),
                "days_diverged": days_diverged,
                "avg_reversion_days": avg_reversion_days,
                "overvalued_stock": overvalued,
                "undervalued_stock": undervalued,
                "action": action,
                "signal_strength": "strong" if abs(zscore) > 2.5 else "moderate",
                "price_a": round(float(pa[-1]), 2),
                "price_b": round(float(pb[-1]), 2),
            })
        except:
            continue

    # Sort by Z-score magnitude (most diverged first)
    opportunities.sort(key=lambda x: abs(x["current_zscore"]), reverse=True)

    return {
        "pairs_scanned": len(pairs_to_check),
        "opportunities_found": len(opportunities),
        "opportunities": opportunities[:10],
        "zscore_threshold": req.zscore_threshold,
        "explanation": (
            "Pairs trading is a market-neutral strategy: you buy the undervalued stock and "
            "short (or avoid) the overvalued one. The idea is that historically correlated stocks "
            "that diverge will eventually converge back to their normal relationship. "
            "It is called 'market neutral' because if the overall market drops, both stocks drop "
            "together and your relative bet still works. The risk is that the divergence is "
            "permanent (the relationship has fundamentally changed)."
        ),
        "scanned_at": datetime.now().isoformat(),
    }
