"""
Broker Connection API (Saxo Bank OpenAPI)

Handles OAuth2 authentication with Saxo Bank and fetches real portfolio data.
Works with both SIM (simulation/demo) and LIVE environments.

To use:
  1. Create free account at https://www.developer.saxo
  2. Register an app (get client_id and client_secret)
  3. Set environment variables: SAXO_CLIENT_ID, SAXO_CLIENT_SECRET, SAXO_REDIRECT_URI
  4. Use SIM environment first (free, no real money)

Endpoints:
  GET  /api/broker/status       — Check if broker is connected
  GET  /api/broker/auth-url     — Get OAuth2 login URL (redirect user here)
  POST /api/broker/callback     — Exchange auth code for access token
  GET  /api/broker/positions    — Fetch real holdings from broker
  GET  /api/broker/balance      — Fetch account balance
  POST /api/broker/disconnect   — Remove stored credentials
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import os
import httpx

router = APIRouter(prefix="/api/broker", tags=["Broker Connection"])

# ─── Configuration ────────────────────────────────────────────────────────────
# Read from environment variables (never hardcoded)

SAXO_CLIENT_ID = os.getenv("SAXO_CLIENT_ID", "")
SAXO_CLIENT_SECRET = os.getenv("SAXO_CLIENT_SECRET", "")
SAXO_REDIRECT_URI = os.getenv("SAXO_REDIRECT_URI", "http://localhost:3000/broker-callback")

# SIM = demo environment (free), LIVE = real money
SAXO_ENV = os.getenv("SAXO_ENV", "SIM")  # "SIM" or "LIVE"

SAXO_AUTH_URL = (
    "https://sim.logonvalidation.net/authorize" if SAXO_ENV == "SIM"
    else "https://live.logonvalidation.net/authorize"
)
SAXO_TOKEN_URL = (
    "https://sim.logonvalidation.net/token" if SAXO_ENV == "SIM"
    else "https://live.logonvalidation.net/token"
)
SAXO_API_BASE = (
    "https://gateway.saxobank.com/sim/openapi" if SAXO_ENV == "SIM"
    else "https://gateway.saxobank.com/openapi"
)

# In-memory token storage (in production, use encrypted DB)
_token_store: dict = {}


# ─── Models ───────────────────────────────────────────────────────────────────

class CallbackRequest(BaseModel):
    code: str  # Authorization code from OAuth2 redirect


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/status")
def broker_status():
    """Check if broker is connected and configured."""
    configured = bool(SAXO_CLIENT_ID and SAXO_CLIENT_SECRET)
    connected = bool(_token_store.get("access_token"))

    return {
        "configured": configured,
        "connected": connected,
        "environment": SAXO_ENV,
        "broker": "Saxo Bank",
        "hint": "Set SAXO_CLIENT_ID and SAXO_CLIENT_SECRET environment variables" if not configured else None,
    }


@router.get("/auth-url")
def get_auth_url():
    """
    Get the Saxo Bank OAuth2 login URL.
    Redirect the user to this URL to log in to their broker account.
    """
    if not SAXO_CLIENT_ID:
        raise HTTPException(
            status_code=400,
            detail="Broker not configured. Set SAXO_CLIENT_ID and SAXO_CLIENT_SECRET environment variables."
        )

    url = (
        f"{SAXO_AUTH_URL}"
        f"?client_id={SAXO_CLIENT_ID}"
        f"&response_type=code"
        f"&redirect_uri={SAXO_REDIRECT_URI}"
    )
    return {"auth_url": url, "environment": SAXO_ENV}


@router.post("/callback")
async def handle_callback(req: CallbackRequest):
    """
    Exchange the OAuth2 authorization code for an access token.
    Called after the user logs in at Saxo Bank and is redirected back.
    """
    if not SAXO_CLIENT_ID or not SAXO_CLIENT_SECRET:
        raise HTTPException(status_code=400, detail="Broker not configured.")

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                SAXO_TOKEN_URL,
                data={
                    "grant_type": "authorization_code",
                    "code": req.code,
                    "client_id": SAXO_CLIENT_ID,
                    "client_secret": SAXO_CLIENT_SECRET,
                    "redirect_uri": SAXO_REDIRECT_URI,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=15.0,
            )

            if resp.status_code != 200:
                raise HTTPException(
                    status_code=401,
                    detail="Could not authenticate with Saxo Bank. Please try logging in again."
                )

            data = resp.json()
            _token_store["access_token"] = data.get("access_token")
            _token_store["refresh_token"] = data.get("refresh_token")
            _token_store["expires_in"] = data.get("expires_in")

            return {"status": "connected", "environment": SAXO_ENV}

    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Could not reach Saxo Bank servers. Try again.")


@router.get("/positions")
async def get_positions():
    """
    Fetch real holdings from the connected broker account.
    Returns positions in the same format as the portfolio page expects.
    """
    token = _token_store.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not connected to broker. Please log in first.")

    try:
        async with httpx.AsyncClient() as client:
            # Get client info first (to get ClientKey)
            me_resp = await client.get(
                f"{SAXO_API_BASE}/port/v1/clients/me",
                headers={"Authorization": f"Bearer {token}"},
                timeout=10.0,
            )
            if me_resp.status_code == 401:
                _token_store.clear()
                raise HTTPException(status_code=401, detail="Session expired. Please reconnect your broker.")

            me_data = me_resp.json()
            client_key = me_data.get("ClientKey", "")

            # Get positions
            pos_resp = await client.get(
                f"{SAXO_API_BASE}/port/v1/positions",
                params={"ClientKey": client_key},
                headers={"Authorization": f"Bearer {token}"},
                timeout=10.0,
            )
            pos_data = pos_resp.json()

            # Get balance
            bal_resp = await client.get(
                f"{SAXO_API_BASE}/port/v1/balances",
                params={"ClientKey": client_key},
                headers={"Authorization": f"Bearer {token}"},
                timeout=10.0,
            )
            bal_data = bal_resp.json()

            # Transform Saxo positions into SmartVest format
            positions = []
            for pos in pos_data.get("Data", []):
                net_pos = pos.get("NetPositionBase", {})
                pos_view = pos.get("PositionView", {})
                instrument = pos.get("DisplayAndFormat", {})

                positions.append({
                    "symbol": instrument.get("Symbol", "???"),
                    "name": instrument.get("Description", "Unknown"),
                    "shares": net_pos.get("Amount", 0),
                    "avg_cost": pos_view.get("AverageOpenPrice", 0),
                    "current_price": pos_view.get("CurrentPrice", 0),
                    "currency": instrument.get("Currency", "DKK"),
                    "gain_loss": pos_view.get("ProfitLossOnTrade", 0),
                    "gain_loss_pct": pos_view.get("ProfitLossOnTradeInPercentage", 0),
                    "market_value": pos_view.get("MarketValue", 0),
                })

            return {
                "connected": True,
                "environment": SAXO_ENV,
                "account_balance": bal_data.get("TotalValue", 0),
                "cash_available": bal_data.get("CashAvailableForTrading", 0),
                "currency": bal_data.get("Currency", "DKK"),
                "positions_count": len(positions),
                "positions": positions,
            }

    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Could not reach Saxo Bank. Check your internet connection.")


@router.get("/balance")
async def get_balance():
    """Get account balance and cash available."""
    token = _token_store.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not connected to broker.")

    try:
        async with httpx.AsyncClient() as client:
            me_resp = await client.get(
                f"{SAXO_API_BASE}/port/v1/clients/me",
                headers={"Authorization": f"Bearer {token}"},
                timeout=10.0,
            )
            me_data = me_resp.json()
            client_key = me_data.get("ClientKey", "")

            bal_resp = await client.get(
                f"{SAXO_API_BASE}/port/v1/balances",
                params={"ClientKey": client_key},
                headers={"Authorization": f"Bearer {token}"},
                timeout=10.0,
            )
            bal_data = bal_resp.json()

            return {
                "total_value": bal_data.get("TotalValue", 0),
                "cash_available": bal_data.get("CashAvailableForTrading", 0),
                "currency": bal_data.get("Currency", "DKK"),
                "margin_used": bal_data.get("MarginUsedByCurrentPositions", 0),
            }

    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Could not reach Saxo Bank.")


@router.post("/disconnect")
def disconnect():
    """Remove stored broker credentials."""
    _token_store.clear()
    return {"status": "disconnected"}
