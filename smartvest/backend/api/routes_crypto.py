"""
Cryptocurrency API

Provides:
- Live prices for top 20 cryptos by market cap (via CoinGecko free API)
- Beginner scoring adapted for crypto (market cap, age, liquidity, volatility)
- Crypto watchlist support
"""

import math
from datetime import datetime

import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/crypto", tags=["crypto"])

COINGECKO_BASE = "https://api.coingecko.com/api/v3"

# ─── Crypto Age Data (approximate launch years) ───────────────────────────────

CRYPTO_LAUNCH_YEARS = {
    "bitcoin": 2009,
    "ethereum": 2015,
    "tether": 2014,
    "binancecoin": 2017,
    "solana": 2020,
    "ripple": 2012,
    "usd-coin": 2018,
    "staked-ether": 2020,
    "dogecoin": 2013,
    "cardano": 2017,
    "tron": 2017,
    "avalanche-2": 2020,
    "polkadot": 2020,
    "chainlink": 2017,
    "polygon": 2017,
    "shiba-inu": 2020,
    "litecoin": 2011,
    "bitcoin-cash": 2017,
    "uniswap": 2020,
    "stellar": 2014,
}


# ─── Beginner Scoring ─────────────────────────────────────────────────────────

def score_crypto(coin: dict) -> dict:
    """
    Score a cryptocurrency for beginners (0-10).

    Factors:
    - Market Cap Size (30%): larger = safer
    - Age (20%): older = more established
    - Liquidity / 24h Volume (25%): higher = easier to trade
    - Volatility / 7d/30d change (25%): lower = less risky
    """
    scores = {}
    explanations = []

    # 1. Market Cap (30%)
    mcap = coin.get("market_cap", 0) or 0
    if mcap > 500_000_000_000:  # >$500B
        scores["market_cap"] = 10
        explanations.append("Massive market cap — one of the most established cryptos.")
    elif mcap > 100_000_000_000:  # >$100B
        scores["market_cap"] = 8
        explanations.append("Very large market cap — relatively stable for crypto.")
    elif mcap > 10_000_000_000:  # >$10B
        scores["market_cap"] = 6
    elif mcap > 1_000_000_000:  # >$1B
        scores["market_cap"] = 4
        explanations.append("Mid-cap crypto — more volatile than large caps.")
    else:
        scores["market_cap"] = 2
        explanations.append("Small market cap — extremely volatile and risky.")

    # 2. Age (20%)
    coin_id = coin.get("id", "")
    launch_year = CRYPTO_LAUNCH_YEARS.get(coin_id)
    if launch_year:
        age = datetime.now().year - launch_year
        if age >= 10:
            scores["age"] = 10
            explanations.append(f"Established since {launch_year} ({age} years) — survived multiple cycles.")
        elif age >= 5:
            scores["age"] = 7
        elif age >= 3:
            scores["age"] = 4
        else:
            scores["age"] = 2
            explanations.append(f"Relatively new (since {launch_year}) — unproven long-term.")
    else:
        scores["age"] = 4

    # 3. Liquidity (25%)
    volume = coin.get("total_volume", 0) or 0
    if volume > 50_000_000_000:
        scores["liquidity"] = 10
    elif volume > 10_000_000_000:
        scores["liquidity"] = 8
    elif volume > 1_000_000_000:
        scores["liquidity"] = 6
        explanations.append("Good 24h trading volume — easy to buy and sell.")
    elif volume > 100_000_000:
        scores["liquidity"] = 4
    else:
        scores["liquidity"] = 2
        explanations.append("Low trading volume — may be hard to sell quickly.")

    # 4. Volatility (25%) — based on 7d and 30d price changes
    change_7d = abs(coin.get("price_change_percentage_7d_in_currency", 0) or 0)
    change_30d = abs(coin.get("price_change_percentage_30d_in_currency", 0) or 0)
    avg_change = (change_7d + change_30d / 4) / 2  # Normalize 30d to weekly scale

    if avg_change < 3:
        scores["volatility"] = 9
        explanations.append("Unusually stable for crypto (likely a stablecoin).")
    elif avg_change < 8:
        scores["volatility"] = 7
    elif avg_change < 15:
        scores["volatility"] = 5
        explanations.append("Moderate crypto volatility — expect significant swings.")
    elif avg_change < 25:
        scores["volatility"] = 3
    else:
        scores["volatility"] = 1
        explanations.append("Extremely volatile — can gain or lose 20%+ in a week.")

    # Weighted total
    weights = {"market_cap": 0.30, "age": 0.20, "liquidity": 0.25, "volatility": 0.25}
    total = sum(scores.get(k, 4) * w for k, w in weights.items())
    total = round(total, 1)

    # Cap at 7 for crypto (they're all riskier than stocks)
    if total > 7 and coin_id not in ("tether", "usd-coin"):
        total = 7.0

    if total >= 6:
        label = "Lower Risk (for crypto)"
        rating = "yellow"  # Still yellow, never green for crypto
    elif total >= 4:
        label = "Moderate Risk"
        rating = "yellow"
    else:
        label = "High Risk"
        rating = "red"

    return {
        "total_score": total,
        "label": label,
        "rating": rating,
        "breakdown": scores,
        "explanations": explanations[:4],
    }


