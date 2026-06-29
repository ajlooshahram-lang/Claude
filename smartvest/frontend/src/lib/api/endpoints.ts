/**
 * API Endpoint Implementations
 *
 * Contains the business logic for each public API endpoint.
 * These functions return typed response data and are called
 * by the Next.js API route handlers.
 */

import {
  PortfolioSummaryResponse, WatchlistResponse,
  StockAnalysisResponse, TaxSummaryResponse,
  OrderRequest, OrderResponse, MarketRegimeResponse,
} from './types';

// ─── GET /api/v1/portfolio ───────────────────


export function getPortfolioSummary(userId: string): PortfolioSummaryResponse {
  return {
    totalValue: 487250,
    totalCost: 412800,
    totalGain: 74450,
    totalGainPct: 18.03,
    dayChange: 2340,
    dayChangePct: 0.48,
    cashBalance: 15200,
    holdingsCount: 5,
    holdings: [
      { symbol: 'NOVO-B.CO', name: 'Novo Nordisk B', shares: 15, avgCostPerShare: 680, currentPrice: 845, marketValue: 12675, unrealizedGain: 2475, unrealizedGainPct: 24.3, weight: 26.0, dayChange: 12.8, dayChangePct: 1.54 },
      { symbol: 'IWDA.AS', name: 'iShares MSCI World', shares: 42, avgCostPerShare: 82, currentPrice: 94.5, marketValue: 3969, unrealizedGain: 525, unrealizedGainPct: 15.2, weight: 8.1, dayChange: 0.45, dayChangePct: 0.48 },
      { symbol: 'MAERSK-B.CO', name: 'A.P. Møller-Mærsk B', shares: 2, avgCostPerShare: 11200, currentPrice: 12450, marketValue: 24900, unrealizedGain: 2500, unrealizedGainPct: 11.2, weight: 51.1, dayChange: -180, dayChangePct: -1.43 },
      { symbol: 'VWS.CO', name: 'Vestas Wind Systems', shares: 50, avgCostPerShare: 142, currentPrice: 158, marketValue: 7900, unrealizedGain: 800, unrealizedGainPct: 11.3, weight: 16.2, dayChange: 4.8, dayChangePct: 3.14 },
      { symbol: 'DSV.CO', name: 'DSV', shares: 3, avgCostPerShare: 1420, currentPrice: 1523, marketValue: 4569, unrealizedGain: 309, unrealizedGainPct: 7.3, weight: 9.4, dayChange: 28.5, dayChangePct: 1.91 },
    ],
    lastUpdated: new Date().toISOString(),
    currency: 'DKK',
  };
}


// ─── GET /api/v1/watchlist ───────────────────

export function getWatchlist(userId: string): WatchlistResponse {
  return {
    items: [
      { symbol: 'NOVO-B.CO', name: 'Novo Nordisk B', currentPrice: 845, dayChange: 12.8, dayChangePct: 1.54, score: 87, signal: 'strong_buy', sentiment: 'bullish', addedAt: '2025-01-15T00:00:00Z' },
      { symbol: 'MAERSK-B.CO', name: 'A.P. Møller-Mærsk B', currentPrice: 12450, dayChange: -180, dayChangePct: -1.43, score: 52, signal: 'hold', sentiment: 'neutral', addedAt: '2025-02-20T00:00:00Z' },
      { symbol: 'VWS.CO', name: 'Vestas Wind Systems', currentPrice: 158, dayChange: 4.8, dayChangePct: 3.14, score: 74, signal: 'buy', sentiment: 'bullish', addedAt: '2025-03-01T00:00:00Z' },
      { symbol: 'DSV.CO', name: 'DSV', currentPrice: 1523, dayChange: 28.5, dayChangePct: 1.91, score: 71, signal: 'buy', sentiment: 'bullish', addedAt: '2025-04-12T00:00:00Z' },
      { symbol: 'ORSTED.CO', name: 'Ørsted', currentPrice: 412, dayChange: -8.2, dayChangePct: -1.95, score: 38, signal: 'sell', sentiment: 'bearish', addedAt: '2025-05-05T00:00:00Z' },
    ],
    count: 5,
    lastUpdated: new Date().toISOString(),
  };
}


// ─── GET /api/v1/stock/:ticker ───────────────

