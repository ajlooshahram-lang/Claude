import { Quote, Bar, Timeframe, SymbolInfo, Fundamentals } from '../../../shared/types/market.types';

export interface DateRange {
  from: string;
  to: string;
}

export interface MarketDataProvider {
  readonly name: string;
  readonly priority: number;

  getQuote(symbol: string): Promise<Quote>;
  getBatchQuotes(symbols: string[]): Promise<Quote[]>;
  getHistoricalBars(symbol: string, timeframe: Timeframe, range: DateRange): Promise<Bar[]>;
  getFundamentals(symbol: string): Promise<Fundamentals>;
  searchSymbols(query: string, limit?: number): Promise<SymbolInfo[]>;
  isHealthy(): Promise<boolean>;
}

export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  rateLimitPerMinute: number;
  timeout: number;
}
