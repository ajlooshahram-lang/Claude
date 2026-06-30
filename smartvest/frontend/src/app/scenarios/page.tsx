'use client';

import { useState } from 'react';
import {
  FlaskConical, TrendingDown, TrendingUp, AlertTriangle,
  ChevronDown, ChevronUp, History, Target, Wrench,
} from 'lucide-react';
import {
  getAllScenarios, runScenario, buildCustomScenario,
  ScenarioDefinition, ScenarioResult, HoldingImpact,
  PREBUILT_SCENARIOS,
} from '@/lib/scenario-engine';

export default function ScenariosPage() {
  const [selectedScenario, setSelectedScenario] = useState<ScenarioDefinition | null>(null);
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const [customCategory, setCustomCategory] = useState<ScenarioDefinition['category']>('rates');

  function handleRun(scenario: ScenarioDefinition) {
    setSelectedScenario(scenario);
    setResult(runScenario(scenario));
  }

  function handleCustomBuild() {
    if (!customName) return;
    const custom = buildCustomScenario(customName, customDesc, customCategory, [
      { variable: 'Custom Factor', change: 10, unit: '%', direction: 'decrease' },
    ]);
    handleRun(custom);
    setShowCustom(false);
  }


  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FlaskConical className="h-6 w-6 text-[var(--primary)]" />
          Scenario Analysis
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Model macroeconomic scenarios and see projected portfolio impact in DKK
        </p>
      </div>

      {/* Scenario Cards */}
      {!result && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PREBUILT_SCENARIOS.map(s => (
              <button key={s.id} onClick={() => handleRun(s)} className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 text-left hover:border-[var(--primary)]/50 transition-all group">
                <span className="text-2xl mb-2 block">{s.icon}</span>
                <h3 className="text-xs font-bold group-hover:text-[var(--primary)] transition-colors">{s.name}</h3>
                <p className="text-[10px] text-[var(--muted)] mt-1 leading-relaxed line-clamp-2">{s.description}</p>
                <div className="mt-3 flex gap-1.5 flex-wrap">
                  {s.assumptions.slice(0, 2).map((a, i) => (
                    <span key={i} className="text-[8px] px-1.5 py-0.5 rounded bg-[var(--loss)]/10 text-[var(--loss)]">
                      {a.variable} {a.direction === 'increase' ? '↑' : '↓'}{a.change}{a.unit}
                    </span>
                  ))}
                </div>
              </button>
            ))}
            {/* Custom Scenario Button */}
            <button onClick={() => setShowCustom(true)} className="rounded-xl border-2 border-dashed border-[var(--card-border)] p-5 text-center hover:border-[var(--primary)]/50 transition-all">
              <Wrench className="h-8 w-8 text-[var(--muted)] mx-auto mb-2" />
              <h3 className="text-xs font-bold">Build Custom Scenario</h3>
              <p className="text-[10px] text-[var(--muted)] mt-1">Define your own assumptions</p>
            </button>
          </div>

          {/* Custom Builder */}
          {showCustom && (
            <div className="rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/5 p-5 space-y-3">
              <h3 className="text-sm font-semibold text-[var(--primary)]">Custom Scenario Builder</h3>
              <div className="grid grid-cols-3 gap-3">
                <input value={customName} onChange={e => setCustomName(e.target.value)} placeholder="Scenario name" className="px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--card)] text-xs" />
                <input value={customDesc} onChange={e => setCustomDesc(e.target.value)} placeholder="Description" className="px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--card)] text-xs" />
                <select value={customCategory} onChange={e => setCustomCategory(e.target.value as any)} className="px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--card)] text-xs">
                  <option value="rates">Interest Rates</option>
                  <option value="recession">Recession</option>
                  <option value="commodity">Commodity Shock</option>
                  <option value="currency">Currency Move</option>
                  <option value="sector">Sector Selloff</option>
                  <option value="geopolitical">Geopolitical</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={handleCustomBuild} className="px-4 py-2 rounded-lg text-xs font-medium bg-[var(--primary)] text-white">Run Analysis</button>
                <button onClick={() => setShowCustom(false)} className="px-4 py-2 rounded-lg text-xs text-[var(--muted)]">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}


      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Scenario Header */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{result.scenario.icon}</span>
                <h2 className="text-lg font-bold">{result.scenario.name}</h2>
              </div>
              <p className="text-xs text-[var(--muted)]">{result.scenario.description}</p>
            </div>
            <button onClick={() => { setResult(null); setSelectedScenario(null); }} className="px-3 py-2 rounded-lg text-xs font-medium border border-[var(--card-border)] text-[var(--muted)]">← Back</button>
          </div>

          {/* Portfolio Impact Summary */}
          <div className={`rounded-xl border p-6 ${result.portfolioImpactPct < -10 ? 'border-[var(--loss)]/40 bg-[var(--loss)]/5' : result.portfolioImpactPct < -5 ? 'border-[var(--warning)]/40 bg-[var(--warning)]/5' : 'border-[var(--card-border)] bg-[var(--card)]'}`}>
            <div className="grid grid-cols-3 gap-6 text-center">
              <div>
                <p className="text-[10px] text-[var(--muted)] uppercase mb-1">Estimated Impact</p>
                <p className={`text-2xl font-bold font-tabular ${result.portfolioImpact >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
                  {result.portfolioImpact >= 0 ? '+' : ''}{result.portfolioImpact.toLocaleString()} DKK
                </p>
                <p className={`text-xs font-tabular ${result.portfolioImpactPct >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
                  ({result.portfolioImpactPct >= 0 ? '+' : ''}{result.portfolioImpactPct}%)
                </p>
              </div>
              <div>
                <p className="text-[10px] text-[var(--muted)] uppercase mb-1">Worst Case</p>
                <p className="text-xl font-bold font-tabular text-[var(--loss)]">{result.worstCase.toLocaleString()} DKK</p>
              </div>
              <div>
                <p className="text-[10px] text-[var(--muted)] uppercase mb-1">Best Case</p>
                <p className="text-xl font-bold font-tabular text-[var(--foreground)]">{result.bestCase.toLocaleString()} DKK</p>
              </div>
            </div>
          </div>

          {/* Recommendation */}
          <div className="rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-4 w-4 text-[var(--primary)]" />
              <span className="text-xs font-bold text-[var(--primary)]">Recommendation</span>
            </div>
            <p className="text-[11px] leading-relaxed text-[var(--foreground)]/85">{result.recommendation}</p>
          </div>

          {/* Per-Holding Impact */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--card-border)]">
              <h3 className="text-sm font-semibold">Per-Holding Impact</h3>
            </div>
            <div className="divide-y divide-[var(--card-border)]">
              {result.holdingImpacts.map(h => (
                <div key={h.symbol} className="px-5 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold">{h.symbol}</span>
                      <span className="text-[10px] text-[var(--muted)]">{h.name}</span>
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${h.sensitivity === 'High' ? 'bg-[var(--loss)]/10 text-[var(--loss)]' : h.sensitivity === 'Moderate' ? 'bg-[var(--warning)]/10 text-[var(--warning)]' : 'bg-[var(--gain)]/10 text-[var(--gain)]'}`}>{h.sensitivity}</span>
                    </div>
                    <span className={`text-xs font-bold font-tabular ${h.estimatedChangePct >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
                      {h.estimatedChangePct >= 0 ? '+' : ''}{h.estimatedChangePct}% ({h.estimatedChange >= 0 ? '+' : ''}{h.estimatedChange.toLocaleString()} DKK)
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--muted)] leading-relaxed">{h.reasoning}</p>
                  <div className="flex items-center gap-2 mt-1 text-[9px] text-[var(--muted)]">
                    <span>Range: {h.confidenceLow.toLocaleString()} to {h.confidenceHigh.toLocaleString()} DKK</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Historical Precedents */}
          {result.scenario.historicalPrecedents.length > 0 && (
            <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
              <div className="px-5 py-3 border-b border-[var(--card-border)] flex items-center gap-2">
                <History className="h-4 w-4 text-[var(--muted)]" />
                <h3 className="text-sm font-semibold">Historical Precedents</h3>
              </div>
              <div className="divide-y divide-[var(--card-border)]">
                {result.scenario.historicalPrecedents.map((p, i) => (
                  <div key={i} className="px-5 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold">{p.event}</span>
                      <span className="text-xs font-tabular text-[var(--loss)]">S&P 500: {p.sp500Impact}%</span>
                    </div>
                    <p className="text-[10px] text-[var(--muted)]">{p.date} &middot; Duration: {p.duration}</p>
                    <p className="text-[10px] text-[var(--foreground)]/70 mt-1">{p.outcome}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-[var(--muted)] mt-0.5 flex-shrink-0" />
            <p className="text-[9px] text-[var(--muted)] leading-relaxed">
              <strong>Disclaimer:</strong> Scenario results are estimates based on historical patterns and sensitivity analysis. Actual market reactions may differ significantly. Past precedents do not predict future outcomes. Use as one input among many — not as the sole basis for investment decisions.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
