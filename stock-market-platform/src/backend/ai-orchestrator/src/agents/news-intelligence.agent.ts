import { Injectable } from '@nestjs/common';
import { BaseAgent, AgentContext } from './base-agent';
import { LLMRegistry } from '../providers/llm-registry';

@Injectable()
export class NewsIntelligenceAgent extends BaseAgent {
  readonly id = 'agent.news_intelligence';
  readonly name = 'News Intelligence';
  readonly description = 'News analysis, sentiment assessment, event impact estimation';
  readonly temperature = 0.3;
  readonly maxTokens = 1200;

  readonly systemPrompt = `You are an expert financial news analyst specializing in information synthesis, sentiment assessment, and impact estimation. You process large volumes of financial news and extract actionable intelligence.

Your analysis must include:
1. Key Developments Summary — the 3-5 most important recent events for the queried company/sector
2. Sentiment Assessment:
   - Overall sentiment score interpretation (-1.0 to +1.0)
   - Sentiment trend (improving, stable, deteriorating)
   - Coverage volume (low/normal/high/extreme)
3. Event Impact Analysis — for each significant event:
   - What happened
   - Estimated impact (low/medium/high/critical)
   - Time horizon of the impact
4. Upcoming Catalysts — known future events that could move the stock
5. Contradiction Detection — where different sources disagree, present both sides
6. Insider Activity Context — if insiders are buying/selling, what it might signal

Rules:
- Always cite the source for each claim
- Distinguish between facts, analyst opinions, and speculation
- Note when news is priced in vs. potentially new information
- Flag when coverage volume is unusually high or low (could signal something)
- Never editorialize — present the news landscape objectively
- Assess news through a "market impact" lens, not personal opinion`;

  constructor(llmRegistry: LLMRegistry) {
    super(llmRegistry);
  }

  protected formatContext(context: AgentContext): string {
    const parts: string[] = ['## News & Sentiment Data'];

    if (context.news.length > 0) {
      parts.push(`\n### Recent Articles (${context.news.length} total)`);
      context.news.forEach((article: any, i: number) => {
        parts.push(`\n${i + 1}. **${article.title}**`);
        parts.push(`   Source: ${article.source} | Published: ${article.publishedAt}`);
        parts.push(`   Sentiment: ${article.sentimentScore?.toFixed(2) ?? 'N/A'} | Impact: ${article.impactLevel ?? 'unknown'}`);
        if (article.summary) parts.push(`   Summary: ${article.summary}`);
      });

      // Compute aggregate sentiment
      const scores = context.news.filter((a: any) => a.sentimentScore != null).map((a: any) => a.sentimentScore);
      if (scores.length > 0) {
        const avg = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
        parts.push(`\n### Aggregate Sentiment: ${avg.toFixed(3)} (based on ${scores.length} articles)`);
      }
    } else {
      parts.push('\nNo recent news articles available for the queried symbols.');
    }

    for (const symbol of context.symbols) {
      const quote = context.quotes[symbol];
      if (quote) {
        parts.push(`\n### ${symbol} Market Context`);
        parts.push(`Price: $${quote.price} | Change today: ${quote.changePercent}%`);
      }
    }

    return parts.join('\n');
  }
}
