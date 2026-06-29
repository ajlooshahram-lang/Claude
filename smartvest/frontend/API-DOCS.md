# SmartVest Public REST API Documentation

## Overview

The SmartVest API allows third-party developers to build on top of
the platform. Access portfolio data, stock analysis, market signals,
and execute orders programmatically.

**Base URL:** `https://your-domain.com/api/v1`

---

## Authentication

All requests require an API key in the Authorization header:

```
Authorization: Bearer sv_live_free_a1b2c3d4e5f6...
```

### API Key Tiers

| Tier | Rate Limit | Cost |
|------|-----------|------|
| Free | 100 requests/day | $0 |
| Paid | 10,000 requests/day | Included with Pro/Institutional subscription |

### Getting an API Key

1. Log in to SmartVest
2. Go to Settings > API Keys
3. Click "Generate New Key"
4. Choose Free or Paid tier
5. Copy your key (shown only once)

---

## Rate Limiting

Every response includes rate limit headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1719792000
```

When rate limited, you receive a `429` status code.

---

## Response Format

All responses follow this structure:

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-06-29T08:00:00Z",
    "rateLimit": {
      "limit": 100,
      "remaining": 87,
      "reset": 1719792000
    }
  }
}
```

Error responses:

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Rate limit exceeded..."
  },
  "meta": { ... }
}
```

---

## Endpoints


### GET /api/v1/portfolio

Returns the authenticated user's portfolio summary with all holdings.

**Example Request:**
```bash
curl -H "Authorization: Bearer sv_live_paid_abc123" \
  https://your-domain.com/api/v1/portfolio
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "totalValue": 487250,
    "totalCost": 412800,
    "totalGain": 74450,
    "totalGainPct": 18.03,
    "dayChange": 2340,
    "dayChangePct": 0.48,
    "cashBalance": 15200,
    "holdingsCount": 5,
    "holdings": [
      {
        "symbol": "NOVO-B.CO",
        "name": "Novo Nordisk B",
        "shares": 15,
        "avgCostPerShare": 680,
        "currentPrice": 845,
        "marketValue": 12675,
        "unrealizedGain": 2475,
        "unrealizedGainPct": 24.3,
        "weight": 26.0,
        "dayChange": 12.8,
        "dayChangePct": 1.54
      }
    ],
    "lastUpdated": "2026-06-29T08:00:00Z",
    "currency": "DKK"
  },
  "meta": { ... }
}
```

---

### GET /api/v1/watchlist

Returns the user's watchlist with scores and signals for each stock.

**Example Request:**
```bash
curl -H "Authorization: Bearer sv_live_paid_abc123" \
  https://your-domain.com/api/v1/watchlist
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "symbol": "NOVO-B.CO",
        "name": "Novo Nordisk B",
        "currentPrice": 845,
        "dayChange": 12.8,
        "dayChangePct": 1.54,
        "score": 87,
        "signal": "strong_buy",
        "sentiment": "bullish",
        "addedAt": "2025-01-15T00:00:00Z"
      }
    ],
    "count": 5,
    "lastUpdated": "2026-06-29T08:00:00Z"
  },
  "meta": { ... }
}
```

**Signal values:** `strong_buy`, `buy`, `hold`, `sell`, `strong_sell`
**Sentiment values:** `bullish`, `neutral`, `bearish`


---

### GET /api/v1/stock/:ticker

Returns comprehensive analysis for any stock ticker including score,
signal, sentiment, factor exposures, and technicals.

**Parameters:**
- `:ticker` — Stock symbol (e.g., `NOVO-B.CO`, `AAPL`, `MAERSK-B.CO`)

**Example Request:**
```bash
curl -H "Authorization: Bearer sv_live_paid_abc123" \
  https://your-domain.com/api/v1/stock/NOVO-B.CO
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "symbol": "NOVO-B.CO",
    "name": "Novo Nordisk B",
    "exchange": "OMX Copenhagen",
    "currentPrice": 845,
    "marketCap": 3420000000000,
    "pe": 42.3,
    "eps": 19.98,
    "dividendYield": 1.2,
    "score": 87,
    "scoreBreakdown": {
      "fundamental": 82,
      "technical": 91,
      "sentiment": 88,
      "momentum": 85
    },
    "signal": "strong_buy",
    "signalConfidence": 0.89,
    "sentiment": {
      "overall": "bullish",
      "newsScore": 0.72,
      "socialScore": 0.65,
      "analystConsensus": "Outperform",
      "analystTarget": 920
    },
    "factorExposures": [
      { "factor": "Market", "beta": 0.78, "percentile": 35 },
      { "factor": "Size", "beta": 0.92, "percentile": 95 },
      { "factor": "Value", "beta": -0.45, "percentile": 12 },
      { "factor": "Momentum", "beta": 0.67, "percentile": 82 },
      { "factor": "Quality", "beta": 0.85, "percentile": 91 }
    ],
    "technicals": {
      "rsi14": 62.4,
      "macd": { "value": 8.2, "signal": 5.1, "histogram": 3.1 },
      "sma50": 812,
      "sma200": 745,
      "atr14": 18.5,
      "support": 810,
      "resistance": 880
    },
    "lastUpdated": "2026-06-29T08:00:00Z"
  },
  "meta": { ... }
}
```

---

### GET /api/v1/tax

Returns the tax summary for the current year including estimated
Danish capital gains tax (aktieindkomst).

**Example Request:**
```bash
curl -H "Authorization: Bearer sv_live_paid_abc123" \
  https://your-domain.com/api/v1/tax
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "year": 2026,
    "realizedGains": 42500,
    "realizedLosses": 8200,
    "netGain": 34300,
    "estimatedTax": 9861,
    "effectiveRate": 28.7,
    "taxBrackets": [
      { "bracket": "First 61,000 DKK", "rate": 27, "amount": 34300, "tax": 9261 },
      { "bracket": "Above 61,000 DKK", "rate": 42, "amount": 0, "tax": 0 }
    ],
    "lossCarryForward": 0,
    "askTax": 1850,
    "dividendTax": 2430,
    "totalEstimatedTax": 14141,
    "currency": "DKK",
    "disclaimer": "Estimate only. Consult SKAT.dk."
  },
  "meta": { ... }
}
```


---

### POST /api/v1/orders

Submit a new order with full execution logic. Returns the fill
details including price, commission, and status.

**Request Body:**
```json
{
  "symbol": "NOVO-B.CO",
  "side": "buy",
  "quantity": 5,
  "type": "market",
  "timeInForce": "day",
  "notes": "Adding to position on dip"
}
```

**Required fields:** `symbol`, `side`, `quantity`, `type`, `timeInForce`
**Optional fields:** `limitPrice` (for limit orders), `stopPrice` (for stop orders), `notes`

**Order Types:** `market`, `limit`, `stop`, `stop_limit`
**Side:** `buy`, `sell`
**Time in Force:** `day`, `gtc` (good til cancelled), `ioc` (immediate or cancel), `fok` (fill or kill)

**Example Request:**
```bash
curl -X POST \
  -H "Authorization: Bearer sv_live_paid_abc123" \
  -H "Content-Type: application/json" \
  -d '{"symbol":"NOVO-B.CO","side":"buy","quantity":5,"type":"market","timeInForce":"day"}' \
  https://your-domain.com/api/v1/orders
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "orderId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "filled",
    "symbol": "NOVO-B.CO",
    "side": "buy",
    "quantity": 5,
    "filledQuantity": 5,
    "avgFillPrice": 845.20,
    "type": "market",
    "timeInForce": "day",
    "createdAt": "2026-06-29T08:15:00Z",
    "filledAt": "2026-06-29T08:15:01Z",
    "commission": 29.00,
    "totalCost": 4226.00,
    "notes": "Adding to position on dip"
  },
  "meta": { ... }
}
```

---

### GET /api/v1/market-regime

Returns the current market regime classification with confidence
score and supporting indicators.

**Example Request:**
```bash
curl -H "Authorization: Bearer sv_live_free_abc123" \
  https://your-domain.com/api/v1/market-regime
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "regime": "Grinding Higher",
    "confidence": 0.78,
    "description": "Markets are in a grinding-higher regime with narrow breadth leadership, modest volatility, and momentum favoring large-cap growth.",
    "indicators": {
      "vix": 14.2,
      "breadth": 62.4,
      "momentum": 0.73,
      "volatility": "low",
      "trend": "bullish"
    },
    "previousRegime": "Range-Bound Chop",
    "regimeStartDate": "2026-05-15",
    "daysSinceChange": 45,
    "lastUpdated": "2026-06-29T08:00:00Z"
  },
  "meta": { ... }
}
```

**Possible regime values:**
- `Risk-On Rally`
- `Grinding Higher`
- `Range-Bound Chop`
- `Sector Rotation`
- `Risk-Off Correction`
- `High Volatility Sell-Off`
- `Bear Market`

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing Authorization header |
| `INVALID_KEY` | 401 | API key is invalid or revoked |
| `RATE_LIMITED` | 429 | Daily request limit exceeded |
| `INVALID_PARAM` | 400 | Invalid URL parameter |
| `INVALID_BODY` | 400 | Request body is not valid JSON |
| `MISSING_FIELDS` | 400 | Required fields missing |
| `INVALID_SIDE` | 400 | Order side must be buy/sell |
| `INVALID_QUANTITY` | 400 | Quantity must be > 0 |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## SDKs & Libraries

### JavaScript/TypeScript
```typescript
const response = await fetch('https://your-domain.com/api/v1/portfolio', {
  headers: { 'Authorization': 'Bearer sv_live_paid_abc123' }
});
const { data } = await response.json();
console.log(data.totalValue); // 487250
```

### Python
```python
import requests

headers = {'Authorization': 'Bearer sv_live_paid_abc123'}
r = requests.get('https://your-domain.com/api/v1/stock/NOVO-B.CO', headers=headers)
data = r.json()['data']
print(f"Score: {data['score']}, Signal: {data['signal']}")
```

### cURL
```bash
curl -s -H "Authorization: Bearer YOUR_KEY" \
  https://your-domain.com/api/v1/market-regime | jq .data.regime
```

---

## Changelog

- **v1.0** (June 2026) — Initial release with 6 endpoints

---

*Last updated: June 2026*
