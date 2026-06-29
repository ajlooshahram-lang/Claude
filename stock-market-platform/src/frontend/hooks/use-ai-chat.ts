'use client';

import { useState, useCallback, useRef } from 'react';
import { useAuthStore } from '../stores/auth.store';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  agentsUsed?: string[];
  confidence?: number;
  sources?: Array<{ type: string; reference: string; freshness: string }>;
  isStreaming?: boolean;
}

interface UseChatOptions {
  conversationId?: string;
  context?: { symbols?: string[]; portfolioId?: string };
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/v1';

export function useAIChat(options?: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const token = useAuthStore((s) => s.accessToken);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isStreaming) return;

    setError(null);

    // Add user message
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // Add placeholder assistant message (will be streamed into)
    const assistantId = crypto.randomUUID();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };
    setMessages((prev) => [...prev, assistantMsg]);

    setIsStreaming(true);
    abortRef.current = new AbortController();

    try {
      const response = await fetch(`${API_BASE}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: content,
          conversationId: options?.conversationId,
          context: options?.context,
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      // Parse SSE stream
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      let metadata: Partial<ChatMessage> = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();

          if (trimmed.startsWith('event: ')) {
            // Will be processed with next data line
            continue;
          }

          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6);
            try {
              const data = JSON.parse(dataStr);

              if (data.token) {
                fullContent += data.token;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: fullContent }
                      : m
                  )
                );
              }

              if (data.agentsUsed) {
                metadata.agentsUsed = data.agentsUsed;
              }
              if (data.confidence !== undefined) {
                metadata.confidence = data.confidence;
              }
              if (data.sources) {
                metadata.sources = data.sources;
              }
              if (data.complete) {
                // Stream complete
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, ...metadata, content: fullContent, isStreaming: false }
                      : m
                  )
                );
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }

      // Ensure streaming flag is cleared
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, ...metadata, content: fullContent, isStreaming: false }
            : m
        )
      );
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err.message ?? 'Failed to get AI response');
      // Remove the empty assistant message on error
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [isStreaming, token, options?.conversationId, options?.context]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setMessages((prev) =>
      prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m))
    );
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, isStreaming, error, sendMessage, stopStreaming, clearMessages };
}
