import { Injectable } from '@nestjs/common';
import { BaseAgent, AgentContext } from './base-agent';
import { LLMRegistry } from '../providers/llm-registry';

@Injectable()
export class MacroEconomicsAgent extends BaseAgent {
  readonly id = 'agent.macro_economics';
  readonly name = 'Macro Economics';
  readonly description = 'Macroeconomic analysis, cycle positioning, sector implications';
  readonly temperature = 0.3;
  readonly maxTokens = 1500;

  readonly systemPrompt = `You are a senior macroeconomist and strategist at a major asset management firm. You analyze the global economic environment and its implications for equity markets.

Your analysis must include:
1. Current Economic Regime:
   - Business cycle position (early expansion, mid expansion, late expansion, slowdown, contraction, recovery)
   - Confidence level and key supporting indicators
2. Macro Outlook:
   - Short-term (1-3 months): key data points to watch
   - Medium-term (3-12 months): likely trajectory
   - Key risks to the base case
3. Interest Rate Impact:
   - Current Fed/central bank path and market pricing
   - Impact on equities generally and the queried sector specifically
4. Sector Implications:
   - Which sectors benefit/suffer in the current environment
   - Rotation signals
5. Historical Analogy:
   - What historical period most resembles current conditions
   - What happened to equities in that period
   - Important caveats about the comparison
6. Country/Regional Attractiveness (if relevant):
   - Relative economic strength
   - Policy environment

Rules:
- Reference specific data points (CPI prints, employment numbers, PMI, yield curves)
- Distinguish between leading, coincident, and lagging indicators
- Express uncertainty about forecasts — macro is inherently uncertain
- Explain how macro factors transmit to individual stock prices
- Never predict specific market levels or dates for moves
- Adapt complexity to user's expertise level`;

  constructor(llmRegistry: LLMRegistry) {
    super(llmRegistry);
  }

  protected formatContext(context: AgentContext): string {
    const parts: string[] = ['## Macroeconomic Context'];

    // In production, this would include FRED data, yield curve, PMI, etc.
    parts.push('\n### Current Macro Data (would be injected from FRED/ECB services)');
    parts.push('- Fed Funds Rate: [latest]');
    parts.push('- CPI YoY: [latest]');
    parts.push('- Unemployment Rate: [latest]');
    parts.push('- ISM Manufacturing PMI: [latest]');
    parts.push('- 10Y Treasury Yield: [latest]');
    parts.push('- 2Y-10Y Spread: [latest]');
    parts.push('- DXY (Dollar Index): [latest]');

    for (const symbol of context.symbols) {
      const quote = context.quotes[symbol];
      const fundamentals = context.fundamentals[symbol];
      if (quote || fundamentals) {
        parts.push(`\n### ${symbol} — Sector Context`);
        if (quote) parts.push(`Price: $${quote.price} | Change: ${quote.changePercent}%`);
        // In production: sector, industry, geographic exposure
      }
    }

    if (context.news.length > 0) {
      const macroNews = context.news.filter((a: any) =>
        /fed|rate|inflation|gdp|employment|recession|economy/i.test(a.title ?? '')
      );
      if (macroNews.length > 0) {
        parts.push('\n### Macro-Related News');
        macroNews.slice(0, 3).forEach((a: any) => {
          parts.push(`- ${a.title} (${a.source})`);
        });
      }
    }

    return parts.join('\n');
  }
}
