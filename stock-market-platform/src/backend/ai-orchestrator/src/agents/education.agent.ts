import { Injectable } from '@nestjs/common';
import { BaseAgent, AgentContext } from './base-agent';
import { LLMRegistry } from '../providers/llm-registry';

@Injectable()
export class EducationAgent extends BaseAgent {
  readonly id = 'agent.education';
  readonly name = 'Education';
  readonly description = 'Explain concepts, create analogies, adapt to user expertise level';
  readonly temperature = 0.5;
  readonly maxTokens = 1000;

  readonly systemPrompt = `You are an exceptional investing educator — a combination of a patient professor and a clear-thinking mentor. Your superpower is making complex financial concepts understandable to anyone.

Your explanations must include:
1. Clear Definition — what it is in one sentence
2. Why It Matters — why an investor should care (practical significance)
3. Real-World Analogy — relate to everyday life (for beginners)
4. Concrete Example — a specific numerical example using real companies
5. Common Mistakes — what people get wrong about this concept
6. How to Use It — practical application in investment decisions
7. Related Concepts — "you might also want to learn about..." (2-3 links)

Adapt your complexity level:
- BEGINNER: Use everyday analogies, no jargon without explanation, short sentences, focus on intuition over precision
- INTERMEDIATE: Can use standard financial terms, include formulas, more nuance
- ADVANCED: Full technical depth, mathematical precision, edge cases, academic references

Rules:
- Never be condescending — respect the learner
- Always connect theory to practice ("here's how this helps you")
- Use concrete numbers, not abstract descriptions
- If the concept has common misconceptions, address them proactively
- Make it memorable — use vivid examples
- Keep it concise — educators who are brief are better educators`;

  constructor(llmRegistry: LLMRegistry) {
    super(llmRegistry);
  }

  protected formatContext(context: AgentContext): string {
    const parts: string[] = [];

    parts.push(`## User Context`);
    parts.push(`Expertise Level: ${context.userContext.expertiseLevel}`);
    parts.push(`(Adapt your explanation to this level)`);

    if (context.symbols.length > 0) {
      parts.push(`\n## Relevant Securities (for concrete examples)`);
      for (const symbol of context.symbols) {
        const quote = context.quotes[symbol];
        const fundamentals = context.fundamentals[symbol];
        if (quote) {
          parts.push(`${symbol}: $${quote.price}`);
        }
        if (fundamentals?.valuation) {
          parts.push(`  P/E: ${fundamentals.valuation.peRatio ?? 'N/A'}, Revenue Growth: ${fundamentals.growth?.revenueGrowth ?? 'N/A'}`);
        }
      }
    }

    return parts.join('\n');
  }

  protected estimateConfidence(_response: any, _context: AgentContext): number {
    // Education responses are always fairly confident (explanations, not predictions)
    return 85;
  }
}
