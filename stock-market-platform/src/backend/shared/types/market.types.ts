// Shared market data types used across services

export interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  dayHigh: number;
  dayLow: number;
  dayOpen: number;
  prevClose: number;
  week52High: number;
  week52Low: number;
  marketCap: number;
  avgVolume20d: number;
  marketStatus: 'pre_market' | 'open' | 'post_market' | 'closed';
  lastTradeAt: string;
}

export interface Bar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap?: number;
}

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '1d' | '1w' | '1M';

export interface SymbolInfo {
  symbol: string;
  name: string;
  assetType: 'stock' | 'etf' | 'crypto' | 'forex' | 'index';
  exchange: string;
  sector?: string;
  industry?: string;
  country?: string;
  currency: string;
  marketCap?: number;
  logoUrl?: string;
}

export interface Fundamentals {
  symbol: string;
  period: 'annual' | 'quarterly' | 'ttm';
  fiscalDate: string;
  valuation: {
    peRatio: number | null;
    forwardPe: number | null;
    pegRatio: number | null;
    pbRatio: number | null;
    psRatio: number | null;
    evEbitda: number | null;
  };
  growth: {
    revenueGrowth: number | null;
    epsGrowth: number | null;
    fcfGrowth: number | null;
  };
  profitability: {
    roe: number | null;
    roic: number | null;
    grossMargin: number | null;
    operatingMargin: number | null;
    netMargin: number | null;
  };
  financialHealth: {
    debtEquity: number | null;
    currentRatio: number | null;
    freeCashFlow: number | null;
  };
  dividends: {
    yield: number | null;
    payoutRatio: number | null;
    exDividendDate: string | null;
  };
}

export interface NewsArticle {
  id: string;
  title: string;
  summary: string | null;
  source: string;
  publishedAt: string;
  symbols: string[];
  sentimentScore: number | null;
  impactLevel: 'low' | 'medium' | 'high' | 'critical' | null;
  contentUrl: string;
  imageUrl: string | null;
}
