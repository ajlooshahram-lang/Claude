'use client';

import { useState, useEffect } from 'react';
import {
  Cpu, Plus, X, Play, Loader2, CheckCircle2, XCircle,
  Save, Trash2, FlaskConical, Zap, ArrowRight,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const STORAGE_KEY = 'smartvest_strategies';


const CONDITION_OPTIONS: Record<string, { name: string; values: { label: string; value: string }[] }> = {
  trend_14d: { name: '14-Day Trend', values: [{ label: 'Green (Up)', value: 'green' }, { label: 'Red (Down)', value: 'red' }] },
  trend_50d: { name: '50-Day Trend', values: [{ label: 'Green (Up)', value: 'green' }, { label: 'Red (Down)', value: 'red' }] },
  beginner_score: { name: 'Beginner Score', values: [{ label: 'Beginner Friendly', value: 'beginner_friendly' }, { label: 'Intermediate', value: 'intermediate' }, { label: 'Risky', value: 'risky' }] },
  money_flow: { name: 'Money Flow', values: [{ label: 'Positive (Buying)', value: 'positive' }, { label: 'Negative (Selling)', value: 'negative' }, { label: 'Neutral', value: 'neutral' }] },
  sentiment: { name: 'Sentiment', values: [{ label: 'Positive', value: 'positive' }, { label: 'Negative', value: 'negative' }, { label: 'Neutral', value: 'neutral' }] },
  volume_spike: { name: 'Volume Spike (>200%)', values: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }] },
  rsi_oversold: { name: 'RSI Oversold (<30)', values: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }] },
  rsi_overbought: { name: 'RSI Overbought (>70)', values: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }] },
  price_above_sma200: { name: 'Above 200-Day SMA', values: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }] },
  dividend_yield: { name: 'Dividend Yield', values: [{ label: '>3%', value: 'above_3pct' }, { label: '>2%', value: 'above_2pct' }, { label: 'None', value: 'none' }] },
};

interface Condition { type: string; value: string; logic: string; }
interface SavedStrategy { id: string; name: string; conditions: Condition[]; signal: string; }
interface RunResult { symbol: string; name: string; price: number; passes: boolean; conditions_met: { type: string; value: string; met: boolean }[]; }
interface BacktestResult { symbol: string; strategy_name: string; total_trades: number; wins: number; losses: number; win_rate: number; strategy_return_pct: number; buy_hold_return_pct: number; beats_buy_hold: boolean; trades: any[]; }

