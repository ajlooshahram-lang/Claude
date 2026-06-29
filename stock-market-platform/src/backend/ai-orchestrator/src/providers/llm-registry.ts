import { Injectable, Logger } from '@nestjs/common';
import { LLMProvider, LLMMessage, LLMRequestOptions, LLMResponse, LLMStreamChunk } from './llm-provider.interface';
import { OpenAIProvider } from './openai.provider';
import { AnthropicProvider } from './anthropic.provider';

/**
 * LLM Provider Registry with automatic failover.
 *
 * Manages multiple LLM providers with:
 * - Priority-based selection (primary → fallback)
 * - Circuit breaker per provider (5 failures → 30s open)
 * - Health monitoring
 * - Agent-specific provider routing
 */

interface CircuitState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
}

/** Agent-to-provider preference mapping */
const AGENT_PROVIDER_MAP: Record<string, { primary: string; model: string }> = {
  'agent.investment_analyst': { primary: 'openai', model: 'gpt-4o' },
  'agent.technical_analyst': { primary: 'openai', model: 'gpt-4o' },
  'agent.quantitative': { primary: 'openai', model: 'gpt-4o' },
  'agent.news_intelligence': { primary: 'anthropic', model: 'claude-sonnet-4-20250514' },
  'agent.macro_economics': { primary: 'openai', model: 'gpt-4o' },
  'agent.portfolio_advisor': { primary: 'openai', model: 'gpt-4o' },
  'agent.education': { primary: 'anthropic', model: 'claude-sonnet-4-20250514' },
  'orchestrator.classifier': { primary: 'openai', model: 'gpt-4o-mini' },
  'orchestrator.merger': { primary: 'openai', model: 'gpt-4o' },
};

@Injectable()
export class LLMRegistry {
  private readonly logger = new Logger(LLMRegistry.name);
  private readonly providers: Map<string, LLMProvider> = new Map();
  private readonly circuits: Map<string, CircuitState> = new Map();

  private readonly FAILURE_THRESHOLD = 5;
  private readonly RECOVERY_MS = 30000;

  constructor(
    private readonly openai: OpenAIProvider,
    private readonly anthropic: AnthropicProvider,
  ) {
    this.providers.set('openai', openai);
    this.providers.set('anthropic', anthropic);
  }

  /**
   * Get the best provider for a given agent, respecting circuit breakers.
   * Falls back to alternate provider if primary is unhealthy.
   */
  getProviderForAgent(agentId: string): { provider: LLMProvider; model: string } {
    const preference = AGENT_PROVIDER_MAP[agentId] ?? { primary: 'openai', model: 'gpt-4o' };
    const primary = this.providers.get(preference.primary);

    if (primary && !this.isCircuitOpen(preference.primary)) {
      return { provider: primary, model: preference.model };
    }

    // Failover to the other provider
    const fallbackName = preference.primary === 'openai' ? 'anthropic' : 'openai';
    const fallback = this.providers.get(fallbackName);
    if (fallback && !this.isCircuitOpen(fallbackName)) {
      this.logger.warn(`Failing over from ${preference.primary} to ${fallbackName} for ${agentId}`);
      const fallbackModel = fallbackName === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-20250514';
      return { provider: fallback, model: fallbackModel };
    }

    throw new Error(`All LLM providers unavailable for agent: ${agentId}`);
  }

  /**
   * Complete with automatic failover.
   */
  async complete(
    agentId: string,
    messages: LLMMessage[],
    options?: LLMRequestOptions,
  ): Promise<LLMResponse> {
    const { provider, model } = this.getProviderForAgent(agentId);
    const opts = { ...options, model: options?.model ?? model };

    try {
      const result = await provider.complete(messages, opts);
      this.recordSuccess(provider.name);
      return result;
    } catch (error: any) {
      this.recordFailure(provider.name);
      this.logger.warn(`${provider.name} failed for ${agentId}: ${error.message}`);

      // Try fallback
      const fallbackName = provider.name === 'openai' ? 'anthropic' : 'openai';
      const fallback = this.providers.get(fallbackName);
      if (fallback && !this.isCircuitOpen(fallbackName)) {
        const fallbackModel = fallbackName === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-20250514';
        try {
          const result = await fallback.complete(messages, { ...opts, model: fallbackModel });
          this.recordSuccess(fallbackName);
          return result;
        } catch (fallbackError: any) {
          this.recordFailure(fallbackName);
          throw fallbackError;
        }
      }
      throw error;
    }
  }

  /**
   * Stream with automatic failover.
   */
  async *stream(
    agentId: string,
    messages: LLMMessage[],
    options?: LLMRequestOptions,
  ): AsyncGenerator<LLMStreamChunk> {
    const { provider, model } = this.getProviderForAgent(agentId);
    const opts = { ...options, model: options?.model ?? model };

    try {
      for await (const chunk of provider.stream(messages, opts)) {
        yield chunk;
      }
      this.recordSuccess(provider.name);
    } catch (error: any) {
      this.recordFailure(provider.name);
      this.logger.warn(`${provider.name} stream failed: ${error.message}, trying fallback`);

      const fallbackName = provider.name === 'openai' ? 'anthropic' : 'openai';
      const fallback = this.providers.get(fallbackName);
      if (fallback && !this.isCircuitOpen(fallbackName)) {
        const fallbackModel = fallbackName === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-20250514';
        for await (const chunk of fallback.stream(messages, { ...opts, model: fallbackModel })) {
          yield chunk;
        }
        this.recordSuccess(fallbackName);
      } else {
        throw error;
      }
    }
  }

  private isCircuitOpen(providerName: string): boolean {
    const circuit = this.circuits.get(providerName);
    if (!circuit || circuit.state === 'closed') return false;
    if (circuit.state === 'open') {
      if (Date.now() - circuit.lastFailure > this.RECOVERY_MS) {
        circuit.state = 'half-open';
        return false;
      }
      return true;
    }
    return false;
  }

  private recordFailure(providerName: string): void {
    const circuit = this.circuits.get(providerName) ?? { failures: 0, lastFailure: 0, state: 'closed' as const };
    circuit.failures++;
    circuit.lastFailure = Date.now();
    if (circuit.failures >= this.FAILURE_THRESHOLD) {
      circuit.state = 'open';
      this.logger.error(`Circuit OPEN for provider: ${providerName}`);
    }
    this.circuits.set(providerName, circuit);
  }

  private recordSuccess(providerName: string): void {
    const circuit = this.circuits.get(providerName);
    if (circuit) {
      circuit.failures = 0;
      circuit.state = 'closed';
    }
  }
}
