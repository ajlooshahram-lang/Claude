/**
 * LLM Provider Abstraction Layer
 *
 * All LLM interactions go through this interface, enabling:
 * - Provider failover (OpenAI → Anthropic → Local)
 * - Consistent token counting and cost tracking
 * - Streaming support across providers
 * - Structured output (JSON mode)
 */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequestOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  jsonMode?: boolean;
  stopSequences?: string[];
  /** Unique request ID for tracing */
  requestId?: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  tokensUsed: {
    input: number;
    output: number;
    total: number;
  };
  finishReason: 'stop' | 'length' | 'content_filter' | 'error';
  latencyMs: number;
}

export interface LLMStreamChunk {
  content: string;
  done: boolean;
  tokensUsed?: {
    input: number;
    output: number;
    total: number;
  };
}

export interface LLMProvider {
  readonly name: string;
  readonly priority: number;

  /**
   * Generate a completion (non-streaming).
   */
  complete(messages: LLMMessage[], options?: LLMRequestOptions): Promise<LLMResponse>;

  /**
   * Generate a streaming completion. Yields chunks as they arrive.
   */
  stream(messages: LLMMessage[], options?: LLMRequestOptions): AsyncGenerator<LLMStreamChunk>;

  /**
   * Health check — can the provider respond?
   */
  isHealthy(): Promise<boolean>;

  /**
   * Estimate token count for a set of messages (for budget management).
   */
  estimateTokens(messages: LLMMessage[]): number;
}
