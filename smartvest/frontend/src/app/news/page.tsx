'use client';

import { useState, useEffect } from 'react';
import {
  Newspaper, Clock, TrendingUp, TrendingDown,
  Minus, ChevronDown, ChevronUp, ExternalLink,
  Target, Filter, Sparkles,
} from 'lucide-react';
import {
  getPersonalizedNewsFeed, getCategoryStyle,
  NewsFeed, NewsStory,
} from '@/lib/news-summarizer';

export default function NewsPage() {
  const [feed, setFeed] = useState<NewsFeed | null>(null);
  const [expandedLow, setExpandedLow] = useState(false);
  const [filterMin, setFilterMin] = useState(1);

  useEffect(() => {
    setFeed(getPersonalizedNewsFeed());
  }, []);

  if (!feed) return null;

  const highRelevance = feed.stories.filter(s => s.relevanceScore >= 5);
  const lowRelevance = feed.stories.filter(s => s.relevanceScore < 5 && s.relevanceScore >= filterMin);


  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Newspaper className="h-6 w-6 text-[var(--primary)]" />
            Morning Briefing
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            {feed.storiesRelevant} of {feed.storiesTotal} stories relevant to your portfolio
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-[var(--muted)]">{feed.marketStatus}</p>
          <p className="text-[9px] text-[var(--muted)]">
            Updated {new Date(feed.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3">
          <p className="text-[9px] text-[var(--muted)] uppercase">High Relevance</p>
          <p className="text-lg font-bold text-[var(--primary)]">{highRelevance.length}</p>
        </div>
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3">
          <p className="text-[9px] text-[var(--muted)] uppercase">Top Score</p>
          <p className="text-lg font-bold">{feed.topRelevanceScore}/10</p>
        </div>
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3">
          <p className="text-[9px] text-[var(--muted)] uppercase">Sentiment</p>
          <p className="text-lg font-bold text-[var(--gain)]">
            {feed.stories.filter(s => s.sentiment === 'positive').length > feed.stories.filter(s => s.sentiment === 'negative').length ? 'Positive' : 'Mixed'}
          </p>
        </div>
      </div>

      {/* High Relevance Stories (expanded) */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold flex items-center gap-2">
          <Target className="h-4 w-4 text-[var(--primary)]" />
          High Relevance for Your Portfolio (score ≥ 5)
        </h2>
        {highRelevance.map(story => (
          <StoryCard key={story.id} story={story} expanded />
        ))}
      </div>

      {/* Low Relevance (collapsed) */}
      {lowRelevance.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setExpandedLow(!expandedLow)}
            className="flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            {expandedLow ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {lowRelevance.length} lower relevance stories (score &lt; 5)
          </button>
          {expandedLow && (
            <div className="space-y-3">
              {lowRelevance.map(story => (
                <StoryCard key={story.id} story={story} expanded={false} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ─── Story Card ──────────────────────────────────────────────────────────────

function StoryCard({ story, expanded }: { story: NewsStory; expanded: boolean }) {
  const [isExpanded, setIsExpanded] = useState(expanded);
  const catStyle = getCategoryStyle(story.category);
  const sentimentIcon = story.sentiment === 'positive' ? TrendingUp :
                        story.sentiment === 'negative' ? TrendingDown : Minus;
  const SentIcon = sentimentIcon;
  const sentColor = story.sentiment === 'positive' ? 'text-[var(--gain)]' :
                    story.sentiment === 'negative' ? 'text-[var(--loss)]' : 'text-[var(--muted)]';

  return (
    <div className={`rounded-xl border bg-[var(--card)] overflow-hidden transition-all ${
      story.relevanceScore >= 8 ? 'border-[var(--primary)]/40' :
      story.relevanceScore >= 5 ? 'border-[var(--card-border)]' :
      'border-[var(--card-border)]/50 opacity-80'
    }`}>
      {/* Header — always visible */}
      <div
        className="px-5 py-3 flex items-start gap-3 cursor-pointer hover:bg-[var(--background)]/30 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Relevance Score */}
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold ${
          story.relevanceScore >= 8 ? 'bg-[var(--primary)] text-white' :
          story.relevanceScore >= 5 ? 'bg-[var(--primary)]/10 text-[var(--primary)]' :
          'bg-[var(--muted)]/10 text-[var(--muted)]'
        }`}>
          {story.relevanceScore}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ${catStyle.color}`}>
              {catStyle.label}
            </span>
            <SentIcon className={`h-3 w-3 ${sentColor}`} />
            <span className="text-[9px] text-[var(--muted)]">{story.source}</span>
            <span className="text-[9px] text-[var(--muted)]">
              {new Date(story.publishedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <h3 className="text-xs font-semibold leading-snug">{story.headline}</h3>
          {story.affectedHoldings.length > 0 && (
            <div className="flex gap-1.5 mt-1.5">
              {story.affectedHoldings.map(h => (
                <span key={h} className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-[var(--gain)]/10 text-[var(--gain)]">
                  {h}
                </span>
              ))}
            </div>
          )}
        </div>

        {isExpanded ? <ChevronUp className="h-4 w-4 text-[var(--muted)] flex-shrink-0 mt-1" /> : <ChevronDown className="h-4 w-4 text-[var(--muted)] flex-shrink-0 mt-1" />}
      </div>

      {/* Summary — expanded */}
      {isExpanded && (
        <div className="px-5 pb-4 pt-1 border-t border-[var(--card-border)] space-y-2.5">
          <div className="flex items-start gap-2">
            <span className="text-[9px] font-bold uppercase text-[var(--muted)] w-20 flex-shrink-0 pt-0.5">What</span>
            <p className="text-[11px] text-[var(--foreground)]/80 leading-relaxed">{story.summary.whatHappened}</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[9px] font-bold uppercase text-[var(--muted)] w-20 flex-shrink-0 pt-0.5">Why</span>
            <p className="text-[11px] text-[var(--foreground)]/80 leading-relaxed">{story.summary.whyItMatters}</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[9px] font-bold uppercase text-[var(--primary)] w-20 flex-shrink-0 pt-0.5">For you</span>
            <p className="text-[11px] text-[var(--foreground)]/90 leading-relaxed font-medium">{story.summary.portfolioImplication}</p>
          </div>
        </div>
      )}
    </div>
  );
}