# ─── API Endpoints ───────────────────────────────────────────────────────────

@router.get("/top")
def get_top_cryptos():
    """Get top 20 cryptos by market cap with live prices and beginner scores."""
    try:
        url = f"{COINGECKO_BASE}/coins/markets"
        params = {
            "vs_currency": "usd",
            "order": "market_cap_desc",
            "per_page": 20,
            "page": 1,
            "sparkline": False,
            "price_change_percentage": "1h,24h,7d,30d",
        }
        resp = requests.get(url, params=params, timeout=15)

        if resp.status_code == 429:
            # Rate limited — return cached/fallback data
            return _get_fallback_data()

        if resp.status_code != 200:
            return _get_fallback_data()

        coins = resp.json()
        results = []

        for coin in coins:
            beginner_score = score_crypto(coin)
            results.append({
                "id": coin.get("id"),
                "symbol": (coin.get("symbol") or "").upper(),
                "name": coin.get("name"),
                "image": coin.get("image"),
                "current_price": coin.get("current_price"),
                "market_cap": coin.get("market_cap"),
                "market_cap_rank": coin.get("market_cap_rank"),
                "total_volume": coin.get("total_volume"),
                "price_change_1h": coin.get("price_change_percentage_1h_in_currency"),
                "price_change_24h": coin.get("price_change_percentage_24h"),
                "price_change_7d": coin.get("price_change_percentage_7d_in_currency"),
                "price_change_30d": coin.get("price_change_percentage_30d_in_currency"),
                "ath": coin.get("ath"),
                "ath_change_pct": coin.get("ath_change_percentage"),
                "beginner_score": beginner_score,
            })

        return {
            "cryptos": results,
            "updated_at": datetime.now().isoformat(),
            "source": "CoinGecko",
            "warning": "Cryptocurrencies are significantly more volatile than stocks. They can lose 50%+ of their value in days. They are NOT suitable for Conservative risk profiles.",
        }
    except Exception as e:
        return _get_fallback_data()


