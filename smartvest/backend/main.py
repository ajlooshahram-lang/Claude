"""
SmartVest Backend — Main Entry Point

Starts the FastAPI server with all routes.

Run locally with:
    cd backend
    python main.py

Or:
    uvicorn main:app --reload --port 8000
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.routes_market_data import router as market_data_router
from api.routes_search import router as search_router
from api.routes_sectors import router as sectors_router
from api.routes_picks import router as picks_router
from api.routes_chat import router as chat_router
from api.routes_performance import router as performance_router
from api.routes_weekly import router as weekly_router
from api.routes_broker import router as broker_router
from api.routes_community import router as community_router
from api.routes_inflation import router as inflation_router
from api.routes_currency import router as currency_router
from api.routes_backtest import router as backtest_router
from api.routes_anomalies import router as anomalies_router
from api.routes_flow import router as flow_router
from api.routes_earnings import router as earnings_router
from api.routes_correlation import router as correlation_router
from api.routes_options import router as options_router
from api.routes_sentiment import router as sentiment_router
from api.routes_rebalance import router as rebalance_router
from api.routes_shadow import router as shadow_router

# Create the app
app = FastAPI(
    title="SmartVest API",
    description="AI-powered stock market assistant for beginner investors",
    version="0.1.0",
)

# Allow frontend to connect (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3100"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(market_data_router)
app.include_router(search_router)
app.include_router(sectors_router)
app.include_router(picks_router)
app.include_router(chat_router)
app.include_router(performance_router)
app.include_router(weekly_router)
app.include_router(broker_router)
app.include_router(community_router)
app.include_router(inflation_router)
app.include_router(currency_router)
app.include_router(backtest_router)
app.include_router(anomalies_router)
app.include_router(flow_router)
app.include_router(earnings_router)
app.include_router(correlation_router)
app.include_router(options_router)
app.include_router(sentiment_router)
app.include_router(rebalance_router)
app.include_router(shadow_router)


# Global error handler — returns friendly JSON instead of crashing
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={
            "error": "Something went wrong",
            "detail": str(exc),
            "hint": "This is usually a temporary issue with the data provider. Try again in a moment.",
        },
    )


@app.get("/")
def root():
    return {
        "app": "SmartVest",
        "version": "0.1.0",
        "description": "Your AI-powered stock market assistant",
        "docs": "/docs",
        "endpoints": {
            "health": "/api/health",
            "quote": "/api/quote/{symbol}",
            "quotes": "POST /api/quotes",
            "fundamentals": "/api/fundamentals/{symbol}",
            "history": "/api/history/{symbol}?period=6mo",
        },
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
