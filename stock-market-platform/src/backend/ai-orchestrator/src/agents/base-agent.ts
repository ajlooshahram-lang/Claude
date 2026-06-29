import { LLMMessage, LLMRequestOptions, LLMResponse } from '../providers/llm-provider.interface';
import { LLMRegistry } from '../providers/llm-registry';

export interface AgentOutput {
  agentId: string;
  content: string;
  confidence: number;
  sources: Array<{ type: string; reference: string; freshness: string }>;
  tokensUsed: number;
}

export interface AgentContext {
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

export abstract class BaseAgent {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly systemPrompt: string;
  abstract readonly temperature: number;
  abstract readonly maxTokens: number;

  constructor(protected readonly llmRegistry: LLMRegistry) {}

  async execute(query: string, context: AgentContext): Promise<AgentOutput> {
    const messages = this.buildMessages(query, context);
    const options: LLMRequestOptions = {
      temperature: this.temperature,
      maxTokens: this.maxTokens,
    };

    const response: LLMResponse = await this.llmRegistry.complete(this.id, messages, options);

    return {
      agentId: this.id,
      content: response.content,
      confidence: this.estimateConfidence(response, context),
      sources: this.buildSources(context),
      tokensUsed: response.tokensUsed.total,
    };
  }

  protected buildMessages(query: string, context: AgentContext): LLMMessage[] {
    const contextString = this.formatContext(context);
    return [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: `${contextString}\n\n---\nUser question: ${query}` },
    ];
  }

  protected abstract formatContext(context: AgentContext): string;

  protected estimateConfidence(response: LLMResponse, context: AgentContext): number {
    // Base confidence: 70. Add points for data availability.
    let confidence = 70;
    if (context.symbols.length > 0 && Object.keys(context.quotes).length > 0) confidence += 10;
    if (Object.keys(context.fundamentals).length > 0) confidence += 10;
    if (context.news.length > 0) confidence += 5;
    if (response.finishReason === 'length') confidence -= 15; // Truncated = less reliable
    return Math.min(95, Math.max(30, confidence));
  }

  protected buildSources(context: AgentContext): AgentOutput['sources'] {
    const sources: AgentOutput['sources'] = [];
    if (Object.keys(context.quotes).length > 0) {
      sources.push({ type: 'market_data', reference: 'Real-time market data', freshness: new Date().toISOString() });
    }
    if (Object.keys(context.fundamentals).length > 0) {
      sources.push({ type: 'financial_data', reference: 'Latest quarterly filings', freshness: new Date().toISOString() });
    }
    if (context.news.length > 0) {
      sources.push({ type: 'news', reference: `${context.news.length} recent articles`, freshness: new Date().toISOString() });
    }
    return sources;
  }
}
