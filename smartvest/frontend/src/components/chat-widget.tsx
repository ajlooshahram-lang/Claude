'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Loader2, Sparkles } from 'lucide-react';
import { getProfile } from '@/lib/profile';
import { getWatchlist } from '@/lib/watchlist';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  'What is a P/E ratio?',
  'Is my portfolio diversified enough?',
  'What does beta mean?',
  'How do dividends work?',
];

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(text?: string) {
    const msg = (text || input).trim();
    if (!msg || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: msg,
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const profile = getProfile();
      const watchlist = getWatchlist();

      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          history: messages.slice(-6).map(m => ({
            role: m.role,
            content: m.content,
          })),
          risk_profile: profile?.riskProfile || 'moderate',
          portfolio_symbols: watchlist.map(w => w.symbol),
        }),
      });

      if (!res.ok) throw new Error('Failed');
      const data = await res.json();

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response,
      }]);
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "Sorry, I couldn't get a response right now. Please try again in a moment.",
      }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary)] text-white shadow-lg shadow-[var(--primary)]/20 hover:scale-105 transition-transform"
          aria-label="Open AI chat"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col w-[calc(100vw-2rem)] sm:w-[380px] h-[70vh] sm:h-[520px] rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--card-border)] bg-[var(--primary)]/5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[var(--primary)]" />
              <span className="text-sm font-semibold">SmartVest AI</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded-md hover:bg-white/10 text-[var(--muted)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>


          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-6">
                <Sparkles className="h-8 w-8 text-[var(--primary)] mx-auto mb-3 opacity-50" />
                <p className="text-sm font-medium">Ask me anything about investing</p>
                <p className="text-[10px] text-[var(--muted)] mt-1">
                  I explain things in plain English, no jargon
                </p>
                <div className="mt-4 space-y-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSend(s)}
                      className="block w-full text-left rounded-lg border border-[var(--card-border)] px-3 py-2 text-xs hover:border-[var(--primary)]/50 hover:bg-[var(--primary)]/5 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-[var(--primary)] text-white'
                      : 'bg-white/5 border border-[var(--card-border)]'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-xl bg-white/5 border border-[var(--card-border)] px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--primary)]" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-[var(--card-border)] px-3 py-3">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about stocks, your portfolio..."
                className="flex-1 resize-none rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-xs outline-none focus:border-[var(--primary)] placeholder:text-[var(--muted)]"
                rows={1}
                disabled={loading}
              />
              <button
                onClick={() => handleSend()}
                disabled={loading || !input.trim()}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary)] text-white disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-[9px] text-[var(--muted)] mt-1.5 text-center">
              Educational tool only — not financial advice
            </p>
          </div>
        </div>
      )}
    </>
  );
}