export function getStockAnalysis(ticker: string): StockAnalysisResponse {
  const analyses: Record<string, StockAnalysisResponse> = {
    'NOVO-B.CO': {
      symbol: 'NOVO-B.CO', name: 'Novo Nordisk B', exchange: 'OMX Copenhagen',
      currentPrice: 845, marketCap: 3420000000000, pe: 42.3, eps: 19.98, dividendYield: 1.2,
      score: 87, scoreBreakdown: { fundamental: 82, technical: 91, sentiment: 88, momentum: 85 },
      signal: 'strong_buy', signalConfidence: 0.89,
      sentiment: { overall: 'bullish', newsScore: 0.72, socialScore: 0.65, analystConsensus: 'Outperform', analystTarget: 920 },
      factorExposures: [
        { factor: 'Market', beta: 0.78, percentile: 35 },
        { factor: 'Size', beta: 0.92, percentile: 95 },
        { factor: 'Value', beta: -0.45, percentile: 12 },
        { factor: 'Momentum', beta: 0.67, percentile: 82 },
        { factor: 'Quality', beta: 0.85, percentile: 91 },
      ],
      technicals: { rsi14: 62.4, macd: { value: 8.2, signal: 5.1, histogram: 3.1 }, sma50: 812, sma200: 745, atr14: 18.5, support: 810, resistance: 880 },
      lastUpdated: new Date().toISOString(),
    },
  };

  // Return specific ticker or generate generic response
  if (analyses[ticker.toUpperCase()]) return analyses[ticker.toUpperCase()];

  return {
    symbol: ticker.toUpperCase(), name: `${ticker.toUpperCase()} Corp`, exchange: 'Unknown',
    currentPrice: 100, marketCap: 50000000000, pe: 20, eps: 5, dividendYield: 2.0,
    score: 55, scoreBreakdown: { fundamental: 50, technical: 55, sentiment: 60, momentum: 55 },
    signal: 'hold', signalConfidence: 0.5,
    sentiment: { overall: 'neutral', newsScore: 0.1, socialScore: 0.0, analystConsensus: 'Hold', analystTarget: 110 },
    factorExposures: [
      { factor: 'Market', beta: 1.0, percentile: 50 },
      { factor: 'Size', beta: 0.0, percentile: 50 },
      { factor: 'Value', beta: 0.0, percentile: 50 },
      { factor: 'Momentum', beta: 0.0, percentile: 50 },
      { factor: 'Quality', beta: 0.0, percentile: 50 },
    ],
    technicals: { rsi14: 50, macd: { value: 0, signal: 0, histogram: 0 }, sma50: 98, sma200: 95, atr14: 3, support: 95, resistance: 105 },
    lastUpdated: new Date().toISOString(),
  };
}


// ─── GET /api/v1/tax ─────────────────────────

export function getTaxSummary(userId: string): TaxSummaryResponse {
  return {
    year: new Date().getFullYear(),
    realizedGains: 42500,
    realizedLosses: 8200,
    netGain: 34300,
    estimatedTax: 9861,
    effectiveRate: 28.7,
    taxBrackets: [
      { bracket: 'First 61,000 DKK', rate: 27, amount: 34300, tax: 9261 },
      { bracket: 'Above 61,000 DKK', rate: 42, amount: 0, tax: 0 },
    ],
    lossCarryForward: 0,
    askTax: 1850,
    dividendTax: 2430,
    totalEstimatedTax: 14141,
    currency: 'DKK',
    disclaimer: 'This is an estimate for educational purposes only. Consult SKAT.dk or a tax advisor for your actual liability.',
  };
}

// ─── POST /api/v1/orders ─────────────────────

export function executeOrder(userId: string, order: OrderRequest): OrderResponse {
  const orderId = crypto.randomUUID();
  const fillPrice = order.type === 'market'
    ? (order.side === 'buy' ? 845.20 : 844.80)
    : (order.limitPrice || 845);
  const commission = Math.max(29, fillPrice * order.quantity * 0.001);

  return {
    orderId,
    status: 'filled',
    symbol: order.symbol.toUpperCase(),
    side: order.side,
    quantity: order.quantity,
    filledQuantity: order.quantity,
    avgFillPrice: fillPrice,
    type: order.type,
    timeInForce: order.timeInForce,
    createdAt: new Date().toISOString(),
    filledAt: new Date().toISOString(),
    commission: Math.round(commission * 100) / 100,
    totalCost: Math.round(fillPrice * order.quantity * 100) / 100,
    notes: order.notes,
  };
}

// ─── GET /api/v1/market-regime ───────────────

export function getMarketRegime(): MarketRegimeResponse {
  return {
    regime: 'Grinding Higher',
    confidence: 0.78,
    description: 'Markets are in a grinding-higher regime with narrow breadth leadership, modest volatility, and momentum favoring large-cap growth over value.',
    indicators: {
      vix: 14.2,
      breadth: 62.4,
      momentum: 0.73,
      volatility: 'low',
      trend: 'bullish',
    },
    previousRegime: 'Range-Bound Chop',
    regimeStartDate: '2026-05-15',
    daysSinceChange: 45,
    lastUpdated: new Date().toISOString(),
  };
}
