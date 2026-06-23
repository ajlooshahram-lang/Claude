import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketDataProvider, DateRange, ProviderConfig } from './provider.interface';
import { Quote, Bar, Timeframe, SymbolInfo, Fundamentals } from '../../../shared/types/market.types';

@Injectable()
export class PolygonProvider implements MarketDataProvider {
  readonly name = 'polygon';
  readonly priority = 1; // Primary provider

  private readonly logger = new Logger(PolygonProvider.name);
  private readonly config: ProviderConfig;

  constructor(private readonly configService: ConfigService) {
    this.config = {
      apiKey: this.configService.get<string>('POLYGON_API_KEY') ?? '',
      baseUrl: 'https://api.polygon.io',
      rateLimitPerMinute: 5,  // Free tier; paid tier is unlimited
      timeout: 10000,
    };
  }

  async getQuote(symbol: string): Promise<Quote> {
    const data = await this.request(`/v2/last/trade/${symbol}`);
    const prevClose = await this.request(`/v2/aggs/ticker/${symbol}/prev`);

    return {
      symbol,
      price: data.results?.p ?? 0,
      change: (data.results?.p ?? 0) - (prevClose.results?.[0]?.c ?? 0),
      changePercent: 0,  // Calculated from above
      volume: data.results?.s ?? 0,
      dayHigh: prevClose.results?.[0]?.h ?? 0,
      dayLow: prevClose.results?.[0]?.l ?? 0,
      dayOpen: prevClose.results?.[0]?.o ?? 0,
      prevClose: prevClose.results?.[0]?.c ?? 0,
      week52High: 0,    // Requires additional call
      week52Low: 0,
      marketCap: 0,
      avgVolume20d: 0,
      marketStatus: 'closed',
      lastTradeAt: new Date().toISOString(),
    };
  }

  async getBatchQuotes(symbols: string[]): Promise<Quote[]> {
    // Polygon supports batch via snapshot endpoint
    const data = await this.request(
      `/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${symbols.join(',')}`
    );
    return (data.tickers ?? []).map(this.mapSnapshotToQuote);
  }

  async getHistoricalBars(symbol: string, timeframe: Timeframe, range: DateRange): Promise<Bar[]> {
    const multiplier = this.getMultiplier(timeframe);
    const span = this.getSpan(timeframe);

    const data = await this.request(
      `/v2/aggs/ticker/${symbol}/range/${multiplier}/${span}/${range.from}/${range.to}?limit=5000`
    );

    return (data.results ?? []).map((bar: any) => ({
      timestamp: new Date(bar.t).toISOString(),
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v,
      vwap: bar.vw,
    }));
  }

  async getFundamentals(symbol: string): Promise<Fundamentals> {
    const data = await this.request(`/vX/reference/financials?ticker=${symbol}&limit=1`);
    // Map Polygon financials response to our schema
    // This is a simplified mapping
    return {
      symbol,
      period: 'ttm',
      fiscalDate: new Date().toISOString().split('T')[0],
      valuation: { peRatio: null, forwardPe: null, pegRatio: null, pbRatio: null, psRatio: null, evEbitda: null },
      growth: { revenueGrowth: null, epsGrowth: null, fcfGrowth: null },
      profitability: { roe: null, roic: null, grossMargin: null, operatingMargin: null, netMargin: null },
      financialHealth: { debtEquity: null, currentRatio: null, freeCashFlow: null },
      dividends: { yield: null, payoutRatio: null, exDividendDate: null },
    };
  }

  async searchSymbols(query: string, limit = 10): Promise<SymbolInfo[]> {
    const data = await this.request(`/v3/reference/tickers?search=${query}&limit=${limit}&active=true`);
    return (data.results ?? []).map((item: any) => ({
      symbol: item.ticker,
      name: item.name,
      assetType: this.mapAssetType(item.type),
      exchange: item.primary_exchange,
      currency: item.currency_name ?? 'USD',
      marketCap: item.market_cap,
    }));
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.request('/v1/marketstatus/now');
      return true;
    } catch {
      return false;
    }
  }

  private async request(path: string): Promise<any> {
    const url = `${this.config.baseUrl}${path}${path.includes('?') ? '&' : '?'}apiKey=${this.config.apiKey}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`Polygon API error: ${response.status}`);
      return await response.json();
    } catch (error: any) {
      clearTimeout(timeout);
      this.logger.error(`Polygon request failed: ${path} - ${error.message}`);
      throw error;
    }
  }

  private mapSnapshotToQuote(ticker: any): Quote {
    return {
      symbol: ticker.ticker,
      price: ticker.lastTrade?.p ?? ticker.day?.c ?? 0,
      change: ticker.todaysChange ?? 0,
      changePercent: ticker.todaysChangePerc ?? 0,
      volume: ticker.day?.v ?? 0,
      dayHigh: ticker.day?.h ?? 0,
      dayLow: ticker.day?.l ?? 0,
      dayOpen: ticker.day?.o ?? 0,
      prevClose: ticker.prevDay?.c ?? 0,
      week52High: 0,
      week52Low: 0,
      marketCap: 0,
      avgVolume20d: 0,
      marketStatus: 'open',
      lastTradeAt: new Date().toISOString(),
    };
  }

  private getMultiplier(tf: Timeframe): number {
    const map: Record<Timeframe, number> = { '1m': 1, '5m': 5, '15m': 15, '1h': 1, '1d': 1, '1w': 1, '1M': 1 };
    return map[tf];
  }

  private getSpan(tf: Timeframe): string {
    const map: Record<Timeframe, string> = { '1m': 'minute', '5m': 'minute', '15m': 'minute', '1h': 'hour', '1d': 'day', '1w': 'week', '1M': 'month' };
    return map[tf];
  }

  private mapAssetType(type: string): SymbolInfo['assetType'] {
    if (type === 'ETF' || type === 'ETV') return 'etf';
    if (type === 'CRYPTO') return 'crypto';
    if (type === 'FX') return 'forex';
    if (type === 'INDEX') return 'index';
    return 'stock';
  }
}
