'use client';

import { useState, useEffect } from 'react';
import {
  Brain, TrendingUp, TrendingDown, AlertTriangle,
  Activity, Target, Shield, Pause, Play, Info,
} from 'lucide-react';
import { getShadowPortfolio, ShadowPortfolioState, AgentPosition } from '@/lib/shadow-portfolio';

export default function ShadowPortfolioPage() {
  const [state, setState] = useState<ShadowPortfolioState | null>(null);

  useEffect(() => { setState(getShadowPortfolio()); }, []);
  if (!state) return null;


  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 text-[var(--primary)]" />
            RL Shadow Portfolio
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            {state.agentName} — {state.status === 'live' ? '🟢 Running' : '⏸️ Paused'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-lg ${state.status === 'live' ? 'bg-[var(--gain)]/10 text-[var(--gain)]' : 'bg-[var(--muted)]/10 text-[var(--muted)]'}`}>
            Shadow Only — No Real Money
          </span>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="rounded-xl border border-[var(--warning)]/30 bg-[var(--warning)]/5 p-4 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-[var(--warning)] flex-shrink-0 mt-0.5" />
        <p className="text-[10px] text-[var(--warning)] leading-relaxed">{state.disclaimer}</p>
      </div>

      {/* Performance vs Benchmarks */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Target className="h-4 w-4 text-[var(--primary)]" />
          Performance Comparison
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead><tr className="border-b border-[var(--card-border)]">
              <th className="text-left py-2 px-3 font-medium text-[var(--muted)]">Strategy</th>
              <th className="text-right py-2 px-3 font-medium text-[var(--muted)]">Total Return</th>
              <th className="text-right py-2 px-3 font-medium text-[var(--muted)]">Sharpe Ratio</th>
              <th className="text-right py-2 px-3 font-medium text-[var(--muted)]">Max Drawdown</th>
            </tr></thead>
            <tbody className="divide-y divide-[var(--card-border)]">
              <tr className="bg-[var(--primary)]/5 font-medium">
                <td className="py-2.5 px-3 flex items-center gap-2"><Brain className="h-3.5 w-3.5 text-[var(--primary)]" /> RL Agent (Shadow)</td>
                <td className="text-right py-2.5 px-3 font-tabular text-[var(--gain)]">+{state.performance.totalReturn}%</td>
                <td className="text-right py-2.5 px-3 font-tabular font-bold text-[var(--primary)]">{state.performance.sharpeRatio}</td>
                <td className="text-right py-2.5 px-3 font-tabular text-[var(--loss)]">{state.performance.maxDrawdown}%</td>
              </tr>
              {state.comparisons.map(c => (
                <tr key={c.name}>
                  <td className="py-2.5 px-3">{c.name}</td>
                  <td className="text-right py-2.5 px-3 font-tabular">{c.totalReturn >= 0 ? '+' : ''}{c.totalReturn}%</td>
                  <td className="text-right py-2.5 px-3 font-tabular">{c.sharpeRatio}</td>
                  <td className="text-right py-2.5 px-3 font-tabular text-[var(--loss)]">{c.maxDrawdown}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[9px] text-[var(--muted)] mt-3">
          The RL agent optimizes for <strong>Sharpe ratio</strong> (risk-adjusted return), not raw return. A higher Sharpe with lower drawdown means better risk management even if total return is lower.
        </p>
      </div>

      {/* Agent Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBox label="Win Rate" value={`${state.performance.winRate}%`} />
        <StatBox label="Profit Factor" value={state.performance.profitFactor.toFixed(2)} />
        <StatBox label="Avg Holding" value={`${state.performance.avgHoldingDays}d`} />
        <StatBox label="Cash" value={`${state.cashPct.toFixed(0)}%`} />
      </div>

      {/* Open Positions */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--card-border)] flex items-center gap-2">
          <Activity className="h-4 w-4 text-[var(--primary)]" />
          <h2 className="text-sm font-semibold">Open Positions ({state.positions.length})</h2>
          <span className="text-[9px] text-[var(--muted)] ml-auto">{(100 - state.cashPct).toFixed(1)}% deployed</span>
        </div>
        <div className="divide-y divide-[var(--card-border)]">
          {state.positions.map(pos => (
            <PositionRow key={pos.symbol} position={pos} />
          ))}
        </div>
      </div>

      {/* Training Info */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Shield className="h-4 w-4 text-[var(--muted)]" />
          Training Details
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-[10px]">
          <div><p className="text-[var(--muted)]">Algorithm</p><p className="font-medium">PPO (Stable-Baselines3)</p></div>
          <div><p className="text-[var(--muted)]">Episodes</p><p className="font-medium">{state.training.episodes.toLocaleString()}</p></div>
          <div><p className="text-[var(--muted)]">Converged at</p><p className="font-medium">Episode {state.training.convergenceEpisode.toLocaleString()}</p></div>
          <div><p className="text-[var(--muted)]">Training time</p><p className="font-medium">{state.training.trainingDuration}</p></div>
          <div><p className="text-[var(--muted)]">Data window</p><p className="font-medium">{state.training.dataWindow}</p></div>
          <div><p className="text-[var(--muted)]">Last trained</p><p className="font-medium">{state.training.lastTrained}</p></div>
        </div>
      </div>

      {/* Implementation Status */}
      <div className="rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/5 p-5">
        <div className="flex items-center gap-2 mb-2">
          <Info className="h-4 w-4 text-[var(--primary)]" />
          <h3 className="text-xs font-bold text-[var(--primary)]">Implementation Status</h3>
        </div>
        <p className="text-[11px] text-[var(--foreground)]/80 leading-relaxed">
          This UI displays simulated RL agent results. The full technical specification for building the real Python backend (PPO agent, Gym environment, reward function, training pipeline) is documented in <code className="text-[var(--primary)]">RL-AGENT-SPEC.md</code>. When deployed, this page connects to the backend via REST API and displays live results identically.
        </p>
      </div>
    </div>
  );
}


// ─── Sub-components ──────────────────────────────────────────────────────────

function PositionRow({ position: p }: { position: AgentPosition }) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">{p.symbol}</span>
          <span className="text-[10px] text-[var(--muted)]">{p.name}</span>
          <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--gain)]/10 text-[var(--gain)]">LONG</span>
          <span className="text-[9px] text-[var(--muted)]">{p.positionSize}% of portfolio</span>
        </div>
        <div className="text-right">
          <span className={`text-xs font-bold font-tabular ${p.unrealizedPnLPct >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
            {p.unrealizedPnLPct >= 0 ? '+' : ''}{p.unrealizedPnLPct.toFixed(2)}% ({p.unrealizedPnL >= 0 ? '+' : ''}{p.unrealizedPnL} DKK)
          </span>
          <p className="text-[9px] text-[var(--muted)]">Entry: {p.entryPrice} → Now: {p.currentPrice} · Conf: {(p.confidence * 100).toFixed(0)}%</p>
        </div>
      </div>
      {/* Trigger Signals */}
      <div className="flex flex-wrap gap-1.5 mt-2">
        {p.triggerSignals.map((ts, i) => (
          <span key={i} className="text-[8px] px-2 py-1 rounded-md bg-[var(--background)] border border-[var(--card-border)] text-[var(--foreground)]/70">
            {ts.signal} <span className="text-[var(--primary)] font-bold">({ts.value.toFixed(1)})</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3">
      <p className="text-[9px] text-[var(--muted)] uppercase">{label}</p>
      <p className="text-sm font-bold font-tabular mt-0.5">{value}</p>
    </div>
  );
}
