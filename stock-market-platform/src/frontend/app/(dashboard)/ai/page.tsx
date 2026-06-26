'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Square, Sparkles, RefreshCw } from 'lucide-react';
import { useAIChat, ChatMessage } from '../../../hooks/use-ai-chat';

const SUGGESTED_QUESTIONS = [
  'Is NVIDIA overvalued?',
  'Compare MSFT vs GOOG',
  'What is a P/E ratio?',
  'How risky is my portfolio?',
  'Best dividend stocks for income',
  'Impact of rising interest rates',
];

export default function AIChatPage() {
  const [input, setInput] = useState('');
  const { messages, isStreaming, error, sendMessage, stopStreaming, clearMessages } = useAIChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    sendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleSuggestion = (question: string) => {
    sendMessage(question);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">AI Assistant</h1>
        </div>
        <button
          onClick={clearMessages}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
        >
          <RefreshCw className="h-4 w-4" />
          New Chat
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <EmptyState onSuggestion={handleSuggestion} />
        ) : (
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
                {error}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border bg-card px-4 py-4">
        <form onSubmit={handleSubmit} className="mx-auto max-w-3xl">
          <div className="relative flex items-end rounded-xl border border-border bg-background p-2 focus-within:border-primary">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about stocks, portfolio, markets..."
              className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
              rows={1}
              maxLength={2000}
              disabled={isStreaming}
              style={{ maxHeight: '120px' }}
            />
            {isStreaming ? (
              <button
                type="button"
                onClick={stopStreaming}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500 text-white hover:bg-red-600"
              >
                <Square className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            AI analysis is for educational purposes only. Not financial advice.
          </p>
        </form>
      </div>
    </div>
  );
}

function EmptyState({ onSuggestion }: { onSuggestion: (q: string) => void }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Sparkles className="h-8 w-8 text-primary" />
      </div>
      <h2 className="text-xl font-semibold">AI Investment Assistant</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Ask me anything about stocks, portfolios, market conditions, or investing concepts.
        I combine multiple specialist AI agents for comprehensive analysis.
      </p>
      <div className="mt-8 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTED_QUESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => onSuggestion(q)}
            className="rounded-lg border border-border px-4 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`} data-testid={`${message.role}-message`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
        isUser
          ? 'bg-primary text-primary-foreground'
          : 'bg-card border border-border'
      }`}>
        {/* Content */}
        <div className="whitespace-pre-wrap text-sm leading-relaxed">
          {message.content}
          {message.isStreaming && (
            <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-current" />
          )}
        </div>

        {/* Metadata (assistant only) */}
        {!isUser && !message.isStreaming && message.content && (
          <div className="mt-3 space-y-2 border-t border-border/50 pt-2">
            {/* Agent badges */}
            {message.agentsUsed && message.agentsUsed.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {message.agentsUsed.map((agent) => (
                  <AgentBadge key={agent} agentId={agent} />
                ))}
              </div>
            )}

            {/* Confidence */}
            {message.confidence != null && (
              <div className="flex items-center gap-2" data-testid="confidence-score">
                <span className="text-xs text-muted-foreground">Confidence:</span>
                <ConfidenceBar value={message.confidence} />
                <span className="text-xs font-medium">{message.confidence}%</span>
              </div>
            )}

            {/* Sources */}
            {message.sources && message.sources.length > 0 && (
              <div className="text-xs text-muted-foreground">
                Sources: {message.sources.map((s) => s.reference).join(' · ')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const AGENT_LABELS: Record<string, { label: string; color: string }> = {
  'agent.investment_analyst': { label: 'Fundamental', color: 'bg-blue-500/20 text-blue-400' },
  'agent.technical_analyst': { label: 'Technical', color: 'bg-purple-500/20 text-purple-400' },
  'agent.quantitative': { label: 'Quantitative', color: 'bg-cyan-500/20 text-cyan-400' },
  'agent.news_intelligence': { label: 'News', color: 'bg-orange-500/20 text-orange-400' },
  'agent.macro_economics': { label: 'Macro', color: 'bg-green-500/20 text-green-400' },
  'agent.portfolio_advisor': { label: 'Portfolio', color: 'bg-pink-500/20 text-pink-400' },
  'agent.education': { label: 'Education', color: 'bg-yellow-500/20 text-yellow-400' },
};

function AgentBadge({ agentId }: { agentId: string }) {
  const config = AGENT_LABELS[agentId] ?? { label: agentId, color: 'bg-gray-500/20 text-gray-400' };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${config.color}`}>
      {config.label}
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 70 ? 'bg-green-500' : value >= 40 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
    </div>
  );
}
