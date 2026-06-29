/**
 * SmartVest API Client
 *
 * Talks to the Python backend (FastAPI) to fetch real market data.
 * In development: http://localhost:8000
 * In production: whatever your backend URL is.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface StockQuote {
  symbol: string;
  name: string;
  currency: string;
  exchange: string;
  current_price: number;
  previous_close: number;
  day_change: number;
  day_change_pct: number;
  day_high: number;
  day_low: number;
  volume: number;
  avg_volume: number;
  market_cap: number | null;
  pe_ratio: number | null;
  dividend_yield: number | null;
  fifty_two_week_high: number | null;
  fifty_two_week_low: number | null;
  beta: number | null;
  sector: string;
  industry: string;
  country: string;
  timestamp: string;
}

export interface StockFundamentals {
  symbol: string;
  name: string;
  pe_ratio: number | null;
  forward_pe: number | null;
  pb_ratio: number | null;
  peg_ratio: number | null;
  ev_ebitda: number | null;
  profit_margin: number | null;
  operating_margin: number | null;
  gross_margin: number | null;
  roe: number | null;
  roa: number | null;
  revenue_growth: number | null;
  earnings_growth: number | null;
  debt_to_equity: number | null;
  current_ratio: number | null;
  dividend_yield: number | null;
  dividend_rate: number | null;
  payout_ratio: number | null;
  beta: number | null;
  market_cap: number | null;
}

export interface PriceHistory {
  symbol: string;
  period: string;
  data_points: number;
  start_date: string;
  end_date: string;
  start_price: number;
  end_price: number;
  high: number;
  low: number;
  total_return_pct: number;
}

class SmartVestAPI {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl;
  }

  async getQuote(symbol: string): Promise<StockQuote> {
    const res = await fetch(`${this.baseUrl}/api/quote/${symbol}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Failed to fetch ${symbol}: ${res.statusText}`);
    return res.json();
  }

  async getQuotes(symbols: string[]): Promise<Record<string, StockQuote>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout
    try {
      const res = await fetch(`${this.baseUrl}/api/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Failed to fetch quotes: ${res.statusText}`);
      const data = await res.json();
      return data.quotes;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getFundamentals(symbol: string): Promise<StockFundamentals> {
    const res = await fetch(`${this.baseUrl}/api/fundamentals/${symbol}`);
    if (!res.ok) throw new Error(`Failed to fetch fundamentals: ${res.statusText}`);
    return res.json();
  }

  async getHistory(symbol: string, period: string = '6mo'): Promise<PriceHistory> {
    const res = await fetch(`${this.baseUrl}/api/history/${symbol}?period=${period}`);
    if (!res.ok) throw new Error(`Failed to fetch history: ${res.statusText}`);
    return res.json();
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/health`);
      return res.ok;
    } catch {
      return false;
    }
  }
}

// Singleton instance
export const api = new SmartVestAPI();


// Re-export offline utilities for easy import
export { fetchWithOffline, isOnline } from './offline-cache';
export { OfflineBanner, OfflineGuard } from '../components/offline-banner';
