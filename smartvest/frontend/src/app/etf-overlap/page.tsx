'use client';

import { useState } from 'react';
import {
  Layers, AlertTriangle, Loader2, PieChart, BarChart3,
  Plus, X, Shield, Zap, CheckCircle2, Info,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';


interface PairOverlap {
  etf_a: string;
  etf_b: string;
  overlap_pct: number;
  common_count: number;
  common_stocks: { symbol: string; weight_a: number; weight_b: number }[];
}

interface SectorExposure {
  sector: string;
  true_weight_pct: number;
}

interface Warning {
  severity: string;
  message: string;
}

interface OverlapResult {
  etfs: string[];
  pairwise_overlaps: PairOverlap[];
  true_sector_exposure: SectorExposure[];
  warnings: Warning[];
  summary: string;
  max_overlap_pct: number;
}

export default function ETFOverlapPage() {
  const [etfs, setEtfs] = useState<string[]>(['', '']);
  const [result, setResult] = useState<OverlapResult | null>(null);
  const [loading, setLoading] = useState(false);

  function addETF() {
    if (etfs.length < 10) setEtfs([...etfs, '']);
  }

  function removeETF(idx: number) {
    if (etfs.length > 2) setEtfs(etfs.filter((_, i) => i !== idx));
  }

  function updateETF(idx: number, val: string) {
    const updated = [...etfs];
    updated[idx] = val.toUpperCase();
    setEtfs(updated);
  }

  async function analyze() {
    const valid = etfs.filter(e => e.trim().length > 0);
    if (valid.length < 2) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/etf-overlap/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ etfs: valid }),
      });
      if (res.ok) {
        const data = await res.json();
        setResult(data);
      }
    } catch {}
    setLoading(false);
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10">
          <Layers className="h-5 w-5 text-orange-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold">ETF Overlap Detector</h1>
          <p className="text-xs text-[var(--muted)]">
            Find hidden redundancy in your ETF holdings
          </p>
        </div>
      </div>

      {/* Explainer */}
      <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
        <p className="text-xs text-[var(--muted)] leading-relaxed">
          Many ETFs hold the same stocks underneath. If you own a Total Market ETF and a Tech ETF,
          you might think you are diversified — but in reality, the Total Market ETF already contains 30%+ tech stocks.
          This tool shows your <strong>true</strong> exposure after accounting for all overlapping holdings.
        </p>
      </div>

      {/* Input */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-4">
        <p className="text-sm font-semibold">Your ETFs</p>
        <div className="space-y-2">
          {etfs.map((etf, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-xs text-[var(--muted)] w-5">{idx + 1}.</span>
              <input
                type="text"
                value={etf}
                onChange={(e) => updateETF(idx, e.target.value)}
                placeholder="ETF ticker (e.g. VOO, QQQ, VGT)"
                className="flex-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"
              />
              {etfs.length > 2 && (
                <button onClick={() => removeETF(idx)} className="text-[var(--muted)] hover:text-[var(--loss)]">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Quick Fills */}
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setEtfs(['VOO', 'QQQ'])} className="rounded-md px-2.5 py-1 text-[10px] border border-[var(--card-border)] text-[var(--muted)] hover:text-orange-400">
            VOO + QQQ
          </button>
          <button onClick={() => setEtfs(['VTI', 'VGT', 'SCHD'])} className="rounded-md px-2.5 py-1 text-[10px] border border-[var(--card-border)] text-[var(--muted)] hover:text-orange-400">
            VTI + VGT + SCHD
          </button>
          <button onClick={() => setEtfs(['SPY', 'QQQ', 'ARKK'])} className="rounded-md px-2.5 py-1 text-[10px] border border-[var(--card-border)] text-[var(--muted)] hover:text-orange-400">
            SPY + QQQ + ARKK
          </button>
          <button onClick={() => setEtfs(['VOO', 'VEA', 'VWO', 'AGG'])} className="rounded-md px-2.5 py-1 text-[10px] border border-[var(--card-border)] text-[var(--muted)] hover:text-orange-400">
            Global 4-Fund
          </button>
        </div>

        <div className="flex gap-2">
          {etfs.length < 10 && (
            <button onClick={addETF} className="rounded-lg border border-dashed border-[var(--card-border)] px-3 py-2 text-xs text-[var(--muted)] hover:text-[var(--foreground)]">
              <Plus className="inline h-3 w-3 mr-1" />Add ETF
            </button>
          )}
          <button
            onClick={analyze}
            disabled={loading || etfs.filter(e => e.trim()).length < 2}
            className="flex-1 rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Detect Overlap'}
          </button>
        </div>
      </div>


      {/* Results */}
      {result && (
        <div className="space-y-5">
          {/* Summary */}
          <div className={`rounded-xl border p-5 ${
            result.max_overlap_pct > 50 ? 'border-[var(--loss)]/30 bg-[var(--loss)]/5' :
            result.max_overlap_pct > 25 ? 'border-[var(--warning)]/30 bg-[var(--warning)]/5' :
            'border-[var(--gain)]/30 bg-[var(--gain)]/5'
          }`}>
            <div className="flex items-center gap-3 mb-3">
              {result.max_overlap_pct > 50 ? (
                <AlertTriangle className="h-6 w-6 text-[var(--loss)]" />
              ) : result.max_overlap_pct > 25 ? (
                <Info className="h-6 w-6 text-[var(--warning)]" />
              ) : (
                <CheckCircle2 className="h-6 w-6 text-[var(--gain)]" />
              )}
              <div>
                <p className="text-sm font-semibold">
                  {result.max_overlap_pct > 50 ? 'High Overlap Detected' :
                   result.max_overlap_pct > 25 ? 'Moderate Overlap' :
                   'Good Diversification'}
                </p>
                <p className="text-[10px] text-[var(--muted)]">Max overlap: {result.max_overlap_pct}%</p>
              </div>
            </div>
            <p className="text-xs leading-relaxed">{result.summary}</p>
          </div>

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="space-y-2">
              {result.warnings.map((w, i) => (
                <div
                  key={i}
                  className={`rounded-lg border p-3 ${
                    w.severity === 'high'
                      ? 'border-[var(--loss)]/20 bg-[var(--loss)]/5'
                      : 'border-[var(--warning)]/20 bg-[var(--warning)]/5'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <Zap className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${w.severity === 'high' ? 'text-[var(--loss)]' : 'text-[var(--warning)]'}`} />
                    <p className="text-xs leading-relaxed">{w.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pairwise Overlaps */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-orange-400" />
              <p className="text-sm font-semibold">Pairwise Overlap</p>
            </div>

            {result.pairwise_overlaps.map((pair, i) => (
              <div key={i} className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium">{pair.etf_a} ↔ {pair.etf_b}</p>
                  <p className={`text-xs font-bold font-tabular ${
                    pair.overlap_pct > 50 ? 'text-[var(--loss)]' :
                    pair.overlap_pct > 25 ? 'text-[var(--warning)]' :
                    'text-[var(--gain)]'
                  }`}>
                    {pair.overlap_pct}% overlap · {pair.common_count} shared stocks
                  </p>
                </div>
                <div className="h-3 rounded-full bg-[var(--background)] overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      pair.overlap_pct > 50 ? 'bg-[var(--loss)]' :
                      pair.overlap_pct > 25 ? 'bg-[var(--warning)]' :
                      'bg-[var(--gain)]'
                    }`}
                    style={{ width: `${Math.min(pair.overlap_pct, 100)}%` }}
                  />
                </div>

                {/* Common stocks */}
                {pair.common_stocks.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {pair.common_stocks.slice(0, 8).map(s => (
                      <span key={s.symbol} className="rounded bg-orange-500/10 px-1.5 py-0.5 text-[9px] text-orange-400 font-medium">
                        {s.symbol} ({s.weight_a}% / {s.weight_b}%)
                      </span>
                    ))}
                    {pair.common_stocks.length > 8 && (
                      <span className="text-[9px] text-[var(--muted)]">+{pair.common_stocks.length - 8} more</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* True Sector Exposure */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-4">
            <div className="flex items-center gap-2">
              <PieChart className="h-4 w-4 text-orange-400" />
              <p className="text-sm font-semibold">Your TRUE Sector Exposure</p>
            </div>
            <p className="text-[10px] text-[var(--muted)]">
              This is what your portfolio actually looks like after unwrapping all ETF holdings:
            </p>
            <div className="space-y-2">
              {result.true_sector_exposure.filter(s => s.true_weight_pct >= 1).map(sector => (
                <div key={sector.sector} className="space-y-0.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{sector.sector}</span>
                    <span className={`font-bold font-tabular ${
                      sector.true_weight_pct > 40 ? 'text-[var(--loss)]' :
                      sector.true_weight_pct > 25 ? 'text-[var(--warning)]' :
                      'text-[var(--foreground)]'
                    }`}>
                      {sector.true_weight_pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-4 rounded-full bg-[var(--background)] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        sector.true_weight_pct > 40 ? 'bg-[var(--loss)]' :
                        sector.true_weight_pct > 25 ? 'bg-[var(--warning)]' :
                        'bg-orange-500'
                      }`}
                      style={{ width: `${Math.min(sector.true_weight_pct, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <p className="text-[10px] text-[var(--muted)] text-center pb-4">
        Holdings data is approximate and based on latest available information. Not financial advice.
      </p>
    </div>
  );
}
