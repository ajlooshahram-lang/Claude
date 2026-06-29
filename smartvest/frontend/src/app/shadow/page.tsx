'use client';

import { useState, useEffect } from 'react';
import {
  Ghost, TrendingUp, TrendingDown, DollarSign, Loader2,
  Plus, Minus, RefreshCw, BarChart3, ArrowRight, Shield,
  AlertTriangle, Search, CheckCircle2, XCircle, Scale,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const STORAGE_KEY = 'smartvest_shadow_portfolio';
const INITIAL_CAPITAL = 100000;


// ─── Types ───────────────────────────────────────────────────────────────────

interface ShadowTrade {
  id: string;
  symbol: string;
  name: string;
  type: 'buy' | 'sell';
  shares: number;
  price: number;
  total: number;
  date: string;
}

interface ShadowHolding {
  symbol: string;
  shares: number;
  avgCost: number;
}

interface ShadowState {
  cash: number;
  trades: ShadowTrade[];
  holdings: ShadowHolding[];
  createdAt: string;
}

interface HoldingData {
  symbol: string;
  name: string;
  sector: string;
  shares: number;
  avg_cost: number;
  current_price: number;
  market_value: number;
  cost_basis: number;
  unrealized_pnl: number;
  pnl_pct: number;
  day_change: number;
  day_change_pct: number;
  weight_pct: number;
}

interface PortfolioValue {
  total_value: number;
  invested_value: number;
  cash_balance: number;
  initial_capital: number;
  total_return: number;
  total_return_pct: number;
  total_unrealized_pnl: number;
  holdings_count: number;
  holdings: HoldingData[];
  sector_breakdown: { sector: string; value: number; pct: number }[];
}

interface CompareResult {
  shadow: { total_value: number; total_return: number; total_return_pct: number; holdings_count: number; sectors_count: number; max_position_weight: number };
  real: { total_value: number; total_return: number; total_return_pct: number; holdings_count: number; sectors_count: number; max_position_weight: number };
  comparison: { outperformance_pct: number; shadow_wins: boolean; shadow_more_concentrated: boolean; shadow_less_diversified: boolean };
  insight: string;
}


// ─── Storage Helpers ─────────────────────────────────────────────────────────

function loadShadow(): ShadowState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return { cash: INITIAL_CAPITAL, trades: [], holdings: [], createdAt: new Date().toISOString() };
}

