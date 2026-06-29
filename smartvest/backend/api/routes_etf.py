"""
ETF Explorer API

Provides:
- ETF search and profile data
- Top holdings, expense ratio, strategy
- 1Y/5Y returns, dividend yield
- Beginner score adapted for ETFs (liquidity, tracking error, expense)
- Side-by-side ETF comparison
"""

import math
from datetime import datetime, timedelta

import yfinance as yf
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/etf", tags=["etf"])


# ─── ETF Beginner Scoring Engine ──────────────────────────────────────────────

def score_etf(info: dict, hist_1y, hist_5y) -> dict:
    """
    Score an ETF for beginners (0-10).

    Factors:
    - Expense ratio (lower = better for beginners): 30%
    - Liquidity / AUM (higher = safer): 25%
    - Volatility (lower = better): 25%
    - Diversification / # holdings (more = safer): 20%
    """
    scores = {}
    explanations = []

    # 1. Expense Ratio (30%)
    expense = info.get("annualReportExpenseRatio") or info.get("expenseRatio")
    if expense is None:
        # Try netExpenseRatio
        expense = info.get("netExpenseRatio")
    if expense is not None:
        if isinstance(expense, str):
            try:
                expense = float(expense.replace('%', '')) / 100
            except:
                expense = None

    if expense is not None:
        if expense <= 0.001:  # <=0.10%
            scores["expense"] = 10
            explanations.append(f"Very low expense ratio ({expense*100:.2f}%) — you keep more of your returns.")
        elif expense <= 0.005:  # <=0.50%
            scores["expense"] = 8
            explanations.append(f"Low expense ratio ({expense*100:.2f}%) — reasonable cost.")
        elif expense <= 0.01:  # <=1.0%
            scores["expense"] = 5
            explanations.append(f"Moderate expense ratio ({expense*100:.2f}%) — eats into returns over time.")
        else:
            scores["expense"] = 2
            explanations.append(f"High expense ratio ({expense*100:.2f}%) — costly for long-term holding.")
    else:
        scores["expense"] = 5

    # 2. Liquidity / AUM (25%)
    aum = info.get("totalAssets") or info.get("netAssets") or 0
    avg_volume = info.get("averageVolume") or info.get("averageDailyVolume10Day") or 0

    if aum > 50_000_000_000:  # >$50B
        scores["liquidity"] = 10
        explanations.append("Massive fund (>$50B) — extremely liquid and safe from closure.")
    elif aum > 10_000_000_000:  # >$10B
        scores["liquidity"] = 9
    elif aum > 1_000_000_000:  # >$1B
        scores["liquidity"] = 7
        explanations.append("Large fund (>$1B) — good liquidity.")
    elif aum > 100_000_000:  # >$100M
        scores["liquidity"] = 5
        explanations.append("Medium fund — adequate but watch for low volume days.")
    else:
        scores["liquidity"] = 3
        explanations.append("Small fund — potential liquidity issues for beginners.")

    # 3. Volatility (25%)
    if hist_1y is not None and not hist_1y.empty and len(hist_1y) > 20:
        returns = hist_1y["Close"].pct_change().dropna()
        annual_vol = returns.std() * math.sqrt(252) * 100

        if annual_vol < 10:
            scores["volatility"] = 10
            explanations.append(f"Very low volatility ({annual_vol:.1f}%) — steady and predictable.")
        elif annual_vol < 15:
            scores["volatility"] = 8
        elif annual_vol < 20:
            scores["volatility"] = 6
            explanations.append(f"Moderate volatility ({annual_vol:.1f}%) — some ups and downs.")
        elif annual_vol < 30:
            scores["volatility"] = 4
            explanations.append(f"High volatility ({annual_vol:.1f}%) — can swing significantly.")
        else:
            scores["volatility"] = 2
            explanations.append(f"Very high volatility ({annual_vol:.1f}%) — risky for beginners.")
    else:
        scores["volatility"] = 5

    # 4. Diversification (20%)
    holdings_count = info.get("holdingsCount")
    if holdings_count is None:
        # Estimate from category
        category = (info.get("category") or "").lower()
        if "total market" in category or "s&p 500" in category:
            holdings_count = 500
        elif "sector" in category:
            holdings_count = 50
        else:
            holdings_count = 100

    if holdings_count and holdings_count > 400:
        scores["diversification"] = 10
        explanations.append(f"Very diversified ({holdings_count}+ holdings) — excellent risk spread.")
    elif holdings_count and holdings_count > 100:
        scores["diversification"] = 8
    elif holdings_count and holdings_count > 30:
        scores["diversification"] = 5
        explanations.append(f"Moderately diversified ({holdings_count} holdings).")
    else:
        scores["diversification"] = 3
        explanations.append(f"Concentrated ({holdings_count or 'few'} holdings) — higher single-stock risk.")

    # Weighted total
    weights = {"expense": 0.30, "liquidity": 0.25, "volatility": 0.25, "diversification": 0.20}
    total = sum(scores.get(k, 5) * w for k, w in weights.items())
    total = round(total, 1)

    if total >= 8:
        label = "Excellent for Beginners"
        rating = "green"
    elif total >= 6:
        label = "Good for Beginners"
        rating = "green"
    elif total >= 4.5:
        label = "Moderate Risk"
        rating = "yellow"
    else:
        label = "Advanced Only"
        rating = "red"

    return {
        "total_score": total,
        "label": label,
        "rating": rating,
        "breakdown": scores,
        "explanations": explanations[:4],
    }


