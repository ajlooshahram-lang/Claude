"""
Unified Portfolio API

Merges stocks, ETFs, and crypto into one combined view.
Shows total wealth in USD and DKK, allocation breakdown,
and risk warnings when crypto exceeds profile limits.
"""

from datetime import datetime

import yfinance as yf
import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/unified", tags=["unified"])

COINGECKO_BASE = "https://api.coingecko.com/api/v3"

# Max crypto allocation by risk profile
CRYPTO_LIMITS = {
    "Conservative": 0.05,  # 5%
    "Moderate": 0.10,      # 10%
    "Aggressive": 0.20,    # 20%
}


class StockHolding(BaseModel):
    symbol: str
    shares: float
    avg_cost: float


class CryptoHolding(BaseModel):
    coin_id: str
    symbol: str
    amount: float
    avg_cost_usd: float


class UnifiedRequest(BaseModel):
    stocks: list[StockHolding] = []
    etfs: list[StockHolding] = []
    cryptos: list[CryptoHolding] = []
    cash_usd: float = 0
    cash_dkk: float = 0
    risk_profile: str = "Moderate"
    dkk_usd_rate: float = 6.85


# ─── Known ETFs for classification ───────────────────────────────────────────

KNOWN_ETFS = {
    "VOO", "SPY", "VTI", "QQQ", "IVV", "VEA", "VWO", "AGG", "BND",
    "VNQ", "VGT", "VHT", "XLE", "XLF", "ARKK", "SCHD", "VIG", "JEPI",
    "GLD", "TLT", "IEFA", "EEM", "VYM", "XLK", "SOXX", "XLB", "XLI",
    "XLC", "XLU", "XLP", "XLY", "VDC", "VPU", "VCR", "VOX", "VIS",
    "VAW", "XLRE",
}


