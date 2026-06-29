'use client';

import { useState, useEffect } from 'react';
import {
  Wallet, TrendingUp, TrendingDown, AlertTriangle, Loader2,
  PieChart, DollarSign, Shield, Coins, Briefcase, Layers,
  RefreshCw,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';


interface Allocation {
  stocks_pct: number; etfs_pct: number; crypto_pct: number; cash_pct: number;
  stocks_usd: number; etfs_usd: number; crypto_usd: number; cash_usd: number;
}
interface Warning { severity: string; title: string; message: string; }
interface Holding {
  type: string; symbol: string; name?: string; value_usd: number; pnl_pct: number;
  pnl_usd: number; price_usd: number; shares?: number; amount?: number;
  sector?: string; category?: string; coin_id?: string; change_24h_pct?: number;
}
interface UnifiedData {
  total_portfolio_usd: number; total_portfolio_dkk: number; dkk_usd_rate: number;
  total_pnl_usd: number; total_pnl_pct: number;
  allocation: Allocation; stocks: Holding[]; etfs: Holding[]; cryptos: Holding[];
  risk_profile: string; crypto_limit_pct: number; warnings: Warning[];
}

function getPortfolio() {
  try {
    const orders = JSON.parse(localStorage.getItem('smartvest_orders') || '[]');
    const map: Record<string, { shares: number; totalCost: number }> = {};
    for (const o of orders) {
      if (o.type === 'buy') {
        if (!map[o.symbol]) map[o.symbol] = { shares: 0, totalCost: 0 };
        map[o.symbol].shares += o.shares;
        map[o.symbol].totalCost += o.shares * o.price;
      } else if (o.type === 'sell' && map[o.symbol]) {
        map[o.symbol].shares -= o.shares;
      }
    }
    return Object.entries(map).filter(([,v]) => v.shares > 0)
      .map(([symbol, v]) => ({ symbol, shares: v.shares, avg_cost: v.totalCost / v.shares }));
  } catch { return []; }
}

function getRiskProfile(): string {
  try { return JSON.parse(localStorage.getItem('smartvest_profile') || '{}').riskProfile || 'Moderate'; }
  catch { return 'Moderate'; }
}

function getCryptoHoldings() {
  try {
    return JSON.parse(localStorage.getItem('smartvest_crypto_holdings') || '[]');
  } catch { return []; }
}

const KNOWN_ETFS = new Set(['VOO','SPY','VTI','QQQ','IVV','VEA','VWO','AGG','BND','VNQ','VGT','VHT','XLE','XLF','ARKK','SCHD','VIG','JEPI','GLD','TLT','IEFA','EEM','VYM','XLK','SOXX']);


export default function UnifiedPage() {
  const [data, setData] = useState<UnifiedData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadPortfolio(); }, []);

  async function loadPortfolio() {
    setLoading(true);
    const allHoldings = getPortfolio();
    const stocks = allHoldings.filter(h => !KNOWN_ETFS.has(h.symbol.toUpperCase()));
    const etfs = allHoldings.filter(h => KNOWN_ETFS.has(h.symbol.toUpperCase()));
    const cryptos = getCryptoHoldings();
    const profile = getRiskProfile();

    try {
      const res = await fetch(`${API_BASE}/api/unified/portfolio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stocks: stocks.map(s => ({ symbol: s.symbol, shares: s.shares, avg_cost: s.avg_cost })),
          etfs: etfs.map(e => ({ symbol: e.symbol, shares: e.shares, avg_cost: e.avg_cost })),
          cryptos: cryptos.map((c: { coin_id: string; symbol: string; amount: number; avg_cost_usd: number }) => ({
            coin_id: c.coin_id, symbol: c.symbol, amount: c.amount, avg_cost_usd: c.avg_cost_usd,
          })),
          cash_usd: 0,
          cash_dkk: 20000,
          risk_profile: profile,
          dkk_usd_rate: 6.85,
        }),
      });
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  }

  // Demo data if empty
  const demoMode = !loading && data && data.stocks.length === 0 && data.etfs.length === 0 && data.cryptos.length === 0;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
            <Wallet className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Unified Portfolio</h1>
            <p className="text-xs text-[var(--muted)]">
              Stocks + ETFs + Crypto · Total wealth in USD &amp; DKK
            </p>
          </div>
        </div>
        <button onClick={loadPortfolio} disabled={loading} className="rounded-lg border border-[var(--card-border)] p-2">
          <RefreshCw className={`h-4 w-4 text-[var(--muted)] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
          <span className="ml-2 text-sm text-[var(--muted)]">Calculating total wealth...</span>
        </div>
      )}


      {data && !loading && (
        <div className="space-y-5">
          {/* Total Wealth Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-emerald-500/20 bg-[var(--card)] p-5">
              <p className="text-[10px] text-[var(--muted)] uppercase tracking-wide">Total Wealth (USD)</p>
              <p className="text-2xl font-bold font-tabular mt-1">
                ${data.total_portfolio_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className={`text-xs font-medium mt-1 ${data.total_pnl_pct >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
                {data.total_pnl_pct >= 0 ? '+' : ''}{data.total_pnl_pct.toFixed(2)}% (${data.total_pnl_usd >= 0 ? '+' : ''}{data.total_pnl_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
              </p>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-[var(--card)] p-5">
              <p className="text-[10px] text-[var(--muted)] uppercase tracking-wide">Total Wealth (DKK)</p>
              <p className="text-2xl font-bold font-tabular mt-1">
                {data.total_portfolio_dkk.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr
              </p>
              <p className="text-[10px] text-[var(--muted)] mt-1">
                Rate: 1 USD = {data.dkk_usd_rate} DKK · {data.risk_profile} profile
              </p>
            </div>
          </div>

          {/* Allocation Pie Chart (CSS-based) */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-4">
            <div className="flex items-center gap-2">
              <PieChart className="h-4 w-4 text-emerald-400" />
              <p className="text-sm font-semibold">Asset Allocation</p>
            </div>

            <div className="flex items-center gap-6">
              {/* Visual pie (stacked bar as simple representation) */}
              <div className="flex-1 h-8 rounded-full overflow-hidden flex">
                {data.allocation.stocks_pct > 0 && (
                  <div className="bg-blue-500 h-full" style={{ width: `${data.allocation.stocks_pct}%` }} />
                )}
                {data.allocation.etfs_pct > 0 && (
                  <div className="bg-teal-500 h-full" style={{ width: `${data.allocation.etfs_pct}%` }} />
                )}
                {data.allocation.crypto_pct > 0 && (
                  <div className="bg-yellow-500 h-full" style={{ width: `${data.allocation.crypto_pct}%` }} />
                )}
                {data.allocation.cash_pct > 0 && (
                  <div className="bg-gray-400 h-full" style={{ width: `${data.allocation.cash_pct}%` }} />
                )}
              </div>
            </div>

            {/* Legend */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-sm bg-blue-500" />
                <div>
                  <p className="text-xs font-medium">Stocks</p>
                  <p className="text-[10px] text-[var(--muted)] font-tabular">{data.allocation.stocks_pct}% · ${data.allocation.stocks_usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-sm bg-teal-500" />
                <div>
                  <p className="text-xs font-medium">ETFs</p>
                  <p className="text-[10px] text-[var(--muted)] font-tabular">{data.allocation.etfs_pct}% · ${data.allocation.etfs_usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-sm bg-yellow-500" />
                <div>
                  <p className="text-xs font-medium">Crypto</p>
                  <p className="text-[10px] text-[var(--muted)] font-tabular">{data.allocation.crypto_pct}% · ${data.allocation.crypto_usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-sm bg-gray-400" />
                <div>
                  <p className="text-xs font-medium">Cash</p>
                  <p className="text-[10px] text-[var(--muted)] font-tabular">{data.allocation.cash_pct}% · ${data.allocation.cash_usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                </div>
              </div>
            </div>

            {/* Crypto limit indicator */}
            <div className="flex items-center justify-between rounded-lg bg-[var(--background)] p-2.5">
              <span className="text-[10px] text-[var(--muted)]">Crypto limit for {data.risk_profile}:</span>
              <span className={`text-xs font-bold font-tabular ${
                data.allocation.crypto_pct > data.crypto_limit_pct ? 'text-[var(--loss)]' : 'text-[var(--gain)]'
              }`}>
                {data.allocation.crypto_pct.toFixed(1)}% / {data.crypto_limit_pct}% max
              </span>
            </div>
          </div>

          {/* Warnings */}
          {data.warnings.length > 0 && (
            <div className="space-y-3">
              {data.warnings.map((w, i) => (
                <div key={i} className={`rounded-xl border p-4 ${
                  w.severity === 'high' ? 'border-[var(--loss)]/30 bg-[var(--loss)]/5' : 'border-[var(--warning)]/30 bg-[var(--warning)]/5'
                }`}>
                  <div className="flex items-start gap-3">
                    <AlertTriangle className={`h-5 w-5 shrink-0 mt-0.5 ${w.severity === 'high' ? 'text-[var(--loss)]' : 'text-[var(--warning)]'}`} />
                    <div>
                      <p className={`text-sm font-semibold ${w.severity === 'high' ? 'text-[var(--loss)]' : 'text-[var(--warning)]'}`}>
                        {w.title}
                      </p>
                      <p className="text-xs text-[var(--foreground)] mt-1 leading-relaxed">{w.message}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Holdings by Asset Class */}
          {data.stocks.length > 0 && (
            <HoldingsSection title="Stocks" icon={<Briefcase className="h-4 w-4 text-blue-400" />} holdings={data.stocks} color="blue" />
          )}
          {data.etfs.length > 0 && (
            <HoldingsSection title="ETFs" icon={<Layers className="h-4 w-4 text-teal-400" />} holdings={data.etfs} color="teal" />
          )}
          {data.cryptos.length > 0 && (
            <HoldingsSection title="Crypto" icon={<Coins className="h-4 w-4 text-yellow-400" />} holdings={data.cryptos} color="yellow" />
          )}

          {/* Empty state */}
          {demoMode && (
            <div className="text-center py-12 space-y-3">
              <Wallet className="h-12 w-12 text-[var(--muted)]/30 mx-auto" />
              <p className="text-sm text-[var(--muted)]">
                Add stocks, ETFs, or crypto to your portfolio to see your unified wealth view.
              </p>
              <p className="text-[10px] text-[var(--muted)]">
                Use the Orders page to log stock/ETF purchases, or the Crypto page for crypto.
              </p>
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] text-[var(--muted)] text-center pb-4">
        Prices from Yahoo Finance (stocks/ETFs) and CoinGecko (crypto). Not financial advice.
      </p>
    </div>
  );
}

// ─── Holdings Section Component ──────────────────────────────────────────────

function HoldingsSection({ title, icon, holdings, color }: {
  title: string; icon: React.ReactNode; holdings: Holding[]; color: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-sm font-semibold">{title}</p>
        <span className="text-[10px] text-[var(--muted)]">({holdings.length})</span>
      </div>
      <div className="space-y-2">
        {holdings.map(h => (
          <div key={h.symbol} className="flex items-center justify-between rounded-lg bg-[var(--background)] p-3">
            <div>
              <p className="text-xs font-semibold">{h.symbol}</p>
              <p className="text-[9px] text-[var(--muted)]">
                {h.name || h.coin_id || ''} {h.shares ? `· ${h.shares} shares` : h.amount ? `· ${h.amount}` : ''}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold font-tabular">${h.value_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className={`text-[10px] font-tabular ${h.pnl_pct >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
                {h.pnl_pct >= 0 ? '+' : ''}{h.pnl_pct.toFixed(1)}%
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
