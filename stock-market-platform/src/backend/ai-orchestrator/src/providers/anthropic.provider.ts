import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LLMProvider,
  LLMMessage,
  LLMRequestOptions,
  LLMResponse,
  LLMStreamChunk,
} from './llm-provider.interface';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_MAX_TOKENS = 2000;
const API_VERSION = '2023-06-01';

@Injectable()
export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  readonly priority = 2; // Secondary/fallback provider

  private readonly logger = new Logger(AnthropicProvider.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('ANTHROPIC_API_KEY') ?? '';
    this.baseUrl = this.config.get<string>('ANTHROPIC_BASE_URL') ?? 'https://api.anthropic.com/v1';
  }

  async complete(messages: LLMMessage[], options?: LLMRequestOptions): Promise<LLMResponse> {
    const startTime = Date.now();
    const model = options?.model ?? DEFAULT_MODEL;

    // Anthropic uses a separate system parameter
    const systemMessage = messages.find((m) => m.role === 'system');
    const chatMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const body: any = {
      model,
      messages: chatMessages,
      max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: options?.temperature ?? DEFAULT_TEMPERATURE,
    };

    if (systemMessage) {
      body.system = systemMessage.content;
    }
    if (options?.stopSequences?.length) {
      body.stop_sequences = options.stopSequences;
    }

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': API_VERSION,
        ...(options?.requestId ? { 'X-Request-ID': options.requestId } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`Anthropic API error ${response.status}: ${errorText}`);
      throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.content
      ?.filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('') ?? '';

    return {
      content,
      model: data.model,
      tokensUsed: {
        input: data.usage?.input_tokens ?? 0,
        output: data.usage?.output_tokens ?? 0,
        total: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      },
      finishReason: this.mapStopReason(data.stop_reason),
      latencyMs: Date.now() - startTime,
    };
  }

  async *stream(messages: LLMMessage[], options?: LLMRequestOptions): AsyncGenerator<LLMStreamChunk> {
    const model = options?.model ?? DEFAULT_MODEL;

    const systemMessage = messages.find((m) => m.role === 'system');
    const chatMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const body: any = {
      model,
      messages: chatMessages,
      max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: options?.temperature ?? DEFAULT_TEMPERATURE,
      stream: true,
    };

    if (systemMessage) {
      body.system = systemMessage.content;
    }

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': API_VERSION,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic stream error: ${response.status} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);

          try {
            const event = JSON.parse(data);

            switch (event.type) {
              case 'content_block_delta':
                if (event.delta?.type === 'text_delta') {
                  yield { content: event.delta.text, done: false };
                }
                break;

              case 'message_delta':
                outputTokens = event.usage?.output_tokens ?? outputTokens;
                if (event.delta?.stop_reason) {
                  yield {
                    content: '',
                    done: true,
                    tokensUsed: { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens },
                  };
                  return;
                }
                break;

              case 'message_start':
                inputTokens = event.message?.usage?.input_tokens ?? 0;
                break;

              case 'error':
                this.logger.error(`Stream error: ${JSON.stringify(event.error)}`);
                throw new Error(`Anthropic stream error: ${event.error?.message}`);
            }
          } catch (e: any) {
            if (e.message?.includes('Anthropic stream error')) throw e;
            // Skip malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { content: '', done: true, tokensUsed: { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens } };
  }

  async isHealthy(): Promise<boolean> {
    try {
      // Simple health check: try a tiny request
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(10000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  estimateTokens(messages: LLMMessage[]): number {
    // Anthropic uses ~3.5 chars per token on average
    const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    return Math.ceil(totalChars / 3.5) + messages.length * 4;
  }

  private mapStopReason(reason?: string): LLMResponse['finishReason'] {
    switch (reason) {
      case 'end_turn': return 'stop';
      case 'max_tokens': return 'length';
      case 'stop_sequence': return 'stop';
      default: return 'stop';
    }
  }
}
