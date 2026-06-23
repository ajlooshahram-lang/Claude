import { Injectable, Logger } from '@nestjs/common';
import { IntentClassifier, QueryIntent } from './intent-classifier';
import { AgentRouter } from './agent-router';
import { ContextAssembler } from './context-assembler';
import { ResponseMerger } from './response-merger';
import { BaseAgent, AgentOutput } from '../agents/base-agent';

export interface OrchestratorInput {
  message: string;
  userId: string;
  userTier: string;
  conversationId?: string;
  context?: {
    symbols?: string[];
    portfolioId?: string;
  };
}

export interface OrchestratorOutput {
  content: string;
  confidence: number;
  agentsUsed: string[];
  sources: Array<{ type: string; reference: string; freshness: string }>;
  suggestedFollowups: string[];
  tokensUsed: number;
}

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(
    private readonly intentClassifier: IntentClassifier,
    private readonly agentRouter: AgentRouter,
    private readonly contextAssembler: ContextAssembler,
    private readonly responseMerger: ResponseMerger,
  ) {}

  /**
   * Main orchestration pipeline:
   * 1. Classify intent
   * 2. Select agents
   * 3. Assemble context
   * 4. Execute agents (parallel where possible)
   * 5. Merge responses
   * 6. Apply compliance filter
   */
  async *processQuery(input: OrchestratorInput): AsyncGenerator<string> {
    const startTime = Date.now();

    // Step 1: Classify intents
    this.logger.debug(`Classifying intent for: "${input.message.substring(0, 100)}..."`);
    const classification = await this.intentClassifier.classify(input.message);
    this.logger.debug(`Intents: ${classification.intents.join(', ')} | Symbols: ${classification.entities.join(', ')}`);

    // Step 2: Select agents based on intents
    const selectedAgents = this.agentRouter.selectAgents(classification.intents);
    this.logger.debug(`Selected agents: ${selectedAgents.map(a => a.id).join(', ')}`);

    // Step 3: Assemble context for each agent
    const symbols = classification.entities.length > 0
      ? classification.entities
      : (input.context?.symbols ?? []);

    const context = await this.contextAssembler.assemble({
      symbols,
      userId: input.userId,
      userTier: input.userTier,
      portfolioId: input.context?.portfolioId,
    });

    // Step 4: Execute agents in parallel
    const agentPromises = selectedAgents.map(agent =>
      this.executeAgent(agent, input.message, context)
    );

    const agentOutputs = await Promise.allSettled(agentPromises);
    const successfulOutputs = agentOutputs
      .filter((r): r is PromiseFulfilledResult<AgentOutput> => r.status === 'fulfilled')
      .map(r => r.value);

    if (successfulOutputs.length === 0) {
      yield 'I apologize, but I was unable to process your request at this time. Please try again.';
      return;
    }

    // Step 5: Merge responses
    const merged = await this.responseMerger.merge(successfulOutputs, input.message);

    // Step 6: Stream the response
    // In production, this would stream tokens as they arrive from the LLM
    const chunks = this.chunkResponse(merged.content);
    for (const chunk of chunks) {
      yield chunk;
    }

    // Yield metadata at the end
    yield `\n\n---\n**Confidence:** ${merged.confidence}%\n`;
    yield `**Sources:** ${merged.sources.map(s => s.reference).join(', ')}\n`;
    yield `\n*This analysis is for educational purposes only. It does not constitute financial advice.*`;

    const duration = Date.now() - startTime;
    this.logger.log(`Query processed in ${duration}ms | Agents: ${successfulOutputs.length} | Confidence: ${merged.confidence}`);
  }

  private async executeAgent(agent: BaseAgent, query: string, context: any): Promise<AgentOutput> {
    try {
      const result = await agent.execute(query, context);
      return result;
    } catch (error: any) {
      this.logger.warn(`Agent ${agent.id} failed: ${error.message}`);
      throw error;
    }
  }

  private chunkResponse(content: string): string[] {
    // Simulate streaming by splitting into word-groups
    const words = content.split(' ');
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += 3) {
      chunks.push(words.slice(i, i + 3).join(' ') + ' ');
    }
    return chunks;
  }
}
