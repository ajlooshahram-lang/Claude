'use client';

import { useState, useEffect } from 'react';
import {
  ShieldAlert, Trash2, Plus, AlertTriangle, X, Info,
} from 'lucide-react';
import {
  getStopLosses, addStopLoss, removeStopLoss, triggerStopLoss,
  getActiveStopLosses, StopLoss, hasSeenWarning, markWarningSeen,
} from '@/lib/stop-losses';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Holding {
  symbol: string;
  name: string;
  currentPrice: number;
  currency: string;
}

/**
 * Stop-Loss Panel — shows on the portfolio page.
 * - Lists all active stop-losses with current distance
 * - Allows setting new stop-losses
 * - Checks live prices and triggers alerts when hit
 * - Shows educational warning on first use
 */
export function StopLossPanel({ holdings }: { holdings: Holding[] }) {
  const [stopLosses, setStopLosses] = useState<StopLoss[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [triggered, setTriggered] = useState<StopLoss[]>([]);

  useEffect(() => {
    setStopLosses(getStopLosses());
    checkStopLosses();
  }, [holdings]);

  function checkStopLosses() {
    const active = getActiveStopLosses();
    const newlyTriggered: StopLoss[] = [];

    for (const sl of active) {
      const holding = holdings.find(h => h.symbol === sl.symbol);
      if (holding && holding.currentPrice <= sl.stopPrice) {
        triggerStopLoss(sl.id);
        newlyTriggered.push(sl);
      }
    }

    if (newlyTriggered.length > 0) {
      setTriggered(newlyTriggered);
      setStopLosses(getStopLosses());
    }
  }

  function handleSetNew() {
    if (!hasSeenWarning()) {
      setShowWarning(true);
    } else {
      setShowForm(true);
    }
  }

  function handleWarningAccept() {
    markWarningSeen();
    setShowWarning(false);
    setShowForm(true);
  }

  function handleAdd(symbol: string, name: string, stopPrice: number, currency: string, currentPrice: number) {
    addStopLoss({ symbol, name, stopPrice, currency, priceWhenSet: currentPrice });
    setStopLosses(getStopLosses());
    setShowForm(false);
  }

  function handleRemove(id: string) {
    removeStopLoss(id);
    setStopLosses(getStopLosses());
  }

  const active = stopLosses.filter(sl => sl.status === 'active');
  const triggeredList = stopLosses.filter(sl => sl.status === 'triggered');

  if (active.length === 0 && triggeredList.length === 0 && !showForm && !showWarning) {
    return (
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-[var(--muted)]" />
            <span className="text-sm font-medium">Stop-Loss Protection</span>
          </div>
          <button
            onClick={handleSetNew}
            className="flex items-center gap-1 text-[10px] text-[var(--primary)] hover:underline"
          >
            <Plus className="h-3 w-3" /> Set stop-loss
          </button>
        </div>
        <p className="text-[10px] text-[var(--muted)] mt-1 pl-6">
          No stop-losses set. Add one to get alerted if a stock drops to a price you&apos;re not comfortable with.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-[var(--warning)]" />
          <span className="text-sm font-semibold">Stop-Loss Protection</span>
        </div>
        <button
          onClick={handleSetNew}
          className="flex items-center gap-1 text-[10px] text-[var(--primary)] hover:underline"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>

      {/* Triggered alerts */}
      {triggered.length > 0 && (
        <div className="rounded-lg border border-[var(--loss)]/30 bg-[var(--loss)]/5 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-[var(--loss)] mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-bold text-[var(--loss)]">
                Stop-loss triggered!
              </p>
              {triggered.map(sl => (
                <p key={sl.id} className="text-[11px] text-[var(--foreground)]/80 mt-1">
                  <strong>{sl.symbol}</strong> has dropped to your stop-loss price of {sl.currency} {sl.stopPrice.toFixed(2)}.
                  Open your broker app and consider selling to limit further losses.
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Educational warning (first time) */}
      {showWarning && (
        <div className="rounded-lg border border-[var(--primary)]/20 bg-[var(--primary)]/5 p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-[var(--primary)] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-[var(--primary)]">What is a stop-loss?</p>
              <p className="text-xs text-[var(--foreground)]/70 mt-2 leading-relaxed">
                A stop-loss is a price level where you decide in advance: &quot;If the stock drops this low, I&apos;ll sell to prevent bigger losses.&quot;
              </p>
              <p className="text-xs text-[var(--foreground)]/70 mt-2 leading-relaxed">
                <strong>How it works here:</strong> You set a stop-loss price. If the stock reaches that price, SmartVest alerts you prominently so you can open your broker and sell. The app does NOT automatically sell for you — that&apos;s safer because you stay in control.
              </p>
              <p className="text-xs text-[var(--foreground)]/70 mt-2 leading-relaxed">
                <strong>Tip:</strong> A common approach is to set your stop-loss 15-20% below your purchase price. This limits your maximum loss on any single stock.
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleWarningAccept}
                  className="rounded-lg bg-[var(--primary)] px-4 py-1.5 text-xs font-medium text-white"
                >
                  I understand — set a stop-loss
                </button>
                <button
                  onClick={() => setShowWarning(false)}
                  className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Set form */}
      {showForm && (
        <SetStopLossForm
          holdings={holdings}
          onAdd={handleAdd}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Active stop-losses */}
      {active.length > 0 && (
        <div className="space-y-2">
          {active.map(sl => {
            const holding = holdings.find(h => h.symbol === sl.symbol);
            const currentPrice = holding?.currentPrice || 0;
            const distancePct = currentPrice > 0
              ? ((currentPrice - sl.stopPrice) / currentPrice) * 100
              : 0;
            const isClose = distancePct < 5;

            return (
              <div key={sl.id} className={`flex items-center justify-between rounded-lg border p-3 ${
                isClose ? 'border-[var(--warning)]/30 bg-[var(--warning)]/5' : 'border-[var(--card-border)] bg-black/20'
              }`}>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold">{sl.symbol}</p>
                    {isClose && <span className="text-[9px] text-[var(--warning)] font-medium">CLOSE</span>}
                  </div>
                  <p className="text-[10px] text-[var(--muted)] mt-0.5">
                    Stop at {sl.currency} {sl.stopPrice.toFixed(2)} · Current: {sl.currency} {currentPrice.toFixed(2)} · {distancePct.toFixed(1)}% away
                  </p>
                </div>
                <button
                  onClick={() => handleRemove(sl.id)}
                  className="p-1.5 rounded text-[var(--muted)] hover:text-[var(--loss)] transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Previously triggered */}
      {triggeredList.length > 0 && (
        <div className="pt-2 border-t border-[var(--card-border)]">
          <p className="text-[10px] text-[var(--muted)] mb-1.5">Previously triggered:</p>
          {triggeredList.slice(0, 3).map(sl => (
            <div key={sl.id} className="flex items-center justify-between text-[10px] text-[var(--muted)] py-1">
              <span>{sl.symbol} — hit {sl.currency} {sl.stopPrice.toFixed(2)}</span>
              <button onClick={() => handleRemove(sl.id)} className="hover:text-[var(--loss)]">
                <Trash2 className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Set Stop-Loss Form ──────────────────────────────────────────────────────

function SetStopLossForm({ holdings, onAdd, onCancel }: {
  holdings: Holding[];
  onAdd: (symbol: string, name: string, stopPrice: number, currency: string, currentPrice: number) => void;
  onCancel: () => void;
}) {
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [stopPrice, setStopPrice] = useState('');

  const selected = holdings.find(h => h.symbol === selectedSymbol);

  function handleSubmit() {
    if (!selected || !stopPrice || parseFloat(stopPrice) <= 0) return;
    onAdd(selected.symbol, selected.name, parseFloat(stopPrice), selected.currency, selected.currentPrice);
  }

  // Suggest 15% below current price
  useEffect(() => {
    if (selected) {
      setStopPrice((selected.currentPrice * 0.85).toFixed(2));
    }
  }, [selected]);

  return (
    <div className="rounded-lg border border-[var(--card-border)] bg-black/20 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium">Set Stop-Loss</p>
        <button onClick={onCancel} className="text-[var(--muted)] hover:text-[var(--foreground)]">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Stock picker */}
      <div className="flex flex-wrap gap-1.5">
        {holdings.map(h => (
          <button
            key={h.symbol}
            onClick={() => setSelectedSymbol(h.symbol)}
            className={`rounded-lg border px-2 py-1 text-[10px] font-medium transition-colors ${
              selectedSymbol === h.symbol
                ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                : 'border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--primary)]/50'
            }`}
          >
            {h.symbol}
          </button>
        ))}
      </div>

      {/* Price input */}
      {selected && (
        <>
          <div>
            <p className="text-[10px] text-[var(--muted)] mb-1">
              Current price: {selected.currency} {selected.currentPrice.toFixed(2)} · Alert me if it drops to:
            </p>
            <input
              type="number"
              value={stopPrice}
              onChange={(e) => setStopPrice(e.target.value)}
              className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm font-tabular outline-none focus:border-[var(--primary)]"
              step="0.01"
              min="0.01"
            />
            {stopPrice && parseFloat(stopPrice) > 0 && (
              <p className="text-[9px] text-[var(--muted)] mt-1">
                That&apos;s {((1 - parseFloat(stopPrice) / selected.currentPrice) * 100).toFixed(1)}% below the current price
              </p>
            )}
          </div>
          <button
            onClick={handleSubmit}
            disabled={!stopPrice || parseFloat(stopPrice) <= 0 || parseFloat(stopPrice) >= selected.currentPrice}
            className="w-full rounded-lg bg-[var(--warning)] py-2 text-xs font-semibold text-black disabled:opacity-40"
          >
            Set Stop-Loss at {selected.currency} {stopPrice || '—'}
          </button>
        </>
      )}
    </div>
  );
}
