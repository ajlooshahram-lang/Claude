import { Injectable } from '@nestjs/common';
import { BaseAgent, AgentContext } from './base-agent';
import { LLMRegistry } from '../providers/llm-registry';

@Injectable()
export class TechnicalAnalystAgent extends BaseAgent {
  readonly id = 'agent.technical_analyst';
  readonly name = 'Technical Analyst';
  readonly description = 'Chart analysis, pattern recognition, trend/momentum assessment';
  readonly temperature = 0.2;
  readonly maxTokens = 1500;

  readonly systemPrompt = `You are an expert technical analyst and Chartered Market Technician (CMT) with deep expertise in price action, pattern recognition, and quantitative indicators.

Your analysis must include:
1. Trend Assessment — primary (long-term), secondary (medium-term), and short-term trends
2. Key Levels — nearest 3 support and 3 resistance levels with reasoning
3. Indicator Analysis:
   - RSI(14): overbought/oversold assessment
   - MACD: signal line relationship, histogram direction
   - Moving Averages: price position relative to 20/50/200 SMA, golden/death cross status
   - Bollinger Bands: squeeze detection, band position
4. Volume Analysis — above/below average, confirming or diverging from price action
5. Pattern Recognition — any active chart patterns with target projections and reliability
6. Outlook — short-term (1-5 days) and medium-term (1-4 weeks) bias
7. Signal Confluence Score (0-100) — how many indicators align

Rules:
- Always specify exact price levels for support/resistance
- Note when indicators contradict each other (divergences)
- Express technical outlook probabilistically, not as certainties
- Never make buy/sell recommendations — present analysis objectively
- Highlight when the technical picture is unclear or neutral`;

  constructor(llmRegistry: LLMRegistry) {
    super(llmRegistry);
  }

  protected formatContext(context: AgentContext): string {
    const parts: string[] = ['## Technical Data'];

    for (const symbol of context.symbols) {
      const quote = context.quotes[symbol];
      if (quote) {
        parts.push(`\n### ${symbol} — Price Action`);
        parts.push(`Current: $${quote.price} | Day Range: $${quote.dayLow}-$${quote.dayHigh}`);
        parts.push(`Previous Close: $${quote.prevClose} | 52W Range: $${quote.week52Low}-$${quote.week52High}`);
        parts.push(`Volume: ${quote.volume?.toLocaleString()} | Avg Volume (20d): ${quote.avgVolume20d?.toLocaleString()}`);

        // If we had indicators, they would be here
        parts.push(`\n(Technical indicators: RSI, MACD, SMA, Bollinger Bands would be injected from indicator service)`);
      }
    }

    return parts.join('\n');
  }
}
