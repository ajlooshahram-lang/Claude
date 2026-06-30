'use client';

import { useState, useEffect } from 'react';
import {
  Shield, Lock, Eye, EyeOff, Check, X,
  AlertTriangle, Database, Globe, Info,
} from 'lucide-react';
import {
  getPrivacyDashboardData, updatePrivacySettings,
  optOutOfEverything, PrivacyDashboardData,
  PrivacySettings, DataFlowItem,
} from '@/lib/privacy-layer';

export default function PrivacyPage() {
  const [data, setData] = useState<PrivacyDashboardData | null>(null);

  useEffect(() => { setData(getPrivacyDashboardData()); }, []);

  function handleToggle(key: keyof PrivacySettings) {
    if (!data) return;
    const updated = updatePrivacySettings({ [key]: !data.settings[key] });
    setData(getPrivacyDashboardData());
  }

  function handleOptOutAll() {
    optOutOfEverything();
    setData(getPrivacyDashboardData());
  }

  if (!data) return null;


  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6 text-[var(--primary)]" />
          Privacy Dashboard
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Exactly what data leaves your device, in what form, and what it&apos;s used for
        </p>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-[var(--gain)]/30 bg-[var(--gain)]/5 p-4 text-center">
          <Lock className="h-5 w-5 text-[var(--gain)] mx-auto mb-1" />
          <p className="text-xl font-bold">{data.stats.dataPointsOnDevice}</p>
          <p className="text-[9px] text-[var(--gain)]">Data points ON YOUR DEVICE</p>
        </div>
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 text-center">
          <Globe className="h-5 w-5 text-[var(--muted)] mx-auto mb-1" />
          <p className="text-xl font-bold">{data.stats.dataPointsShared}</p>
          <p className="text-[9px] text-[var(--muted)]">Data points shared (anonymized)</p>
        </div>
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 text-center">
          <Eye className="h-5 w-5 text-[var(--muted)] mx-auto mb-1" />
          <p className="text-xl font-bold">{data.neverShared.length}</p>
          <p className="text-[9px] text-[var(--muted)]">Categories NEVER shared</p>
        </div>
      </div>

      {/* Master Opt-Out */}
      <div className="rounded-xl border border-[var(--loss)]/30 bg-[var(--loss)]/5 p-5 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold">One-Click Opt Out</p>
          <p className="text-[10px] text-[var(--muted)] mt-0.5">Disable ALL community features and data sharing instantly. Your app continues to work — you just won&apos;t contribute to or benefit from aggregate insights.</p>
        </div>
        <button onClick={handleOptOutAll} disabled={!data.settings.communityFeaturesEnabled}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-colors ${data.settings.communityFeaturesEnabled ? 'bg-[var(--loss)] text-white hover:bg-[var(--loss)]/80' : 'bg-[var(--muted)]/20 text-[var(--muted)] cursor-default'}`}>
          {data.settings.communityFeaturesEnabled ? 'Opt Out of Everything' : '✓ Already Opted Out'}
        </button>
      </div>

      {/* Data Flows */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold">What Leaves Your Device (and what doesn&apos;t)</h2>
        {data.dataFlows.map(flow => (
          <DataFlowCard key={flow.id} flow={flow} onToggle={() => {
            const settingKey = flow.id === 'peer_benchmark' ? 'contributeToPeerBenchmark' :
              flow.id === 'smart_picks' ? 'contributeToSmartPicks' :
              flow.id === 'popular_stocks' ? 'contributeToPopularStocks' :
              flow.id === 'risk_profile' ? 'shareRiskProfile' :
              'allowAnonymizedAnalytics';
            handleToggle(settingKey as keyof PrivacySettings);
          }} />
        ))}
      </div>

      {/* NEVER Shared */}
      <div className="rounded-xl border border-[var(--gain)]/30 bg-[var(--gain)]/5 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Lock className="h-4 w-4 text-[var(--gain)]" />
          <h2 className="text-sm font-bold text-[var(--gain)]">Data That NEVER Leaves Your Device</h2>
        </div>
        <ul className="space-y-1.5">
          {data.neverShared.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-[10px]">
              <span className="text-[var(--gain)] font-bold mt-0.5">✓</span>
              <span className="text-[var(--foreground)]/80">{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Third Parties */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
        <h2 className="text-sm font-bold mb-3">Third Parties</h2>
        <div className="space-y-2">
          {data.thirdParties.map(tp => (
            <div key={tp.name} className="flex items-center gap-4 text-[10px] rounded-lg border border-[var(--card-border)] p-3">
              <span className="font-bold w-16">{tp.name}</span>
              <span className="text-[var(--muted)] flex-1">{tp.purpose}</span>
              <span className="text-[var(--foreground)]/70">{tp.dataShared}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Honest Note */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
        <div className="flex items-center gap-2 mb-2">
          <Info className="h-4 w-4 text-[var(--primary)]" />
          <h2 className="text-sm font-bold">A Note on Honesty</h2>
        </div>
        <p className="text-[10px] text-[var(--muted)] leading-relaxed">
          We use <strong>server-side aggregation with k-anonymity</strong> (minimum 10 users per group). We do NOT use federated learning, on-device training, or differential privacy — because implementing those correctly requires infrastructure and formal mathematical proofs that we have not built. We believe being transparent about our actual privacy approach is more honest than claiming cutting-edge cryptographic techniques we haven&apos;t implemented. Your data is protected by isolation, minimization, and transparency — not by marketing buzzwords.
        </p>
      </div>
    </div>
  );
}


// ─── Sub-component ───────────────────────────────────────────────────────────

function DataFlowCard({ flow, onToggle }: { flow: DataFlowItem; onToggle: () => void }) {
  return (
    <div className={`rounded-xl border p-4 transition-all ${flow.isOptedOut ? 'border-[var(--card-border)] opacity-60' : 'border-[var(--primary)]/20 bg-[var(--primary)]/5'}`}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <p className="text-xs font-bold">{flow.dataPoint}</p>
          <p className="text-[9px] text-[var(--muted)] mt-0.5">Purpose: {flow.purpose}</p>
        </div>
        {flow.canOptOut && (
          <button onClick={onToggle}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[9px] font-bold transition-colors ${flow.isOptedOut ? 'bg-[var(--muted)]/10 text-[var(--muted)]' : 'bg-[var(--primary)]/10 text-[var(--primary)]'}`}>
            {flow.isOptedOut ? 'Opted Out' : 'Sharing'}
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 text-[9px]">
        <div className="rounded-lg bg-[var(--gain)]/5 border border-[var(--gain)]/20 p-2.5">
          <p className="font-bold text-[var(--gain)] mb-0.5 flex items-center gap-1"><Lock className="h-2.5 w-2.5" /> STAYS on device:</p>
          <p className="text-[var(--foreground)]/70 leading-relaxed">{flow.whatStays}</p>
        </div>
        <div className="rounded-lg bg-[var(--background)] border border-[var(--card-border)] p-2.5">
          <p className="font-bold text-[var(--muted)] mb-0.5 flex items-center gap-1"><Globe className="h-2.5 w-2.5" /> {flow.isOptedOut ? 'Would leave (opted out):' : 'Leaves device as:'}</p>
          <p className="text-[var(--foreground)]/70 leading-relaxed">{flow.whatLeaves}</p>
        </div>
      </div>
      <p className="text-[8px] text-[var(--muted)] mt-2">Anonymization: {flow.aggregationMethod}</p>
    </div>
  );
}
