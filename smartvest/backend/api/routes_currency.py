"""
Currency Exchange Rate API

Provides live exchange rates for converting foreign stock prices to DKK.
Uses the free frankfurter.app API (European Central Bank data).

Endpoints:
    GET /api/fx/rates         — All rates vs DKK
    GET /api/fx/convert       — Convert an amount from one currency to DKK
"""
from fastapi import APIRouter, Query
import httpx
from typing import Dict

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from market_data.cache import get as cache_get, set as cache_set

router = APIRouter(prefix="/api/fx", tags=["Currency"])

# Fallback rates (approximately correct, used if API is down)
FALLBACK_RATES: Dict[str, float] = {
    "USD": 6.85,    # 1 USD = ~6.85 DKK
    "EUR": 7.46,    # 1 EUR = ~7.46 DKK
    "GBP": 8.70,    # 1 GBP = ~8.70 DKK
    "GBp": 0.087,   # 1 GBp (penny) = 0.087 DKK
    "CHF": 7.80,    # 1 CHF = ~7.80 DKK
    "JPY": 0.046,   # 1 JPY = ~0.046 DKK
    "SEK": 0.65,    # 1 SEK = ~0.65 DKK
    "NOK": 0.64,    # 1 NOK = ~0.64 DKK
    "DKK": 1.0,     # Base currency
}


async def fetch_live_rates() -> Dict[str, float]:
    """Fetch live rates from frankfurter.app (ECB data, free, no key)."""
    cache_key = "fx_rates_dkk"
    cached = cache_get(cache_key)
    if cached:
        return cached

    try:
        async with httpx.AsyncClient() as client:
            # Frankfurter.app: free ECB exchange rates
            resp = await client.get(
                "https://api.frankfurter.app/latest",
                params={"from": "DKK", "to": "USD,EUR,GBP,CHF,JPY,SEK,NOK"},
                timeout=8.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                raw_rates = data.get("rates", {})

                # frankfurter returns "1 DKK = X foreign"
                # We need "1 foreign = X DKK" (invert)
                rates: Dict[str, float] = {"DKK": 1.0}
                for currency, rate in raw_rates.items():
                    if rate > 0:
                        rates[currency] = round(1.0 / rate, 4)

                # Add GBp (British pence = GBP / 100)
                if "GBP" in rates:
                    rates["GBp"] = round(rates["GBP"] / 100, 6)

                cache_set(cache_key, rates, ttl=600)  # Cache 10 minutes
                return rates
    except Exception:
        pass

    return FALLBACK_RATES


@router.get("/rates")
async def get_rates():
    """
    Get all exchange rates vs DKK.
    Returns: how many DKK you get for 1 unit of each currency.
    """
    rates = await fetch_live_rates()
    return {
        "base": "DKK",
        "rates": rates,
        "note": "1 unit of foreign currency = X DKK",
    }


@router.get("/convert")
async def convert(
    amount: float = Query(..., description="Amount to convert"),
    from_currency: str = Query("USD", alias="from", description="Source currency"),
):
    """
    Convert an amount from a foreign currency to DKK.

    Examples:
        /api/fx/convert?amount=100&from=USD  → 685 DKK
        /api/fx/convert?amount=1000&from=GBp → 87 DKK
    """
    rates = await fetch_live_rates()
    from_upper = from_currency.upper() if from_currency != "GBp" else "GBp"

    rate = rates.get(from_upper) or rates.get(from_currency) or FALLBACK_RATES.get(from_upper, 1.0)
    dkk_amount = amount * rate

    return {
        "amount": amount,
        "from": from_currency,
        "to": "DKK",
        "rate": rate,
        "result": round(dkk_amount, 2),
    }
