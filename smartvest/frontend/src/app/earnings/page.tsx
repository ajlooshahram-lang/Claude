'use client';

import { useState, useEffect } from 'react';
import {
  Mic, Target, AlertTriangle, ArrowLeftRight,
  Shield, TrendingUp, TrendingDown, Minus,
  Save, Trash2, FileText, Loader2, Play,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  analyzeEarningsCall, saveAnalysis, getSavedAnalyses,
  deleteAnalysis, getPreviousTranscript,
  EarningsAnalysis, NumericalGuidance, IdentifiedRisk,
  SentimentShift, EvasiveFlag, NarrativeChange,
} from '@/lib/earnings-analyzer';

export default function EarningsPage() {
  const [transcript, setTranscript] = useState('');
  const [ticker, setTicker] = useState('');
  const [company, setCompany] = useState('');
  const [quarter, setQuarter] = useState('Q2 2026');
  const [analysis, setAnalysis] = useState<EarningsAnalysis | null>(null);
  const [saved, setSaved] = useState<EarningsAnalysis[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'input' | 'result'>('input');

  useEffect(() => { setSaved(getSavedAnalyses()); }, []);


  async function handleAnalyze() {
    if (!transcript.trim() || !ticker.trim()) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 800));
    const prev = getPreviousTranscript(ticker);
    const result = analyzeEarningsCall(transcript, ticker, company || ticker, quarter, prev);
    setAnalysis(result);
    setView('result');
    setLoading(false);
  }

  function handleSave() {
    if (!analysis) return;
    saveAnalysis(analysis);
    setSaved(getSavedAnalyses());
  }

  function handleDelete(id: string) {
    deleteAnalysis(id);
    setSaved(getSavedAnalyses());
  }

  function handleLoadSaved(a: EarningsAnalysis) {
    setAnalysis(a);
    setView('result');
  }

  const toneColors: Record<string, string> = {
    very_positive: 'text-[var(--gain)] bg-[var(--gain)]/10',
    positive: 'text-[var(--gain)] bg-[var(--gain)]/5',
    neutral: 'text-[var(--muted)] bg-[var(--muted)]/10',
    cautious: 'text-[var(--warning)] bg-[var(--warning)]/10',
    negative: 'text-[var(--loss)] bg-[var(--loss)]/10',
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Mic className="h-6 w-6 text-[var(--primary)]" />
            Earnings Call Analyzer
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Paste any earnings call transcript for deep analysis
          </p>
        </div>
        {view === 'result' && (
          <div className="flex gap-2">
            <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[var(--primary)] text-white">
              <Save className="h-3.5 w-3.5" /> Save to Stock
            </button>
            <button onClick={() => { setView('input'); setAnalysis(null); }} className="px-3 py-2 rounded-lg text-xs font-medium border border-[var(--card-border)] text-[var(--muted)]">
              ← New Analysis
            </button>
          </div>
        )}
      </div>


      {/* Input View */}
      {view === 'input' && (
        <div className="space-y-4">
          {/* Metadata */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] text-[var(--muted)] font-medium block mb-1">Ticker</label>
              <input value={ticker} onChange={e => setTicker(e.target.value)} placeholder="NOVO-B.CO" className="w-full px-3 py-2.5 rounded-lg border border-[var(--card-border)] bg-[var(--card)] text-sm" required />
            </div>
            <div>
              <label className="text-[10px] text-[var(--muted)] font-medium block mb-1">Company</label>
              <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Novo Nordisk" className="w-full px-3 py-2.5 rounded-lg border border-[var(--card-border)] bg-[var(--card)] text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-[var(--muted)] font-medium block mb-1">Quarter</label>
              <input value={quarter} onChange={e => setQuarter(e.target.value)} placeholder="Q2 2026" className="w-full px-3 py-2.5 rounded-lg border border-[var(--card-border)] bg-[var(--card)] text-sm" />
            </div>
          </div>

          {/* Transcript Input */}
          <div>
            <label className="text-[10px] text-[var(--muted)] font-medium block mb-1">Paste Transcript</label>
            <textarea
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              placeholder="Paste the full earnings call transcript here..."
              className="w-full h-64 px-4 py-3 rounded-xl border border-[var(--card-border)] bg-[var(--card)] text-xs font-mono leading-relaxed resize-y"
            />
            <p className="text-[9px] text-[var(--muted)] mt-1">{transcript.length.toLocaleString()} characters</p>
          </div>

          {/* Analyze Button */}
          <button
            onClick={handleAnalyze}
            disabled={!transcript.trim() || !ticker.trim() || loading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {loading ? 'Analyzing...' : 'Analyze Transcript'}
          </button>

          {/* Saved Analyses */}
          {saved.length > 0 && (
            <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
              <div className="px-5 py-3 border-b border-[var(--card-border)]">
                <h3 className="text-sm font-semibold">Previous Analyses</h3>
              </div>
              <div className="divide-y divide-[var(--card-border)] max-h-48 overflow-y-auto">
                {saved.map(a => (
                  <div key={a.id} className="px-5 py-2.5 flex items-center gap-3">
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleLoadSaved(a)}>
                      <p className="text-xs font-medium">{a.ticker} — {a.quarter}</p>
                      <p className="text-[9px] text-[var(--muted)]">{new Date(a.analyzedAt).toLocaleDateString()}</p>
                    </div>
                    <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ${toneColors[a.overallTone]}`}>{a.overallTone.replace('_', ' ')}</span>
                    <button onClick={() => handleDelete(a.id)} className="p-1 text-[var(--muted)] hover:text-[var(--loss)]"><Trash2 className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}


      {/* Result View */}
      {view === 'result' && analysis && (
        <div className="space-y-6">
          {/* Company + Tone */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">{analysis.company} ({analysis.ticker})</h2>
              <p className="text-xs text-[var(--muted)]">{analysis.quarter} Earnings Call &middot; {(analysis.transcriptLength / 1000).toFixed(0)}K chars</p>
            </div>
            <span className={`text-xs font-bold uppercase px-3 py-1.5 rounded-lg ${toneColors[analysis.overallTone]}`}>
              {analysis.overallTone.replace('_', ' ')}
            </span>
          </div>

          {/* Executive Summary */}
          <div className="rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/5 p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--primary)] mb-2">Executive Summary</h3>
            <p className="text-[12px] leading-relaxed text-[var(--foreground)]/85">{analysis.executiveSummary}</p>
          </div>

          {/* 1. Numerical Guidance */}
          <Section title="Numerical Guidance" icon={Target} count={analysis.guidance.length}>
            {analysis.guidance.length === 0 ? (
              <p className="text-xs text-[var(--muted)] p-4">No specific numerical guidance extracted.</p>
            ) : (
              <div className="divide-y divide-[var(--card-border)]">
                {analysis.guidance.map((g, i) => (
                  <div key={i} className="px-5 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold">{g.metric}</span>
                      <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ${g.confidence === 'explicit' ? 'bg-[var(--gain)]/10 text-[var(--gain)]' : g.confidence === 'range' ? 'bg-[var(--primary)]/10 text-[var(--primary)]' : 'bg-[var(--muted)]/10 text-[var(--muted)]'}`}>{g.confidence}</span>
                    </div>
                    <p className="text-sm font-bold font-tabular text-[var(--primary)]">{g.value}</p>
                    <p className="text-[10px] text-[var(--muted)] mt-1 italic">&ldquo;{g.context}&rdquo;</p>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* 2. Top Risks */}
          <Section title="Key Risks Identified" icon={AlertTriangle} count={analysis.risks.length}>
            <div className="space-y-3 p-5">
              {analysis.risks.map((r, i) => (
                <div key={i} className={`rounded-lg border p-3 ${r.severity === 'high' ? 'border-[var(--loss)]/30 bg-[var(--loss)]/5' : 'border-[var(--warning)]/30 bg-[var(--warning)]/5'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold">{r.title}</span>
                    {r.buried && <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--loss)]/20 text-[var(--loss)]">BURIED</span>}
                    <span className="text-[8px] text-[var(--muted)] uppercase ml-auto">{r.category}</span>
                  </div>
                  <p className="text-[10px] text-[var(--foreground)]/70 italic leading-relaxed">&ldquo;{r.quote}&rdquo;</p>
                </div>
              ))}
            </div>
          </Section>

          {/* 3. Sentiment Shifts */}
          <Section title="Sentiment Shifts (Prepared vs Q&A)" icon={ArrowLeftRight} count={analysis.sentimentShifts.length}>
            <div className="p-5 space-y-4">
              {/* Sentiment bars */}
              <div className="grid grid-cols-2 gap-4">
                <SentimentBar label="Prepared Remarks" score={analysis.preparedSentiment.overallScore} />
                <SentimentBar label="Q&A Session" score={analysis.qaSentiment.overallScore} />
              </div>
              {analysis.sentimentShifts.map((s, i) => (
                <div key={i} className="rounded-lg border border-[var(--card-border)] p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold">{s.topic}</span>
                    <span className={`text-[10px] font-tabular font-medium ${s.shift < 0 ? 'text-[var(--loss)]' : 'text-[var(--gain)]'}`}>
                      {s.shift > 0 ? '▲' : '▼'} {Math.abs(s.shift).toFixed(2)}
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--muted)] leading-relaxed">{s.interpretation}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* 4. Evasive Language */}
          <Section title="Defensive / Evasive Language" icon={Shield} count={analysis.evasiveFlags.length}>
            <div className="divide-y divide-[var(--card-border)]">
              {analysis.evasiveFlags.map((f, i) => (
                <div key={i} className="px-5 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ${f.severity === 'high' ? 'bg-[var(--loss)]/10 text-[var(--loss)]' : 'bg-[var(--warning)]/10 text-[var(--warning)]'}`}>{f.pattern}</span>
                    <span className="text-[10px] text-[var(--muted)]">Topic: {f.topic}</span>
                  </div>
                  <p className="text-[10px] italic text-[var(--foreground)]/60">&ldquo;{f.quote}&rdquo;</p>
                  <p className="text-[10px] text-[var(--primary)] mt-1">{f.explanation}</p>
                </div>
              ))}
              {analysis.evasiveFlags.length === 0 && <p className="text-xs text-[var(--muted)] p-5">No evasive language detected.</p>}
            </div>
          </Section>

          {/* 5. Narrative Changes */}
          <Section title="Narrative Changes vs Previous Quarter" icon={FileText} count={analysis.narrativeChanges.length}>
            <div className="divide-y divide-[var(--card-border)]">
              {analysis.narrativeChanges.map((c, i) => (
                <div key={i} className="px-5 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold">{c.topic}</span>
                    <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ${
                      c.changeType === 'softened' || c.changeType === 'dropped' ? 'bg-[var(--loss)]/10 text-[var(--loss)]' :
                      c.changeType === 'strengthened' ? 'bg-[var(--gain)]/10 text-[var(--gain)]' : 'bg-[var(--primary)]/10 text-[var(--primary)]'
                    }`}>{c.changeType}</span>
                    <span className={`text-[8px] uppercase ${c.significance === 'major' ? 'text-[var(--loss)]' : 'text-[var(--muted)]'}`}>{c.significance}</span>
                  </div>
                  <p className="text-[10px] text-[var(--muted)]">Previous: {c.previousStatement}</p>
                  <p className="text-[10px] font-medium">Now: {c.currentStatement}</p>
                </div>
              ))}
              {analysis.narrativeChanges.length === 0 && <p className="text-xs text-[var(--muted)] p-5">No previous transcript saved for {analysis.ticker}. Save this analysis to enable comparison next quarter.</p>}
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}


// ─── Sub-components ──────────────────────────────────────────────────────────

function Section({ title, icon: Icon, count, children }: { title: string; icon: typeof Target; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full px-5 py-3 flex items-center gap-2 border-b border-[var(--card-border)] hover:bg-[var(--background)]/50 transition-colors">
        <Icon className="h-4 w-4 text-[var(--primary)]" />
        <span className="text-sm font-semibold flex-1 text-left">{title}</span>
        <span className="text-[9px] text-[var(--muted)] bg-[var(--background)]/50 px-2 py-0.5 rounded">{count}</span>
        {open ? <ChevronUp className="h-4 w-4 text-[var(--muted)]" /> : <ChevronDown className="h-4 w-4 text-[var(--muted)]" />}
      </button>
      {open && children}
    </div>
  );
}

function SentimentBar({ label, score }: { label: string; score: number }) {
  const pct = ((score + 1) / 2) * 100; // Convert -1..1 to 0..100
  const color = score > 0.2 ? 'bg-[var(--gain)]' : score < -0.1 ? 'bg-[var(--loss)]' : 'bg-[var(--muted)]';
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-medium">{label}</span>
        <span className={`text-[10px] font-tabular font-medium ${score > 0.2 ? 'text-[var(--gain)]' : score < -0.1 ? 'text-[var(--loss)]' : 'text-[var(--muted)]'}`}>{score.toFixed(2)}</span>
      </div>
      <div className="h-2 rounded-full bg-[var(--card-border)] overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