function saveShadow(state: ShadowState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getRealPortfolio(): ShadowHolding[] {
  try {
    const stored = localStorage.getItem('smartvest_orders');
    if (!stored) return [];
    const orders = JSON.parse(stored);
    const map: Record<string, { shares: number; totalCost: number }> = {};
    for (const order of orders) {
      if (order.type === 'buy') {
        if (!map[order.symbol]) map[order.symbol] = { shares: 0, totalCost: 0 };
        map[order.symbol].shares += order.shares;
        map[order.symbol].totalCost += order.shares * order.price;
      } else if (order.type === 'sell') {
        if (map[order.symbol]) map[order.symbol].shares -= order.shares;
      }
    }
    return Object.entries(map)
      .filter(([, v]) => v.shares > 0)
      .map(([symbol, v]) => ({ symbol, shares: v.shares, avgCost: v.totalCost / v.shares }));
  } catch { return []; }
}


// ─── Main Component ──────────────────────────────────────────────────────────

export default function ShadowPage() {
  const [tab, setTab] = useState<'portfolio' | 'trade' | 'compare' | 'history'>('portfolio');
  const [shadow, setShadow] = useState<ShadowState>(loadShadow());
  const [portfolioData, setPortfolioData] = useState<PortfolioValue | null>(null);
  const [compareData, setCompareData] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);

  // Trade form
  const [tradeSymbol, setTradeSymbol] = useState('');
  const [tradeShares, setTradeShares] = useState(10);
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [quotePrice, setQuotePrice] = useState<number | null>(null);
  const [quoteName, setQuoteName] = useState('');
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [tradeSuccess, setTradeSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (shadow.holdings.length > 0) {
      loadPortfolioValue();
    }
  }, []);

  async function loadPortfolioValue() {
    if (shadow.holdings.length === 0) {
      setPortfolioData(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/shadow/value`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holdings: shadow.holdings.map(h => ({ symbol: h.symbol, shares: h.shares, avg_cost: h.avgCost })),
          cash_balance: shadow.cash,
          initial_capital: INITIAL_CAPITAL,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPortfolioData(data);
      }
    } catch {}
    setLoading(false);
  }

  async function getQuote() {
    if (!tradeSymbol.trim()) return;
    setQuoteLoading(true);
    setQuotePrice(null);
    setTradeError(null);
    try {
      const res = await fetch(`${API_BASE}/api/shadow/quote/${tradeSymbol.trim().toUpperCase()}`);
      if (res.ok) {
        const data = await res.json();
        setQuotePrice(data.price);
        setQuoteName(data.name);
      } else {
        setTradeError(`Could not find ${tradeSymbol.toUpperCase()}`);
      }
    } catch {
      setTradeError('Failed to get quote');
    }
    setQuoteLoading(false);
  }

  function executeTrade() {
    if (!quotePrice || !tradeSymbol.trim() || tradeShares <= 0) return;
    setTradeError(null);
    setTradeSuccess(null);

    const symbol = tradeSymbol.trim().toUpperCase();
    const total = quotePrice * tradeShares;

    if (tradeType === 'buy') {
      if (total > shadow.cash) {
        setTradeError(`Not enough cash. You need $${total.toFixed(2)} but only have $${shadow.cash.toFixed(2)}`);
        return;
      }
      // Execute buy
      const existing = shadow.holdings.find(h => h.symbol === symbol);
      let newHoldings: ShadowHolding[];
      if (existing) {
        const newShares = existing.shares + tradeShares;
        const newAvgCost = ((existing.avgCost * existing.shares) + (quotePrice * tradeShares)) / newShares;
        newHoldings = shadow.holdings.map(h =>
          h.symbol === symbol ? { ...h, shares: newShares, avgCost: newAvgCost } : h
        );
      } else {
        newHoldings = [...shadow.holdings, { symbol, shares: tradeShares, avgCost: quotePrice }];
      }

      const newState: ShadowState = {
        ...shadow,
        cash: shadow.cash - total,
        holdings: newHoldings,
        trades: [...shadow.trades, {
          id: Date.now().toString(),
          symbol, name: quoteName, type: 'buy',
          shares: tradeShares, price: quotePrice, total, date: new Date().toISOString(),
        }],
      };
      setShadow(newState);
      saveShadow(newState);
      setTradeSuccess(`Bought ${tradeShares} shares of ${symbol} at $${quotePrice.toFixed(2)}`);
    } else {
      // Execute sell
      const existing = shadow.holdings.find(h => h.symbol === symbol);
      if (!existing || existing.shares < tradeShares) {
        setTradeError(`You only own ${existing?.shares || 0} shares of ${symbol}`);
        return;
      }

      let newHoldings: ShadowHolding[];
      if (existing.shares === tradeShares) {
        newHoldings = shadow.holdings.filter(h => h.symbol !== symbol);
      } else {
        newHoldings = shadow.holdings.map(h =>
          h.symbol === symbol ? { ...h, shares: h.shares - tradeShares } : h
        );
      }

      const newState: ShadowState = {
        ...shadow,
        cash: shadow.cash + total,
        holdings: newHoldings,
        trades: [...shadow.trades, {
          id: Date.now().toString(),
          symbol, name: quoteName, type: 'sell',
          shares: tradeShares, price: quotePrice, total, date: new Date().toISOString(),
        }],
      };
      setShadow(newState);
      saveShadow(newState);
      setTradeSuccess(`Sold ${tradeShares} shares of ${symbol} at $${quotePrice.toFixed(2)}`);
    }

    setTradeSymbol('');
    setQuotePrice(null);
    setQuoteName('');
  }


  async function runComparison() {
    setCompareLoading(true);
    setCompareData(null);
    const realHoldings = getRealPortfolio();
    try {
      const res = await fetch(`${API_BASE}/api/shadow/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shadow_holdings: shadow.holdings.map(h => ({ symbol: h.symbol, shares: h.shares, avg_cost: h.avgCost })),
          shadow_cash: shadow.cash,
          shadow_initial: INITIAL_CAPITAL,
          real_holdings: realHoldings.map(h => ({ symbol: h.symbol, shares: h.shares, avg_cost: h.avgCost })),
          real_cash: 0,
          real_initial: realHoldings.reduce((sum, h) => sum + h.shares * h.avgCost, 0) || INITIAL_CAPITAL,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCompareData(data);
      }
    } catch {}
    setCompareLoading(false);
  }

  function resetShadow() {
    if (confirm('Reset your shadow portfolio? This clears all virtual trades and starts fresh with $100,000.')) {
      const fresh: ShadowState = { cash: INITIAL_CAPITAL, trades: [], holdings: [], createdAt: new Date().toISOString() };
      setShadow(fresh);
      saveShadow(fresh);
      setPortfolioData(null);
      setCompareData(null);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10">
            <Ghost className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Shadow Portfolio</h1>
            <p className="text-xs text-[var(--muted)]">
              Test aggressive strategies with fake money · Compare against your real portfolio
            </p>
          </div>
        </div>
        <button onClick={resetShadow} className="rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--loss)]">
          Reset
        </button>
      </div>


      {/* Safety Banner */}
      <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-violet-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-violet-400">Virtual Money Only</p>
            <p className="text-xs text-[var(--muted)] mt-1">
              This is a practice portfolio with $100,000 in fake money. No real trades are placed.
              Use it to test strategies you would never risk with real money. Professional fund managers
              use this exact approach to test ideas before committing capital.
            </p>
          </div>
        </div>
      </div>

      {/* Balance Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3 text-center">
          <p className="text-[10px] text-[var(--muted)]">Total Value</p>
          <p className="text-sm font-bold font-tabular">
            ${(portfolioData?.total_value || shadow.cash).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3 text-center">
          <p className="text-[10px] text-[var(--muted)]">Cash Available</p>
          <p className="text-sm font-bold font-tabular text-[var(--primary)]">
            ${shadow.cash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3 text-center">
          <p className="text-[10px] text-[var(--muted)]">Total Return</p>
          <p className={`text-sm font-bold font-tabular ${(portfolioData?.total_return_pct || 0) >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
            {(portfolioData?.total_return_pct || 0) >= 0 ? '+' : ''}{(portfolioData?.total_return_pct || 0).toFixed(2)}%
          </p>
        </div>
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3 text-center">
          <p className="text-[10px] text-[var(--muted)]">Positions</p>
          <p className="text-sm font-bold font-tabular">{shadow.holdings.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-[var(--card)] p-1 border border-[var(--card-border)]">
        {(['portfolio', 'trade', 'compare', 'history'] as const).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); if (t === 'portfolio') loadPortfolioValue(); if (t === 'compare') runComparison(); }}
            className={`flex-1 rounded-md px-3 py-2 text-xs font-medium capitalize transition-colors ${
              tab === t ? 'bg-violet-500/20 text-violet-400' : 'text-[var(--muted)] hover:text-[var(--foreground)]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>


      {/* Portfolio Tab */}
      {tab === 'portfolio' && (
        <div className="space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
              <span className="ml-2 text-sm text-[var(--muted)]">Loading live prices...</span>
            </div>
          )}

          {!loading && shadow.holdings.length === 0 && (
            <div className="text-center py-16">
              <Ghost className="h-12 w-12 text-[var(--muted)]/30 mx-auto mb-4" />
              <p className="text-sm font-semibold">Your shadow portfolio is empty</p>
              <p className="text-xs text-[var(--muted)] mt-1">
                Go to the Trade tab to buy your first virtual stocks with $100,000 fake money.
              </p>
              <button
                onClick={() => setTab('trade')}
                className="mt-4 rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white"
              >
                Start Trading
              </button>
            </div>
          )}

          {!loading && portfolioData && portfolioData.holdings.length > 0 && (
            <div className="space-y-3">
              {/* Holdings */}
              {portfolioData.holdings.map((h) => (
                <div key={h.symbol} className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{h.symbol}</p>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400">{h.weight_pct}%</span>
                      </div>
                      <p className="text-[10px] text-[var(--muted)]">{h.name} · {h.sector}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold font-tabular">${h.market_value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      <p className={`text-[10px] font-medium font-tabular ${h.pnl_pct >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
                        {h.pnl_pct >= 0 ? '+' : ''}{h.pnl_pct}% (${h.unrealized_pnl >= 0 ? '+' : ''}{h.unrealized_pnl.toFixed(2)})
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-[10px] text-[var(--muted)]">
                    <span>{h.shares} shares @ ${h.avg_cost}</span>
                    <span>Now: ${h.current_price}</span>
                    <span className={h.day_change_pct >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}>
                      Today: {h.day_change_pct >= 0 ? '+' : ''}{h.day_change_pct}%
                    </span>
                  </div>
                </div>
              ))}

              {/* Sector Breakdown */}
              {portfolioData.sector_breakdown.length > 0 && (
                <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 space-y-2">
                  <p className="text-xs font-semibold">Sector Allocation</p>
                  {portfolioData.sector_breakdown.map((s) => (
                    <div key={s.sector} className="flex items-center gap-2">
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-[10px] mb-0.5">
                          <span>{s.sector}</span>
                          <span className="text-[var(--muted)] font-tabular">{s.pct}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-[var(--background)] overflow-hidden">
                          <div className="h-full rounded-full bg-violet-500" style={{ width: `${s.pct}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}


      {/* Trade Tab */}
      {tab === 'trade' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-4">
            <p className="text-sm font-semibold">Place a Virtual Trade</p>
            <p className="text-xs text-[var(--muted)]">
              Cash available: <span className="font-bold text-[var(--foreground)]">${shadow.cash.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </p>

            {/* Buy / Sell Toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setTradeType('buy')}
                className={`flex-1 rounded-lg p-3 border text-center ${
                  tradeType === 'buy' ? 'border-[var(--gain)]/50 bg-[var(--gain)]/10' : 'border-[var(--card-border)]'
                }`}
              >
                <Plus className={`h-4 w-4 mx-auto mb-1 ${tradeType === 'buy' ? 'text-[var(--gain)]' : 'text-[var(--muted)]'}`} />
                <p className={`text-xs font-semibold ${tradeType === 'buy' ? 'text-[var(--gain)]' : ''}`}>Buy</p>
              </button>
              <button
                onClick={() => setTradeType('sell')}
                className={`flex-1 rounded-lg p-3 border text-center ${
                  tradeType === 'sell' ? 'border-[var(--loss)]/50 bg-[var(--loss)]/10' : 'border-[var(--card-border)]'
                }`}
              >
                <Minus className={`h-4 w-4 mx-auto mb-1 ${tradeType === 'sell' ? 'text-[var(--loss)]' : 'text-[var(--muted)]'}`} />
                <p className={`text-xs font-semibold ${tradeType === 'sell' ? 'text-[var(--loss)]' : ''}`}>Sell</p>
              </button>
            </div>

            {/* Symbol Input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={tradeSymbol}
                onChange={(e) => setTradeSymbol(e.target.value.toUpperCase())}
                placeholder="Stock symbol (e.g. TSLA)"
                className="flex-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm"
              />
              <button
                onClick={getQuote}
                disabled={quoteLoading || !tradeSymbol.trim()}
                className="rounded-lg bg-violet-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-600 disabled:opacity-50"
              >
                {quoteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </button>
            </div>

            {/* Quick Picks */}
            <div className="flex gap-2 flex-wrap">
              {['TSLA', 'NVDA', 'AMD', 'COIN', 'PLTR', 'MSTR', 'SOFI'].map(s => (
                <button
                  key={s}
                  onClick={() => setTradeSymbol(s)}
                  className={`rounded-md px-2.5 py-1 text-xs border ${
                    tradeSymbol === s ? 'border-violet-500/50 bg-violet-500/10 text-violet-400' : 'border-[var(--card-border)] text-[var(--muted)]'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Quote + Shares */}
            {quotePrice && (
              <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{tradeSymbol}</p>
                    <p className="text-[10px] text-[var(--muted)]">{quoteName}</p>
                  </div>
                  <p className="text-lg font-bold font-tabular">${quotePrice.toFixed(2)}</p>
                </div>

                <div>
                  <label className="text-xs text-[var(--muted)]">Number of shares</label>
                  <input
                    type="number"
                    min={1}
                    value={tradeShares}
                    onChange={(e) => setTradeShares(Math.max(1, Number(e.target.value)))}
                    className="w-full mt-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"
                  />
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--muted)]">Total cost:</span>
                  <span className="font-bold font-tabular">${(quotePrice * tradeShares).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>

                <button
                  onClick={executeTrade}
                  className={`w-full rounded-lg py-3 text-sm font-semibold text-white ${
                    tradeType === 'buy' ? 'bg-[var(--gain)] hover:bg-green-600' : 'bg-[var(--loss)] hover:bg-red-600'
                  }`}
                >
                  {tradeType === 'buy' ? 'Buy' : 'Sell'} {tradeShares} shares of {tradeSymbol}
                </button>
              </div>
            )}

            {/* Messages */}
            {tradeError && (
              <div className="rounded-lg border border-[var(--loss)]/30 bg-[var(--loss)]/5 p-3">
                <p className="text-xs text-[var(--loss)]">{tradeError}</p>
              </div>
            )}
            {tradeSuccess && (
              <div className="rounded-lg border border-[var(--gain)]/30 bg-[var(--gain)]/5 p-3">
                <p className="text-xs text-[var(--gain)]">{tradeSuccess}</p>
              </div>
            )}
          </div>

          {/* Current Holdings Quick View */}
          {shadow.holdings.length > 0 && (
            <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 space-y-2">
              <p className="text-xs font-semibold text-[var(--muted)]">Your Shadow Holdings</p>
              {shadow.holdings.map(h => (
                <div key={h.symbol} className="flex items-center justify-between text-xs">
                  <span className="font-medium">{h.symbol}</span>
                  <span className="text-[var(--muted)] font-tabular">{h.shares} shares @ ${h.avgCost.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}


      {/* Compare Tab */}
      {tab === 'compare' && (
        <div className="space-y-4">
          {compareLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
              <span className="ml-2 text-sm text-[var(--muted)]">Comparing portfolios...</span>
            </div>
          )}

          {!compareLoading && !compareData && shadow.holdings.length === 0 && (
            <div className="text-center py-12">
              <Scale className="h-10 w-10 text-[var(--muted)]/30 mx-auto mb-3" />
              <p className="text-sm text-[var(--muted)]">
                Add stocks to your shadow portfolio first, then compare against your real one.
              </p>
            </div>
          )}

          {!compareLoading && !compareData && shadow.holdings.length > 0 && (
            <div className="text-center py-12">
              <button
                onClick={runComparison}
                className="rounded-lg bg-violet-500 px-6 py-3 text-sm font-medium text-white hover:bg-violet-600"
              >
                Compare Shadow vs Real Portfolio
              </button>
            </div>
          )}

          {compareData && (
            <div className="space-y-4">
              {/* Winner Banner */}
              <div className={`rounded-xl border p-5 ${
                compareData.comparison.shadow_wins
                  ? 'border-violet-500/30 bg-violet-500/5'
                  : 'border-[var(--gain)]/30 bg-[var(--gain)]/5'
              }`}>
                <div className="flex items-center gap-3 mb-3">
                  {compareData.comparison.shadow_wins ? (
                    <Ghost className="h-6 w-6 text-violet-400" />
                  ) : (
                    <Shield className="h-6 w-6 text-[var(--gain)]" />
                  )}
                  <div>
                    <p className="text-sm font-semibold">
                      {compareData.comparison.shadow_wins ? 'Shadow Portfolio Wins' : 'Real Portfolio Wins'}
                    </p>
                    <p className="text-[10px] text-[var(--muted)]">
                      Difference: {Math.abs(compareData.comparison.outperformance_pct).toFixed(2)}%
                    </p>
                  </div>
                </div>
                <p className="text-xs leading-relaxed">{compareData.insight}</p>
              </div>

              {/* Side by Side */}
              <div className="grid grid-cols-2 gap-3">
                {/* Shadow */}
                <div className="rounded-xl border border-violet-500/20 bg-[var(--card)] p-4 space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Ghost className="h-4 w-4 text-violet-400" />
                    <p className="text-xs font-semibold text-violet-400">Shadow</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[var(--muted)]">Value</p>
                    <p className="text-sm font-bold font-tabular">${compareData.shadow.total_value.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[var(--muted)]">Return</p>
                    <p className={`text-sm font-bold font-tabular ${compareData.shadow.total_return_pct >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
                      {compareData.shadow.total_return_pct >= 0 ? '+' : ''}{compareData.shadow.total_return_pct.toFixed(2)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[var(--muted)]">Positions</p>
                    <p className="text-xs font-tabular">{compareData.shadow.holdings_count}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[var(--muted)]">Biggest Position</p>
                    <p className="text-xs font-tabular">{compareData.shadow.max_position_weight.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[var(--muted)]">Sectors</p>
                    <p className="text-xs font-tabular">{compareData.shadow.sectors_count}</p>
                  </div>
                </div>

                {/* Real */}
                <div className="rounded-xl border border-[var(--gain)]/20 bg-[var(--card)] p-4 space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="h-4 w-4 text-[var(--gain)]" />
                    <p className="text-xs font-semibold text-[var(--gain)]">Real</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[var(--muted)]">Value</p>
                    <p className="text-sm font-bold font-tabular">${compareData.real.total_value.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[var(--muted)]">Return</p>
                    <p className={`text-sm font-bold font-tabular ${compareData.real.total_return_pct >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
                      {compareData.real.total_return_pct >= 0 ? '+' : ''}{compareData.real.total_return_pct.toFixed(2)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[var(--muted)]">Positions</p>
                    <p className="text-xs font-tabular">{compareData.real.holdings_count}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[var(--muted)]">Biggest Position</p>
                    <p className="text-xs font-tabular">{compareData.real.max_position_weight.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[var(--muted)]">Sectors</p>
                    <p className="text-xs font-tabular">{compareData.real.sectors_count}</p>
                  </div>
                </div>
              </div>

              {/* Risk Flags */}
              {(compareData.comparison.shadow_more_concentrated || compareData.comparison.shadow_less_diversified) && (
                <div className="rounded-lg border border-[var(--warning)]/20 bg-[var(--warning)]/5 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="h-4 w-4 text-[var(--warning)]" />
                    <p className="text-xs font-semibold text-[var(--warning)]">Risk Note</p>
                  </div>
                  <p className="text-[10px] text-[var(--muted)] leading-relaxed">
                    {compareData.comparison.shadow_more_concentrated && 'Your shadow portfolio is more concentrated (higher risk). '}
                    {compareData.comparison.shadow_less_diversified && 'Your shadow portfolio has fewer sectors (less diversified). '}
                    Higher returns in the shadow portfolio may come from taking more risk, not better decisions.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}


      {/* History Tab */}
      {tab === 'history' && (
        <div className="space-y-3">
          {shadow.trades.length === 0 && (
            <div className="text-center py-12">
              <p className="text-sm text-[var(--muted)]">No trades yet. Go to the Trade tab to start.</p>
            </div>
          )}

          {shadow.trades.length > 0 && (
            <>
              <p className="text-xs text-[var(--muted)]">{shadow.trades.length} virtual trades</p>
              <div className="space-y-2">
                {[...shadow.trades].reverse().map((trade) => (
                  <div
                    key={trade.id}
                    className={`rounded-xl border p-3 ${
                      trade.type === 'buy'
                        ? 'border-[var(--gain)]/20 bg-[var(--gain)]/5'
                        : 'border-[var(--loss)]/20 bg-[var(--loss)]/5'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {trade.type === 'buy' ? (
                          <Plus className="h-3.5 w-3.5 text-[var(--gain)]" />
                        ) : (
                          <Minus className="h-3.5 w-3.5 text-[var(--loss)]" />
                        )}
                        <div>
                          <p className="text-xs font-semibold">
                            {trade.type.toUpperCase()} {trade.shares} × {trade.symbol}
                          </p>
                          <p className="text-[9px] text-[var(--muted)]">{trade.name}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold font-tabular">
                          ${trade.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-[9px] text-[var(--muted)]">
                          @ ${trade.price.toFixed(2)} · {new Date(trade.date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Footer */}
      <p className="text-[10px] text-[var(--muted)] text-center pb-4">
        Shadow portfolio uses fake money only. No real trades are executed. Prices from Yahoo Finance.
      </p>
    </div>
  );
}
