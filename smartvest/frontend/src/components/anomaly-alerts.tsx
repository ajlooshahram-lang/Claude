'use client';

import { useState, useEffect } from 'react';
import { Activity, Loader2, BarChart3, TrendingUp, Newspaper, Zap } from 'lucide-react';
import { getWatchlist } from '@/lib/watchlist';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Anomaly {
  symbol: string;
  name: string;
  type: string;
  severity: string;
  title: string;
  explanation: string;
  data: Record<string, number>;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  volume_spike: <BarChart3 className="h-4 w-4" />,
  price_deviation: <TrendingUp className="h-4 w-4" />,
  abnormal_move: <Zap className="h-4 w-4" />,
  news_surge: <Newspaper className="h-4 w-4" />,
};

const SEVERITY_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  mild: { border: 'border-[var(--primary)]/30', bg: 'bg-[var(--primary)]/5', text: 'text-[var(--primary)]' },
  moderate: { border: 'border-[var(--warning)]/30', bg: 'bg-[var(--warning)]/5', text: 'text-[var(--warning)]' },
  extreme: { border: 'border-[var(--loss)]/30', bg: 'bg-[var(--loss)]/5', text: 'text-[var(--loss)]' },
};

/**
 * Anomaly Alerts — runs in background, shows detected anomalies on portfolio.
 * Checks watchlist stocks for unusual behavior every time the component mounts.
 */
export function AnomalyAlerts() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const watchlist = getWatchlist();
    if (watchlist.length === 0) { setLoading(false); return; }

    const symbols = watchlist.map(w => w.symbol);

    fetch(`${API_BASE}/api/anomalies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols }),
      signal: AbortSignal.timeout(30000),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data && data.anomalies) setAnomalies(data.anomalies); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const visible = anomalies.filter(a => !dismissed.has(`${a.symbol}-${a.type}`));

  if (loading || visible.length === 0) return null;

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4 text-[var(--warning)]" />
          Anomalies Detected
        </h2>
        <span className="text-[9px] text-[var(--muted)]">
          {visible.length} unusual signal{visible.length > 1 ? 's' : ''} on your watchlist
        </span>
      </div>

      {visible.map((a, i) => {
        const colors = SEVERITY_COLORS[a.severity] || SEVERITY_COLORS['mild'];
        const icon = ICON_MAP[a.type] || <Activity className="h-4 w-4" />;

        return (
          <div key={i} className={`rounded-lg border ${colors.border} ${colors.bg} p-3.5`}>
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-2.5">
                <span className={`mt-0.5 ${colors.text}`}>{icon}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold">{a.symbol}</span>
                    <span className={`text-[9px] font-medium uppercase ${colors.text}`}>{a.severity}</span>
                  </div>
                  <p className={`text-xs font-semibold mt-0.5 ${colors.text}`}>{a.title}</p>
                  <p className="text-[11px] text-[var(--foreground)]/70 mt-1.5 leading-relaxed">
                    {a.explanation}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDismissed(prev => new Set([...prev, `${a.symbol}-${a.type}`]))}
                className="text-[var(--muted)] hover:text-[var(--foreground)] text-xs ml-2 flex-shrink-0"
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}

      <p className="text-[9px] text-[var(--muted)] pt-2 border-t border-[var(--card-border)]">
        Anomalies are signals worth investigating — not buy or sell recommendations.
        Something unusual is happening; check the news and decide for yourself.
      </p>
    </div>
  );
}
