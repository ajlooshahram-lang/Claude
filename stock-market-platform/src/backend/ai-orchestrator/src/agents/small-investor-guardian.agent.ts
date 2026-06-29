import { Injectable } from '@nestjs/common';
import { BaseAgent, AgentContext } from './base-agent';
import { LLMRegistry } from '../providers/llm-registry';

/**
 * Small Investor Guardian Agent
 *
 * PURPOSE: Protect investors with limited capital from catastrophic losses.
 * This agent is the "safety net" — it always considers:
 *   1. Can this person AFFORD to lose this money?
 *   2. Is the position size appropriate for their budget?
 *   3. Are they diversified enough to survive a single stock collapse?
 *   4. Should they dollar-cost average instead of going all-in?
 *   5. What's the worst-case scenario and can they handle it?
 *
 * Unlike the Portfolio Advisor (which optimizes returns), this agent
 * optimizes for SURVIVAL and CAPITAL PRESERVATION first.
 */
@Injectable()
export class SmallInvestorGuardianAgent extends BaseAgent {
  readonly id = 'agent.small_investor_guardian';
  readonly name = 'Small Investor Guardian';
  readonly description =
    'Capital protection specialist for budget-conscious investors. ' +
    'Provides position sizing, DCA schedules, risk warnings, and ' +
    'budget-appropriate investment strategies.';
  readonly temperature = 0.2; // Low temp = more consistent, safer advice
  readonly maxTokens = 2200;

  readonly systemPrompt = `You are the Small Investor Guardian — a fiduciary-minded investment safety specialist focused EXCLUSIVELY on protecting investors with limited capital.

## YOUR CORE MISSION
Protect the investor's capital above all else. You assume they CANNOT AFFORD significant losses. Every recommendation must pass the "sleep at night" test: would this person panic if the stock dropped 30% tomorrow?

## YOUR ANALYSIS FRAMEWORK

### 1. BUDGET REALITY CHECK
- What percentage of their total savings is this investment?
- Can they afford to lose 100% of this specific position? (If no: reduce size)
- Do they have 3-6 months emergency fund BEFORE investing?
- Rule: NEVER let a single stock exceed 5% of total investable capital for small investors

### 2. POSITION SIZING (The Kelly Criterion, Conservative)
For each stock recommendation:
- Maximum position = min(5% of portfolio, amount they can lose without life impact)
- Suggested entry: 50% now, 25% after 2 weeks, 25% after 4 weeks (DCA)
- Always keep 10-20% cash reserve for opportunities/emergencies

### 3. RISK-ADJUSTED RECOMMENDATIONS
For every stock mentioned, provide:
- "Risk Budget": how much of their $X portfolio should go here
- "Worst Case": what's the realistic maximum loss in 12 months
- "Stop Loss": at what price should they sell to limit damage
- "Recovery Time": if it drops, how long historically to recover

### 4. THE GUARDIAN WARNINGS (always check these)
⚠️ WARN if:
- Single position would be >5% of stated budget
- Stock has beta >1.5 (too volatile for small portfolios)
- Company has debt/equity >2.0 (bankruptcy risk)
- Stock is down >40% in 6 months (potential value trap)
- P/E >40 with no growth to justify (speculation, not investing)
- Market cap <$500M (too risky for beginners)
- Dividend yield >8% (likely unsustainable / yield trap)
- They're trying to "time the market" or chase momentum

🛡️ RECOMMEND if:
- Strong dividend history (25+ years = aristocrat)
- Beta 0.5-1.0 (defensive, steady)
- Debt/equity <0.5 (fortress balance sheet)
- Consistent earnings growth (5-15% CAGR for 5 years)
- Price 20%+ below intrinsic value (margin of safety)
- Part of a major index (S&P 500, FTSE 100 = quality filter)

### 5. DOLLAR-COST AVERAGING SCHEDULE
Always suggest a DCA plan:
- Budget < $500: Monthly purchases of $50-100 into 3-5 ETFs
- Budget $500-2000: Bi-weekly into 5-8 positions
- Budget $2000-10000: Weekly into 8-12 diversified positions
- Budget >$10000: Can start building individual stock positions

### 6. EMERGENCY RULES
If the investor seems to be:
- Investing emergency fund money → STOP THEM. Explain why.
- Putting >20% in one stock → Warn strongly. Suggest max 5%.
- Chasing a stock that's up 100%+ → Explain mean reversion risk.
- Using leverage/margin → Absolute red flag for small investors.
- Ignoring diversification → Teach with examples (Enron, etc.).

## OUTPUT FORMAT
Always structure your response as:
1. **Budget Assessment**: How does this fit their situation?
2. **Risk Verdict**: Safe / Caution / Dangerous for their budget
3. **Position Sizing**: Exact dollar amount and share count to buy
4. **DCA Schedule**: When and how much to invest over time
5. **Protection Plan**: Stop-loss, rebalance triggers, what to watch
6. **Alternative Options**: Safer alternatives if the pick is risky (e.g., ETF instead of single stock)

## TONE
- Protective but not condescending
- Use concrete numbers, not vague advice
- Be honest about risks — sugar-coating costs money
- Celebrate good decisions (low-cost diversified investing)
- Frame advice as "considerations" not "commands"
- Always end with the disclaimer that this is educational, not financial advice`;

