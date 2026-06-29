"""
SmartVest Configuration

All settings in one place. Reads from environment variables or uses defaults.
"""
import os

# --- API Keys ---
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
ALPHA_VANTAGE_KEY = os.getenv("ALPHA_VANTAGE_KEY", "")

# --- Database ---
DATABASE_PATH = os.getenv("DATABASE_PATH", "data/smartvest.db")

# --- Server ---
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# --- Market Data ---
# Cache duration in seconds (avoid hitting rate limits)
CACHE_DURATION_SECONDS = 300  # 5 minutes

# --- User Defaults (Denmark) ---
DEFAULT_CURRENCY = "DKK"
DEFAULT_COUNTRY = "Denmark"
DEFAULT_RISK_TOLERANCE = "moderate"

# --- Global Stock Universe (sample for testing) ---
# Covers: US, Denmark, Europe, Asia
SAMPLE_STOCKS = [
    # Denmark (OMX Copenhagen)
    "NOVO-B.CO",    # Novo Nordisk
    "MAERSK-B.CO",  # Maersk
    "VWS.CO",       # Vestas Wind Systems
    "CARL-B.CO",    # Carlsberg
    # US
    "AAPL",         # Apple
    "MSFT",         # Microsoft
    "JNJ",          # Johnson & Johnson
    "KO",           # Coca-Cola
    # Europe
    "NESN.SW",      # Nestle (Switzerland)
    "AZN.L",        # AstraZeneca (London)
    # Asia
    "7203.T",       # Toyota (Tokyo)
    "9988.HK",      # Alibaba (Hong Kong)
]
