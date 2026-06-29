'use client';
import { useState, useEffect } from 'react';
import { Compass, Loader2, RefreshCw, CheckCircle2, AlertTriangle, TrendingUp, Shield, Info } from 'lucide-react';
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';


interface RegimeData { regime: string; confidence_pct: number; regime_scores: Record<string,number>; regime_description: string; signals: Record<string,number>; explanation: string; well_positioned: {symbol:string;name:string;sector:string;reason:string}[]; at_risk: {symbol:string;name:string;sector:string;reason:string}[]; }
function getPortfolio() { try { const o=JSON.parse(localStorage.getItem('smartvest_orders')||'[]'); const m:Record<string,{shares:number;totalCost:number}>={}; for(const x of o){if(x.type==='buy'){if(!m[x.symbol])m[x.symbol]={shares:0,totalCost:0};m[x.symbol].shares+=x.shares;m[x.symbol].totalCost+=x.shares*x.price}else if(x.type==='sell'&&m[x.symbol])m[x.symbol].shares-=x.shares} return Object.entries(m).filter(([,v])=>v.shares>0).map(([s,v])=>({symbol:s,shares:v.shares,current_value:0})); } catch{return[];} }

const REGIME_COLORS: Record<string,string> = { 'Risk On':'text-[var(--gain)]', 'Risk Off':'text-[var(--loss)]', 'Inflationary':'text-[var(--warning)]', 'Deflationary':'text-[var(--primary)]' };
const REGIME_BG: Record<string,string> = { 'Risk On':'border-[var(--gain)]/30 bg-[var(--gain)]/5', 'Risk Off':'border-[var(--loss)]/30 bg-[var(--loss)]/5', 'Inflationary':'border-[var(--warning)]/30 bg-[var(--warning)]/5', 'Deflationary':'border-[var(--primary)]/30 bg-[var(--primary)]/5' };