# ─── API Endpoints ───────────────────────────────────────────────────────────

@router.get("/profile/{symbol}")
def get_etf_profile(symbol: str):
    """Full ETF profile with holdings, returns, and beginner score."""
    try:
        ticker = yf.Ticker(symbol.upper())
        info = ticker.info

        # Verify it's an ETF
        quote_type = info.get("quoteType", "")
        if quote_type not in ("ETF", "MUTUALFUND", ""):
            pass  # Still try — some ETFs report as other types

        name = info.get("shortName") or info.get("longName") or symbol.upper()
        category = info.get("category") or "Unknown"
        fund_family = info.get("fundFamily") or "Unknown"

        # Expense ratio
        expense_ratio = info.get("annualReportExpenseRatio")
        if expense_ratio is None:
            expense_ratio = info.get("expenseRatio")
        if expense_ratio is None:
            expense_ratio = info.get("netExpenseRatio")

        # AUM
        total_assets = info.get("totalAssets") or info.get("netAssets")

        # Dividend yield
        div_yield = info.get("yield") or info.get("dividendYield") or info.get("trailingAnnualDividendYield")

        # Get historical data
        hist_1y = ticker.history(period="1y")
        hist_5y = ticker.history(period="5y")

        # Calculate returns
        return_1y = None
        return_5y = None

        if hist_1y is not None and len(hist_1y) > 20:
            start_price = hist_1y["Close"].iloc[0]
            end_price = hist_1y["Close"].iloc[-1]
            return_1y = ((end_price / start_price) - 1) * 100

        if hist_5y is not None and len(hist_5y) > 200:
            start_price = hist_5y["Close"].iloc[0]
            end_price = hist_5y["Close"].iloc[-1]
            years = len(hist_5y) / 252
            total_return = end_price / start_price
            return_5y = (total_return ** (1 / years) - 1) * 100 if years > 0 else None

        # Current price
        current_price = None
        day_change_pct = None
        if hist_1y is not None and not hist_1y.empty:
            current_price = hist_1y["Close"].iloc[-1]
            if len(hist_1y) >= 2:
                prev = hist_1y["Close"].iloc[-2]
                day_change_pct = ((current_price / prev) - 1) * 100

        # Top holdings
        top_holdings = []
        try:
            holdings_df = ticker.get_holdings()
            if holdings_df is not None and not holdings_df.empty:
                for _, row in holdings_df.head(10).iterrows():
                    holding_name = row.get("Name") or row.get("Holding") or "Unknown"
                    holding_symbol = row.get("Symbol") or row.get("Ticker") or ""
                    weight = row.get("Holding Percent") or row.get("% Assets") or row.get("Weight") or 0
                    if isinstance(weight, str):
                        weight = float(weight.replace('%', ''))
                    top_holdings.append({
                        "name": holding_name,
                        "symbol": holding_symbol,
                        "weight_pct": round(float(weight), 2) if weight else 0,
                    })
        except Exception:
            # Fallback: try info field
            pass

        # Beginner score
        beginner_score = score_etf(info, hist_1y, hist_5y)

        # Strategy description
        description = info.get("longBusinessSummary") or info.get("description") or ""
        if not description:
            description = f"Tracks {category}. Managed by {fund_family}."

        return {
            "symbol": symbol.upper(),
            "name": name,
            "category": category,
            "fund_family": fund_family,
            "description": description[:500],
            "expense_ratio": round(expense_ratio * 100, 3) if expense_ratio else None,
            "total_assets": total_assets,
            "total_assets_formatted": _format_assets(total_assets),
            "dividend_yield": round(div_yield * 100, 2) if div_yield else None,
            "current_price": round(current_price, 2) if current_price else None,
            "day_change_pct": round(day_change_pct, 2) if day_change_pct else None,
            "return_1y": round(return_1y, 2) if return_1y is not None else None,
            "return_5y_annualized": round(return_5y, 2) if return_5y is not None else None,
            "top_holdings": top_holdings,
            "beginner_score": beginner_score,
            "currency": info.get("currency", "USD"),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class CompareRequest(BaseModel):
    etf_a: str
    etf_b: str


@router.post("/compare")
def compare_etfs(req: CompareRequest):
    """Compare two ETFs side by side."""
    a = get_etf_profile(req.etf_a)
    b = get_etf_profile(req.etf_b)

    # Generate comparison insights
    insights = []

    # Expense
    if a.get("expense_ratio") and b.get("expense_ratio"):
        cheaper = req.etf_a.upper() if a["expense_ratio"] < b["expense_ratio"] else req.etf_b.upper()
        diff = abs((a["expense_ratio"] or 0) - (b["expense_ratio"] or 0))
        if diff > 0.1:
            insights.append(f"{cheaper} is significantly cheaper ({diff:.2f}% lower expense ratio). Over 10 years on a $10,000 investment this saves roughly ${int(diff * 10000 / 100 * 10)}.")

    # Returns
    if a.get("return_1y") is not None and b.get("return_1y") is not None:
        better_1y = req.etf_a.upper() if a["return_1y"] > b["return_1y"] else req.etf_b.upper()
        insights.append(f"{better_1y} had better 1-year performance ({max(a['return_1y'], b['return_1y']):.1f}% vs {min(a['return_1y'], b['return_1y']):.1f}%).")

    # Beginner score
    score_a = a["beginner_score"]["total_score"]
    score_b = b["beginner_score"]["total_score"]
    if abs(score_a - score_b) > 1:
        friendlier = req.etf_a.upper() if score_a > score_b else req.etf_b.upper()
        insights.append(f"{friendlier} is more beginner-friendly (score {max(score_a, score_b)}/10 vs {min(score_a, score_b)}/10).")

    # Dividend
    if a.get("dividend_yield") and b.get("dividend_yield"):
        higher_div = req.etf_a.upper() if a["dividend_yield"] > b["dividend_yield"] else req.etf_b.upper()
        insights.append(f"{higher_div} pays a higher dividend ({max(a['dividend_yield'], b['dividend_yield']):.2f}% vs {min(a['dividend_yield'], b['dividend_yield']):.2f}%).")

    return {
        "etf_a": a,
        "etf_b": b,
        "insights": insights,
        "recommendation": _recommend(a, b),
    }


def _recommend(a: dict, b: dict) -> str:
    """Simple recommendation for beginners."""
    score_a = a["beginner_score"]["total_score"]
    score_b = b["beginner_score"]["total_score"]
    if abs(score_a - score_b) < 0.5:
        return "Both ETFs are similar quality for beginners. Pick based on which category matches your goals better."
    better = a if score_a > score_b else b
    return f"{better['symbol']} scores higher for beginners. It offers a better combination of low cost, liquidity, and diversification."


def _format_assets(assets) -> str:
    if not assets:
        return "Unknown"
    if assets >= 1_000_000_000_000:
        return f"${assets / 1_000_000_000_000:.1f}T"
    if assets >= 1_000_000_000:
        return f"${assets / 1_000_000_000:.1f}B"
    if assets >= 1_000_000:
        return f"${assets / 1_000_000:.0f}M"
    return f"${assets:,.0f}"


@router.get("/search/{query}")
def search_etfs(query: str):
    """Search for ETFs by name or ticker."""
    # Common ETFs database for quick search
    popular_etfs = [
        {"symbol": "SPY", "name": "SPDR S&P 500 ETF", "category": "Large Blend"},
        {"symbol": "VOO", "name": "Vanguard S&P 500 ETF", "category": "Large Blend"},
        {"symbol": "VTI", "name": "Vanguard Total Stock Market ETF", "category": "Large Blend"},
        {"symbol": "QQQ", "name": "Invesco QQQ (Nasdaq 100)", "category": "Large Growth"},
        {"symbol": "IVV", "name": "iShares Core S&P 500 ETF", "category": "Large Blend"},
        {"symbol": "VEA", "name": "Vanguard FTSE Developed Markets", "category": "International"},
        {"symbol": "VWO", "name": "Vanguard FTSE Emerging Markets", "category": "Emerging Markets"},
        {"symbol": "AGG", "name": "iShares Core US Aggregate Bond", "category": "Bond"},
        {"symbol": "BND", "name": "Vanguard Total Bond Market", "category": "Bond"},
        {"symbol": "VNQ", "name": "Vanguard Real Estate ETF", "category": "Real Estate"},
        {"symbol": "VGT", "name": "Vanguard Information Technology", "category": "Technology"},
        {"symbol": "VHT", "name": "Vanguard Health Care ETF", "category": "Healthcare"},
        {"symbol": "XLE", "name": "Energy Select Sector SPDR", "category": "Energy"},
        {"symbol": "XLF", "name": "Financial Select Sector SPDR", "category": "Financials"},
        {"symbol": "ARKK", "name": "ARK Innovation ETF", "category": "Thematic Growth"},
        {"symbol": "SCHD", "name": "Schwab US Dividend Equity ETF", "category": "Dividend"},
        {"symbol": "VIG", "name": "Vanguard Dividend Appreciation", "category": "Dividend"},
        {"symbol": "JEPI", "name": "JPMorgan Equity Premium Income", "category": "Income"},
        {"symbol": "GLD", "name": "SPDR Gold Shares", "category": "Commodities"},
        {"symbol": "TLT", "name": "iShares 20+ Year Treasury Bond", "category": "Long-Term Bond"},
        {"symbol": "IEFA", "name": "iShares Core MSCI EAFE", "category": "International"},
        {"symbol": "EEM", "name": "iShares MSCI Emerging Markets", "category": "Emerging Markets"},
        {"symbol": "VYM", "name": "Vanguard High Dividend Yield", "category": "Dividend"},
        {"symbol": "XLK", "name": "Technology Select Sector SPDR", "category": "Technology"},
        {"symbol": "SOXX", "name": "iShares Semiconductor ETF", "category": "Semiconductor"},
    ]

    q = query.upper().strip()
    results = [
        etf for etf in popular_etfs
        if q in etf["symbol"] or q.lower() in etf["name"].lower() or q.lower() in etf["category"].lower()
    ]

    # If exact match or no local results, try yfinance
    if not results or len(q) <= 5:
        try:
            ticker = yf.Ticker(q)
            info = ticker.info
            if info.get("shortName"):
                results.insert(0, {
                    "symbol": q,
                    "name": info.get("shortName", q),
                    "category": info.get("category") or info.get("sector") or "ETF",
                })
        except:
            pass

    return {"query": query, "results": results[:10]}