function loadStrategies(): SavedStrategy[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function saveStrategies(s: SavedStrategy[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
function getWatchlist(): string[] {
  try {
    const stored = localStorage.getItem('smartvest_watchlist');
    if (!stored) return ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'JNJ', 'PG', 'KO'];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : parsed.map((s: any) => s.symbol || s);
  } catch { return ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN']; }
}


export default function StrategyPage() {
  const [strategies, setStrategies] = useState<SavedStrategy[]>([]);
  const [conditions, setConditions] = useState<Condition[]>([{ type: 'trend_14d', value: 'green', logic: 'AND' }]);
  const [strategyName, setStrategyName] = useState('My Strategy');
  const [signal, setSignal] = useState('Strong Buy');
  const [runResults, setRunResults] = useState<RunResult[] | null>(null);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [backtestSymbol, setBacktestSymbol] = useState('AAPL');
  const [tab, setTab] = useState<'build' | 'saved' | 'results'>('build');

  useEffect(() => { setStrategies(loadStrategies()); }, []);

  function addCondition() {
    if (conditions.length >= 5) return;
    setConditions([...conditions, { type: 'beginner_score', value: 'beginner_friendly', logic: 'AND' }]);
  }
  function removeCondition(idx: number) {
    setConditions(conditions.filter((_, i) => i !== idx));
  }
  function updateCondition(idx: number, field: string, val: string) {
    const updated = [...conditions];
    (updated[idx] as any)[field] = val;
    if (field === 'type') updated[idx].value = CONDITION_OPTIONS[val]?.values[0]?.value || '';
    setConditions(updated);
  }

  function saveStrategy() {
    const strat: SavedStrategy = { id: Date.now().toString(), name: strategyName, conditions, signal };
    const updated = [...strategies, strat];
    setStrategies(updated);
    saveStrategies(updated);
  }
  function deleteStrategy(id: string) {
    const updated = strategies.filter(s => s.id !== id);
    setStrategies(updated);
    saveStrategies(updated);
  }
  function loadStrategy(s: SavedStrategy) {
    setStrategyName(s.name);
    setConditions(s.conditions);
    setSignal(s.signal);
    setTab('build');
  }

  async function runStrategy() {
    setLoading(true);
    setRunResults(null);
    const symbols = getWatchlist();
    try {
      const res = await fetch(`${API_BASE}/api/strategy/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy: { name: strategyName, conditions, signal }, symbols }),
      });
      if (res.ok) {
        const data = await res.json();
        setRunResults(data.all_results);
        setTab('results');
      }
    } catch {}
    setLoading(false);
  }

  async function runBacktest() {
    setBacktestLoading(true);
    setBacktestResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/strategy/backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy: { name: strategyName, conditions, signal }, symbol: backtestSymbol, period_years: 2 }),
      });
      if (res.ok) setBacktestResult(await res.json());
    } catch {}
    setBacktestLoading(false);
  }

  const passing = runResults?.filter(r => r.passes) || [];

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10">
          <Cpu className="h-5 w-5 text-cyan-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Strategy Builder</h1>
          <p className="text-xs text-[var(--muted)]">Create IF-THEN rules · Run on watchlist · Backtest 2 years</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-[var(--card)] p-1 border border-[var(--card-border)]">
        {(['build', 'saved', 'results'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-3 py-2 text-xs font-medium capitalize ${tab === t ? 'bg-cyan-500/20 text-cyan-400' : 'text-[var(--muted)]'}`}>
            {t === 'build' ? 'Build' : t === 'saved' ? `Saved (${strategies.length})` : `Results${passing.length > 0 ? ` (${passing.length})` : ''}`}
          </button>
        ))}
      </div>


      {/* Build Tab */}
      {tab === 'build' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-4">
            <input type="text" value={strategyName} onChange={e => setStrategyName(e.target.value)}
              className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm font-semibold" placeholder="Strategy Name" />

            <div className="space-y-3">
              <p className="text-xs font-semibold text-cyan-400">IF all these conditions are true:</p>
              {conditions.map((cond, idx) => (
                <div key={idx} className="flex items-center gap-2 flex-wrap">
                  {idx > 0 && (
                    <select value={conditions[idx-1].logic} onChange={e => updateCondition(idx-1, 'logic', e.target.value)}
                      className="rounded-md border border-[var(--card-border)] bg-[var(--background)] px-2 py-1 text-[10px] font-bold text-cyan-400">
                      <option value="AND">AND</option><option value="OR">OR</option>
                    </select>
                  )}
                  <select value={cond.type} onChange={e => updateCondition(idx, 'type', e.target.value)}
                    className="flex-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-xs">
                    {Object.entries(CONDITION_OPTIONS).map(([k, v]) => (<option key={k} value={k}>{v.name}</option>))}
                  </select>
                  <span className="text-[10px] text-[var(--muted)]">is</span>
                  <select value={cond.value} onChange={e => updateCondition(idx, 'value', e.target.value)}
                    className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-xs">
                    {CONDITION_OPTIONS[cond.type]?.values.map(v => (<option key={v.value} value={v.value}>{v.label}</option>))}
                  </select>
                  {conditions.length > 1 && (
                    <button onClick={() => removeCondition(idx)} className="text-[var(--muted)] hover:text-[var(--loss)]"><X className="h-4 w-4" /></button>
                  )}
                </div>
              ))}
              {conditions.length < 5 && (
                <button onClick={addCondition} className="flex items-center gap-1 text-xs text-cyan-400 hover:underline">
                  <Plus className="h-3 w-3" />Add Condition ({5 - conditions.length} remaining)
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 border-t border-[var(--card-border)] pt-4">
              <span className="text-xs font-semibold text-[var(--gain)]">THEN flag as:</span>
              <select value={signal} onChange={e => setSignal(e.target.value)}
                className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-xs">
                <option>Strong Buy</option><option>Buy</option><option>Watch Closely</option><option>Consider Selling</option>
              </select>
            </div>

            <div className="flex gap-2">
              <button onClick={runStrategy} disabled={loading}
                className="flex-1 rounded-xl bg-cyan-500 py-3 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Run on Watchlist
              </button>
              <button onClick={saveStrategy} className="rounded-xl border border-cyan-500/30 px-4 py-3 text-sm text-cyan-400 hover:bg-cyan-500/5">
                <Save className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Backtest Section */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-3">
            <div className="flex items-center gap-2"><FlaskConical className="h-4 w-4 text-cyan-400" /><p className="text-sm font-semibold">Backtest (2 Years)</p></div>
            <div className="flex gap-2">
              <input type="text" value={backtestSymbol} onChange={e => setBacktestSymbol(e.target.value.toUpperCase())}
                placeholder="Symbol" className="w-28 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm" />
              <button onClick={runBacktest} disabled={backtestLoading}
                className="flex-1 rounded-lg bg-cyan-500/10 border border-cyan-500/30 py-2 text-xs font-medium text-cyan-400 disabled:opacity-50">
                {backtestLoading ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : 'Backtest This Strategy'}
              </button>
            </div>
            {backtestResult && (
              <div className="rounded-lg bg-[var(--background)] p-4 space-y-3">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div><p className="text-[9px] text-[var(--muted)]">Strategy Return</p><p className={`text-sm font-bold ${backtestResult.strategy_return_pct >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>{backtestResult.strategy_return_pct >= 0 ? '+' : ''}{backtestResult.strategy_return_pct}%</p></div>
                  <div><p className="text-[9px] text-[var(--muted)]">Buy & Hold</p><p className={`text-sm font-bold ${backtestResult.buy_hold_return_pct >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>{backtestResult.buy_hold_return_pct >= 0 ? '+' : ''}{backtestResult.buy_hold_return_pct}%</p></div>
                  <div><p className="text-[9px] text-[var(--muted)]">Win Rate</p><p className="text-sm font-bold">{backtestResult.win_rate}%</p></div>
                </div>
                <p className={`text-[10px] font-medium text-center ${backtestResult.beats_buy_hold ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
                  {backtestResult.beats_buy_hold ? '✓ Strategy beats buy & hold' : '✗ Buy & hold would have been better'}
                </p>
                <p className="text-[10px] text-[var(--muted)] text-center">{backtestResult.total_trades} trades over 2 years · {backtestResult.wins}W / {backtestResult.losses}L</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Saved Tab */}
      {tab === 'saved' && (
        <div className="space-y-3">
          {strategies.length === 0 && <p className="text-sm text-[var(--muted)] text-center py-12">No saved strategies. Build one first.</p>}
          {strategies.map(s => (
            <div key={s.id} className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">{s.name}</p>
                <p className="text-[10px] text-[var(--muted)]">{s.conditions.length} conditions · Signal: {s.signal}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => loadStrategy(s)} className="text-xs text-cyan-400 hover:underline">Load</button>
                <button onClick={() => deleteStrategy(s.id)} className="text-[var(--muted)] hover:text-[var(--loss)]"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Results Tab */}
      {tab === 'results' && runResults && (
        <div className="space-y-3">
          {passing.length > 0 && (
            <div className="rounded-xl border border-[var(--gain)]/30 bg-[var(--gain)]/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4 text-[var(--gain)]" />
                <p className="text-sm font-semibold text-[var(--gain)]">{passing.length} stocks pass all conditions → {signal}</p>
              </div>
              <div className="space-y-1.5">
                {passing.map(r => (
                  <div key={r.symbol} className="flex items-center justify-between rounded-lg bg-[var(--card)] p-2.5 border border-[var(--card-border)]">
                    <div><p className="text-xs font-bold">{r.symbol}</p><p className="text-[9px] text-[var(--muted)]">{r.name}</p></div>
                    <p className="text-xs font-bold font-tabular">${r.price.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {passing.length === 0 && <p className="text-sm text-[var(--muted)] text-center py-8">No stocks currently match all conditions.</p>}
          <p className="text-xs text-[var(--muted)]">{runResults.length} stocks scanned from your watchlist</p>
          <div className="space-y-1.5">
            {runResults.filter(r => !r.passes).map(r => (
              <div key={r.symbol} className="flex items-center justify-between rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-2.5 opacity-60">
                <div className="flex items-center gap-2">
                  <p className="text-xs">{r.symbol}</p>
                  <div className="flex gap-0.5">{r.conditions_met.map((c, i) => (
                    <span key={i} className={`h-1.5 w-1.5 rounded-full ${c.met ? 'bg-[var(--gain)]' : 'bg-[var(--loss)]'}`} />
                  ))}</div>
                </div>
                <p className="text-[10px] text-[var(--muted)]">{r.conditions_met.filter(c => c.met).length}/{r.conditions_met.length} conditions</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-[var(--muted)] text-center pb-4">Strategies are educational tools. Past signals do not guarantee future results.</p>
    </div>
  );
}
