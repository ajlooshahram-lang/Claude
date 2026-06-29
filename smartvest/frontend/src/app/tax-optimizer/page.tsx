'use client';

import { useState } from 'react';
import { Receipt, Loader2, Info, AlertTriangle, CheckCircle2, RefreshCw, Calculator } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';


export default function TaxOptimizerPage() {
  const [tab, setTab] = useState<'sell'|'dividend'|'checklist'>('checklist');
  const [loading, setLoading] = useState(false);
  const [checklist, setChecklist] = useState<any>(null);
  const [sellResult, setSellResult] = useState<any>(null);

  async function loadChecklist() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/tax-optimizer/year-end-checklist`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ account_type:'free', marital_status:'single', ytd_realized_gains_dkk:35000, ytd_realized_losses_dkk:8000, unrealized_gains_dkk:15000, unrealized_losses_dkk:12000, us_withholding_paid_dkk:2400, ask_value_start_of_year_dkk:100000, ask_value_now_dkk:115000 }),
      });
      if(res.ok) setChecklist(await res.json());
    } catch{}
    setLoading(false);
  }

  async function simulateSell() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/tax-optimizer/sell-analysis`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          trade:{symbol:'AAPL',shares_to_sell:10,current_price:230,currency:'USD',dkk_rate:6.85},
          purchases:[{date:'2023-03-15',shares:5,price_per_share:155,currency:'USD'},{date:'2024-01-10',shares:10,price_per_share:185,currency:'USD'}],
          account_type:'free', marital_status:'single', ytd_realized_gains_dkk:20000, ytd_realized_losses_dkk:5000,
        }),
      });
      if(res.ok) setSellResult(await res.json());
    } catch{}
    setLoading(false);
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-600/10"><Receipt className="h-5 w-5 text-green-400"/></div>
        <div><h1 className="text-xl font-bold">Danish Tax Optimizer</h1><p className="text-xs text-[var(--muted)]">Cross-border US/DK tax · FIFO vs Avg Cost · Year-end checklist</p></div>
      </div>

      <div className="rounded-xl border border-green-600/20 bg-green-600/5 p-4">
        <p className="text-xs text-[var(--muted)] leading-relaxed">Covers: US dividend withholding (15% treaty), Danish aktieindkomst (27%/42%), Aktiesparekonto (17% flat), FIFO vs Average Cost comparison, and loss harvesting strategies. <strong>Not tax advice — consult a revisor.</strong></p>
      </div>

      <div className="flex gap-1 rounded-lg bg-[var(--card)] p-1 border border-[var(--card-border)]">
        {(['checklist','sell','dividend'] as const).map(t=>(<button key={t} onClick={()=>{setTab(t); if(t==='checklist'&&!checklist)loadChecklist(); if(t==='sell'&&!sellResult)simulateSell();}} className={`flex-1 rounded-md px-3 py-2 text-xs font-medium capitalize ${tab===t?'bg-green-600/20 text-green-400':'text-[var(--muted)]'}`}>{t==='sell'?'Sell Analysis':t==='dividend'?'Dividend Tax':t}</button>))}
      </div>

      {loading && <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-green-400"/></div>}

      {/* Year-End Checklist */}
      {tab==='checklist' && checklist && !loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg bg-[var(--background)] p-3 text-center"><p className="text-[9px] text-[var(--muted)]">Net Gains</p><p className="text-sm font-bold font-tabular">{checklist.summary.net_taxable_dkk.toLocaleString('da-DK')} kr</p></div>
            <div className="rounded-lg bg-[var(--background)] p-3 text-center"><p className="text-[9px] text-[var(--muted)]">27% Room Left</p><p className="text-sm font-bold font-tabular text-[var(--gain)]">{checklist.summary.room_in_low_bracket_dkk.toLocaleString('da-DK')} kr</p></div>
            <div className="rounded-lg bg-[var(--background)] p-3 text-center"><p className="text-[9px] text-[var(--muted)]">Losses Available</p><p className="text-sm font-bold font-tabular">{checklist.summary.unrealized_losses_available_dkk.toLocaleString('da-DK')} kr</p></div>
            <div className="rounded-lg bg-[var(--background)] p-3 text-center"><p className="text-[9px] text-[var(--muted)]">Threshold</p><p className="text-sm font-bold font-tabular">{checklist.summary.threshold_dkk.toLocaleString('da-DK')} kr</p></div>
          </div>
          {checklist.actions.map((a:any,i:number)=>(<div key={i} className={`rounded-xl border p-4 space-y-2 ${a.priority==='high'?'border-[var(--warning)]/30 bg-[var(--warning)]/5':a.priority==='medium'?'border-[var(--primary)]/20 bg-[var(--primary)]/5':'border-[var(--card-border)] bg-[var(--card)]'}`}>
            <div className="flex items-center gap-2">{a.priority==='high'?<AlertTriangle className="h-4 w-4 text-[var(--warning)]"/>:<Info className="h-4 w-4 text-[var(--primary)]"/>}<p className="text-xs font-semibold">{a.action}</p></div>
            <p className="text-[10px] text-[var(--muted)] leading-relaxed">{a.reasoning}</p>
            <div className="flex items-center gap-3 text-[9px] text-[var(--muted)]"><span>Deadline: {a.deadline}</span></div>
            {a.note && <p className="text-[9px] italic text-[var(--muted)]">{a.note}</p>}
          </div>))}
          <p className="text-[9px] text-[var(--muted)] italic text-center">{checklist.disclaimer}</p>
        </div>
      )}

      {/* Sell Analysis */}
      {tab==='sell' && sellResult && !loading && (
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-3">
            <p className="text-sm font-semibold">Selling {sellResult.shares_sold} shares of {sellResult.symbol} @ {sellResult.sell_price_dkk.toLocaleString('da-DK')} DKK</p>
            <p className="text-xs text-[var(--muted)]">Proceeds: {sellResult.proceeds_dkk.toLocaleString('da-DK')} DKK</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 space-y-2">
              <p className="text-xs font-semibold">FIFO (First In, First Out)</p>
              <p className="text-[10px] text-[var(--muted)]">Cost: {sellResult.fifo.cost_basis_dkk.toLocaleString('da-DK')} DKK</p>
              <p className="text-[10px]">Gain: <strong>{sellResult.fifo.gain_dkk.toLocaleString('da-DK')} DKK</strong></p>
              <p className="text-[10px]">Tax: <strong className="text-[var(--loss)]">{sellResult.fifo.tax.tax_dkk.toLocaleString('da-DK')} DKK</strong></p>
              <p className="text-[10px] text-[var(--muted)] italic">{sellResult.fifo.tax.method}</p>
              <p className="text-sm font-bold text-[var(--gain)]">After tax: {sellResult.fifo.after_tax_proceeds_dkk.toLocaleString('da-DK')} DKK</p>
            </div>
            <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 space-y-2">
              <p className="text-xs font-semibold">Average Cost (Gennemsnit)</p>
              <p className="text-[10px] text-[var(--muted)]">Avg price: {sellResult.average_cost.avg_price_per_share_dkk.toLocaleString('da-DK')} DKK/share</p>
              <p className="text-[10px]">Gain: <strong>{sellResult.average_cost.gain_dkk.toLocaleString('da-DK')} DKK</strong></p>
              <p className="text-[10px]">Tax: <strong className="text-[var(--loss)]">{sellResult.average_cost.tax.tax_dkk.toLocaleString('da-DK')} DKK</strong></p>
              <p className="text-[10px] text-[var(--muted)] italic">{sellResult.average_cost.tax.method}</p>
              <p className="text-sm font-bold text-[var(--gain)]">After tax: {sellResult.average_cost.after_tax_proceeds_dkk.toLocaleString('da-DK')} DKK</p>
            </div>
          </div>
          <div className={`rounded-xl border p-4 ${sellResult.recommendation.savings_dkk>100?'border-[var(--gain)]/30 bg-[var(--gain)]/5':'border-[var(--card-border)] bg-[var(--card)]'}`}>
            <div className="flex items-center gap-2 mb-2"><CheckCircle2 className="h-4 w-4 text-[var(--gain)]"/><p className="text-xs font-semibold">Best Method: {sellResult.recommendation.better_method}</p></div>
            <p className="text-[10px] leading-relaxed">{sellResult.recommendation.explanation}</p>
            {sellResult.recommendation.savings_dkk>0 && <p className="text-xs font-bold text-[var(--gain)] mt-2">Saves you {sellResult.recommendation.savings_dkk.toLocaleString('da-DK')} DKK</p>}
          </div>
          <p className="text-[9px] text-[var(--muted)] italic">{sellResult.note}</p>
        </div>
      )}

      {/* Dividend Tab */}
      {tab==='dividend' && !loading && (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-4">
          <p className="text-sm font-semibold">US Dividend Tax (Denmark-US Treaty)</p>
          <div className="space-y-3 text-xs">
            <div className="rounded-lg bg-[var(--background)] p-3 space-y-1"><p className="font-semibold">With W-8BEN (correct setup):</p><p className="text-[var(--muted)]">US withholds 15% → Denmark taxes at 27% but credits the 15% → effective rate ~27%</p></div>
            <div className="rounded-lg bg-[var(--loss)]/5 border border-[var(--loss)]/10 p-3 space-y-1"><p className="font-semibold text-[var(--loss)]">Without W-8BEN (wrong):</p><p className="text-[var(--muted)]">US withholds 30% → you still owe Denmark 27% but only get 15% credit → effective rate ~42%! File W-8BEN immediately.</p></div>
            <div className="rounded-lg bg-[var(--background)] p-3 space-y-1"><p className="font-semibold">ASK account:</p><p className="text-[var(--muted)]">US withholds 15% → ASK tax is 17% → credit 15% → you only pay 2% more to Denmark. Very efficient.</p></div>
            <div className="rounded-lg bg-[var(--primary)]/5 border border-[var(--primary)]/10 p-3 space-y-1"><p className="font-semibold">How to reclaim overpaid withholding:</p><p className="text-[var(--muted)]">1. File W-8BEN with your broker (Saxo/Nordnet do it digitally). 2. Future dividends auto-deduct 15%. 3. For past overpayments, broker may handle reclaim or you file IRS Form 1040-NR.</p></div>
          </div>
        </div>
      )}

      <p className="text-[10px] text-[var(--muted)] text-center pb-4">Educational tax guidance only. Danish tax law changes annually. Always verify with SKAT or a certified revisor.</p>
    </div>
  );
}
