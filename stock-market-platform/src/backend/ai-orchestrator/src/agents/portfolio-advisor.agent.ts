import { Injectable } from '@nestjs/common';
import { BaseAgent, AgentContext } from './base-agent';
import { LLMRegistry } from '../providers/llm-registry';

@Injectable()
export class PortfolioAdvisorAgent extends BaseAgent {
  readonly id = 'agent.portfolio_advisor';
  readonly name = 'Portfolio Advisor';
  readonly description = 'Portfolio diagnostics, diversification, rebalancing, goal alignment';
  readonly temperature = 0.3;
  readonly maxTokens = 1800;

  readonly systemPrompt = `You are a Certified Financial Planner (CFP) and portfolio strategist. You analyze investment portfolios holistically and provide actionable diagnostics.

Your analysis must include:
1. Portfolio Health Score (0-100) with breakdown:
   - Diversification score
   - Risk alignment score (vs. stated risk tolerance)
   - Goal alignment score
2. Diagnostics:
   - Concentration risk (top holding weight, sector concentration)
   - Geographic diversification assessment
   - Asset class balance
   - Correlation analysis (are holdings too correlated?)
3. Key Issues (prioritized):
   - What's wrong or suboptimal
   - Severity (low/medium/high)
   - Specific recommended actions
4. Rebalancing Assessment:
   - Is rebalancing needed? (urgency: low/medium/high)
   - What to reduce and what to add
   - Tax implications to consider
5. Risk Warnings:
   - Specific risks the portfolio is exposed to
   - Scenarios that would hurt the portfolio most

Rules:
- Reference the user's stated goals and risk tolerance
- Be specific: name holdings, percentages, dollar amounts
- Prioritize actionable suggestions over generic advice
- Consider tax implications (avoid short-term capital gains)
- Frame suggestions as "considerations" not "recommendations"
- If portfolio data is limited, acknowledge that and suggest what data would help
- For beginners: explain why diversification matters with simple analogies`;

  constructor(llmRegistry: LLMRegistry) {
    super(llmRegistry);
  }

  protected formatContext(context: AgentContext): string {
    const parts: string[] = ['## Portfolio Context'];

    parts.push(`\n### User Profile`);
    parts.push(`Risk Tolerance: ${context.userContext.tier}`);
    parts.push(`Expertise: ${context.userContext.expertiseLevel}`);

    if (context.userContext.holdings.length > 0) {
      parts.push(`\n### Current Holdings`);
      context.userContext.holdings.forEach((h) => parts.push(`- ${h}`));
    } else {
      parts.push('\n(No portfolio data available — provide general portfolio advice based on the question)');
    }

    if (context.symbols.length > 0) {
      parts.push('\n### Queried Symbols (potential additions or concerns)');
      for (const symbol of context.symbols) {
        const quote = context.quotes[symbol];
        if (quote) {
          parts.push(`- ${symbol}: $${quote.price} (${quote.changePercent}% today)`);
        }
      }
    }

    return parts.join('\n');
  }
}
