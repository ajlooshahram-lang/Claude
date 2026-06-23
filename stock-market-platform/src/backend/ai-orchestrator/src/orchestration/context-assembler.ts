import { Injectable, Logger } from '@nestjs/common';

export interface ContextRequest {
  symbols: string[];
  userId: string;
  userTier: string;
  portfolioId?: string;
}

export interface AssembledContext {
  symbols: string[];
  quotes: Record<string, any>;
  fundamentals: Record<string, any>;
  news: any[];
  userContext: {
    tier: string;
    expertiseLevel: string;
    holdings: string[];
  };
}

const MARKET_DATA_URL = process.env.MARKET_DATA_SERVICE_URL ?? 'http://localhost:3002';

@Injectable()
export class ContextAssembler {
  private readonly logger = new Logger(ContextAssembler.name);

  /**
   * Assemble the context window for agents by fetching relevant market data,
   * fundamentals, and news in parallel. Each agent receives a curated, token-
   * budgeted slice of this context.
   */
  async assemble(request: ContextRequest): Promise<AssembledContext> {
    const { symbols } = request;

    // Fetch market data for all symbols in parallel
    const [quotes, fundamentals, news] = await Promise.allSettled([
      this.fetchQuotes(symbols),
      this.fetchFundamentals(symbols),
      this.fetchNews(symbols),
    ]);

    return {
      symbols,
      quotes: this.unwrap(quotes, {}),
      fundamentals: this.unwrap(fundamentals, {}),
      news: this.unwrap(news, []),
      userContext: {
        tier: request.userTier,
        expertiseLevel: 'intermediate', // TODO: fetch from user profile
        holdings: [], // TODO: fetch portfolio holdings if portfolioId set
      },
    };
  }

  private async fetchQuotes(symbols: string[]): Promise<Record<string, any>> {
    if (symbols.length === 0) return {};
    try {
      const response = await fetch(
        `${MARKET_DATA_URL}/quotes?symbols=${symbols.join(',')}`,
        { signal: AbortSignal.timeout(3000) },
      );
      if (!response.ok) return {};
      const data = await response.json();
      const quotesMap: Record<string, any> = {};
      (data.data ?? []).forEach((q: any) => { quotesMap[q.symbol] = q; });
      return quotesMap;
    } catch (error: any) {
      this.logger.warn(`Failed to fetch quotes: ${error.message}`);
      return {};
    }
  }

  private async fetchFundamentals(symbols: string[]): Promise<Record<string, any>> {
    if (symbols.length === 0) return {};
    const result: Record<string, any> = {};
    await Promise.all(
      symbols.slice(0, 5).map(async (symbol) => {
        try {
          const response = await fetch(
            `${MARKET_DATA_URL}/fundamentals/${symbol}`,
            { signal: AbortSignal.timeout(3000) },
          );
          if (response.ok) {
            const data = await response.json();
            result[symbol] = data.data;
          }
        } catch {
          // Skip on failure; agent handles missing data gracefully
        }
      }),
    );
    return result;
  }

  private async fetchNews(symbols: string[]): Promise<any[]> {
    if (symbols.length === 0) return [];
    try {
      const response = await fetch(
        `${MARKET_DATA_URL}/news?symbols=${symbols.join(',')}&limit=10`,
        { signal: AbortSignal.timeout(3000) },
      );
      if (!response.ok) return [];
      const data = await response.json();
      return data.data ?? [];
    } catch (error: any) {
      this.logger.warn(`Failed to fetch news: ${error.message}`);
      return [];
    }
  }

  private unwrap<T>(result: PromiseSettledResult<T>, fallback: T): T {
    return result.status === 'fulfilled' ? result.value : fallback;
  }
}
