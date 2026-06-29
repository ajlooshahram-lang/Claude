"""
ETF Overlap Detector API

Calculates:
- Percentage overlap in underlying holdings between ETFs
- True sector exposure after accounting for all ETF holdings
- Plain English warnings when overlap is high
"""

import yfinance as yf
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/etf-overlap", tags=["etf-overlap"])


# ─── Known ETF Holdings (fallback when yfinance doesn't provide them) ─────────

# Approximate sector weights for popular ETFs
ETF_SECTOR_WEIGHTS = {
    "VOO": {"Technology": 31, "Healthcare": 13, "Financials": 13, "Consumer Discretionary": 11, "Communication Services": 9, "Industrials": 8, "Consumer Staples": 6, "Energy": 4, "Utilities": 2, "Real Estate": 2, "Materials": 2},
    "SPY": {"Technology": 31, "Healthcare": 13, "Financials": 13, "Consumer Discretionary": 11, "Communication Services": 9, "Industrials": 8, "Consumer Staples": 6, "Energy": 4, "Utilities": 2, "Real Estate": 2, "Materials": 2},
    "VTI": {"Technology": 30, "Healthcare": 13, "Financials": 13, "Consumer Discretionary": 11, "Communication Services": 9, "Industrials": 9, "Consumer Staples": 6, "Energy": 4, "Real Estate": 3, "Utilities": 3, "Materials": 2},
    "QQQ": {"Technology": 58, "Communication Services": 16, "Consumer Discretionary": 13, "Healthcare": 7, "Consumer Staples": 3, "Industrials": 3},
    "VGT": {"Technology": 100},
    "XLK": {"Technology": 100},
    "SOXX": {"Technology": 100},
    "VHT": {"Healthcare": 100},
    "XLV": {"Healthcare": 100},
    "XLE": {"Energy": 100},
    "XLF": {"Financials": 100},
    "VFH": {"Financials": 100},
    "VNQ": {"Real Estate": 100},
    "XLRE": {"Real Estate": 100},
    "XLU": {"Utilities": 100},
    "VPU": {"Utilities": 100},
    "VDC": {"Consumer Staples": 100},
    "XLP": {"Consumer Staples": 100},
    "VCR": {"Consumer Discretionary": 100},
    "XLY": {"Consumer Discretionary": 100},
    "VOX": {"Communication Services": 100},
    "XLC": {"Communication Services": 100},
    "VIS": {"Industrials": 100},
    "XLI": {"Industrials": 100},
    "VAW": {"Materials": 100},
    "XLB": {"Materials": 100},
    "ARKK": {"Technology": 45, "Healthcare": 30, "Communication Services": 15, "Financials": 10},
    "SCHD": {"Financials": 18, "Healthcare": 16, "Industrials": 15, "Consumer Staples": 14, "Technology": 12, "Energy": 10, "Communication Services": 8, "Materials": 4, "Consumer Discretionary": 3},
    "VIG": {"Technology": 22, "Financials": 18, "Healthcare": 16, "Industrials": 14, "Consumer Staples": 12, "Consumer Discretionary": 8, "Communication Services": 5, "Materials": 3, "Utilities": 2},
    "AGG": {"Bonds": 100},
    "BND": {"Bonds": 100},
    "GLD": {"Commodities": 100},
    "TLT": {"Bonds": 100},
    "JEPI": {"Technology": 18, "Financials": 15, "Healthcare": 14, "Industrials": 12, "Consumer Staples": 10, "Consumer Discretionary": 9, "Communication Services": 8, "Energy": 6, "Utilities": 4, "Materials": 4},
    "VEA": {"Technology": 15, "Financials": 18, "Industrials": 16, "Healthcare": 12, "Consumer Discretionary": 12, "Consumer Staples": 9, "Materials": 7, "Energy": 5, "Communication Services": 4, "Utilities": 2},
    "VWO": {"Technology": 22, "Financials": 21, "Consumer Discretionary": 14, "Communication Services": 10, "Energy": 7, "Industrials": 7, "Materials": 7, "Consumer Staples": 5, "Healthcare": 4, "Utilities": 3},
    "IEFA": {"Financials": 18, "Industrials": 16, "Technology": 14, "Healthcare": 13, "Consumer Discretionary": 12, "Consumer Staples": 9, "Materials": 7, "Energy": 5, "Communication Services": 4, "Utilities": 2},
    "EEM": {"Technology": 22, "Financials": 20, "Consumer Discretionary": 14, "Communication Services": 10, "Energy": 7, "Industrials": 7, "Materials": 7, "Consumer Staples": 6, "Healthcare": 4, "Utilities": 3},
}