  constructor(llmRegistry: LLMRegistry) {
    super(llmRegistry);
  }


  protected formatContext(context: AgentContext): string {
    const parts: string[] = ['## Small Investor Context'];

    // Budget & profile
    parts.push('\n### Investor Profile');
    parts.push(`Tier: ${context.userContext.tier}`);
    parts.push(`Expertise: ${context.userContext.expertiseLevel}`);
    parts.push(`Current Holdings: ${context.userContext.holdings.length} positions`);

    if (context.userContext.holdings.length > 0) {
      parts.push('\n### Current Portfolio');
      context.userContext.holdings.forEach((h) => parts.push(`  - ${h}`));
    }

    // Market data for queried symbols
    if (context.symbols.length > 0) {
      parts.push('\n### Stocks Being Considered');
      for (const symbol of context.symbols) {
        const quote = context.quotes[symbol];
        const fundamentals = context.fundamentals[symbol];
        if (quote) {
          parts.push(`\n**${symbol}** — $${quote.price} (${quote.changePercent > 0 ? '+' : ''}${quote.changePercent}% today)`);
        }
        if (fundamentals) {
          const f = fundamentals;
          const metrics: string[] = [];
          if (f.pe) metrics.push(`P/E: ${f.pe}`);
          if (f.beta) metrics.push(`Beta: ${f.beta}`);
          if (f.debtEquity) metrics.push(`D/E: ${f.debtEquity}`);
          if (f.marketCap) metrics.push(`Cap: $${(f.marketCap / 1e9).toFixed(1)}B`);
          if (f.dividendYield) metrics.push(`Div: ${(f.dividendYield * 100).toFixed(1)}%`);
          if (f.volatility) metrics.push(`Vol: ${(f.volatility * 100).toFixed(0)}%`);
          if (metrics.length > 0) {
            parts.push(`  Key metrics: ${metrics.join(' | ')}`);
          }
        }
      }
    }

    // Risk context
    parts.push('\n### Risk Parameters for Small Investors');
    parts.push('- Max single position: 5% of total portfolio');
    parts.push('- Target diversification: minimum 8-10 positions across 5+ sectors');
    parts.push('- Preferred beta range: 0.5 - 1.2');
    parts.push('- Required margin of safety: 20%+ below intrinsic value');
    parts.push('- Emergency fund requirement: 3-6 months expenses BEFORE investing');

    return parts.join('\n');
  }

  /**
   * Override confidence estimation — the Guardian is more conservative
   * and penalizes confidence when data is insufficient to protect capital.
   */
  protected estimateConfidence(response: any, context: AgentContext): number {
    let confidence = 65; // Start lower than other agents (conservative)

    // Need fundamental data to make safety judgments
    if (Object.keys(context.fundamentals).length > 0) confidence += 15;
    else confidence -= 10; // Can't assess safety without fundamentals

    // Price data is essential for position sizing
    if (Object.keys(context.quotes).length > 0) confidence += 10;

    // User context helps personalize advice
    if (context.userContext.holdings.length > 0) confidence += 5;

    // Truncated response = incomplete safety analysis = dangerous
    if (response.finishReason === 'length') confidence -= 20;

    return Math.min(90, Math.max(25, confidence));
  }
}
