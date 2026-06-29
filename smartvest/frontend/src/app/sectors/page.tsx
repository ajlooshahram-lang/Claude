'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, TrendingUp, TrendingDown, Loader2, AlertCircle,
  ArrowLeft, Minus,
} from 'lucide-react';
import { LearningTip } from '@/components/learning-tip';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Sector {
  sector: string;
  etf: string;
  weekly_change_pct: number;
  direction: 'up' | 'down' | 'flat';
}

interface SectorStock {
  symbol: string;
  name: string;
  price: number;
  currency: string;
  weekly_change_pct: number;
  direction: 'up' | 'down';
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function SectorsPage() {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [sectorStocks, setSectorStocks] = useState<SectorStock[]>([]);
  const [loadingStocks, setLoadingStocks] = useState(false);

  // Fetch all sectors on mount
  useEffect(() => {
    setLoading(true);
    const controller = new AbortController();
    fetch(`${API_BASE}/api/sectors`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
      .then(data => setSectors(data.sectors || []))
      .catch(err => {
        if (err.name !== 'AbortError') {
          setError(`Could not load sector data. Make sure the backend is running.`);
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  // Fetch stocks for a selected sector
  const handleSelectSector = useCallback(async (sectorName: string) => {
    setSelectedSector(sectorName);
    setLoadingStocks(true);
    setSectorStocks([]);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(
        `${API_BASE}/api/sectors/${encodeURIComponent(sectorName)}`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      setSectorStocks(data.stocks || []);
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(`Could not load stocks for this sector. Please try again.`);
      }
    } finally {
      setLoadingStocks(false);
    }
  }, []);

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-[var(--primary)]" />
          Sector Overview
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          How each market sector performed this week. Click a sector to see top stocks.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/5 px-4 py-2.5 text-sm text-[var(--warning)]">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* Learning tip: sector rotation */}
      <LearningTip
        tipId="sectors_rotation"
        title="💡 What is sector rotation?"
        text="Different sectors perform better at different times. When the economy is growing, Technology and Industrials tend to lead. When things slow down, Healthcare and Consumer Goods hold up better because people still need medicine and food regardless of the economy. You don't need to predict this perfectly — just make sure you own stocks in at least 3-4 different sectors so you always have something working in your favor."
      />

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
          <span className="ml-3 text-sm text-[var(--muted)]">Loading sector data...</span>
        </div>
      )}

      {/* Sector Grid */}
      {!loading && sectors.length > 0 && !selectedSector && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {sectors.map((s) => (
            <SectorBlock key={s.sector} sector={s} onClick={() => handleSelectSector(s.sector)} />
          ))}
        </div>
      )}

      {/* Selected Sector Detail */}
      {selectedSector && (
        <div className="space-y-4">
          <button
            onClick={() => { setSelectedSector(null); setSectorStocks([]); }}
            className="flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to all sectors
          </button>

          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--card-border)]">
              <h2 className="font-semibold text-lg">{selectedSector}</h2>
              <p className="text-xs text-[var(--muted)] mt-0.5">Top 5 stocks by weekly performance</p>
            </div>

            {loadingStocks && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-[var(--primary)]" />
                <span className="ml-2 text-sm text-[var(--muted)]">Loading top stocks...</span>
              </div>
            )}

            {!loadingStocks && sectorStocks.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-[var(--muted)]">
                No stock data available for this sector right now.
              </div>
            )}

            {!loadingStocks && sectorStocks.length > 0 && (
              <div className="divide-y divide-[var(--card-border)]">
                {sectorStocks.map((stock, i) => (
                  <StockRow key={stock.symbol} stock={stock} rank={i + 1} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Components ──────────────────────────────────────────────────────────────

function SectorBlock({ sector, onClick }: { sector: Sector; onClick: () => void }) {
  const isUp = sector.direction === 'up';
  const isDown = sector.direction === 'down';

  const bgColor = isUp
    ? 'bg-[var(--gain)]/10 border-[var(--gain)]/30 hover:bg-[var(--gain)]/15'
    : isDown
    ? 'bg-[var(--loss)]/10 border-[var(--loss)]/30 hover:bg-[var(--loss)]/15'
    : 'bg-white/5 border-[var(--card-border)] hover:bg-white/10';

  const textColor = isUp
    ? 'text-[var(--gain)]'
    : isDown
    ? 'text-[var(--loss)]'
    : 'text-[var(--muted)]';

  const icon = isUp
    ? <TrendingUp className="h-5 w-5" />
    : isDown
    ? <TrendingDown className="h-5 w-5" />
    : <Minus className="h-5 w-5" />;

  return (
    <button
      onClick={onClick}
      className={`rounded-xl border p-5 text-left transition-colors cursor-pointer ${bgColor}`}
    >
      <div className={`flex items-center justify-between ${textColor}`}>
        {icon}
        <span className="text-xl font-bold font-tabular">
          {sector.weekly_change_pct >= 0 ? '+' : ''}{sector.weekly_change_pct.toFixed(2)}%
        </span>
      </div>
      <p className="text-sm font-semibold mt-3 text-[var(--foreground)]">{sector.sector}</p>
      <p className="text-[10px] text-[var(--muted)] mt-0.5">
        This week · {sector.etf}
      </p>
    </button>
  );
}

function StockRow({ stock, rank }: { stock: SectorStock; rank: number }) {
  const isUp = stock.weekly_change_pct >= 0;

  return (
    <div className="flex items-center gap-4 px-5 py-3.5">
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 text-xs font-bold text-[var(--muted)]">
        {rank}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{stock.symbol}</p>
        <p className="text-[10px] text-[var(--muted)] truncate">{stock.name}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-tabular">
          {stock.currency} {stock.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </p>
        <p className={`text-xs font-medium flex items-center justify-end gap-0.5 ${isUp ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
          {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {isUp ? '+' : ''}{stock.weekly_change_pct.toFixed(2)}%
        </p>
      </div>
    </div>
  );
}