# Approximate top holdings for popular ETFs (symbol -> weight %)
ETF_TOP_HOLDINGS = {
    "VOO": {"AAPL": 7.2, "MSFT": 6.8, "NVDA": 5.1, "AMZN": 3.7, "META": 2.5, "GOOGL": 2.1, "GOOG": 1.8, "BRK.B": 1.7, "AVGO": 1.5, "JPM": 1.4, "LLY": 1.3, "TSLA": 1.2, "UNH": 1.2, "V": 1.1, "XOM": 1.0},
    "SPY": {"AAPL": 7.2, "MSFT": 6.8, "NVDA": 5.1, "AMZN": 3.7, "META": 2.5, "GOOGL": 2.1, "GOOG": 1.8, "BRK.B": 1.7, "AVGO": 1.5, "JPM": 1.4, "LLY": 1.3, "TSLA": 1.2, "UNH": 1.2, "V": 1.1, "XOM": 1.0},
    "VTI": {"AAPL": 6.5, "MSFT": 6.1, "NVDA": 4.6, "AMZN": 3.3, "META": 2.2, "GOOGL": 1.9, "GOOG": 1.6, "BRK.B": 1.5, "AVGO": 1.4, "JPM": 1.3, "LLY": 1.2, "TSLA": 1.1, "UNH": 1.0, "V": 1.0, "XOM": 0.9},
    "QQQ": {"AAPL": 9.0, "MSFT": 8.5, "NVDA": 7.8, "AMZN": 5.5, "META": 4.8, "AVGO": 4.2, "GOOGL": 3.2, "GOOG": 2.8, "TSLA": 2.7, "COST": 2.5, "NFLX": 2.0, "AMD": 1.8, "ADBE": 1.5, "LIN": 1.3, "QCOM": 1.2},
    "VGT": {"AAPL": 16.5, "MSFT": 15.0, "NVDA": 13.5, "AVGO": 5.0, "AMD": 2.5, "CRM": 2.3, "ADBE": 2.0, "ACN": 1.8, "ORCL": 1.7, "CSCO": 1.5},
    "SCHD": {"ABBV": 4.5, "HD": 4.2, "AMGN": 4.0, "CSCO": 3.9, "BLK": 3.8, "PEP": 3.7, "MRK": 3.6, "TXN": 3.5, "KO": 3.3, "PFE": 3.2},
    "ARKK": {"TSLA": 10.0, "COIN": 8.5, "ROKU": 7.0, "SQ": 6.5, "PATH": 5.5, "DKNG": 5.0, "RBLX": 4.5, "TWLO": 4.0, "PLTR": 3.5, "HOOD": 3.0},
}


# ─── Helper Functions ─────────────────────────────────────────────────────────

def get_etf_holdings(symbol: str) -> dict[str, float]:
    """Get top holdings for an ETF. Returns {stock_symbol: weight_pct}."""
    sym = symbol.upper()

    # Try known data first (fast)
    if sym in ETF_TOP_HOLDINGS:
        return ETF_TOP_HOLDINGS[sym]

    # Try yfinance
    try:
        ticker = yf.Ticker(sym)
        holdings = ticker.get_holdings()
        if holdings is not None and not holdings.empty:
            result = {}
            for _, row in holdings.head(20).iterrows():
                h_symbol = row.get("Symbol") or row.get("Ticker") or ""
                weight = row.get("Holding Percent") or row.get("% Assets") or row.get("Weight") or 0
                if isinstance(weight, str):
                    weight = float(weight.replace('%', ''))
                if h_symbol and weight:
                    result[h_symbol] = float(weight)
            if result:
                return result
    except:
        pass

    return {}


def get_etf_sectors(symbol: str) -> dict[str, float]:
    """Get sector breakdown for an ETF. Returns {sector: weight_pct}."""
    sym = symbol.upper()

    if sym in ETF_SECTOR_WEIGHTS:
        return ETF_SECTOR_WEIGHTS[sym]

    # Try yfinance info
    try:
        ticker = yf.Ticker(sym)
        info = ticker.info
        category = (info.get("category") or "").lower()

        # Guess from category
        if "technology" in category:
            return {"Technology": 100}
        elif "health" in category:
            return {"Healthcare": 100}
        elif "real estate" in category:
            return {"Real Estate": 100}
        elif "energy" in category:
            return {"Energy": 100}
        elif "financial" in category:
            return {"Financials": 100}
        elif "bond" in category or "fixed income" in category:
            return {"Bonds": 100}
        elif "total" in category or "blend" in category or "500" in category:
            return ETF_SECTOR_WEIGHTS.get("VTI", {"Diversified": 100})
    except:
        pass

    return {"Unknown": 100}


def calculate_overlap(holdings_a: dict, holdings_b: dict) -> dict:
    """Calculate overlap between two sets of holdings."""
    stocks_a = set(holdings_a.keys())
    stocks_b = set(holdings_b.keys())

    common = stocks_a & stocks_b
    all_stocks = stocks_a | stocks_b

    if not all_stocks:
        return {"overlap_pct": 0, "common_stocks": [], "unique_a": [], "unique_b": []}

    # Weighted overlap — sum of min weights for common stocks
    overlap_weight_a = sum(holdings_a.get(s, 0) for s in common)
    overlap_weight_b = sum(holdings_b.get(s, 0) for s in common)
    overlap_pct = (overlap_weight_a + overlap_weight_b) / 2

    common_details = []
    for stock in sorted(common, key=lambda s: holdings_a.get(s, 0) + holdings_b.get(s, 0), reverse=True):
        common_details.append({
            "symbol": stock,
            "weight_a": round(holdings_a.get(stock, 0), 2),
            "weight_b": round(holdings_b.get(stock, 0), 2),
        })

    return {
        "overlap_pct": round(overlap_pct, 1),
        "common_count": len(common),
        "common_stocks": common_details[:15],
        "unique_a_count": len(stocks_a - stocks_b),
        "unique_b_count": len(stocks_b - stocks_a),
    }


