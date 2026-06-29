'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Sparkles, Loader2, AlertCircle, TrendingUp, TrendingDown,
  Minus, RefreshCw, Shield, Users,
} from 'lucide-react';
import { getProfile, RiskProfile } from '@/lib/profile';
import { LearningTip } from '@/components/learning-tip';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Pick {
  symbol: string;
  name: string;
  price: number;
  currency: string;
  score: number;
  label: string;
  safety_score: number;
  value_score: number;
  momentum_score: number;
  beginner_rating: 'Beginner Friendly' | 'Intermediate' | 'Risky';
  traffic_light: 'up' | 'down' | 'flat';
  change_14d_pct: number | null;
  reason: string;
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function PicksPage() {
  const [picks, setPicks] = useState<Pick[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<RiskProfile>('Moderate');
  const [disclaimer, setDisclaimer] = useState('');

  useEffect(() => {
    const p = getProfile();
    if (p) setProfile(p.riskProfile);
  }, []);

  const fetchPicks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      const res = await fetch(
        `${API_BASE}/api/picks?profile=${profile.toLowerCase()}`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      setPicks(data.picks || []);
      setDisclaimer(data.disclaimer || '');
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(`Could not load Smart Picks right now. This takes a moment — please try again.`);
      }
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    fetchPicks();
  }, [fetchPicks]);

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-[var(--primary)]" />
            Smart Picks
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Today&apos;s top 5 stocks for your{' '}
            <span className="font-medium text-[var(--foreground)]">
              {profile}
            </span>{' '}
            profile
          </p>
        </div>
        <button
          onClick={fetchPicks}
          disabled={loading}
          className="p-2 rounded-lg hover:bg-white/5 text-[var(--muted)] disabled:opacity-50"
          title="Refresh picks"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Learning tip */}
      <LearningTip
        tipId="picks_not_advice"
        title="💡 These are suggestions, not instructions"
        text="Smart Picks uses real data (price trends, valuation, and safety metrics) to surface interesting stocks. But no algorithm can predict the future. Always research a stock yourself before buying — check what the company does, whether you understand it, and whether you can afford to lose that money. Think of these as a starting point for your own research, not a buy order."
      />

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/5 px-4 py-2.5 text-sm text-[var(--warning)]">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)] mb-3" />
          <p className="text-sm text-[var(--muted)]">Analyzing stocks for your profile...</p>
          <p className="text-[10px] text-[var(--muted)] mt-1">
            Scoring safety, value & momentum across global markets
          </p>
        </div>
      )}

      {/* Picks */}
      {!loading && picks.length > 0 && (
        <div className="space-y-4">
          {picks.map((pick, i) => (
            <PickCard key={pick.symbol} pick={pick} rank={i + 1} />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && picks.length === 0 && !error && (
        <div className="text-center py-12 text-sm text-[var(--muted)]">
          No picks available right now. Try again later.
        </div>
      )}

      {/* Community Picks */}
      <CommunityPicks />

      {/* Disclaimer */}
      {disclaimer && (
        <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-4 flex items-start gap-3">
          <Shield className="h-4 w-4 text-[var(--muted)] mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-[var(--muted)] leading-relaxed">
            {disclaimer}
          </p>
        </div>
      )}
    </div>
  );
}


// ─── Pick Card ───────────────────────────────────────────────────────────────

function PickCard({ pick, rank }: { pick: Pick; rank: number }) {
  const trafficConfig = {
    up: { emoji: '🟢', label: 'Uptrend', color: 'text-[var(--gain)]' },
    down: { emoji: '🔴', label: 'Downtrend', color: 'text-[var(--loss)]' },
    flat: { emoji: '🟡', label: 'Flat', color: 'text-[var(--warning)]' },
  };
  const tl = trafficConfig[pick.traffic_light];

  const beginnerConfig = {
    'Beginner Friendly': { emoji: '🟢', color: 'text-[var(--gain)]', bg: 'bg-[var(--gain)]/10' },
    'Intermediate': { emoji: '🟡', color: 'text-[var(--warning)]', bg: 'bg-[var(--warning)]/10' },
    'Risky': { emoji: '🔴', color: 'text-[var(--loss)]', bg: 'bg-[var(--loss)]/10' },
  };
  const br = beginnerConfig[pick.beginner_rating];

  const scoreColor =
    pick.score >= 7 ? 'text-[var(--gain)] border-[var(--gain)]/30 bg-[var(--gain)]/5' :
    pick.score >= 5 ? 'text-[var(--primary)] border-[var(--primary)]/30 bg-[var(--primary)]/5' :
    'text-[var(--warning)] border-[var(--warning)]/30 bg-[var(--warning)]/5';

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 hover:border-[var(--primary)]/30 transition-colors">
      {/* Top row: rank + name + price + score */}
      <div className="flex items-start gap-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary)]/10 text-sm font-bold text-[var(--primary)] flex-shrink-0">
          {rank}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold">{pick.symbol}</p>
            <p className="text-xs text-[var(--muted)] truncate">{pick.name}</p>
          </div>
          <p className="text-lg font-bold font-tabular mt-0.5">
            {pick.currency} {pick.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className={`flex flex-col items-center justify-center h-12 w-12 rounded-lg border ${scoreColor}`}>
          <span className="text-base font-bold font-tabular">{pick.score}</span>
          <span className="text-[8px] opacity-70">/10</span>
        </div>
      </div>

      {/* Badges: beginner rating + traffic light */}
      <div className="flex items-center gap-3 mt-3">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium ${br.bg} ${br.color}`}>
          {br.emoji} {pick.beginner_rating}
        </span>
        <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${tl.color}`}>
          {tl.emoji} {tl.label}
          {pick.change_14d_pct !== null && (
            <span className="font-tabular">
              ({pick.change_14d_pct >= 0 ? '+' : ''}{pick.change_14d_pct.toFixed(1)}%)
            </span>
          )}
        </span>
      </div>

      {/* Reason */}
      <p className="text-xs text-[var(--foreground)]/70 mt-3 leading-relaxed">
        {pick.reason}
      </p>

      {/* Score breakdown mini */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[var(--card-border)] text-[10px] text-[var(--muted)]">
        <span>Safety: {pick.safety_score}/10</span>
        <span>Value: {pick.value_score}/10</span>
        <span>Momentum: {pick.momentum_score}/10</span>
      </div>
    </div>
  );
}


// ─── Community Picks ─────────────────────────────────────────────────────────

interface CommunityPick {
  symbol: string;
  name: string;
  saves_this_week: number;
  score: number;
  score_label: string;
  beginner_rating: string;
  signal: string;
  change_14d_pct: number;
  price: number;
  currency: string;
}

function CommunityPicks() {
  const [picks, setPicks] = useState<CommunityPick[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/community/popular`, { signal: AbortSignal.timeout(30000) })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data && data.picks) setPicks(data.picks); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading community picks...
        </div>
      </div>
    );
  }

  if (picks.length === 0) return null;

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <Users className="h-4 w-4 text-[var(--accent)]" />
        <h2 className="text-sm font-semibold">Community Picks</h2>
        <span className="text-[10px] text-[var(--muted)]">Most saved this week</span>
      </div>

      <div className="space-y-2">
        {picks.map((pick, i) => (
          <CommunityPickRow key={pick.symbol} pick={pick} rank={i + 1} />
        ))}
      </div>

      <p className="text-[9px] text-[var(--muted)] mt-3 pt-3 border-t border-[var(--card-border)]">
        Based on anonymous, aggregate watchlist additions. No personal data is shared.
      </p>
    </div>
  );
}

function CommunityPickRow({ pick, rank }: { pick: CommunityPick; rank: number }) {
  const signalEmoji = { up: '🟢', down: '🔴', flat: '🟡' }[pick.signal] || '🟡';
  const brConfig: Record<string, { emoji: string; color: string }> = {
    'Beginner Friendly': { emoji: '🟢', color: 'text-[var(--gain)]' },
    'Intermediate': { emoji: '🟡', color: 'text-[var(--warning)]' },
    'Risky': { emoji: '🔴', color: 'text-[var(--loss)]' },
  };
  const br = brConfig[pick.beginner_rating] || brConfig['Intermediate'];

  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--card-border)] bg-black/20 p-3">
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)]/10 text-[10px] font-bold text-[var(--accent)] flex-shrink-0">
        {rank}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold">{pick.symbol}</p>
          <p className="text-[10px] text-[var(--muted)] truncate">{pick.name}</p>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[9px] font-medium ${br.color}`}>{br.emoji} {pick.beginner_rating}</span>
          <span className="text-[9px] text-[var(--muted)]">{signalEmoji} {pick.change_14d_pct >= 0 ? '+' : ''}{pick.change_14d_pct.toFixed(1)}%</span>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="text-center">
          <p className="text-xs font-bold text-[var(--accent)] font-tabular">{pick.saves_this_week}</p>
          <p className="text-[8px] text-[var(--muted)]">saves</p>
        </div>
        <div className={`flex flex-col items-center h-8 w-8 rounded border justify-center ${
          pick.score >= 7 ? 'border-[var(--gain)]/30 bg-[var(--gain)]/5' :
          pick.score >= 5 ? 'border-[var(--primary)]/30 bg-[var(--primary)]/5' :
          'border-[var(--warning)]/30 bg-[var(--warning)]/5'
        }`}>
          <span className={`text-[10px] font-bold font-tabular ${
            pick.score >= 7 ? 'text-[var(--gain)]' :
            pick.score >= 5 ? 'text-[var(--primary)]' :
            'text-[var(--warning)]'
          }`}>{pick.score}</span>
        </div>
      </div>
    </div>
  );
}