@router.get("/coin/{coin_id}")
def get_coin_detail(coin_id: str):
    """Get detailed info for a single cryptocurrency."""
    try:
        url = f"{COINGECKO_BASE}/coins/{coin_id}"
        params = {
            "localization": False,
            "tickers": False,
            "community_data": False,
            "developer_data": False,
        }
        resp = requests.get(url, params=params, timeout=15)

        if resp.status_code != 200:
            raise HTTPException(status_code=404, detail=f"Coin not found: {coin_id}")

        data = resp.json()
        market = data.get("market_data", {})

        return {
            "id": data.get("id"),
            "symbol": (data.get("symbol") or "").upper(),
            "name": data.get("name"),
            "description": (data.get("description", {}).get("en", "") or "")[:500],
            "image": data.get("image", {}).get("large"),
            "current_price": market.get("current_price", {}).get("usd"),
            "market_cap": market.get("market_cap", {}).get("usd"),
            "market_cap_rank": data.get("market_cap_rank"),
            "total_volume": market.get("total_volume", {}).get("usd"),
            "price_change_24h": market.get("price_change_percentage_24h"),
            "price_change_7d": market.get("price_change_percentage_7d"),
            "price_change_30d": market.get("price_change_percentage_30d"),
            "ath": market.get("ath", {}).get("usd"),
            "ath_change_pct": market.get("ath_change_percentage", {}).get("usd"),
            "atl": market.get("atl", {}).get("usd"),
            "circulating_supply": market.get("circulating_supply"),
            "max_supply": market.get("max_supply"),
            "genesis_date": data.get("genesis_date"),
            "categories": data.get("categories", [])[:5],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _get_fallback_data():
    """Return static fallback data when CoinGecko is rate-limited."""
    fallback = [
        {"id": "bitcoin", "symbol": "BTC", "name": "Bitcoin", "current_price": 67500, "market_cap": 1320000000000, "market_cap_rank": 1, "total_volume": 28000000000, "price_change_24h": 1.2, "price_change_7d": 3.5, "price_change_30d": 8.0},
        {"id": "ethereum", "symbol": "ETH", "name": "Ethereum", "current_price": 3500, "market_cap": 420000000000, "market_cap_rank": 2, "total_volume": 15000000000, "price_change_24h": 0.8, "price_change_7d": 2.1, "price_change_30d": 5.0},
        {"id": "tether", "symbol": "USDT", "name": "Tether", "current_price": 1.0, "market_cap": 110000000000, "market_cap_rank": 3, "total_volume": 50000000000, "price_change_24h": 0.0, "price_change_7d": 0.0, "price_change_30d": 0.0},
        {"id": "solana", "symbol": "SOL", "name": "Solana", "current_price": 175, "market_cap": 78000000000, "market_cap_rank": 4, "total_volume": 3000000000, "price_change_24h": 2.5, "price_change_7d": 5.0, "price_change_30d": 12.0},
        {"id": "binancecoin", "symbol": "BNB", "name": "BNB", "current_price": 600, "market_cap": 90000000000, "market_cap_rank": 5, "total_volume": 1500000000, "price_change_24h": 0.5, "price_change_7d": 1.0, "price_change_30d": 3.0},
        {"id": "ripple", "symbol": "XRP", "name": "XRP", "current_price": 0.55, "market_cap": 30000000000, "market_cap_rank": 6, "total_volume": 1200000000, "price_change_24h": -0.5, "price_change_7d": -2.0, "price_change_30d": -5.0},
        {"id": "dogecoin", "symbol": "DOGE", "name": "Dogecoin", "current_price": 0.16, "market_cap": 23000000000, "market_cap_rank": 7, "total_volume": 1000000000, "price_change_24h": 3.0, "price_change_7d": 8.0, "price_change_30d": 15.0},
        {"id": "cardano", "symbol": "ADA", "name": "Cardano", "current_price": 0.45, "market_cap": 16000000000, "market_cap_rank": 8, "total_volume": 400000000, "price_change_24h": 1.0, "price_change_7d": -1.5, "price_change_30d": -8.0},
        {"id": "avalanche-2", "symbol": "AVAX", "name": "Avalanche", "current_price": 36, "market_cap": 14000000000, "market_cap_rank": 9, "total_volume": 500000000, "price_change_24h": 2.0, "price_change_7d": 4.0, "price_change_30d": 10.0},
        {"id": "polkadot", "symbol": "DOT", "name": "Polkadot", "current_price": 7.5, "market_cap": 10000000000, "market_cap_rank": 10, "total_volume": 300000000, "price_change_24h": 0.3, "price_change_7d": -3.0, "price_change_30d": -7.0},
    ]

    results = []
    for coin in fallback:
        coin["price_change_percentage_7d_in_currency"] = coin.get("price_change_7d", 0)
        coin["price_change_percentage_30d_in_currency"] = coin.get("price_change_30d", 0)
        score = score_crypto(coin)
        results.append({
            **coin,
            "image": None,
            "price_change_1h": None,
            "ath": None,
            "ath_change_pct": None,
            "beginner_score": score,
        })

    return {
        "cryptos": results,
        "updated_at": datetime.now().isoformat(),
        "source": "Fallback (CoinGecko rate limited)",
        "warning": "Cryptocurrencies are significantly more volatile than stocks. They can lose 50%+ of their value in days. They are NOT suitable for Conservative risk profiles.",
    }
