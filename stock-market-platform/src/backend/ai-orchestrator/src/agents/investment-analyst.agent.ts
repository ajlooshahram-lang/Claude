import { Injectable } from '@nestjs/common';
import { BaseAgent, AgentContext } from './base-agent';
import { LLMRegistry } from '../providers/llm-registry';

@Injectable()
export class InvestmentAnalystAgent extends BaseAgent {
  readonly id = 'agent.investment_analyst';
  readonly name = 'Investment Analyst';
  readonly description = 'Fundamental analysis, valuation, business model assessment';
  readonly temperature = 0.3;
  readonly maxTokens = 2000;

  readonly systemPrompt = `You are a senior equity research analyst at a top-tier investment bank with 15 years of experience. You specialize in rigorous fundamental analysis.

Your analysis must include:
1. A concise executive summary (2-3 sentences)
2. Business model assessment — how the company makes money, competitive position
3. Key financial metrics compared to peers (P/E, EV/EBITDA, Revenue Growth, ROE, FCF Yield)
4. Growth drivers (3-5 catalysts with impact and timeframe estimates)
5. Risk factors (3-5 risks with probability assessment)
6. Moat assessment (none, narrow, or wide) with supporting evidence
7. Valuation context — is it cheap or expensive relative to history and peers?
8. Scenario analysis: Bull case (30%), Base case (50%), Bear case (20%) with target prices

Rules:
- Always cite specific numbers from the data provided
- Compare metrics to sector/peer medians
- Be balanced — present both bull and bear arguments
- Never make explicit buy/sell recommendations
- Express uncertainty when data is limited
- Adapt language complexity to the user's expertise level`;

  constructor(llmRegistry: LLMRegistry) {
    super(llmRegistry);
  }

  protected formatContext(context: AgentContext): string {
    const parts: string[] = ['## Market Context'];

    for (const symbol of context.symbols) {
      const quote = context.quotes[symbol];
      const fundamentals = context.fundamentals[symbol];

      if (quote) {
        parts.push(`\n### ${symbol} — Current Quote`);
        parts.push(`Price: $${quote.price} | Change: ${quote.changePercent}%`);
        parts.push(`Volume: ${quote.volume?.toLocaleString()} | Market Cap: $${(quote.marketCap / 1e9)?.toFixed(1)}B`);
      }

      if (fundamentals) {
        parts.push(`\n### ${symbol} — Fundamentals`);
        const v = fundamentals.valuation ?? {};
        const g = fundamentals.growth ?? {};
        const p = fundamentals.profitability ?? {};
        const h = fundamentals.financialHealth ?? {};
        parts.push(`P/E: ${v.peRatio ?? 'N/A'} | Forward P/E: ${v.forwardPe ?? 'N/A'} | PEG: ${v.pegRatio ?? 'N/A'}`);
        parts.push(`EV/EBITDA: ${v.evEbitda ?? 'N/A'} | P/S: ${v.psRatio ?? 'N/A'}`);
        parts.push(`Revenue Growth: ${g.revenueGrowth ? (g.revenueGrowth * 100).toFixed(1) + '%' : 'N/A'} | EPS Growth: ${g.epsGrowth ? (g.epsGrowth * 100).toFixed(1) + '%' : 'N/A'}`);
        parts.push(`ROE: ${p.roe ? (p.roe * 100).toFixed(1) + '%' : 'N/A'} | ROIC: ${p.roic ? (p.roic * 100).toFixed(1) + '%' : 'N/A'}`);
        parts.push(`Gross Margin: ${p.grossMargin ? (p.grossMargin * 100).toFixed(1) + '%' : 'N/A'} | Net Margin: ${p.netMargin ? (p.netMargin * 100).toFixed(1) + '%' : 'N/A'}`);
        parts.push(`Debt/Equity: ${h.debtEquity ?? 'N/A'} | FCF: $${h.freeCashFlow ? (h.freeCashFlow / 1e9).toFixed(2) + 'B' : 'N/A'}`);
      }
    }

    if (context.news.length > 0) {
      parts.push('\n### Recent News');
      context.news.slice(0, 5).forEach((article: any) => {
        parts.push(`- [${article.sentimentScore > 0 ? '+' : article.sentimentScore < 0 ? '-' : '~'}] ${article.title} (${article.source})`);
      });
    }

    parts.push(`\n### User Profile`);
    parts.push(`Expertise: ${context.userContext.expertiseLevel} | Risk: ${context.userContext.tier}`);

    return parts.join('\n');
  }
}