@router.post("/portfolio")
def get_unified_portfolio(req: UnifiedRequest):
    """Calculate unified portfolio value across stocks, ETFs, and crypto."""

    # ─── Fetch stock prices ───────────────────────────────────────────────
    stock_holdings = []
    total_stocks_usd = 0

    for h in req.stocks:
        try:
            ticker = yf.Ticker(h.symbol)
            hist = ticker.history(period="5d")
            if hist.empty:
                continue
            price = hist["Close"].iloc[-1]
            info = ticker.info
            name = info.get("shortName", h.symbol)
            sector = info.get("sector", "Unknown")

            value = price * h.shares
            cost = h.avg_cost * h.shares
            pnl = value - cost
            pnl_pct = ((value / cost) - 1) * 100 if cost > 0 else 0

            stock_holdings.append({
                "type": "stock",
                "symbol": h.symbol.upper(),
                "name": name,
                "sector": sector,
                "shares": h.shares,
                "price_usd": round(price, 2),
                "value_usd": round(value, 2),
                "cost_usd": round(cost, 2),
                "pnl_usd": round(pnl, 2),
                "pnl_pct": round(pnl_pct, 1),
            })
            total_stocks_usd += value
        except:
            continue

    # ─── Fetch ETF prices ─────────────────────────────────────────────────
    etf_holdings = []
    total_etfs_usd = 0

    for h in req.etfs:
        try:
            ticker = yf.Ticker(h.symbol)
            hist = ticker.history(period="5d")
            if hist.empty:
                continue
            price = hist["Close"].iloc[-1]
            info = ticker.info
            name = info.get("shortName", h.symbol)
            category = info.get("category", "ETF")

            value = price * h.shares
            cost = h.avg_cost * h.shares
            pnl = value - cost
            pnl_pct = ((value / cost) - 1) * 100 if cost > 0 else 0

            etf_holdings.append({
                "type": "etf",
                "symbol": h.symbol.upper(),
                "name": name,
                "category": category,
                "shares": h.shares,
                "price_usd": round(price, 2),
                "value_usd": round(value, 2),
                "cost_usd": round(cost, 2),
                "pnl_usd": round(pnl, 2),
                "pnl_pct": round(pnl_pct, 1),
            })
            total_etfs_usd += value
        except:
            continue

    # ─── Fetch crypto prices ──────────────────────────────────────────────
    crypto_holdings = []
    total_crypto_usd = 0

    if req.cryptos:
        coin_ids = [c.coin_id for c in req.cryptos]
        try:
            url = f"{COINGECKO_BASE}/simple/price"
            params = {
                "ids": ",".join(coin_ids),
                "vs_currencies": "usd",
                "include_24hr_change": "true",
            }
            resp = requests.get(url, params=params, timeout=10)
            prices = resp.json() if resp.status_code == 200 else {}
        except:
            prices = {}

        for h in req.cryptos:
            coin_data = prices.get(h.coin_id, {})
            price = coin_data.get("usd", h.avg_cost_usd)  # Fallback to cost
            change_24h = coin_data.get("usd_24h_change", 0)

            value = price * h.amount
            cost = h.avg_cost_usd * h.amount
            pnl = value - cost
            pnl_pct = ((value / cost) - 1) * 100 if cost > 0 else 0

            crypto_holdings.append({
                "type": "crypto",
                "symbol": h.symbol.upper(),
                "coin_id": h.coin_id,
                "amount": h.amount,
                "price_usd": round(price, 2),
                "value_usd": round(value, 2),
                "cost_usd": round(cost, 2),
                "pnl_usd": round(pnl, 2),
                "pnl_pct": round(pnl_pct, 1),
                "change_24h_pct": round(change_24h, 2) if change_24h else 0,
            })
            total_crypto_usd += value

    # ─── Total portfolio ──────────────────────────────────────────────────
    total_cash_usd = req.cash_usd + (req.cash_dkk / req.dkk_usd_rate)
    total_portfolio_usd = total_stocks_usd + total_etfs_usd + total_crypto_usd + total_cash_usd
    total_portfolio_dkk = total_portfolio_usd * req.dkk_usd_rate

    # Allocation percentages
    stock_pct = (total_stocks_usd / total_portfolio_usd * 100) if total_portfolio_usd > 0 else 0
    etf_pct = (total_etfs_usd / total_portfolio_usd * 100) if total_portfolio_usd > 0 else 0
    crypto_pct = (total_crypto_usd / total_portfolio_usd * 100) if total_portfolio_usd > 0 else 0
    cash_pct = (total_cash_usd / total_portfolio_usd * 100) if total_portfolio_usd > 0 else 0

    allocation = {
        "stocks_pct": round(stock_pct, 1),
        "etfs_pct": round(etf_pct, 1),
        "crypto_pct": round(crypto_pct, 1),
        "cash_pct": round(cash_pct, 1),
        "stocks_usd": round(total_stocks_usd, 2),
        "etfs_usd": round(total_etfs_usd, 2),
        "crypto_usd": round(total_crypto_usd, 2),
        "cash_usd": round(total_cash_usd, 2),
    }

    # ─── Risk warnings ────────────────────────────────────────────────────
    warnings = []
    crypto_limit = CRYPTO_LIMITS.get(req.risk_profile, 0.10)

    if total_portfolio_usd > 0 and crypto_pct / 100 > crypto_limit:
        limit_pct = crypto_limit * 100
        warnings.append({
            "severity": "high",
            "title": f"Crypto allocation too high for {req.risk_profile} profile",
            "message": (
                f"Your cryptocurrency allocation is {crypto_pct:.1f}% of your total portfolio. "
                f"For a {req.risk_profile} risk profile, the recommended maximum is {limit_pct:.0f}%. "
                f"Crypto is significantly more volatile than stocks or ETFs — a 50% crash in crypto "
                f"would wipe out ${total_crypto_usd * 0.5:,.0f} from your portfolio. "
                f"Consider selling some crypto and moving the proceeds into diversified ETFs."
            ),
        })

    # Check single-asset concentration
    all_holdings = stock_holdings + etf_holdings + crypto_holdings
    for h in all_holdings:
        weight = h["value_usd"] / total_portfolio_usd * 100 if total_portfolio_usd > 0 else 0
        if weight > 25:
            warnings.append({
                "severity": "medium",
                "title": f"{h['symbol']} is {weight:.1f}% of your portfolio",
                "message": f"Having more than 25% in a single {'crypto' if h.get('type') == 'crypto' else 'asset'} is very concentrated. Consider diversifying.",
            })

    # ─── Total P&L ────────────────────────────────────────────────────────
    total_cost = (
        sum(h["cost_usd"] for h in stock_holdings) +
        sum(h["cost_usd"] for h in etf_holdings) +
        sum(h["cost_usd"] for h in crypto_holdings)
    )
    total_invested_value = total_stocks_usd + total_etfs_usd + total_crypto_usd
    total_pnl = total_invested_value - total_cost
    total_pnl_pct = ((total_invested_value / total_cost) - 1) * 100 if total_cost > 0 else 0

    return {
        "total_portfolio_usd": round(total_portfolio_usd, 2),
        "total_portfolio_dkk": round(total_portfolio_dkk, 2),
        "dkk_usd_rate": req.dkk_usd_rate,
        "total_pnl_usd": round(total_pnl, 2),
        "total_pnl_pct": round(total_pnl_pct, 2),
        "allocation": allocation,
        "stocks": stock_holdings,
        "etfs": etf_holdings,
        "cryptos": crypto_holdings,
        "risk_profile": req.risk_profile,
        "crypto_limit_pct": crypto_limit * 100,
        "warnings": warnings,
        "updated_at": datetime.now().isoformat(),
    }
