"""
Smart Picks API

Generates daily stock recommendations based on the scoring engine,
filtered by risk profile and ranked by a combination of score + momentum.

Endpoint:
    GET /api/picks?profile=conservative|moderate|growth
"""
from fastapi import APIRouter, Query
import yfinance as yf

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from market_data.yahoo_provider import YahooProvider
from core.scorer import compute_score

router = APIRouter(prefix="/api", tags=["Smart Picks"])

provider = YahooProvider()

# Stock universe to scan for picks — well-known, liquid, global
PICK_UNIVERSE = [
    "AAPL", "MSFT", "JNJ", "KO", "PG", "PEP", "V", "UNH",
    "COST", "MRK", "LLY", "ABBV", "HD", "WMT", "MCD",
    "NOVO-B.CO", "AZN.L", "NESN.SW", "7203.T",
    "GE", "CAT", "HON", "BRK-B", "JPM", "BAC",
    "XOM", "CVX", "COP",
]


def _generate_reason(
    name: str,
    safety: float,
    value: float,
    momentum: float,
    safety_exp: str,
    value_exp: str,
    momentum_exp: str,
    beta: float | None,
    dividend_yield: float | None,
    pe_ratio: float | None,
    change_14d: float | None,
) -> str:
    """
    Generate a two-sentence plain English reason why this stock is a pick today.
    Focuses on the strongest attribute(s) of the stock.
    """
    sentences = []

    # First sentence: the strongest pillar
    if safety >= 8:
        sentences.append(f"{name} is one of the safest stocks you can own — low volatility and a rock-solid balance sheet mean your money is well-protected here.")
    elif value >= 8:
        sentences.append(f"{name} looks attractively priced right now compared to what the company actually earns — you're getting good value for your money.")
    elif momentum >= 8:
        sentences.append(f"{name} has strong upward momentum right now, meaning buyers are in control and the trend is working in your favor.")
    elif safety >= 6 and value >= 6:
        sentences.append(f"{name} combines reasonable safety with fair pricing — a balanced pick that doesn't take unnecessary risks with your money.")
    else:
        sentences.append(f"{name} scores well across safety, value, and momentum — a solid all-around pick for your portfolio.")

    # Second sentence: a specific data point
    if dividend_yield and dividend_yield > 0.02:
        dy_pct = dividend_yield * 100 if dividend_yield < 1 else dividend_yield
        sentences.append(f"It also pays a {dy_pct:.1f}% dividend, meaning you get cash back every quarter just for holding it.")
    elif change_14d and change_14d > 5:
        sentences.append(f"The price is up {change_14d:.1f}% over the last two weeks, showing the market is rewarding this company right now.")
    elif beta and beta < 0.7:
        sentences.append(f"With a beta of {beta:.2f}, it moves less than the overall market — good for sleeping well at night.")
    elif pe_ratio and pe_ratio < 15:
        sentences.append(f"At a P/E of {pe_ratio:.0f}, you're paying less per dollar of earnings than most stocks — that's a value signal.")
    else:
        sentences.append(f"It ranks in the top tier of our scoring system across the metrics that matter most for building long-term wealth.")

    return " ".join(sentences)


@router.get("/picks")
def get_smart_picks(profile: str = Query(default="moderate", description="Risk profile: conservative, moderate, or growth")):
    """
    Get today's 5 smart stock picks based on the scoring engine and risk profile.

    Conservative: prioritizes safety score, lower volatility
    Moderate: balanced across all three pillars
    Growth: prioritizes momentum and value upside
    """
    profile = profile.lower()
    if profile not in ("conservative", "moderate", "growth"):
        profile = "moderate"

    scored_stocks = []

    for symbol in PICK_UNIVERSE:
        try:
            # Get profile data (includes volatility)
            company = provider.get_company_profile(symbol)
            if not company or not company.get("current_price"):
                continue

            # Get 14-day trend
            trend = provider.get_trend_14d(symbol)
            change_14d = trend["change_pct"] if trend else None

            # Score the stock
            result = compute_score(
                symbol=symbol,
                beta=company.get("beta"),
                annualized_volatility=company.get("annualized_volatility"),
                market_cap=company.get("market_cap"),
                pe_ratio=company.get("pe_ratio"),
                dividend_yield=company.get("dividend_yield"),
                change_14d_pct=change_14d,
            )

            # Beginner rating
            vol = company.get("annualized_volatility")
            beta_val = company.get("beta")
            if vol and vol * 100 < 25 and (beta_val is None or beta_val < 1.0):
                beginner_rating = "Beginner Friendly"
            elif vol and vol * 100 > 40 or (beta_val and beta_val > 1.5):
                beginner_rating = "Risky"
            else:
                beginner_rating = "Intermediate"

            # Traffic light
            if change_14d and change_14d > 2:
                traffic_light = "up"
            elif change_14d and change_14d < -2:
                traffic_light = "down"
            else:
                traffic_light = "flat"

            # Profile-based ranking score
            if profile == "conservative":
                rank_score = result.safety_score * 0.5 + result.value_score * 0.3 + result.momentum_score * 0.2
                # Filter out risky stocks
                if beginner_rating == "Risky":
                    continue
            elif profile == "growth":
                rank_score = result.momentum_score * 0.4 + result.value_score * 0.3 + result.safety_score * 0.3
            else:
                rank_score = result.total_score

            reason = _generate_reason(
                name=company.get("name", symbol),
                safety=result.safety_score,
                value=result.value_score,
                momentum=result.momentum_score,
                safety_exp=result.safety_explanation,
                value_exp=result.value_explanation,
                momentum_exp=result.momentum_explanation,
                beta=company.get("beta"),
                dividend_yield=company.get("dividend_yield"),
                pe_ratio=company.get("pe_ratio"),
                change_14d=change_14d,
            )

            scored_stocks.append({
                "symbol": symbol,
                "name": company.get("name", symbol),
                "price": company.get("current_price"),
                "currency": company.get("currency", "USD"),
                "score": result.total_score,
                "label": result.label,
                "safety_score": result.safety_score,
                "value_score": result.value_score,
                "momentum_score": result.momentum_score,
                "beginner_rating": beginner_rating,
                "traffic_light": traffic_light,
                "change_14d_pct": change_14d,
                "reason": reason,
                "rank_score": round(rank_score, 2),
            })

        except Exception as e:
            print(f"  [PICKS] Skipping {symbol}: {e}")
            continue

    # Sort by rank score and take top 5
    scored_stocks.sort(key=lambda x: x["rank_score"], reverse=True)
    top_picks = scored_stocks[:5]

    # Remove internal rank_score from output
    for pick in top_picks:
        del pick["rank_score"]

    return {
        "profile": profile,
        "count": len(top_picks),
        "picks": top_picks,
        "disclaimer": "These picks are data-based suggestions for educational purposes only. They are NOT financial advice. All investing carries risk of loss. Always do your own research before investing real money.",
    }
