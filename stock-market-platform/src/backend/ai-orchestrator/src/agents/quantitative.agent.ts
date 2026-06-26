import { Injectable } from '@nestjs/common';
import { BaseAgent, AgentContext } from './base-agent';
import { LLMRegistry } from '../providers/llm-registry';

@Injectable()
export class QuantitativeAgent extends BaseAgent {
  readonly id = 'agent.quantitative';
  readonly name = 'Quantitative Analyst';
  readonly description = 'Factor analysis, risk metrics, statistical modeling, portfolio optimization';
  readonly temperature = 0.1;
  readonly maxTokens = 1500;

  readonly systemPrompt = `You are a senior quantitative analyst at a systematic hedge fund. You analyze securities and portfolios through a rigorous statistical and mathematical lens.

Your analysis must include:
1. Factor Exposure — value, momentum, quality, size, and low-volatility factor loadings
2. Risk Metrics — beta, annualized volatility, Sharpe ratio, Sortino ratio, max drawdown
3. Return Distribution — expected return, skewness, tail risk (VaR 95%)
4. Peer Ranking — where this security ranks within its peer group on risk-adjusted basis
5. Correlation Profile — correlation to major assets (S&P 500, bonds, gold, sector)
6. Regime Context — how this security behaves in different market regimes (bull/bear/sideways)

Present results with:
- Numerical precision (2-4 decimal places for ratios)
- Statistical context (percentile rank, z-scores where appropriate)
- Clear indication of time period for all metrics
- Caveats about sample size or data limitations

Rules:
- Express all returns as annualized percentages
- Use proper financial notation (σ for volatility, β for beta, α for alpha)
- Compare metrics to benchmark and peer medians
- Distinguish between realized and implied/forward metrics
- Never make investment recommendations — present quantitative facts`;

  constructor(llmRegistry: LLMRegistry) {
    super(llmRegistry);
  }

  protected formatContext(context: AgentContext): string {
    const parts: string[] = ['## Quantitative Data'];

    for (const symbol of context.symbols) {
      const quote = context.quotes[symbol];
      const fundamentals = context.fundamentals[symbol];

      if (quote) {
        parts.push(`\n### ${symbol} — Market Data`);
        parts.push(`Price: $${quote.price} | Market Cap: $${(quote.marketCap / 1e9)?.toFixed(1)}B`);
        parts.push(`Daily Change: ${quote.changePercent}%`);
      }

      if (fundamentals) {
        const v = fundamentals.valuation ?? {};
        const p = fundamentals.profitability ?? {};
        parts.push(`\n### ${symbol} — Factor Inputs`);
        parts.push(`P/E: ${v.peRatio ?? 'N/A'} | P/B: ${v.pbRatio ?? 'N/A'} | EV/EBITDA: ${v.evEbitda ?? 'N/A'}`);
        parts.push(`ROE: ${p.roe ?? 'N/A'} | ROIC: ${p.roic ?? 'N/A'} | Margins: Gross ${p.grossMargin ?? 'N/A'}, Net ${p.netMargin ?? 'N/A'}`);
      }
    }

    parts.push('\n(Note: Full return history, factor model outputs, Monte Carlo results, and regime classification would be injected from ML services in production)');
    return parts.join('\n');
  }
}
