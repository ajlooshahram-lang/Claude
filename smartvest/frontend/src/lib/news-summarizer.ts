/**
 * Personalized Financial News Summarizer
 *
 * Filters and ranks news stories based on portfolio relevance:
 * - Watchlist stock mentions
 * - Sector exposure overlap
 * - Macro regime alignment
 * - Upcoming earnings in portfolio
 *
 * Each story gets:
 * - 3-sentence summary (what happened, why it matters, portfolio implication)
 * - Relevance score 1-10
 * - Affected holdings list
 *
 * Stories ≥5 relevance shown expanded, <5 collapsed.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NewsStory {
  id: string;
  headline: string;
  source: string;
  publishedAt: string;
  url: string;
  category: 'earnings' | 'macro' | 'sector' | 'company' | 'regulatory' | 'market';
  tickers: string[];
  sectors: string[];
  summary: {
    whatHappened: string;
    whyItMatters: string;
    portfolioImplication: string;
  };
  relevanceScore: number;
  affectedHoldings: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
}

export interface NewsFeed {
  stories: NewsStory[];
  generatedAt: string;
  marketStatus: string;
  storiesTotal: number;
  storiesRelevant: number;
  topRelevanceScore: number;
}

export interface UserContext {
  watchlist: string[];
  holdings: string[];
  sectors: string[];
  upcomingEarnings: { symbol: string; date: string }[];
  macroRegime: string;
}


// ─── User Context ────────────────────────────────────────────────────────────

function getUserContext(): UserContext {
  return {
    watchlist: ['NOVO-B.CO', 'MAERSK-B.CO', 'VWS.CO', 'DSV.CO', 'ORSTED.CO', 'CARL-B.CO'],
    holdings: ['NOVO-B.CO', 'MAERSK-B.CO', 'VWS.CO', 'IWDA.AS', 'DSV.CO'],
    sectors: ['Healthcare', 'Industrials', 'Energy', 'ETF/Diversified'],
    upcomingEarnings: [
      { symbol: 'NOVO-B.CO', date: '2026-08-07' },
      { symbol: 'DSV.CO', date: '2026-07-28' },
      { symbol: 'VWS.CO', date: '2026-08-12' },
    ],
    macroRegime: 'Grinding Higher',
  };
}

// ─── Relevance Scoring ───────────────────────────────────────────────────────

function scoreRelevance(story: RawNewsItem, ctx: UserContext): {
  score: number; affectedHoldings: string[]; reasons: string[];
} {
  let score = 0;
  const affected: string[] = [];
  const reasons: string[] = [];

  // Direct ticker mention in holdings (+4)
  for (const ticker of story.tickers) {
    if (ctx.holdings.includes(ticker)) {
      score += 4;
      affected.push(ticker);
      reasons.push(`Directly mentions ${ticker} (your holding)`);
    }
  }

  // Ticker in watchlist but not holding (+2)
  for (const ticker of story.tickers) {
    if (ctx.watchlist.includes(ticker) && !ctx.holdings.includes(ticker)) {
      score += 2;
      reasons.push(`Mentions ${ticker} (your watchlist)`);
    }
  }

  // Sector overlap (+2)
  for (const sector of story.sectors) {
    if (ctx.sectors.includes(sector)) {
      score += 2;
      reasons.push(`Affects ${sector} sector (your exposure)`);
    }
  }

  // Upcoming earnings relevance (+2)
  for (const earns of ctx.upcomingEarnings) {
    if (story.tickers.includes(earns.symbol)) {
      score += 2;
      reasons.push(`${earns.symbol} reports earnings ${earns.date}`);
    }
  }

  // Macro relevance (+1)
  if (story.category === 'macro') {
    score += 1;
    reasons.push('Macro story relevant to current regime');
  }

  // Cap at 10
  return { score: Math.min(10, score), affectedHoldings: affected, reasons };
}

// ─── Raw News Data ───────────────────────────────────────────────────────────

interface RawNewsItem {
  headline: string;
  source: string;
  publishedAt: string;
  category: NewsStory['category'];
  tickers: string[];
  sectors: string[];
  whatHappened: string;
  whyItMatters: string;
  sentiment: NewsStory['sentiment'];
}

const RAW_NEWS: RawNewsItem[] = [
  {
    headline: 'Novo Nordisk raises full-year guidance after record Wegovy demand',
    source: 'Reuters', publishedAt: '2026-06-29T07:15:00Z',
    category: 'earnings', tickers: ['NOVO-B.CO', 'LLY'], sectors: ['Healthcare'],
    whatHappened: 'Novo Nordisk upgraded its 2026 revenue guidance by 8% citing unprecedented demand for Wegovy in the US and European markets.',
    whyItMatters: 'This confirms the GLP-1 market is accelerating faster than consensus expected, with supply finally catching up to demand.',
    sentiment: 'positive',
  },
  {
    headline: 'ECB holds rates steady, signals September cut possible',
    source: 'Financial Times', publishedAt: '2026-06-29T06:30:00Z',
    category: 'macro', tickers: [], sectors: ['Financials', 'Industrials'],
    whatHappened: 'The European Central Bank kept rates at 3.5% but President Lagarde indicated September is "live" for a 25bp cut if inflation data cooperates.',
    whyItMatters: 'Lower rates reduce borrowing costs for European corporates and typically boost equity valuations through DCF compression.',
    sentiment: 'positive',
  },
  {
    headline: 'Mærsk warns Red Sea disruptions may persist through Q3',
    source: 'Bloomberg', publishedAt: '2026-06-29T08:00:00Z',
    category: 'company', tickers: ['MAERSK-B.CO', 'DSV.CO', 'ZIM'], sectors: ['Industrials'],
    whatHappened: 'Mærsk CEO Vincent Clerc stated that Red Sea shipping diversions around the Cape of Good Hope are likely to continue through September, adding 10-14 days to routes.',
    whyItMatters: 'Extended disruptions support elevated freight rates (bullish for Mærsk revenue) but increase costs for importers and may reignite supply chain inflation.',
    sentiment: 'neutral',
  },
  {
    headline: 'Vestas wins 2.4GW offshore wind contract from German consortium',
    source: 'Wind Power Monthly', publishedAt: '2026-06-29T07:45:00Z',
    category: 'company', tickers: ['VWS.CO', 'ORSTED.CO'], sectors: ['Energy'],
    whatHappened: 'Vestas secured its largest single order ever — 2.4 GW of V236-15.0 MW turbines for a German North Sea project, worth an estimated 18 billion DKK.',
    whyItMatters: 'This demonstrates the offshore wind market recovery is real after two years of project cancellations, and validates Vestas\' V236 platform as industry standard.',
    sentiment: 'positive',
  },
  {
    headline: 'US inflation comes in below expectations at 2.4% YoY',
    source: 'CNBC', publishedAt: '2026-06-29T06:00:00Z',
    category: 'macro', tickers: ['SPY', 'IWDA.AS'], sectors: ['ETF/Diversified'],
    whatHappened: 'US CPI for May 2026 printed at 2.4% year-over-year, below the 2.6% consensus, with core inflation at 2.8% vs 3.0% expected.',
    whyItMatters: 'Cooler inflation gives the Fed room to cut rates in H2 2026, which historically benefits growth stocks and equity multiples broadly.',
    sentiment: 'positive',
  },
  {
    headline: 'DSV completes Schenker integration ahead of schedule',
    source: 'ShippingWatch', publishedAt: '2026-06-29T08:30:00Z',
    category: 'company', tickers: ['DSV.CO'], sectors: ['Industrials'],
    whatHappened: 'DSV announced that the DB Schenker integration is 80% complete, 3 months ahead of plan, with synergy realization running at 1.2B DKK annualized.',
    whyItMatters: 'Faster integration means cost synergies flow to earnings sooner. DSV has a track record of extracting more value than initially guided from acquisitions.',
    sentiment: 'positive',
  },
  {
    headline: 'Danish pension funds increase allocation to domestic equities',
    source: 'Børsen', publishedAt: '2026-06-29T07:00:00Z',
    category: 'market', tickers: ['NOVO-B.CO', 'MAERSK-B.CO', 'VWS.CO', 'DSV.CO'], sectors: ['Healthcare', 'Industrials', 'Energy'],
    whatHappened: 'ATP and PFA announced a combined 12 billion DKK increase in Danish equity allocation, citing attractive valuations relative to US stocks.',
    whyItMatters: 'Institutional buying provides a support floor for OMX C25 stocks. When pension funds commit capital, they tend to be patient long-term holders.',
    sentiment: 'positive',
  },
  {
    headline: 'Ørsted faces potential 8B DKK impairment on US offshore projects',
    source: 'Energi Watch', publishedAt: '2026-06-29T09:00:00Z',
    category: 'company', tickers: ['ORSTED.CO', 'VWS.CO'], sectors: ['Energy'],
    whatHappened: 'Ørsted is reviewing three US East Coast offshore wind projects for potential impairment after state regulators rejected power purchase agreement renegotiations.',
    whyItMatters: 'Another impairment would further erode investor confidence in offshore wind economics. However, European projects remain profitable and Ørsted\'s orderbook is strong.',
    sentiment: 'negative',
  },
  {
    headline: 'China announces additional tariffs on European dairy and pork',
    source: 'South China Morning Post', publishedAt: '2026-06-29T05:30:00Z',
    category: 'regulatory', tickers: ['CARL-B.CO'], sectors: ['Consumer'],
    whatHappened: 'China imposed 25% retaliatory tariffs on European dairy products and pork in response to EU EV tariffs, effective August 1.',
    whyItMatters: 'Danish/European food exporters face margin pressure. Companies with significant China revenue (like Carlsberg\'s Asian operations) may see demand impact.',
    sentiment: 'negative',
  },
  {
    headline: 'Semiconductor shortage easing faster than expected',
    source: 'TechCrunch', publishedAt: '2026-06-29T06:45:00Z',
    category: 'sector', tickers: ['ASML', 'NVDA'], sectors: ['Technology'],
    whatHappened: 'TSMC reported that chip lead times have normalized to pre-pandemic levels, with inventory-to-sales ratios back to healthy ranges.',
    whyItMatters: 'Easing shortages reduce input costs for manufacturers but may signal demand normalization that pressures semiconductor stock valuations.',
    sentiment: 'neutral',
  },
  {
    headline: 'Danish government proposes raising ASK limit to 200,000 DKK',
    source: 'Finans.dk', publishedAt: '2026-06-29T08:15:00Z',
    category: 'regulatory', tickers: [], sectors: ['Healthcare', 'Industrials', 'Energy'],
    whatHappened: 'Finance Minister Nicolai Wammen proposed increasing the Aktiesparekonto deposit limit from 135,600 to 200,000 DKK starting 2027.',
    whyItMatters: 'A higher ASK limit means Danish retail investors can shelter more gains at the 17% rate, incentivizing additional stock investment — bullish for domestic equities.',
    sentiment: 'positive',
  },
  {
    headline: 'Oil prices drop 4% on surprise OPEC+ production increase',
    source: 'Oil Price', publishedAt: '2026-06-29T05:00:00Z',
    category: 'macro', tickers: ['EQNR.OL'], sectors: ['Energy'],
    whatHappened: 'Brent crude fell to $72/barrel after Saudi Arabia signaled it would increase production by 500,000 bpd starting August.',
    whyItMatters: 'Lower oil benefits consumer spending and airline/shipping costs, but pressures energy sector stocks. Mixed for portfolios with energy exposure.',
    sentiment: 'negative',
  },
];


// ─── Portfolio Implication Generator ─────────────────────────────────────────

function generatePortfolioImplication(
  story: RawNewsItem,
  affectedHoldings: string[],
  ctx: UserContext
): string {
  if (affectedHoldings.length === 0) {
    // Macro/sector story
    if (story.sectors.some(s => ctx.sectors.includes(s))) {
      return `This affects your ${story.sectors.filter(s => ctx.sectors.includes(s)).join('/')} exposure. Monitor for follow-through in the coming sessions.`;
    }
    return 'No direct impact on your current holdings, but may affect market sentiment broadly.';
  }

  const holdingsStr = affectedHoldings.join(', ');
  if (story.sentiment === 'positive') {
    return `Directly bullish for your ${holdingsStr} position${affectedHoldings.length > 1 ? 's' : ''}. Consider whether this is already priced in before adding.`;
  }
  if (story.sentiment === 'negative') {
    return `Watch your ${holdingsStr} position${affectedHoldings.length > 1 ? 's' : ''} for weakness. If the sell-off is overdone relative to actual business impact, it may be a buying opportunity.`;
  }
  return `Mixed implications for ${holdingsStr}. The near-term effect is unclear — wait for the market's initial reaction before acting.`;
}

// ─── Main API ────────────────────────────────────────────────────────────────

/**
 * Generate the personalized news feed.
 * Filters 20 raw stories, scores relevance, generates summaries.
 */