# ─── API Endpoints ───────────────────────────────────────────────────────────

class OverlapRequest(BaseModel):
    etfs: list[str]  # List of ETF symbols
    allocation_pcts: list[float] | None = None  # Optional: how much of portfolio each ETF is


@router.post("/analyze")
def analyze_etf_overlap(req: OverlapRequest):
    """
    Analyze overlap between multiple ETFs.
    Returns pairwise overlaps and true sector exposure.
    """
    if len(req.etfs) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 ETFs to analyze overlap")
    if len(req.etfs) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 ETFs")

    symbols = [s.strip().upper() for s in req.etfs]

    # Default equal allocation if not provided
    allocations = req.allocation_pcts
    if not allocations or len(allocations) != len(symbols):
        allocations = [100 / len(symbols)] * len(symbols)

    # Normalize allocations to sum to 100
    total_alloc = sum(allocations)
    if total_alloc > 0:
        allocations = [a / total_alloc * 100 for a in allocations]

    # Fetch holdings for each ETF
    all_holdings = {}
    all_sectors = {}
    for sym in symbols:
        all_holdings[sym] = get_etf_holdings(sym)
        all_sectors[sym] = get_etf_sectors(sym)

    # Pairwise overlap
    pairwise = []
    for i in range(len(symbols)):
        for j in range(i + 1, len(symbols)):
            overlap = calculate_overlap(all_holdings[symbols[i]], all_holdings[symbols[j]])
            pairwise.append({
                "etf_a": symbols[i],
                "etf_b": symbols[j],
                **overlap,
            })

    # Calculate TRUE sector exposure (weighted by allocation)
    true_sectors: dict[str, float] = {}
    for idx, sym in enumerate(symbols):
        weight = allocations[idx] / 100
        sectors = all_sectors[sym]
        for sector, pct in sectors.items():
            true_sectors[sector] = true_sectors.get(sector, 0) + (pct * weight)

    # Sort by weight
    true_sector_breakdown = sorted(
        [{"sector": s, "true_weight_pct": round(w, 1)} for s, w in true_sectors.items()],
        key=lambda x: x["true_weight_pct"],
        reverse=True,
    )

    # Generate warnings
    warnings = []
    for pair in pairwise:
        if pair["overlap_pct"] > 50:
            warnings.append({
                "severity": "high",
                "message": f"{pair['etf_a']} and {pair['etf_b']} have {pair['overlap_pct']}% overlap in their holdings. "
                           f"They share {pair['common_count']} stocks. Owning both gives you much less diversification than you think.",
            })
        elif pair["overlap_pct"] > 25:
            warnings.append({
                "severity": "medium",
                "message": f"{pair['etf_a']} and {pair['etf_b']} have {pair['overlap_pct']}% overlap. "
                           f"You have some redundancy — {pair['common_count']} stocks appear in both.",
            })

    # Check sector concentration
    for item in true_sector_breakdown:
        if item["true_weight_pct"] > 40:
            warnings.append({
                "severity": "high",
                "message": f"Your true {item['sector']} exposure is {item['true_weight_pct']:.0f}% of your portfolio. "
                           f"This is much higher than it appears if you only look at ETF names. "
                           f"A broad market ETF already contains significant {item['sector']} stocks.",
            })
        elif item["true_weight_pct"] > 30:
            warnings.append({
                "severity": "medium",
                "message": f"Your combined {item['sector']} exposure is {item['true_weight_pct']:.0f}%. "
                           f"This is getting concentrated — consider if this matches your risk profile.",
            })

    # Summary
    max_overlap = max((p["overlap_pct"] for p in pairwise), default=0)
    if max_overlap > 50:
        summary = (
            f"High overlap detected. Your ETF combination has significant redundancy — "
            f"you are paying multiple expense ratios for substantially the same stocks. "
            f"Consider whether you need all of these ETFs or if one would cover the same exposure."
        )
    elif max_overlap > 25:
        summary = (
            f"Moderate overlap detected. Some of your ETFs share common holdings. "
            f"Your true sector exposure may differ from what the ETF names suggest."
        )
    else:
        summary = (
            f"Good diversification. Your ETFs have minimal overlap and provide "
            f"genuinely different exposures. This is how ETF portfolios should work."
        )

    return {
        "etfs": symbols,
        "allocations": [{"symbol": s, "allocation_pct": round(a, 1)} for s, a in zip(symbols, allocations)],
        "pairwise_overlaps": pairwise,
        "true_sector_exposure": true_sector_breakdown,
        "warnings": warnings,
        "summary": summary,
        "max_overlap_pct": round(max_overlap, 1),
    }
