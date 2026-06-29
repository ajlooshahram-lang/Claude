/**
 * Public REST API — Type Definitions
 *
 * These types define the request/response shapes for all public API endpoints.
 * Third-party developers use these to build integrations.
 */

// ─── Authentication ──────────────────────────────────────────────────────────

export type ApiKeyTier = 'free' | 'paid';

export interface ApiKey {
  key: string;
  userId: string;
  tier: ApiKeyTier;
  name: string;              // Human-readable label
  createdAt: string;
  lastUsedAt: string;
  requestsToday: number;
  totalRequests: number;
  isActive: boolean;
}

export interface RateLimitInfo {
  limit: number;             // Max requests per day
  remaining: number;         // Requests remaining today
  reset: number;             // Unix timestamp when limit resets
}

// ─── API Response Wrapper ────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: string;
  };
  meta: {
    requestId: string;
    timestamp: string;
    rateLimit: RateLimitInfo;
  };
}

// ─── GET /api/v1/portfolio ───────────────────────────────────────────────────

export interface PortfolioHolding {
  symbol: string;
  name: string;
  shares: number;
  avgCostPerShare: number;
  currentPrice: number;
  marketValue: number;
  unrealizedGain: number;
  unrealizedGainPct: number;
  weight: number;            // % of portfolio
  dayChange: number;
  dayChangePct: number;
}

export interface PortfolioSummaryResponse {
  totalValue: number;
  totalCost: number;
  totalGain: number;
  totalGainPct: number;
  dayChange: number;
  dayChangePct: number;
  cashBalance: number;
  holdingsCount: number;
  holdings: PortfolioHolding[];
  lastUpdated: string;
  currency: string;
}

// ─── GET /api/v1/watchlist ───────────────────────────────────────────────────

export interface WatchlistItem {
  symbol: string;
  name: string;
  currentPrice: number;
  dayChange: number;
  dayChangePct: number;
  score: number;             // 0-100 composite score
  signal: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
  sentiment: 'bullish' | 'neutral' | 'bearish';
  addedAt: string;
  notes?: string;
}

export interface WatchlistResponse {
  items: WatchlistItem[];
  count: number;
  lastUpdated: string;
}

// ─── GET /api/v1/stock/:ticker ───────────────────────────────────────────────

export interface FactorExposure {
  factor: string;
  beta: number;
  percentile: number;        // Rank vs universe (0-100)
}

export interface StockAnalysisResponse {
  symbol: string;
  name: string;
  exchange: string;
  currentPrice: number;
  marketCap: number;
  pe: number;
  eps: number;
  dividendYield: number;
  score: number;             // 0-100 composite
  scoreBreakdown: {
    fundamental: number;     // 0-100
    technical: number;       // 0-100
    sentiment: number;       // 0-100
    momentum: number;        // 0-100
  };
  signal: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
  signalConfidence: number;  // 0-1
  sentiment: {
    overall: 'bullish' | 'neutral' | 'bearish';
    newsScore: number;       // -1 to 1
    socialScore: number;     // -1 to 1
    analystConsensus: string;
    analystTarget: number;
  };
  factorExposures: FactorExposure[];
  technicals: {
    rsi14: number;
    macd: { value: number; signal: number; histogram: number };
    sma50: number;
    sma200: number;
    atr14: number;
    support: number;
    resistance: number;
  };
  lastUpdated: string;
}

// ─── GET /api/v1/tax ─────────────────────────────────────────────────────────

export interface TaxSummaryResponse {
  year: number;
  realizedGains: number;
  realizedLosses: number;
  netGain: number;
  estimatedTax: number;
  effectiveRate: number;
  taxBrackets: {
    bracket: string;
    rate: number;
    amount: number;
    tax: number;
  }[];
  lossCarryForward: number;
  askTax: number;            // Aktiesparekonto tax
  dividendTax: number;
  totalEstimatedTax: number;
  currency: string;
  disclaimer: string;
}

// ─── POST /api/v1/orders ─────────────────────────────────────────────────────

export interface OrderRequest {
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  limitPrice?: number;       // Required for limit/stop_limit
  stopPrice?: number;        // Required for stop/stop_limit
  timeInForce: 'day' | 'gtc' | 'ioc' | 'fok';
  notes?: string;
}

export interface OrderResponse {
  orderId: string;
  status: 'filled' | 'pending' | 'partially_filled' | 'rejected';
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  filledQuantity: number;
  avgFillPrice: number;
  type: string;
  timeInForce: string;
  createdAt: string;
  filledAt?: string;
  commission: number;
  totalCost: number;
  notes?: string;
}

// ─── GET /api/v1/market-regime ───────────────────────────────────────────────

export interface MarketRegimeResponse {
  regime: string;            // e.g. "Grinding Higher", "Risk-Off Correction"
  confidence: number;        // 0-1
  description: string;       // One sentence summary
  indicators: {
    vix: number;
    breadth: number;         // % stocks above 200 SMA
    momentum: number;        // Market momentum score
    volatility: string;      // 'low' | 'normal' | 'high' | 'extreme'
    trend: string;           // 'bullish' | 'neutral' | 'bearish'
  };
  previousRegime: string;
  regimeStartDate: string;
  daysSinceChange: number;
  lastUpdated: string;
}