export function getPersonalizedNewsFeed(): NewsFeed {
  const ctx = getUserContext();

  const stories: NewsStory[] = RAW_NEWS.map(raw => {
    const { score, affectedHoldings } = scoreRelevance(raw, ctx);
    const portfolioImplication = generatePortfolioImplication(raw, affectedHoldings, ctx);

    return {
      id: crypto.randomUUID(),
      headline: raw.headline,
      source: raw.source,
      publishedAt: raw.publishedAt,
      url: '#',
      category: raw.category,
      tickers: raw.tickers,
      sectors: raw.sectors,
      summary: {
        whatHappened: raw.whatHappened,
        whyItMatters: raw.whyItMatters,
        portfolioImplication,
      },
      relevanceScore: score,
      affectedHoldings,
      sentiment: raw.sentiment,
    };
  });

  // Sort by relevance (highest first)
  stories.sort((a, b) => b.relevanceScore - a.relevanceScore);

  return {
    stories,
    generatedAt: new Date().toISOString(),
    marketStatus: 'Pre-market (Nordic markets open 09:00 CET)',
    storiesTotal: RAW_NEWS.length,
    storiesRelevant: stories.filter(s => s.relevanceScore >= 5).length,
    topRelevanceScore: stories[0]?.relevanceScore || 0,
  };
}

/**
 * Get category label and color.
 */
export function getCategoryStyle(category: NewsStory['category']): { label: string; color: string } {
  switch (category) {
    case 'earnings': return { label: 'Earnings', color: 'bg-purple-500/10 text-purple-400' };
    case 'macro': return { label: 'Macro', color: 'bg-blue-500/10 text-blue-400' };
    case 'sector': return { label: 'Sector', color: 'bg-[var(--primary)]/10 text-[var(--primary)]' };
    case 'company': return { label: 'Company', color: 'bg-[var(--gain)]/10 text-[var(--gain)]' };
    case 'regulatory': return { label: 'Regulatory', color: 'bg-[var(--warning)]/10 text-[var(--warning)]' };
    case 'market': return { label: 'Market', color: 'bg-[var(--muted)]/10 text-[var(--muted)]' };
  }
}
