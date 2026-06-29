'use client';

import { useState } from 'react';
import { Zap, Loader2, Clock, BarChart3, DollarSign, Info, ArrowRight } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';


interface ExecResult {
  symbol:string; shares:number; side:string; strategy:string; duration_hours:number;
  market_order:{price:number;total_usd:number;total_dkk:number};
  twap:{avg_price:number;total_usd:number;total_dkk:number;num_slices:number};
  vwap:{avg_price:number;total_usd:number;total_dkk:number;num_slices:number;true_vwap_benchmark:number};
  chosen_strategy:{avg_price:number;total_usd:number;total_dkk:number};
  savings:{vs_market_usd:number;vs_market_dkk:number;positive:boolean};
  summary:string;
  education:{twap:string;vwap:string;why_it_matters:string};
}

export default function ExecutionPage() {
  const [symbol, setSymbol] = useState('AAPL');
  const [shares, setShares] = useState(100);
  const [side, setSide] = useState<'buy'|'sell'>('buy');
  const [strategy, setStrategy] = useState<'twap'|'vwap'>('twap');
  const [duration, setDuration] = useState(4);
  const [result, setResult] = useState<ExecResult|null>(null);
  const [loading, setLoading] = useState(false);

  async function simulate() {
    setLoading(true); setResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/execution/simulate`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({symbol,shares,side,strategy,duration_hours:duration,dkk_rate:6.85}),
      });
      if(res.ok) setResult(await res.json());
    } catch{}
    setLoading(false);
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10"><Zap className="h-5 w-5 text-emerald-400"/></div>
        <div><h1 className="text-xl font-bold">Execution Simulator</h1><p className="text-xs text-[var(--muted)]">TWAP & VWAP algorithms · See savings in DKK</p></div>
      </div>

      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <p className="text-xs text-[var(--muted)] leading-relaxed">Institutional investors never place one big market order. They use algorithms to split orders over time, reducing market impact. This simulator shows you the difference using real price data. <strong>Educational only — no real orders placed.</strong></p>
      </div>

      {/* Inputs */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div><label className="text-[10px] text-[var(--muted)]">Symbol</label><input type="text" value={symbol} onChange={e=>setSymbol(e.target.value.toUpperCase())} className="w-full mt-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"/></div>
          <div><label className="text-[10px] text-[var(--muted)]">Shares</label><input type="number" value={shares} onChange={e=>setShares(Number(e.target.value))} className="w-full mt-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"/></div>
          <div><label className="text-[10px] text-[var(--muted)]">Side</label><select value={side} onChange={e=>setSide(e.target.value as any)} className="w-full mt-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"><option value="buy">Buy</option><option value="sell">Sell</option></select></div>
          <div><label className="text-[10px] text-[var(--muted)]">Duration</label><select value={duration} onChange={e=>setDuration(Number(e.target.value))} className="w-full mt-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"><option value={1}>1 hour</option><option value={2}>2 hours</option><option value={4}>4 hours</option><option value={6}>Full day</option></select></div>
        </div>

        {/* Strategy Selection */}
        <div className="flex gap-3">
          <button onClick={()=>setStrategy('twap')} className={`flex-1 rounded-lg p-3 border text-center ${strategy==='twap'?'border-emerald-500/50 bg-emerald-500/10':'border-[var(--card-border)]'}`}>
            <Clock className={`h-5 w-5 mx-auto mb-1 ${strategy==='twap'?'text-emerald-400':'text-[var(--muted)]'}`}/>
            <p className={`text-xs font-semibold ${strategy==='twap'?'text-emerald-400':''}`}>TWAP</p>
            <p className="text-[9px] text-[var(--muted)]">Equal slices over time</p>
          </button>
          <button onClick={()=>setStrategy('vwap')} className={`flex-1 rounded-lg p-3 border text-center ${strategy==='vwap'?'border-emerald-500/50 bg-emerald-500/10':'border-[var(--card-border)]'}`}>
            <BarChart3 className={`h-5 w-5 mx-auto mb-1 ${strategy==='vwap'?'text-emerald-400':'text-[var(--muted)]'}`}/>
            <p className={`text-xs font-semibold ${strategy==='vwap'?'text-emerald-400':''}`}>VWAP</p>
            <p className="text-[9px] text-[var(--muted)]">Weighted by volume</p>
          </button>
        </div>

        <button onClick={simulate} disabled={loading} className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50 flex items-center justify-center gap-2">
          {loading?<Loader2 className="h-4 w-4 animate-spin"/>:<Zap className="h-4 w-4"/>}Simulate Execution
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-5">
          {/* Comparison */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 text-center">
              <p className="text-[9px] text-[var(--muted)]">Market Order</p>
              <p className="text-sm font-bold font-tabular">${result.market_order.price.toFixed(2)}</p>
              <p className="text-[10px] text-[var(--muted)]">{result.market_order.total_dkk.toLocaleString('da-DK',{maximumFractionDigits:0})} DKK total</p>
            </div>
            <div className={`rounded-xl border p-4 text-center ${result.savings.positive?'border-[var(--gain)]/30 bg-[var(--gain)]/5':'border-[var(--loss)]/30 bg-[var(--loss)]/5'}`}>
              <p className="text-[9px] text-[var(--muted)]">{result.strategy.toUpperCase()} Price</p>
              <p className="text-sm font-bold font-tabular">${result.chosen_strategy.avg_price.toFixed(4)}</p>
              <p className="text-[10px] text-[var(--muted)]">{result.chosen_strategy.total_dkk.toLocaleString('da-DK',{maximumFractionDigits:0})} DKK total</p>
            </div>
            <div className={`rounded-xl border p-4 text-center ${result.savings.positive?'border-[var(--gain)]/30 bg-[var(--gain)]/5':'border-[var(--warning)]/30 bg-[var(--warning)]/5'}`}>
              <p className="text-[9px] text-[var(--muted)]">{result.savings.positive?'You Save':'Difference'}</p>
              <p className={`text-lg font-bold font-tabular ${result.savings.positive?'text-[var(--gain)]':'text-[var(--warning)]'}`}>
                {result.savings.positive?'':'−'}{Math.abs(result.savings.vs_market_dkk).toLocaleString('da-DK',{maximumFractionDigits:0})} DKK
              </p>
              <p className="text-[10px] text-[var(--muted)]">${Math.abs(result.savings.vs_market_usd).toFixed(2)} USD</p>
            </div>
          </div>

          {/* Both strategies comparison */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-3">
            <p className="text-sm font-semibold">Strategy Comparison</p>
            <div className="grid grid-cols-3 gap-3 text-center text-xs">
              <div className="rounded-lg bg-[var(--background)] p-2.5"><p className="text-[9px] text-[var(--muted)]">TWAP</p><p className="font-bold font-tabular">${result.twap.avg_price.toFixed(4)}</p><p className="text-[9px] text-[var(--muted)]">{result.twap.num_slices} slices</p></div>
              <div className="rounded-lg bg-[var(--background)] p-2.5"><p className="text-[9px] text-[var(--muted)]">VWAP</p><p className="font-bold font-tabular">${result.vwap.avg_price.toFixed(4)}</p><p className="text-[9px] text-[var(--muted)]">{result.vwap.num_slices} slices</p></div>
              <div className="rounded-lg bg-[var(--background)] p-2.5"><p className="text-[9px] text-[var(--muted)]">Market</p><p className="font-bold font-tabular">${result.market_order.price.toFixed(2)}</p><p className="text-[9px] text-[var(--muted)]">1 order</p></div>
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5 space-y-2">
            <div className="flex items-center gap-2"><Info className="h-4 w-4 text-emerald-400"/><p className="text-sm font-semibold text-emerald-400">Result</p></div>
            <p className="text-xs leading-relaxed">{result.summary}</p>
          </div>

          {/* Education */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-3">
            <p className="text-sm font-semibold">How These Algorithms Work</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg bg-[var(--background)] p-3 space-y-1"><p className="text-xs font-semibold flex items-center gap-1"><Clock className="h-3 w-3 text-emerald-400"/>TWAP</p><p className="text-[10px] text-[var(--muted)]">{result.education.twap}</p></div>
              <div className="rounded-lg bg-[var(--background)] p-3 space-y-1"><p className="text-xs font-semibold flex items-center gap-1"><BarChart3 className="h-3 w-3 text-emerald-400"/>VWAP</p><p className="text-[10px] text-[var(--muted)]">{result.education.vwap}</p></div>
            </div>
            <p className="text-[10px] text-[var(--muted)] italic">{result.education.why_it_matters}</p>
          </div>
        </div>
      )}

      <p className="text-[10px] text-[var(--muted)] text-center pb-4">Simulation only — no real orders placed. Uses real intraday price data from Yahoo Finance.</p>
    </div>
  );
}
