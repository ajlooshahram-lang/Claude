'use client';

import { useState, useEffect, useRef } from 'react';
import {
  MessageSquare, Send, Trash2, Sparkles, Database,
  Lightbulb, Bot, User,
} from 'lucide-react';
import {
  processQuestion, getChatHistory, saveChatMessage,
  clearChatHistory, ChatMessage,
} from '@/lib/ai-portfolio-chat';

export default function AIChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(getChatHistory());
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || thinking) return;

    const question = input.trim();
    setInput('');

    // Add user message
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: question,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    saveChatMessage(userMsg);

    // Process
    setThinking(true);
    await new Promise(r => setTimeout(r, 600));
    const response = processQuestion(question);
    setMessages(prev => [...prev, response]);
    saveChatMessage(response);
    setThinking(false);
  }


  function handleClear() {
    clearChatHistory();
    setMessages([]);
  }

  function handleSuggestion(q: string) {
    setInput(q);
  }

  const suggestions = [
    'Which of my stocks has the highest tax liability if I sell today?',
    'Show me everything correlated above 0.7 with Tesla',
    'If I had invested in the S&P 500 three years ago, what would it be worth?',
    'Which sector am I most overweight in?',
    'What would my monthly dividend income be if I reinvested for 10 more years?',
    'Show me my full portfolio summary',
  ];

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-6rem)]">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[var(--card-border)]">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center">
            <Bot className="h-5 w-5 text-[var(--primary)]" />
          </div>
          <div>
            <h1 className="text-lg font-bold">AI Portfolio Assistant</h1>
            <p className="text-[10px] text-[var(--muted)]">
              Ask anything about your portfolio — I query your real data
            </p>
          </div>
        </div>
        <button onClick={handleClear} className="p-2 rounded-lg text-[var(--muted)] hover:text-[var(--loss)] hover:bg-[var(--loss)]/10 transition-colors" title="Clear history">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12 space-y-6">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-[var(--primary)]/10">
              <Sparkles className="h-8 w-8 text-[var(--primary)]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Ask me anything about your portfolio</h2>
              <p className="text-xs text-[var(--muted)] mt-1 max-w-sm mx-auto">
                I query your actual holdings, positions, and market data to give you specific, numerical answers — not generic advice.
              </p>
            </div>
            {/* Suggestions */}
            <div className="grid gap-2 max-w-md mx-auto">
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => handleSuggestion(s)} className="text-left px-4 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--card)] text-[11px] text-[var(--foreground)]/70 hover:border-[var(--primary)]/50 hover:text-[var(--foreground)] transition-colors">
                  <Lightbulb className="h-3 w-3 text-[var(--primary)] inline mr-2" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="h-7 w-7 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center flex-shrink-0 mt-1">
                <Bot className="h-4 w-4 text-[var(--primary)]" />
              </div>
            )}
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
              msg.role === 'user'
                ? 'bg-[var(--primary)] text-white'
                : 'bg-[var(--card)] border border-[var(--card-border)]'
            }`}>
              {msg.role === 'assistant' ? (
                <div className="text-[11px] leading-relaxed whitespace-pre-wrap prose-sm">
                  <div dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }} />
                  {msg.dataUsed && msg.dataUsed.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-[var(--card-border)] flex items-center gap-1.5 flex-wrap">
                      <Database className="h-3 w-3 text-[var(--muted)]" />
                      {msg.dataUsed.map(d => (
                        <span key={d} className="text-[8px] px-1.5 py-0.5 rounded bg-[var(--background)] text-[var(--muted)] border border-[var(--card-border)]">{d}</span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[12px]">{msg.content}</p>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="h-7 w-7 rounded-lg bg-[var(--foreground)]/10 flex items-center justify-center flex-shrink-0 mt-1">
                <User className="h-4 w-4 text-[var(--foreground)]" />
              </div>
            )}
          </div>
        ))}

        {thinking && (
          <div className="flex gap-3">
            <div className="h-7 w-7 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center flex-shrink-0">
              <Bot className="h-4 w-4 text-[var(--primary)] animate-pulse" />
            </div>
            <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                <div className="flex gap-1">
                  <div className="h-1.5 w-1.5 rounded-full bg-[var(--primary)] animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="h-1.5 w-1.5 rounded-full bg-[var(--primary)] animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="h-1.5 w-1.5 rounded-full bg-[var(--primary)] animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                Querying your portfolio data...
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="pt-4 border-t border-[var(--card-border)]">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about your portfolio..."
            className="flex-1 px-4 py-3 rounded-xl border border-[var(--card-border)] bg-[var(--card)] text-sm focus:border-[var(--primary)] focus:outline-none"
            disabled={thinking}
          />
          <button type="submit" disabled={!input.trim() || thinking} className="px-4 py-3 rounded-xl bg-[var(--primary)] text-white disabled:opacity-50 transition-colors">
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Markdown formatter (simple) ─────────────────────────────────────────────

function formatMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n\|/g, '<br/>|')
    .replace(/\|([^|]+)\|([^|]+)\|([^|]*)\|([^|]*)\|?([^|]*)\|?/g, (_, ...cols) => {
      const cells = cols.filter(c => c !== undefined && c !== '').map(c => `<td class="px-2 py-1 border-b border-[var(--card-border)]">${c.trim()}</td>`).join('');
      return `<tr>${cells}</tr>`;
    })
    .replace(/💡/g, '<span class="text-[var(--primary)]">💡</span>')
    .replace(/\n/g, '<br/>');
}
