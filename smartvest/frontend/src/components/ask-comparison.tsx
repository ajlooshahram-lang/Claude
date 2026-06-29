'use client';

import { useState, useMemo } from 'react';
import { ArrowLeftRight, TrendingUp, Info } from 'lucide-react';
import { compareASKvsRegular, ASK_TAX_RATE, REGULAR_LOW_RATE, REGULAR_HIGH_RATE, REGULAR_THRESHOLD } from '@/lib/ask';

export function ASKComparison() {
  const [investment, setInvestment] = useState(100000);
  const [annualReturn, setAnnualReturn] = useState(8);
  const [years, setYears] = useState(10);

  const comparison = useMemo(
    () => compareASKvsRegular(investment, annualReturn / 100, years),
    [investment, annualReturn, years]
  );

  // Generate year-by-year data for the visual chart
  const yearByYear = useMemo(() => {
    const data: { year: number; ask: number; regular: number }[] = [];
    for (let y = 1; y <= years; y++) {
      const c = compareASKvsRegular(investment, annualReturn / 100, y);
      data.push({ year: y, ask: c.askFinalValue, regular: c.regularFinalValue });
    }
    return data;
  }, [investment, annualReturn, years]);

  const maxValue = Math.max(
    ...yearByYear.map(d => Math.max(d.ask, d.regular)),
    investment
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-1">
          <ArrowLeftRight className="h-4 w-4 text-[var(--primary)]" />
          ASK vs Regular Depot — Tax Comparison
        </h2>
        <p className="text-[10px] text-[var(--muted)]">
          Compare how the same investment grows in an ASK (17% lagerbeskatning) vs a regular depot (27/42% realisationsbeskatning).
        </p>
      </div>


      {/* Input Controls */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-4">
        <p className="text-xs font-medium">Simulation Parameters</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-[10px] text-[var(--muted)] block mb-1">Investment Amount</label>
            <div className="relative">
              <input
                type="range" min="10000" max="135600" step="5000"
                value={investment}
                onChange={e => setInvestment(Number(e.target.value))}
                className="w-full accent-[var(--primary)]"
              />
              <span className="text-xs font-medium font-tabular block mt-1">
                {investment.toLocaleString()} DKK
              </span>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-[var(--muted)] block mb-1">Annual Return</label>
            <div className="relative">
              <input
                type="range" min="2" max="20" step="1"
                value={annualReturn}
                onChange={e => setAnnualReturn(Number(e.target.value))}
                className="w-full accent-[var(--primary)]"
              />
              <span className="text-xs font-medium font-tabular block mt-1">
                {annualReturn}% per year
              </span>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-[var(--muted)] block mb-1">Time Horizon</label>
            <div className="relative">
              <input
                type="range" min="1" max="30" step="1"
                value={years}
                onChange={e => setYears(Number(e.target.value))}
                className="w-full accent-[var(--primary)]"
              />
              <span className="text-xs font-medium font-tabular block mt-1">
                {years} year{years !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>
      </div>


      {/* Results Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-3 w-3 rounded-full bg-[var(--primary)]" />
            <p className="text-[10px] font-semibold text-[var(--primary)] uppercase tracking-wider">ASK (17%)</p>
          </div>
          <p className="text-lg font-bold font-tabular">{comparison.askFinalValue.toLocaleString()} DKK</p>
          <p className="text-[10px] text-[var(--muted)] mt-1">
            Total tax paid: {comparison.askTotalTax.toLocaleString()} DKK
          </p>
          <p className="text-[10px] text-[var(--muted)]">
            Gain after tax: {(comparison.askFinalValue - investment).toLocaleString()} DKK
          </p>
        </div>
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-3 w-3 rounded-full bg-[var(--muted)]" />
            <p className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider">Regular Depot</p>
          </div>
          <p className="text-lg font-bold font-tabular">{comparison.regularFinalValue.toLocaleString()} DKK</p>
          <p className="text-[10px] text-[var(--muted)] mt-1">
            Total tax paid: {comparison.regularTotalTax.toLocaleString()} DKK
          </p>
          <p className="text-[10px] text-[var(--muted)]">
            Gain after tax: {(comparison.regularFinalValue - investment).toLocaleString()} DKK
          </p>
        </div>
      </div>

      {/* Advantage Banner */}
      <div className={`rounded-xl border p-4 ${
        comparison.advantage >= 0
          ? 'border-[var(--gain)]/30 bg-[var(--gain)]/5'
          : 'border-[var(--warning)]/30 bg-[var(--warning)]/5'
      }`}>
        <div className="flex items-center gap-2">
          <TrendingUp className={`h-5 w-5 ${comparison.advantage >= 0 ? 'text-[var(--gain)]' : 'text-[var(--warning)]'}`} />
          <div>
            <p className={`text-sm font-bold ${comparison.advantage >= 0 ? 'text-[var(--gain)]' : 'text-[var(--warning)]'}`}>
              {comparison.advantage >= 0
                ? `ASK wins by ${comparison.advantage.toLocaleString()} DKK (+${comparison.advantagePct}%)`
                : `Regular depot wins by ${Math.abs(comparison.advantage).toLocaleString()} DKK`
              }
            </p>
            <p className="text-[10px] text-[var(--muted)] mt-0.5">
              {comparison.advantage >= 0
                ? `Over ${years} years, the 17% flat tax saves you money vs the progressive 27/42% rate.`
                : `For shorter horizons with smaller gains, the regular depot's deferred taxation can sometimes win.`
              }
            </p>
          </div>
        </div>
      </div>


      {/* Visual Bar Chart */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
        <h3 className="text-xs font-semibold mb-4">Growth Over Time (After Tax)</h3>
        <div className="space-y-2">
          {yearByYear.filter((_, i) => {
            // Show at most 10 bars for readability
            if (years <= 10) return true;
            const step = Math.ceil(years / 10);
            return i % step === 0 || i === years - 1;
          }).map(d => (
            <div key={d.year} className="flex items-center gap-2 text-[10px]">
              <span className="w-8 text-right text-[var(--muted)] font-tabular">Y{d.year}</span>
              <div className="flex-1 space-y-0.5">
                <div className="flex items-center gap-1">
                  <div
                    className="h-3 rounded-sm bg-[var(--primary)]"
                    style={{ width: `${(d.ask / maxValue) * 100}%` }}
                  />
                  <span className="font-tabular text-[var(--primary)]">{(d.ask / 1000).toFixed(0)}k</span>
                </div>
                <div className="flex items-center gap-1">
                  <div
                    className="h-3 rounded-sm bg-[var(--muted)]/40"
                    style={{ width: `${(d.regular / maxValue) * 100}%` }}
                  />
                  <span className="font-tabular text-[var(--muted)]">{(d.regular / 1000).toFixed(0)}k</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-4 text-[10px]">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm bg-[var(--primary)]" />
            <span className="text-[var(--muted)]">ASK (17% annually)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm bg-[var(--muted)]/40" />
            <span className="text-[var(--muted)]">Regular (27/42% on sell)</span>
          </div>
        </div>
      </div>


      {/* Tax Breakdown Table */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
        <h3 className="text-xs font-semibold mb-3">Tax Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-[var(--card-border)]">
                <th className="text-left py-2 text-[var(--muted)] font-medium"></th>
                <th className="text-right py-2 text-[var(--primary)] font-medium">ASK</th>
                <th className="text-right py-2 text-[var(--muted)] font-medium">Regular Depot</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--card-border)]">
              <tr>
                <td className="py-2 text-[var(--muted)]">Tax method</td>
                <td className="py-2 text-right font-medium">Lagerbeskatning</td>
                <td className="py-2 text-right font-medium">Realisationsbeskatning</td>
              </tr>
              <tr>
                <td className="py-2 text-[var(--muted)]">When taxed</td>
                <td className="py-2 text-right">Annually (unrealized)</td>
                <td className="py-2 text-right">Only when sold</td>
              </tr>
              <tr>
                <td className="py-2 text-[var(--muted)]">Tax rate</td>
                <td className="py-2 text-right font-medium text-[var(--primary)]">{(ASK_TAX_RATE * 100)}% flat</td>
                <td className="py-2 text-right">{(REGULAR_LOW_RATE * 100)}% / {(REGULAR_HIGH_RATE * 100)}%</td>
              </tr>
              <tr>
                <td className="py-2 text-[var(--muted)]">Threshold</td>
                <td className="py-2 text-right">None (flat)</td>
                <td className="py-2 text-right">{REGULAR_THRESHOLD.toLocaleString()} DKK</td>
              </tr>
              <tr>
                <td className="py-2 text-[var(--muted)]">Total tax paid</td>
                <td className="py-2 text-right font-bold font-tabular text-[var(--primary)]">{comparison.askTotalTax.toLocaleString()} DKK</td>
                <td className="py-2 text-right font-bold font-tabular">{comparison.regularTotalTax.toLocaleString()} DKK</td>
              </tr>
              <tr>
                <td className="py-2 text-[var(--muted)]">Final value (after tax)</td>
                <td className="py-2 text-right font-bold font-tabular text-[var(--gain)]">{comparison.askFinalValue.toLocaleString()} DKK</td>
                <td className="py-2 text-right font-bold font-tabular">{comparison.regularFinalValue.toLocaleString()} DKK</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Important Notes */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 flex items-start gap-3">
        <Info className="h-4 w-4 text-[var(--muted)] mt-0.5 flex-shrink-0" />
        <div className="text-[10px] text-[var(--muted)] leading-relaxed space-y-1">
          <p><strong>Lagerbeskatning trade-off:</strong> ASK taxes you every year even if you don&apos;t sell. This reduces your compounding base slightly. But the much lower rate (17% vs 27-42%) usually more than compensates.</p>
          <p><strong>When regular depot wins:</strong> For very short holding periods (1-2 years) with gains under 61,000 DKK, the regular depot&apos;s 27% rate with deferred taxation can sometimes come out ahead.</p>
          <p><strong>Loss offset:</strong> Both accounts allow loss offset. In ASK, losses reduce your lagerbeskatning basis. In regular depots, losses offset gains in the same year or carry forward.</p>
        </div>
      </div>
    </div>
  );
}
