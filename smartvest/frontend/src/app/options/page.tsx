'use client';

import { useState, useEffect } from 'react';
import {
  GraduationCap, TrendingUp, TrendingDown, DollarSign, Clock,
  Target, AlertTriangle, Loader2, BarChart3, Info, ArrowRight,
  CheckCircle2, XCircle, Zap,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChainEntry {
  strike: number;
  call_price: number;
  call_delta: number;
  call_itm: boolean;
  call_intrinsic: number;
  call_time_value: number;
  put_price: number;
  put_delta: number;
  put_itm: boolean;
  put_intrinsic: number;
  put_time_value: number;
}

interface ChainData {
  symbol: string;
  name: string;
  current_price: number;
  volatility: number;
  expiries: string[];
  default_expiry: string;
  days_to_expiry: number;
  chain: ChainEntry[];
}

interface Scenario {
  label: string;
  stock_price: number;
  option_value: number;
  pnl: number;
  pnl_pct: number;
  time_remaining_days: number;
  explanation: string;
}

interface SimResult {
  symbol: string;
  current_price: number;
  option_type: string;
  strike: number;
  days_to_expiry: number;
  contracts: number;
  entry_price_per_share: number;
  total_cost: number;
  max_loss: number;
  breakeven: number;
  in_the_money: boolean;
  intrinsic_value: number;
  time_value: number;
  delta: number;
  theta_daily: number;
  scenarios: Scenario[];
  summary: string;
  disclaimer: string;
}



// ─── Education Concepts ──────────────────────────────────────────────────────

const concepts = [
  {
    term: 'Call Option',
    emoji: '📈',
    simple: 'A bet that a stock will GO UP.',
    detail: 'Buying a call gives you the right (not obligation) to buy a stock at a specific price before a deadline. You profit if the stock rises above your strike price plus what you paid.',
  },
  {
    term: 'Put Option',
    emoji: '📉',
    simple: 'A bet that a stock will GO DOWN.',
    detail: 'Buying a put gives you the right to sell a stock at a specific price before a deadline. You profit if the stock falls below your strike price minus what you paid.',
  },
  {
    term: 'Strike Price',
    emoji: '🎯',
    simple: 'The price you are betting the stock will reach.',
    detail: 'This is the price at which you can buy (call) or sell (put) the stock. If the stock never reaches this price, your option expires worthless.',
  },
  {
    term: 'Expiry Date',
    emoji: '⏰',
    simple: 'Your option has a deadline. After this date it is worthless.',
    detail: 'Unlike stocks which you can hold forever, options have an expiration date. If the stock has not moved in your favor by then, you lose your entire investment (the premium).',
  },
  {
    term: 'Premium',
    emoji: '💰',
    simple: 'The price you pay to buy the option. This is the MOST you can lose.',
    detail: 'The premium is like an insurance payment. You pay it upfront. If things go wrong, you lose only this amount — nothing more. This is why options can be safer than you think for learning.',
  },
  {
    term: 'Intrinsic Value',
    emoji: '💎',
    simple: 'How much the option is worth RIGHT NOW if you exercised it.',
    detail: 'For a call: stock price minus strike price (if positive). For a put: strike price minus stock price (if positive). If this is zero, the option has no intrinsic value.',
  },
  {
    term: 'Time Value',
    emoji: '⏳',
    simple: 'Extra value because there is still time for the stock to move.',
    detail: 'Even if your option has no intrinsic value today, it still has value because the stock MIGHT move in your favor before expiry. This value decreases every single day.',
  },
  {
    term: 'Time Decay (Theta)',
    emoji: '🧊',
    simple: 'Your option loses a little value every day, even if the stock does not move.',
    detail: 'This is the option buyer\'s biggest enemy. Every day that passes, your option is worth slightly less. This decay accelerates as expiry approaches. It is like ice melting — slow at first, then fast.',
  },
  {
    term: 'In The Money (ITM)',
    emoji: '✅',
    simple: 'Your option has real value right now.',
    detail: 'A call is ITM when stock price > strike price. A put is ITM when stock price < strike price. ITM options cost more but have a higher chance of being profitable.',
  },
  {
    term: 'Out of The Money (OTM)',
    emoji: '❌',
    simple: 'Your option has NO real value yet — it is a pure bet on future movement.',
    detail: 'A call is OTM when stock price < strike price. A put is OTM when stock price > strike price. OTM options are cheaper but riskier — the stock needs to move significantly for you to profit.',
  },
];



// ─── Main Page Component ─────────────────────────────────────────────────────

export default function OptionsPage() {
  const [tab, setTab] = useState<'learn' | 'simulate'>('learn');
  const [symbol, setSymbol] = useState('AAPL');
  const [chain, setChain] = useState<ChainData | null>(null);
  const [loading, setLoading] = useState(false);
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  // Simulator inputs
  const [optionType, setOptionType] = useState<'call' | 'put'>('call');
  const [selectedStrike, setSelectedStrike] = useState<number>(0);
  const [daysToExpiry, setDaysToExpiry] = useState(14);
  const [contracts, setContracts] = useState(1);
  const [expandedConcept, setExpandedConcept] = useState<number | null>(null);

  // Fake balance
  const [balance] = useState(10000);

  async function loadChain() {
    if (!symbol.trim()) return;
    setLoading(true);
    setChain(null);
    setSimResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/options/chain/${symbol.trim().toUpperCase()}`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setChain(data);
      // Set default strike to ATM
      if (data.chain.length > 0) {
        const atm = data.chain.reduce((prev: ChainEntry, curr: ChainEntry) =>
          Math.abs(curr.strike - data.current_price) < Math.abs(prev.strike - data.current_price) ? curr : prev
        );
        setSelectedStrike(atm.strike);
      }
    } catch {
      setChain(null);
    }
    setLoading(false);
  }

  async function runSimulation() {
    if (!chain || selectedStrike === 0) return;
    setSimLoading(true);
    setSimResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/options/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: symbol.trim().toUpperCase(),
          option_type: optionType,
          strike: selectedStrike,
          days_to_expiry: daysToExpiry,
          contracts,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setSimResult(data);
    } catch {
      setSimResult(null);
    }
    setSimLoading(false);
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10">
          <GraduationCap className="h-5 w-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Options Trading Education</h1>
          <p className="text-xs text-[var(--muted)]">
            Learn how options work with fake money — zero risk
          </p>
        </div>
      </div>

      {/* Safety Banner */}
      <div className="rounded-xl border border-[var(--gain)]/30 bg-[var(--gain)]/5 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-[var(--gain)] shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-[var(--gain)]">100% Safe — Fake Money Only</p>
            <p className="text-xs text-[var(--muted)] mt-1">
              This simulator uses imaginary money on real stock prices. It is impossible to lose real money here.
              This is a learning tool to help you understand how options work before you ever consider trading them.
            </p>
          </div>
        </div>
      </div>


      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-[var(--card)] p-1 border border-[var(--card-border)]">
        <button
          onClick={() => setTab('learn')}
          className={`flex-1 rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === 'learn' ? 'bg-purple-500/20 text-purple-400' : 'text-[var(--muted)] hover:text-[var(--foreground)]'
          }`}
        >
          <GraduationCap className="inline h-4 w-4 mr-1.5" />
          Learn Concepts
        </button>
        <button
          onClick={() => setTab('simulate')}
          className={`flex-1 rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === 'simulate' ? 'bg-purple-500/20 text-purple-400' : 'text-[var(--muted)] hover:text-[var(--foreground)]'
          }`}
        >
          <Zap className="inline h-4 w-4 mr-1.5" />
          Simulator
        </button>
      </div>

      {/* Learn Tab */}
      {tab === 'learn' && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--muted)]">
            Tap any concept to learn more. Read all 10 before trying the simulator.
          </p>
          {concepts.map((c, i) => (
            <div
              key={c.term}
              className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden"
            >
              <button
                onClick={() => setExpandedConcept(expandedConcept === i ? null : i)}
                className="w-full flex items-center gap-3 p-4 text-left"
              >
                <span className="text-xl">{c.emoji}</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold">{c.term}</p>
                  <p className="text-xs text-[var(--muted)]">{c.simple}</p>
                </div>
                <ArrowRight className={`h-4 w-4 text-[var(--muted)] transition-transform ${expandedConcept === i ? 'rotate-90' : ''}`} />
              </button>
              {expandedConcept === i && (
                <div className="px-4 pb-4 pt-0 border-t border-[var(--card-border)]">
                  <p className="text-xs text-[var(--foreground)] leading-relaxed pt-3">
                    {c.detail}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}


      {/* Simulate Tab */}
      {tab === 'simulate' && (
        <div className="space-y-5">
          {/* Fake Balance */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[var(--muted)]">Your Practice Balance</p>
                <p className="text-2xl font-bold font-tabular text-[var(--gain)]">
                  ${balance.toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg bg-purple-500/10 px-3 py-1.5">
                <p className="text-[10px] font-bold text-purple-400 uppercase">Fake Money</p>
              </div>
            </div>
          </div>

          {/* Stock Picker */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 space-y-3">
            <p className="text-sm font-semibold">1. Pick a Stock</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="AAPL, TSLA, MSFT..."
                className="flex-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"
              />
              <button
                onClick={loadChain}
                disabled={loading}
                className="rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white hover:bg-purple-600 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Load'}
              </button>
            </div>
            {/* Quick picks */}
            <div className="flex gap-2 flex-wrap">
              {['AAPL', 'TSLA', 'MSFT', 'NVDA', 'AMZN'].map((s) => (
                <button
                  key={s}
                  onClick={() => { setSymbol(s); }}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium border ${
                    symbol === s ? 'border-purple-500/50 bg-purple-500/10 text-purple-400' : 'border-[var(--card-border)] text-[var(--muted)]'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>


          {/* Chain loaded — show option selection */}
          {chain && (
            <>
              {/* Stock Info */}
              <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{chain.symbol}</p>
                    <p className="text-xs text-[var(--muted)]">{chain.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold font-tabular">${chain.current_price.toFixed(2)}</p>
                    <p className="text-[10px] text-[var(--muted)]">Volatility: {chain.volatility}%</p>
                  </div>
                </div>
              </div>

              {/* Option Type */}
              <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 space-y-3">
                <p className="text-sm font-semibold">2. Choose Option Type</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setOptionType('call')}
                    className={`flex-1 rounded-lg p-3 border text-center ${
                      optionType === 'call'
                        ? 'border-[var(--gain)]/50 bg-[var(--gain)]/10'
                        : 'border-[var(--card-border)]'
                    }`}
                  >
                    <TrendingUp className={`h-5 w-5 mx-auto mb-1 ${optionType === 'call' ? 'text-[var(--gain)]' : 'text-[var(--muted)]'}`} />
                    <p className={`text-sm font-semibold ${optionType === 'call' ? 'text-[var(--gain)]' : ''}`}>Call</p>
                    <p className="text-[10px] text-[var(--muted)]">Bet stock goes UP</p>
                  </button>
                  <button
                    onClick={() => setOptionType('put')}
                    className={`flex-1 rounded-lg p-3 border text-center ${
                      optionType === 'put'
                        ? 'border-[var(--loss)]/50 bg-[var(--loss)]/10'
                        : 'border-[var(--card-border)]'
                    }`}
                  >
                    <TrendingDown className={`h-5 w-5 mx-auto mb-1 ${optionType === 'put' ? 'text-[var(--loss)]' : 'text-[var(--muted)]'}`} />
                    <p className={`text-sm font-semibold ${optionType === 'put' ? 'text-[var(--loss)]' : ''}`}>Put</p>
                    <p className="text-[10px] text-[var(--muted)]">Bet stock goes DOWN</p>
                  </button>
                </div>
              </div>


              {/* Strike Price Selection */}
              <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 space-y-3">
                <p className="text-sm font-semibold">3. Pick Strike Price</p>
                <p className="text-xs text-[var(--muted)]">
                  Current stock price: <span className="font-semibold text-[var(--foreground)]">${chain.current_price.toFixed(2)}</span>.
                  {optionType === 'call'
                    ? ' Pick a strike below the current price (ITM, safer but expensive) or above (OTM, cheaper but riskier).'
                    : ' Pick a strike above the current price (ITM, safer but expensive) or below (OTM, cheaper but riskier).'}
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {chain.chain.map((entry) => {
                    const isITM = optionType === 'call' ? entry.call_itm : entry.put_itm;
                    const isSelected = selectedStrike === entry.strike;
                    const isATM = Math.abs(entry.strike - chain.current_price) < (chain.current_price * 0.02);
                    return (
                      <button
                        key={entry.strike}
                        onClick={() => setSelectedStrike(entry.strike)}
                        className={`rounded-lg border p-2 text-center transition-colors ${
                          isSelected
                            ? 'border-purple-500 bg-purple-500/10'
                            : isITM
                              ? 'border-[var(--gain)]/20 bg-[var(--gain)]/5'
                              : 'border-[var(--card-border)]'
                        }`}
                      >
                        <p className={`text-sm font-bold font-tabular ${isSelected ? 'text-purple-400' : ''}`}>
                          ${entry.strike}
                        </p>
                        <p className={`text-[9px] font-medium ${isITM ? 'text-[var(--gain)]' : 'text-[var(--muted)]'}`}>
                          {isATM ? 'ATM' : isITM ? 'ITM' : 'OTM'}
                        </p>
                        <p className="text-[9px] text-[var(--muted)]">
                          ${optionType === 'call' ? entry.call_price.toFixed(2) : entry.put_price.toFixed(2)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>


              {/* Expiry & Contracts */}
              <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 space-y-3">
                <p className="text-sm font-semibold">4. Days to Expiry & Contracts</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-[var(--muted)]">Days to expiry</label>
                    <select
                      value={daysToExpiry}
                      onChange={(e) => setDaysToExpiry(Number(e.target.value))}
                      className="w-full mt-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"
                    >
                      <option value={7}>7 days (1 week)</option>
                      <option value={14}>14 days (2 weeks)</option>
                      <option value={21}>21 days (3 weeks)</option>
                      <option value={30}>30 days (1 month)</option>
                      <option value={60}>60 days (2 months)</option>
                      <option value={90}>90 days (3 months)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--muted)]">Contracts (1 = 100 shares)</label>
                    <select
                      value={contracts}
                      onChange={(e) => setContracts(Number(e.target.value))}
                      className="w-full mt-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"
                    >
                      <option value={1}>1 contract ($)</option>
                      <option value={2}>2 contracts ($$)</option>
                      <option value={5}>5 contracts ($$$)</option>
                      <option value={10}>10 contracts ($$$$)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Run Simulation Button */}
              <button
                onClick={runSimulation}
                disabled={simLoading || selectedStrike === 0}
                className="w-full rounded-xl bg-purple-500 py-3.5 text-sm font-semibold text-white hover:bg-purple-600 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {simLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                Simulate This Trade (Fake Money)
              </button>
            </>
          )}


          {/* Simulation Results */}
          {simResult && (
            <div className="space-y-4">
              {/* Summary Card */}
              <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-purple-400" />
                  <p className="text-sm font-semibold text-purple-400">Your Trade Summary</p>
                </div>
                <p className="text-xs leading-relaxed">{simResult.summary}</p>
              </div>

              {/* Key Numbers */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-3 text-center">
                  <DollarSign className="h-4 w-4 mx-auto text-[var(--muted)] mb-1" />
                  <p className="text-xs text-[var(--muted)]">Cost</p>
                  <p className="text-sm font-bold font-tabular">${simResult.total_cost.toFixed(2)}</p>
                </div>
                <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-3 text-center">
                  <AlertTriangle className="h-4 w-4 mx-auto text-[var(--loss)] mb-1" />
                  <p className="text-xs text-[var(--muted)]">Max Loss</p>
                  <p className="text-sm font-bold font-tabular text-[var(--loss)]">${simResult.max_loss.toFixed(2)}</p>
                </div>
                <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-3 text-center">
                  <Target className="h-4 w-4 mx-auto text-[var(--primary)] mb-1" />
                  <p className="text-xs text-[var(--muted)]">Breakeven</p>
                  <p className="text-sm font-bold font-tabular">${simResult.breakeven.toFixed(2)}</p>
                </div>
                <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-3 text-center">
                  <Clock className="h-4 w-4 mx-auto text-[var(--warning)] mb-1" />
                  <p className="text-xs text-[var(--muted)]">Daily Decay</p>
                  <p className="text-sm font-bold font-tabular text-[var(--warning)]">${Math.abs(simResult.theta_daily * 100 * simResult.contracts).toFixed(2)}/day</p>
                </div>
              </div>

              {/* ITM/OTM Badge */}
              <div className={`rounded-lg border p-3 flex items-center gap-3 ${
                simResult.in_the_money
                  ? 'border-[var(--gain)]/30 bg-[var(--gain)]/5'
                  : 'border-[var(--warning)]/30 bg-[var(--warning)]/5'
              }`}>
                {simResult.in_the_money ? (
                  <CheckCircle2 className="h-5 w-5 text-[var(--gain)]" />
                ) : (
                  <XCircle className="h-5 w-5 text-[var(--warning)]" />
                )}
                <div>
                  <p className={`text-sm font-semibold ${simResult.in_the_money ? 'text-[var(--gain)]' : 'text-[var(--warning)]'}`}>
                    {simResult.in_the_money ? 'In The Money' : 'Out of The Money'}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {simResult.in_the_money
                      ? `Intrinsic value: $${simResult.intrinsic_value.toFixed(2)} per share. This option has real value right now.`
                      : `No intrinsic value yet. The stock needs to move ${optionType === 'call' ? 'up' : 'down'} to reach your $${simResult.strike} strike.`}
                  </p>
                </div>
              </div>


              {/* Scenarios */}
              <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-purple-400" />
                  <p className="text-sm font-semibold">What Could Happen</p>
                </div>
                <p className="text-xs text-[var(--muted)]">
                  Here is what would happen to your option under different scenarios:
                </p>
                <div className="space-y-2">
                  {simResult.scenarios.map((s, i) => (
                    <div
                      key={i}
                      className={`rounded-lg border p-3 ${
                        s.pnl > 0
                          ? 'border-[var(--gain)]/20 bg-[var(--gain)]/5'
                          : s.pnl < 0
                            ? 'border-[var(--loss)]/20 bg-[var(--loss)]/5'
                            : 'border-[var(--card-border)]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold">{s.label}</p>
                        <p className={`text-xs font-bold font-tabular ${
                          s.pnl > 0 ? 'text-[var(--gain)]' : s.pnl < 0 ? 'text-[var(--loss)]' : ''
                        }`}>
                          {s.pnl >= 0 ? '+' : ''}${s.pnl.toFixed(2)} ({s.pnl_pct >= 0 ? '+' : ''}{s.pnl_pct}%)
                        </p>
                      </div>
                      <div className="flex items-center gap-4 text-[10px] text-[var(--muted)] mb-2">
                        <span>Stock: ${s.stock_price.toFixed(2)}</span>
                        <span>Option worth: ${s.option_value.toFixed(2)}</span>
                        <span>{s.time_remaining_days}d left</span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-[var(--foreground)]">
                        {s.explanation}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Disclaimer */}
              <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-3">
                <p className="text-[10px] text-[var(--muted)] text-center">
                  {simResult.disclaimer}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <p className="text-[10px] text-[var(--muted)] text-center pb-4">
        Options education only — no real trading. Prices from Yahoo Finance. Not financial advice.
      </p>
    </div>
  );
}