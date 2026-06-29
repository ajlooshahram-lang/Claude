'use client';

import { useState, useEffect } from 'react';
import {
  FileText, Plus, CheckCircle2, XCircle, AlertTriangle,
  TrendingUp, TrendingDown, Loader2, Target, Shield,
  Brain, Trophy, Trash2, ArrowRight,
} from 'lucide-react';
import {
  Thesis, getAllTheses, createThesis, closeThesis, getThesisStats,
  deleteThesis,
} from '@/lib/thesis';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';


export default function ThesisPage() {
  const [tab, setTab] = useState<'active' | 'closed' | 'new' | 'stats'>('active');
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [stats, setStats] = useState(getThesisStats());

  // New thesis form
  const [symbol, setSymbol] = useState('');
  const [stockName, setStockName] = useState('');
  const [buyPrice, setBuyPrice] = useState<number>(0);
  const [shares, setShares] = useState<number>(10);
  const [sector, setSector] = useState('');
  const [bullCase, setBullCase] = useState('');
  const [riskFactor, setRiskFactor] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Close thesis form
  const [closingId, setClosingId] = useState<string | null>(null);
  const [sellPrice, setSellPrice] = useState<number>(0);
  const [sellReason, setSellReason] = useState('');

  useEffect(() => {
    reload();
  }, []);

  function reload() {
    setTheses(getAllTheses());
    setStats(getThesisStats());
  }

  async function lookupStock() {
    if (!symbol.trim()) return;
    setQuoteLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/shadow/quote/${symbol.trim().toUpperCase()}`);
      if (res.ok) {
        const data = await res.json();
        setBuyPrice(data.price);
        setStockName(data.name);
        setSector(data.sector);
      }
    } catch {}
    setQuoteLoading(false);
  }

  function handleCreateThesis() {
    setFormError(null);
    setFormSuccess(null);

    if (!symbol.trim()) { setFormError('Enter a stock symbol'); return; }
    if (!bullCase.trim()) { setFormError('Explain why you think this stock will go up'); return; }
    if (!riskFactor.trim()) { setFormError('Identify what could go wrong'); return; }
    if (!stopLoss.trim()) { setFormError('Set your exit condition if wrong'); return; }
    if (!takeProfit.trim()) { setFormError('Set your profit target'); return; }
    if (buyPrice <= 0) { setFormError('Look up the stock price first'); return; }

    createThesis({
      symbol: symbol.trim().toUpperCase(),
      stockName: stockName || symbol.toUpperCase(),
      bullCase, riskFactor, stopLoss, takeProfit,
      buyPrice, shares, sector,
    });

    setFormSuccess(`Thesis saved for ${symbol.toUpperCase()}. Now go buy the stock!`);
    setSymbol(''); setStockName(''); setBullCase(''); setRiskFactor('');
    setStopLoss(''); setTakeProfit(''); setBuyPrice(0); setSector('');
    reload();
  }

  function handleCloseThesis() {
    if (!closingId || sellPrice <= 0 || !sellReason.trim()) return;
    closeThesis(closingId, {
      sellPrice,
      sellDate: new Date().toISOString(),
      sellReason,
    });
    setClosingId(null);
    setSellPrice(0);
    setSellReason('');
    reload();
    setTab('closed');
  }

  function handleDelete(id: string) {
    if (confirm('Delete this thesis permanently?')) {
      deleteThesis(id);
      reload();
    }
  }

  const activeTheses = theses.filter(t => t.status === 'active');
  const closedTheses = theses.filter(t => t.status === 'closed');

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
          <FileText className="h-5 w-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Investment Thesis Builder</h1>
          <p className="text-xs text-[var(--muted)]">
            Document your reasoning before every buy · Score your thinking after every sell
          </p>
        </div>
      </div>


      {/* Explainer */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
        <p className="text-xs text-[var(--muted)] leading-relaxed">
          Professional investors never buy a stock without a written thesis. Before every purchase,
          you must answer four questions: Why will it go up? What could go wrong? When do I cut losses?
          When do I take profit? After you sell, the app scores how well your thinking matched reality.
          Over time, this builds an honest record of your decision-making ability.
        </p>
      </div>

      {/* Quick Stats */}
      {stats.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3 text-center">
            <p className="text-[10px] text-[var(--muted)]">Total</p>
            <p className="text-lg font-bold font-tabular">{stats.total}</p>
          </div>
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3 text-center">
            <p className="text-[10px] text-[var(--muted)]">Active</p>
            <p className="text-lg font-bold font-tabular text-amber-400">{stats.active}</p>
          </div>
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3 text-center">
            <p className="text-[10px] text-[var(--muted)]">Win Rate</p>
            <p className="text-lg font-bold font-tabular text-[var(--gain)]">{stats.winRate}%</p>
          </div>
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3 text-center">
            <p className="text-[10px] text-[var(--muted)]">Thinking</p>
            <p className="text-lg font-bold font-tabular">{stats.avgThesisScore}/10</p>
          </div>
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3 text-center">
            <p className="text-[10px] text-[var(--muted)]">Grade</p>
            <p className={`text-lg font-bold ${
              stats.avgGrade === 'A' ? 'text-[var(--gain)]' :
              stats.avgGrade === 'B' ? 'text-[var(--primary)]' :
              stats.avgGrade === 'C' ? 'text-[var(--warning)]' :
              'text-[var(--loss)]'
            }`}>{stats.avgGrade}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-[var(--card)] p-1 border border-[var(--card-border)]">
        {(['new', 'active', 'closed', 'stats'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-3 py-2 text-xs font-medium capitalize transition-colors ${
              tab === t ? 'bg-amber-500/20 text-amber-400' : 'text-[var(--muted)] hover:text-[var(--foreground)]'
            }`}
          >
            {t === 'new' ? '+ New Thesis' : t === 'active' ? `Active (${activeTheses.length})` :
             t === 'closed' ? `Closed (${closedTheses.length})` : 'Track Record'}
          </button>
        ))}
      </div>


      {/* New Thesis Tab */}
      {tab === 'new' && (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-amber-400" />
            <p className="text-sm font-semibold">Create Investment Thesis</p>
          </div>

          {/* Stock Lookup */}
          <div className="space-y-2">
            <label className="text-xs font-medium">Stock Symbol</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="AAPL, TSLA, MSFT..."
                className="flex-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm"
              />
              <button
                onClick={lookupStock}
                disabled={quoteLoading}
                className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {quoteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Lookup'}
              </button>
            </div>
            {buyPrice > 0 && (
              <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
                <span className="font-semibold text-[var(--foreground)]">{stockName}</span>
                <span>${buyPrice.toFixed(2)}</span>
                <span>{sector}</span>
              </div>
            )}
          </div>

          {/* Shares */}
          <div className="space-y-1">
            <label className="text-xs font-medium">How many shares?</label>
            <input
              type="number"
              value={shares}
              onChange={(e) => setShares(Math.max(1, Number(e.target.value)))}
              min={1}
              className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm"
            />
          </div>

          {/* The 4 Required Fields */}
          <div className="space-y-4 border-t border-[var(--card-border)] pt-4">
            <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
              You must answer all 4 questions
            </p>

            {/* 1. Bull Case */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-3.5 w-3.5 text-[var(--gain)]" />
                <label className="text-xs font-medium">Why do you believe this stock will go up?</label>
              </div>
              <textarea
                value={bullCase}
                onChange={(e) => setBullCase(e.target.value)}
                placeholder="Example: Strong earnings growth, new product launch, industry tailwinds..."
                rows={3}
                className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm resize-none"
              />
            </div>

            {/* 2. Risk Factor */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-[var(--warning)]" />
                <label className="text-xs font-medium">What specific risk could make you wrong?</label>
              </div>
              <textarea
                value={riskFactor}
                onChange={(e) => setRiskFactor(e.target.value)}
                placeholder="Example: Competition from X, regulatory changes, customer concentration..."
                rows={3}
                className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm resize-none"
              />
            </div>

            {/* 3. Stop Loss */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <XCircle className="h-3.5 w-3.5 text-[var(--loss)]" />
                <label className="text-xs font-medium">At what price or condition will you sell if wrong?</label>
              </div>
              <textarea
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                placeholder="Example: If it drops below $140, or if earnings miss two quarters in a row..."
                rows={2}
                className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm resize-none"
              />
            </div>

            {/* 4. Take Profit */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Target className="h-3.5 w-3.5 text-[var(--gain)]" />
                <label className="text-xs font-medium">At what price or condition will you take profit?</label>
              </div>
              <textarea
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                placeholder="Example: At $200 (25% gain), or after holding for 12 months if thesis intact..."
                rows={2}
                className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm resize-none"
              />
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleCreateThesis}
            className="w-full rounded-xl bg-amber-500 py-3.5 text-sm font-semibold text-white hover:bg-amber-600"
          >
            Save Thesis & Commit to Buy
          </button>

          {formError && (
            <p className="text-xs text-[var(--loss)] text-center">{formError}</p>
          )}
          {formSuccess && (
            <p className="text-xs text-[var(--gain)] text-center">{formSuccess}</p>
          )}
        </div>
      )}


      {/* Active Theses Tab */}
      {tab === 'active' && (
        <div className="space-y-3">
          {activeTheses.length === 0 && (
            <div className="text-center py-16">
              <FileText className="h-10 w-10 text-[var(--muted)]/30 mx-auto mb-3" />
              <p className="text-sm text-[var(--muted)]">No active theses. Create one before your next buy.</p>
              <button onClick={() => setTab('new')} className="mt-3 rounded-lg bg-amber-500 px-4 py-2 text-sm text-white">
                + New Thesis
              </button>
            </div>
          )}

          {activeTheses.map(thesis => (
            <div key={thesis.id} className="rounded-xl border border-amber-500/20 bg-[var(--card)] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold">{thesis.symbol}</p>
                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">ACTIVE</span>
                  </div>
                  <p className="text-[10px] text-[var(--muted)]">
                    {thesis.stockName} · Bought @ ${thesis.buyPrice.toFixed(2)} · {thesis.shares} shares · {new Date(thesis.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button onClick={() => handleDelete(thesis.id)} className="text-[var(--muted)] hover:text-[var(--loss)]">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg bg-[var(--gain)]/5 border border-[var(--gain)]/10 p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <TrendingUp className="h-3 w-3 text-[var(--gain)]" />
                    <p className="text-[10px] font-semibold text-[var(--gain)]">Bull Case</p>
                  </div>
                  <p className="text-xs leading-relaxed">{thesis.bullCase}</p>
                </div>
                <div className="rounded-lg bg-[var(--warning)]/5 border border-[var(--warning)]/10 p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="h-3 w-3 text-[var(--warning)]" />
                    <p className="text-[10px] font-semibold text-[var(--warning)]">Key Risk</p>
                  </div>
                  <p className="text-xs leading-relaxed">{thesis.riskFactor}</p>
                </div>
                <div className="rounded-lg bg-[var(--loss)]/5 border border-[var(--loss)]/10 p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <XCircle className="h-3 w-3 text-[var(--loss)]" />
                    <p className="text-[10px] font-semibold text-[var(--loss)]">Exit if Wrong</p>
                  </div>
                  <p className="text-xs leading-relaxed">{thesis.stopLoss}</p>
                </div>
                <div className="rounded-lg bg-[var(--primary)]/5 border border-[var(--primary)]/10 p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Target className="h-3 w-3 text-[var(--primary)]" />
                    <p className="text-[10px] font-semibold text-[var(--primary)]">Profit Target</p>
                  </div>
                  <p className="text-xs leading-relaxed">{thesis.takeProfit}</p>
                </div>
              </div>

              {/* Close thesis button */}
              {closingId === thesis.id ? (
                <div className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-4 space-y-3">
                  <p className="text-xs font-semibold">Close This Thesis (You Sold)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-[var(--muted)]">Sell Price ($)</label>
                      <input
                        type="number"
                        value={sellPrice || ''}
                        onChange={(e) => setSellPrice(Number(e.target.value))}
                        className="w-full mt-1 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-[var(--muted)]">
                        Return: {sellPrice > 0 ? `${(((sellPrice - thesis.buyPrice) / thesis.buyPrice) * 100).toFixed(1)}%` : '-'}
                      </label>
                      <p className={`mt-1 text-sm font-bold font-tabular py-2 ${
                        sellPrice > thesis.buyPrice ? 'text-[var(--gain)]' : sellPrice < thesis.buyPrice ? 'text-[var(--loss)]' : ''
                      }`}>
                        {sellPrice > 0 ? `$${((sellPrice - thesis.buyPrice) * thesis.shares).toFixed(2)}` : '-'}
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-[var(--muted)]">Why did you sell? (Be honest)</label>
                    <textarea
                      value={sellReason}
                      onChange={(e) => setSellReason(e.target.value)}
                      placeholder="Hit my target / Stop loss triggered / Panicked / Thesis broke..."
                      rows={2}
                      className="w-full mt-1 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm resize-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCloseThesis}
                      disabled={sellPrice <= 0 || !sellReason.trim()}
                      className="flex-1 rounded-lg bg-amber-500 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Score My Thesis
                    </button>
                    <button
                      onClick={() => setClosingId(null)}
                      className="rounded-lg border border-[var(--card-border)] px-4 py-2 text-xs text-[var(--muted)]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setClosingId(thesis.id); setSellPrice(0); setSellReason(''); }}
                  className="w-full rounded-lg border border-amber-500/30 py-2.5 text-xs font-medium text-amber-400 hover:bg-amber-500/5"
                >
                  I Sold This Stock — Score My Thesis
                </button>
              )}
            </div>
          ))}
        </div>
      )}


      {/* Closed Theses Tab */}
      {tab === 'closed' && (
        <div className="space-y-3">
          {closedTheses.length === 0 && (
            <div className="text-center py-16">
              <Trophy className="h-10 w-10 text-[var(--muted)]/30 mx-auto mb-3" />
              <p className="text-sm text-[var(--muted)]">
                No closed theses yet. When you sell a stock, close its thesis to get scored.
              </p>
            </div>
          )}

          {closedTheses.map(thesis => (
            <div key={thesis.id} className={`rounded-xl border p-5 space-y-3 ${
              thesis.actualOutcome === 'profit'
                ? 'border-[var(--gain)]/20 bg-[var(--gain)]/5'
                : thesis.actualOutcome === 'loss'
                  ? 'border-[var(--loss)]/20 bg-[var(--loss)]/5'
                  : 'border-[var(--card-border)] bg-[var(--card)]'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold">{thesis.symbol}</p>
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                      thesis.actualOutcome === 'profit' ? 'bg-[var(--gain)]/20 text-[var(--gain)]' :
                      thesis.actualOutcome === 'loss' ? 'bg-[var(--loss)]/20 text-[var(--loss)]' :
                      'bg-[var(--muted)]/20 text-[var(--muted)]'
                    }`}>
                      {thesis.actualOutcome?.toUpperCase()}
                    </span>
                    <span className={`text-xs font-bold font-tabular ${
                      (thesis.returnPct || 0) >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'
                    }`}>
                      {(thesis.returnPct || 0) >= 0 ? '+' : ''}{thesis.returnPct}%
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--muted)]">
                    {thesis.stockName} · ${thesis.buyPrice.toFixed(2)} → ${thesis.sellPrice?.toFixed(2)} ·
                    {thesis.sellDate && ` Sold ${new Date(thesis.sellDate).toLocaleDateString()}`}
                  </p>
                </div>
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg border text-lg font-bold ${
                  thesis.overallGrade === 'A' ? 'border-[var(--gain)]/30 bg-[var(--gain)]/10 text-[var(--gain)]' :
                  thesis.overallGrade === 'B' ? 'border-[var(--primary)]/30 bg-[var(--primary)]/10 text-[var(--primary)]' :
                  thesis.overallGrade === 'C' ? 'border-[var(--warning)]/30 bg-[var(--warning)]/10 text-[var(--warning)]' :
                  'border-[var(--loss)]/30 bg-[var(--loss)]/10 text-[var(--loss)]'
                }`}>
                  {thesis.overallGrade}
                </div>
              </div>

              {/* Scores */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-[var(--background)] p-2.5 text-center">
                  <p className="text-[9px] text-[var(--muted)]">Thesis Accuracy</p>
                  <p className="text-sm font-bold font-tabular">{thesis.thesisScore}/10</p>
                </div>
                <div className="rounded-lg bg-[var(--background)] p-2.5 text-center">
                  <p className="text-[9px] text-[var(--muted)]">Discipline</p>
                  <p className="text-sm font-bold font-tabular">{thesis.disciplineScore}/10</p>
                </div>
              </div>

              {/* Score Explanation */}
              {thesis.scoreExplanation && (
                <div className="rounded-lg border border-[var(--card-border)] p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Brain className="h-3 w-3 text-amber-400" />
                    <p className="text-[10px] font-semibold text-amber-400">Feedback</p>
                  </div>
                  <p className="text-xs leading-relaxed text-[var(--foreground)]">{thesis.scoreExplanation}</p>
                </div>
              )}

              {/* Original Thesis Summary */}
              <div className="border-t border-[var(--card-border)] pt-3 grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[9px] text-[var(--muted)] mb-0.5">Bull Case</p>
                  <p className="text-[10px] line-clamp-2">{thesis.bullCase}</p>
                </div>
                <div>
                  <p className="text-[9px] text-[var(--muted)] mb-0.5">Key Risk</p>
                  <p className="text-[10px] line-clamp-2">{thesis.riskFactor}</p>
                </div>
              </div>

              {/* Why they sold */}
              {thesis.sellReason && (
                <div className="text-[10px] text-[var(--muted)]">
                  <span className="font-semibold">Sell reason:</span> {thesis.sellReason}
                </div>
              )}
            </div>
          ))}
        </div>
      )}


      {/* Stats / Track Record Tab */}
      {tab === 'stats' && (
        <div className="space-y-4">
          {stats.closed === 0 && (
            <div className="text-center py-16">
              <Brain className="h-10 w-10 text-[var(--muted)]/30 mx-auto mb-3" />
              <p className="text-sm text-[var(--muted)]">
                Close some theses to build your track record.
              </p>
            </div>
          )}

          {stats.closed > 0 && (
            <>
              {/* Overall Grade Card */}
              <div className="rounded-xl border border-amber-500/20 bg-[var(--card)] p-6 text-center space-y-3">
                <p className="text-xs text-[var(--muted)]">Your Investor Thinking Grade</p>
                <p className={`text-5xl font-bold ${
                  stats.avgGrade === 'A' ? 'text-[var(--gain)]' :
                  stats.avgGrade === 'B' ? 'text-[var(--primary)]' :
                  stats.avgGrade === 'C' ? 'text-[var(--warning)]' :
                  'text-[var(--loss)]'
                }`}>
                  {stats.avgGrade}
                </p>
                <p className="text-xs text-[var(--muted)]">Based on {stats.closed} completed theses</p>
              </div>

              {/* Breakdown */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 space-y-2">
                  <p className="text-[10px] text-[var(--muted)]">Thesis Accuracy</p>
                  <p className="text-xl font-bold font-tabular">{stats.avgThesisScore}/10</p>
                  <p className="text-[10px] text-[var(--muted)]">
                    How well did your reasoning match what actually happened?
                  </p>
                  <div className="h-2 rounded-full bg-[var(--background)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-500"
                      style={{ width: `${stats.avgThesisScore * 10}%` }}
                    />
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 space-y-2">
                  <p className="text-[10px] text-[var(--muted)]">Discipline</p>
                  <p className="text-xl font-bold font-tabular">{stats.avgDisciplineScore}/10</p>
                  <p className="text-[10px] text-[var(--muted)]">
                    Did you follow your own stop loss and take profit rules?
                  </p>
                  <div className="h-2 rounded-full bg-[var(--background)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-violet-500"
                      style={{ width: `${stats.avgDisciplineScore * 10}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Win Rate */}
              <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold">Win Rate</p>
                  <p className={`text-lg font-bold font-tabular ${
                    stats.winRate >= 60 ? 'text-[var(--gain)]' :
                    stats.winRate >= 40 ? 'text-[var(--warning)]' :
                    'text-[var(--loss)]'
                  }`}>
                    {stats.winRate}%
                  </p>
                </div>
                <div className="h-3 rounded-full bg-[var(--background)] overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      stats.winRate >= 60 ? 'bg-[var(--gain)]' :
                      stats.winRate >= 40 ? 'bg-[var(--warning)]' :
                      'bg-[var(--loss)]'
                    }`}
                    style={{ width: `${stats.winRate}%` }}
                  />
                </div>
                <p className="text-[10px] text-[var(--muted)]">
                  {stats.winRate >= 60
                    ? 'Above average. Your thesis process is working.'
                    : stats.winRate >= 40
                      ? 'Average. Keep refining your thesis quality.'
                      : 'Below average. Focus on identifying risks better before buying.'}
                </p>
              </div>

              {/* Advice */}
              <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="h-4 w-4 text-amber-400" />
                  <p className="text-xs font-semibold">How to Improve</p>
                </div>
                <ul className="space-y-1.5 text-[11px] text-[var(--muted)] leading-relaxed">
                  {stats.avgThesisScore < 6 && (
                    <li>• Your bull cases are not playing out. Be more skeptical about growth narratives.</li>
                  )}
                  {stats.avgDisciplineScore < 6 && (
                    <li>• You are not following your own rules. When you set a stop loss, honor it.</li>
                  )}
                  {stats.winRate < 50 && (
                    <li>• Your win rate is below 50%. Spend more time on risk analysis before buying.</li>
                  )}
                  {stats.avgThesisScore >= 7 && stats.avgDisciplineScore >= 7 && (
                    <li>• You are thinking clearly and following your rules. Keep doing this.</li>
                  )}
                  <li>• The more theses you write and score, the better this feedback becomes.</li>
                </ul>
              </div>
            </>
          )}
        </div>
      )}

      {/* Footer */}
      <p className="text-[10px] text-[var(--muted)] text-center pb-4">
        This is not financial advice. Use the thesis builder to develop your own investment thinking.
      </p>
    </div>
  );
}
