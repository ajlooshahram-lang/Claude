import { Injectable, Logger } from '@nestjs/common';

export enum QueryIntent {
  VALUATION = 'valuation',
  FUNDAMENTAL = 'fundamental',
  EARNINGS = 'earnings',
  COMPARISON = 'comparison',
  THESIS = 'thesis',
  TECHNICAL = 'technical',
  ENTRY_EXIT = 'entry_exit',
  CHART_PATTERN = 'chart_pattern',
  MOMENTUM = 'momentum',
  RISK = 'risk',
  PORTFOLIO_ANALYSIS = 'portfolio_analysis',
  FACTOR = 'factor',
  CORRELATION = 'correlation',
  NEWS = 'news',
  SENTIMENT = 'sentiment',
  EVENT = 'event',
  MACRO = 'macro',
  INTEREST_RATE = 'interest_rate',
  SECTOR_ROTATION = 'sector_rotation',
  PORTFOLIO_REVIEW = 'portfolio_review',
  REBALANCE = 'rebalance',
  DIVERSIFICATION = 'diversification',
  EXPLAIN = 'explain',
  LEARN = 'learn',
  WHAT_IS = 'what_is',
  // Small Investor Guardian intents
  BUDGET_INVEST = 'budget_invest',
  POSITION_SIZE = 'position_size',
  CAPITAL_PROTECTION = 'capital_protection',
  DCA_SCHEDULE = 'dca_schedule',
  SMART_PICK = 'smart_pick',
  BEGINNER_HELP = 'beginner_help',
}

export interface ClassificationResult {
  intents: QueryIntent[];
  entities: string[];       // Extracted stock symbols
  confidence: number;
}

@Injectable()
export class IntentClassifier {
  private readonly logger = new Logger(IntentClassifier.name);

  /**
   * Classify user query into intents and extract entities.
   * In production: uses GPT-4o-mini with function calling for fast classification.
   * This implementation uses pattern matching as a fast fallback.
   */
  async classify(query: string): Promise<ClassificationResult> {
    const normalizedQuery = query.toLowerCase();
    const intents: QueryIntent[] = [];
    const entities: string[] = [];

    // Extract stock symbols (uppercase 1-5 letter words that look like tickers)
    const tickerPattern = /\b([A-Z]{1,5})\b/g;
    const matches = query.match(tickerPattern);
    if (matches) {
      const commonWords = new Set(['I', 'A', 'THE', 'IS', 'IT', 'MY', 'IN', 'TO', 'AND', 'OR', 'FOR', 'OF', 'ON', 'AT', 'BY']);
      entities.push(...matches.filter(m => !commonWords.has(m)));
    }

    // Intent classification via keyword patterns
    if (/overvalued|undervalued|fair value|valuation|p\/e|pe ratio|worth/i.test(normalizedQuery)) {
      intents.push(QueryIntent.VALUATION);
    }
    if (/fundamental|financial|revenue|earnings|profit|growth|balance sheet/i.test(normalizedQuery)) {
      intents.push(QueryIntent.FUNDAMENTAL);
    }
    if (/technical|chart|support|resistance|breakout|indicator/i.test(normalizedQuery)) {
      intents.push(QueryIntent.TECHNICAL);
    }
    if (/compare|versus|vs\.?|better|which one/i.test(normalizedQuery)) {
      intents.push(QueryIntent.COMPARISON);
    }
    if (/news|headline|announcement|event|happened/i.test(normalizedQuery)) {
      intents.push(QueryIntent.NEWS);
    }
    if (/risk|volatile|safe|dangerous|drawdown|var/i.test(normalizedQuery)) {
      intents.push(QueryIntent.RISK);
    }
    if (/portfolio|holdings|allocation|diversif/i.test(normalizedQuery)) {
      intents.push(QueryIntent.PORTFOLIO_REVIEW);
    }
    if (/macro|interest rate|inflation|recession|economy|fed|gdp/i.test(normalizedQuery)) {
      intents.push(QueryIntent.MACRO);
    }
    if (/thesis|analysis|deep dive|full analysis/i.test(normalizedQuery)) {
      intents.push(QueryIntent.THESIS);
    }
    if (/what is|explain|how does|define|meaning of/i.test(normalizedQuery)) {
      intents.push(QueryIntent.EXPLAIN);
    }
    if (/entry|exit|buy zone|sell zone|when to/i.test(normalizedQuery)) {
      intents.push(QueryIntent.ENTRY_EXIT);
    }
    if (/rebalance|optimize|adjust|too much/i.test(normalizedQuery)) {
      intents.push(QueryIntent.REBALANCE);
    }
    if (/sector rotation|cyclical|defensive/i.test(normalizedQuery)) {
      intents.push(QueryIntent.SECTOR_ROTATION);
    }
    if (/sentiment|positive|negative|bullish|bearish/i.test(normalizedQuery)) {
      intents.push(QueryIntent.SENTIMENT);
    }

    // Small Investor Guardian intents
    if (/budget|afford|small amount|limited money|how much|can i invest|little money|\$\d+/i.test(normalizedQuery)) {
      intents.push(QueryIntent.BUDGET_INVEST);
    }
    if (/position size|how many shares|how much to buy|allocation|percentage/i.test(normalizedQuery)) {
      intents.push(QueryIntent.POSITION_SIZE);
    }
    if (/protect|safe|lose money|capital|preservation|can't afford|don't lose/i.test(normalizedQuery)) {
      intents.push(QueryIntent.CAPITAL_PROTECTION);
    }
    if (/dca|dollar cost|monthly|weekly invest|regular invest|auto invest/i.test(normalizedQuery)) {
      intents.push(QueryIntent.DCA_SCHEDULE);
    }
    if (/best stock|top pick|smart pick|recommend|suggest|which stock|what to buy/i.test(normalizedQuery)) {
      intents.push(QueryIntent.SMART_PICK);
    }
    if (/beginner|new to|first time|getting started|never invested|start investing/i.test(normalizedQuery)) {
      intents.push(QueryIntent.BEGINNER_HELP);
    }

    // Default: if no intents detected, treat as fundamental analysis
    if (intents.length === 0) {
      intents.push(entities.length > 0 ? QueryIntent.FUNDAMENTAL : QueryIntent.EXPLAIN);
    }

    return {
      intents,
      entities: [...new Set(entities)],
      confidence: intents.length > 0 ? 0.85 : 0.5,
    };
  }
}
