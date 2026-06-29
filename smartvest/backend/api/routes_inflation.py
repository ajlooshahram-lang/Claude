"""
Inflation Data API

Provides current inflation rate for adjusting portfolio returns.
Uses publicly available data. Falls back to a reasonable estimate
if the API is unavailable.

Endpoint:
    GET /api/inflation — Returns current annual inflation rate
"""
from fastapi import APIRouter
import httpx

router = APIRouter(prefix="/api", tags=["Inflation"])

# Fallback: Danish CPI inflation (updated manually as a safe default)
# Source: Danmarks Statistik / ECB
FALLBACK_INFLATION = {
    "rate": 2.1,
    "country": "Denmark",
    "source": "ECB estimate (fallback)",
    "year": 2026,
}


@router.get("/inflation")
async def get_inflation():
    """
    Get current annual inflation rate (CPI) for Denmark/EU.
    Tries to fetch from a public API, falls back to a reasonable estimate.
    """
    # Try World Bank API (free, no key)
    try:
        async with httpx.AsyncClient() as client:
            # World Bank: Denmark CPI inflation, most recent value
            resp = await client.get(
                "https://api.worldbank.org/v2/country/DNK/indicator/FP.CPI.TOTL.ZG",
                params={"format": "json", "per_page": "1", "mrv": "1"},
                timeout=8.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                if len(data) > 1 and data[1] and len(data[1]) > 0:
                    entry = data[1][0]
                    value = entry.get("value")
                    year = entry.get("date")
                    if value is not None:
                        return {
                            "rate": round(float(value), 2),
                            "country": "Denmark",
                            "source": "World Bank",
                            "year": int(year) if year else 2025,
                            "note": "Annual CPI inflation rate (%)",
                        }
    except Exception:
        pass

    # Try ECB / Eurostat for Euro area
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://sdw-wsrest.ecb.europa.eu/service/data/ICP/M.U2.N.000000.4.ANR",
                params={"lastNObservations": "1", "format": "jsondata"},
                timeout=8.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                observations = data.get("dataSets", [{}])[0].get("series", {})
                for key, series in observations.items():
                    obs = series.get("observations", {})
                    if obs:
                        last_key = max(obs.keys())
                        value = obs[last_key][0]
                        if value is not None:
                            return {
                                "rate": round(float(value), 2),
                                "country": "Euro Area",
                                "source": "ECB",
                                "year": 2026,
                                "note": "Annual HICP inflation rate (%)",
                            }
    except Exception:
        pass

    # Fallback
    return {
        **FALLBACK_INFLATION,
        "note": "Annual CPI inflation rate (%). Using estimate — live data temporarily unavailable.",
    }
