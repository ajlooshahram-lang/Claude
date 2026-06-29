"""
AI Chat API

Answers stock market questions in plain English for beginners.
Has context about the user's profile and portfolio.

If OPENAI_API_KEY is set, uses GPT. Otherwise falls back to a
simple rule-based response system so the app still works without a key.

Endpoint:
    POST /api/chat
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional
import os

router = APIRouter(prefix="/api", tags=["Chat"])

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []
    # Context from the frontend
    risk_profile: Optional[str] = None
    portfolio_symbols: List[str] = []


SYSTEM_PROMPT = """You are SmartVest AI — a friendly, plain-English stock market assistant for a beginner investor in Denmark.

RULES:
1. NEVER use jargon without immediately explaining it in simple terms.
2. Keep answers short (2-4 paragraphs max). A beginner's attention is precious.
3. Always relate answers back to the user's situation when possible.
4. If asked about a specific stock, mention its risk level for a beginner.
5. Never give specific buy/sell instructions. Say "this is worth researching" not "buy this."
6. Always remind that you're an educational tool, not a financial advisor.
7. Use analogies from everyday life to explain concepts.
8. If you don't know something, say so honestly.

USER CONTEXT:
- Country: Denmark
- Currency: DKK
- Experience: Beginner
- Risk Profile: {risk_profile}
- Current Portfolio: {portfolio}