export default function RegimePage() {
  const [data, setData] = useState<RegimeData|null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(()=>{detect();},[]);
  async function detect() {
    setLoading(true);
    const h = getPortfolio();
    const use = h.length>0?h:[{symbol:'AAPL',shares:15,current_value:0},{symbol:'MSFT',shares:10,current_value:0},{symbol:'NVDA',shares:5,current_value:0},{symbol:'XLE',shares:8,current_value:0},{symbol:'JNJ',shares:12,current_value:0},{symbol:'VOO',shares:20,current_value:0}];
    try { const r=await fetch(`${API_BASE}/api/regime/detect`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({holdings:use})}); if(r.ok)setData(await r.json()); } catch{}
    setLoading(false);
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10"><Compass className="h-5 w-5 text-indigo-400" /></div>
          <div><h1 className="text-xl font-bold">Market Regime Detection</h1><p className="text-xs text-[var(--muted)]">Risk On · Risk Off · Inflationary · Deflationary</p></div>
        </div>
        <button onClick={detect} disabled={loading} className="rounded-lg border border-[var(--card-border)] p-2"><RefreshCw className={`h-4 w-4 text-[var(--muted)] ${loading?'animate-spin':''}`}/></button>
      </div>

      <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
        <p className="text-xs text-[var(--muted)] leading-relaxed">Markets cycle through distinct regimes. Knowing which regime we are in helps you understand why some stocks are winning and others losing — and whether your portfolio is positioned correctly.</p>
      </div>

      {loading && <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-indigo-400"/><span className="ml-2 text-sm text-[var(--muted)]">Detecting regime...</span></div>}

      {data && !loading && (
        <div className="space-y-5">
          {/* Current Regime */}
          <div className={`rounded-xl border-2 p-6 text-center space-y-3 ${REGIME_BG[data.regime]}`}>
            <p className="text-[10px] text-[var(--muted)] uppercase tracking-wider">Current Regime</p>
            <p className={`text-3xl font-bold ${REGIME_COLORS[data.regime]}`}>{data.regime}</p>
            <p className="text-xs text-[var(--muted)]">Confidence: {data.confidence_pct}%</p>
            <p className="text-xs leading-relaxed max-w-lg mx-auto">{data.regime_description}</p>
          </div>

          {/* Regime Probabilities */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-3">
            <p className="text-sm font-semibold">Regime Probabilities</p>
            {Object.entries(data.regime_scores).sort((a,b)=>b[1]-a[1]).map(([name, score])=>(
              <div key={name} className="space-y-0.5">
                <div className="flex items-center justify-between text-xs"><span className={`font-medium ${REGIME_COLORS[name]||''}`}>{name}</span><span className="font-tabular">{score}%</span></div>
                <div className="h-2.5 rounded-full bg-[var(--background)] overflow-hidden"><div className={`h-full rounded-full ${name===data.regime?'bg-indigo-500':'bg-[var(--muted)]/30'}`} style={{width:`${score}%`}}/></div>
              </div>
            ))}
          </div>

          {/* Signals Used */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-3">
            <p className="text-sm font-semibold">Signals Analyzed</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg bg-[var(--background)] p-2.5 text-center"><p className="text-[9px] text-[var(--muted)]">VIX</p><p className="text-sm font-bold font-tabular">{data.signals.vix?.toFixed(1)||'N/A'}</p></div>
              <div className="rounded-lg bg-[var(--background)] p-2.5 text-center"><p className="text-[9px] text-[var(--muted)]">Growth vs Def.</p><p className="text-sm font-bold font-tabular">{data.signals.growth_vs_defensive?.toFixed(1)||'0'}%</p></div>
              <div className="rounded-lg bg-[var(--background)] p-2.5 text-center"><p className="text-[9px] text-[var(--muted)]">Yield Curve</p><p className="text-sm font-bold font-tabular">{data.signals.long_vs_short_bonds?.toFixed(1)||'0'}%</p></div>
              <div className="rounded-lg bg-[var(--background)] p-2.5 text-center"><p className="text-[9px] text-[var(--muted)]">Commodities</p><p className="text-sm font-bold font-tabular">{data.signals.commodities_vs_market?.toFixed(1)||'0'}%</p></div>
            </div>
          </div>

          {/* Portfolio Positioning */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-[var(--gain)]/20 bg-[var(--gain)]/5 p-4 space-y-2">
              <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[var(--gain)]"/><p className="text-xs font-semibold text-[var(--gain)]">Well Positioned ({data.well_positioned.length})</p></div>
              {data.well_positioned.slice(0,6).map(h=>(<div key={h.symbol} className="rounded-lg bg-[var(--card)] border border-[var(--card-border)] p-2.5"><p className="text-xs font-bold">{h.symbol}</p><p className="text-[9px] text-[var(--muted)]">{h.reason}</p></div>))}
            </div>
            <div className="rounded-xl border border-[var(--loss)]/20 bg-[var(--loss)]/5 p-4 space-y-2">
              <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-[var(--loss)]"/><p className="text-xs font-semibold text-[var(--loss)]">At Regime Risk ({data.at_risk.length})</p></div>
              {data.at_risk.slice(0,6).map(h=>(<div key={h.symbol} className="rounded-lg bg-[var(--card)] border border-[var(--card-border)] p-2.5"><p className="text-xs font-bold">{h.symbol}</p><p className="text-[9px] text-[var(--muted)]">{h.reason}</p></div>))}
              {data.at_risk.length===0&&<p className="text-xs text-[var(--muted)] text-center py-4">No holdings at significant regime risk.</p>}
            </div>
          </div>

          {/* Full Explanation */}
          <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-5 space-y-2">
            <div className="flex items-center gap-2"><Info className="h-4 w-4 text-indigo-400"/><p className="text-sm font-semibold text-indigo-400">Analysis</p></div>
            <p className="text-xs leading-relaxed" dangerouslySetInnerHTML={{__html:data.explanation}}/>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--muted)] text-center pb-4">Regime detection uses market signals, not predictions. Regimes can change rapidly. Not financial advice.</p>
    </div>
  );
}