Respond in plain English. Be warm, supportive, and educational."""


# ─── Fallback answers (when no API key) ──────────────────────────────────────

FALLBACK_ANSWERS = {
    "p/e": "**P/E Ratio** stands for Price-to-Earnings ratio. Think of it like this: if a stock costs 100 DKK and the company earns 10 DKK per share each year, the P/E is 10. It means you're paying 10 years' worth of earnings for that stock.\n\nA lower P/E (under 15) usually means the stock is cheaper relative to what it earns. A higher P/E (above 30) means you're paying more — often because people expect the company to grow a lot.\n\nFor beginners: a P/E between 10-25 is generally considered reasonable for most established companies.",
    "dividend": "**A dividend** is money a company pays you just for owning its stock — like a thank-you for being a shareholder. If you own a stock with a 3% dividend yield and you've invested 10,000 DKK, you'd receive about 300 DKK per year, usually paid quarterly.\n\nNot all companies pay dividends. Young, fast-growing companies (like tech startups) often reinvest all their profits back into growing. Older, stable companies (like Coca-Cola or Novo Nordisk) tend to pay consistent dividends.\n\nFor beginners: dividend stocks can be great because you get paid while you wait for the stock price to grow too.",
    "beta": "**Beta** measures how much a stock moves compared to the overall market. A beta of 1.0 means it moves exactly with the market. Below 1.0 means it's calmer (good for beginners). Above 1.5 means it swings a lot more.\n\nFor example, a stock with beta 0.5 would typically drop only 5% when the market drops 10%. That's reassuring when markets get scary.\n\nFor your risk profile, look for stocks with beta under 1.0 — they'll give you a smoother ride.",
    "diversif": "**Diversification** means not putting all your eggs in one basket. If you own only one stock and that company has a bad year, you lose a lot. But if you own 8-10 stocks across different industries and countries, one bad stock won't ruin your whole portfolio.\n\nThink of it like this: if you only eat at one restaurant and it closes, you go hungry. If you know 10 restaurants, you always have options.\n\nAim for at least 5-8 stocks across 3+ different sectors (like healthcare, technology, and consumer goods).",
    "dca": "**Dollar-Cost Averaging (DCA)** means investing the same amount of money at regular intervals — like 500 DKK every month — regardless of whether the market is up or down.\n\nWhen prices are high, your 500 DKK buys fewer shares. When prices are low, it buys more shares. Over time, this averages out your purchase price and removes the stress of trying to time the market perfectly.\n\nThis is especially good for beginners because it removes emotion from the equation. You just invest consistently and let time work for you.",
    "portfolio down": "Don't panic — it's completely normal for your portfolio to go down on some days or even some weeks. The stock market goes up about 70% of days, which means it goes down 30% of days. That's just how it works.\n\nWhat matters is the long-term trend. Historically, diversified portfolios have grown over any 5+ year period, even when they had bad months along the way.\n\nAs long as the companies you own are still profitable and growing, short-term drops are usually just noise. Take a breath and check back in a week.",
    "beginner": "Here's what I'd suggest for a complete beginner:\n\n1. **Start with what you know** — invest in companies whose products you actually use and understand.\n2. **Keep it simple** — 3-5 stocks from different sectors is plenty to start.\n3. **Go slow** — invest a small amount monthly (DCA) rather than everything at once.\n4. **Focus on safety** — look for established, profitable companies with low volatility.\n5. **Learn as you go** — every stock you research teaches you something new.\n\nThe most important thing: only invest money you genuinely won't need for at least 1-2 years.",
}


def get_fallback_response(message: str, profile: str) -> str:
    """Simple keyword-matching fallback when no API key is available."""
    msg = message.lower()

    for keyword, answer in FALLBACK_ANSWERS.items():
        if keyword in msg:
            return answer

    if "apple" in msg or "aapl" in msg:
        return f"Apple (AAPL) is one of the world's largest companies — it makes iPhones, Macs, and services like iCloud. For a {profile} investor, it's worth noting that Apple has moderate volatility (it can swing 25-30% in a year) and a relatively high P/E ratio, meaning you're paying a premium for its growth.\n\nIt's a quality company, but for beginners focused on safety, there might be less volatile options. Use the Search page to check its current score and beginner rating."

    if "novo" in msg:
        return f"Novo Nordisk (NOVO-B.CO) is Denmark's largest company — they make diabetes and obesity medications. As a {profile} investor in Denmark, it's natural to consider it. The company is very profitable and dominant in its field.\n\nHowever, it has been volatile recently (high price swings). Check its current beginner rating on the Search page. If it shows as 'Risky', consider a smaller position size."

    if any(w in msg for w in ["what should i buy", "which stock", "recommend"]):
        return f"I can't tell you exactly what to buy — that depends on your budget, timeline, and which companies you understand. But here's what I'd suggest for a {profile} investor:\n\nCheck the Smart Picks page — it shows 5 stocks scored specifically for your risk profile. Each one has a plain English explanation of why it's worth looking at.\n\nAlternatively, search for companies you already know and use in daily life. Understanding what a company does is half the battle."

    return f"That's a great question! As a {profile} investor, the key things to focus on are: safety first (can the company survive a downturn?), value (am I paying a fair price?), and whether you understand what the company does.\n\nI'd suggest checking the Search page to look up specific stocks, or the Smart Picks page for data-driven suggestions tailored to your profile.\n\n*Note: I'm an educational tool, not a financial advisor. Always do your own research before investing.*"


async def get_ai_response(message: str, history: list, profile: str, portfolio: list) -> str:
    """Call OpenAI API if available, otherwise use fallback."""
    if not OPENAI_API_KEY:
        return get_fallback_response(message, profile)

    try:
        import httpx

        portfolio_str = ", ".join(portfolio) if portfolio else "No stocks yet"
        system = SYSTEM_PROMPT.format(
            risk_profile=profile or "Not set",
            portfolio=portfolio_str,
        )

        messages = [{"role": "system", "content": system}]
        for h in history[-6:]:  # Last 6 messages for context
            messages.append({"role": h.role, "content": h.content})
        messages.append({"role": "user", "content": message})

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                json={
                    "model": "gpt-4o-mini",
                    "messages": messages,
                    "max_tokens": 500,
                    "temperature": 0.7,
                },
                timeout=30.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                return data["choices"][0]["message"]["content"]
            else:
                return get_fallback_response(message, profile)
    except Exception:
        return get_fallback_response(message, profile)


@router.post("/chat")
async def chat(req: ChatRequest):
    """
    Send a message and get an AI response.
    Context-aware: knows the user's profile and portfolio.
    """
    profile = req.risk_profile or "moderate"
    response = await get_ai_response(
        req.message, req.history, profile, req.portfolio_symbols
    )
    return {
        "response": response,
        "context": {
            "profile": profile,
            "portfolio_size": len(req.portfolio_symbols),
        },
    }
