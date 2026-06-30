/**
 * Alternative Data Ingestion Pipeline
 *
 * Alternative data = information not in financial reports that predicts
 * business performance. Four sources integrated:
 *
 * 1. Google Trends — Search interest for company products (demand proxy)
 * 2. Web Traffic — Website visitor trends (engagement proxy)
 * 3. App Store Rankings — Mobile app download rank (consumer adoption)
 * 4. Job Postings — Hiring velocity (internal confidence proxy)
 *
 * Combined signal: Accelerating | Stable | Decelerating
 *
 * HONEST NOTE: In production, these would pull from real APIs:
 * - Google Trends: pytrends (free) or SerpApi ($50/mo)
 * - Web Traffic: SimilarWeb API or Semrush (freemium)
 * - App Rankings: AppFollow or data.ai (freemium)
 * - Job Postings: LinkedIn Jobs API or Indeed scraping
 *
 * This demo uses curated sample data that demonstrates the system.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type AltDataSignal = 'accelerating' | 'stable' | 'decelerating';

export interface TrendDataPoint {
  month: string;           // YYYY-MM
  value: number;           // Normalized 0-100
}

export interface GoogleTrendsData {
  searchTerm: string;
  trend: TrendDataPoint[];
  currentIndex: number;    // Latest month value (0-100)
  threeMonthChange: number; // % change over 3 months
  signal: AltDataSignal;
  insight: string;
}

export interface WebTrafficData {
  domain: string;
  monthlyVisits: number;
  monthOverMonthChange: number;  // %
  threeMonthTrend: number;       // %
  bounceRate: number;            // %
  avgSessionDuration: number;    // seconds
  signal: AltDataSignal;
  insight: string;
}

export interface AppRankingData {
  appName: string;
  store: 'iOS' | 'Android' | 'both';
  currentRank: number;
  rankChange30d: number;   // Negative = improving (lower rank is better)
  category: string;
  rating: number;          // 1-5 stars
  signal: AltDataSignal;
  insight: string;
}

export interface JobPostingData {
  openPositions: number;
  thirtyDayChange: number; // % change in postings
  ninetyDayChange: number; // % change over 3 months
  topRoles: string[];      // Most common job titles
  hiringSignal: 'aggressive' | 'moderate' | 'freeze' | 'layoffs';
  signal: AltDataSignal;
  insight: string;
}

export interface StockAltData {
  symbol: string;
  name: string;
  googleTrends: GoogleTrendsData | null;
  webTraffic: WebTrafficData | null;
  appRanking: AppRankingData | null;
  jobPostings: JobPostingData | null;
  combinedSignal: AltDataSignal;
  signalStrength: number;  // 0-10
  primaryDriver: string;   // Which source is driving the signal
  summary: string;         // One sentence explaining the signal
  lastUpdated: string;
}

export interface AltDataDashboard {
  stocks: StockAltData[];
  accelerating: number;
  stable: number;
  decelerating: number;
  lastUpdated: string;
}


// ─── Demo Data ───────────────────────────────────────────────────────────────

const ALT_DATA: Record<string, Omit<StockAltData, 'combinedSignal' | 'signalStrength' | 'primaryDriver' | 'summary' | 'lastUpdated'>> = {
  'NOVO-B.CO': {
    symbol: 'NOVO-B.CO', name: 'Novo Nordisk',
    googleTrends: {
      searchTerm: 'Wegovy + Ozempic',
      trend: [
        { month: '2026-01', value: 62 }, { month: '2026-02', value: 68 }, { month: '2026-03', value: 74 },
        { month: '2026-04', value: 78 }, { month: '2026-05', value: 85 }, { month: '2026-06', value: 92 },
      ],
      currentIndex: 92, threeMonthChange: 24.3, signal: 'accelerating',
      insight: 'Search interest for Wegovy and Ozempic has surged 24% in 3 months, reaching all-time highs — demand for GLP-1 drugs continues to outpace supply.',
    },
    webTraffic: {
      domain: 'novonordisk.com', monthlyVisits: 4200000, monthOverMonthChange: 8.2,
      threeMonthTrend: 18.5, bounceRate: 42, avgSessionDuration: 185, signal: 'accelerating',
      insight: 'Corporate site traffic up 18% over 3 months with low bounce rate — investors, HCPs, and patients are actively researching the company.',
    },
    appRanking: {
      appName: 'Novo Nordisk Patient App', store: 'both', currentRank: 28,
      rankChange30d: -12, category: 'Health & Fitness', rating: 4.6, signal: 'accelerating',
      insight: 'Patient app climbed 12 ranks in 30 days — more patients onboarding onto GLP-1 treatments.',
    },
    jobPostings: {
      openPositions: 2840, thirtyDayChange: 15, ninetyDayChange: 42,
      topRoles: ['Manufacturing Technician', 'Clinical Research Associate', 'Supply Chain Manager', 'Regulatory Affairs'],
      hiringSignal: 'aggressive', signal: 'accelerating',
      insight: 'Hiring surged 42% in 90 days, heavily in manufacturing and clinical roles — company is scaling production capacity for GLP-1 demand.',
    },
  },
  'MAERSK-B.CO': {
    symbol: 'MAERSK-B.CO', name: 'A.P. Møller-Mærsk',
    googleTrends: {
      searchTerm: 'Maersk shipping + container tracking',
      trend: [
        { month: '2026-01', value: 58 }, { month: '2026-02', value: 55 }, { month: '2026-03', value: 52 },
        { month: '2026-04', value: 48 }, { month: '2026-05', value: 45 }, { month: '2026-06', value: 44 },
      ],
      currentIndex: 44, threeMonthChange: -15.4, signal: 'decelerating',
      insight: 'Search interest for Mærsk shipping services declining 15% — global trade volumes may be softening as Red Sea rerouting normalizes.',
    },
    webTraffic: {
      domain: 'maersk.com', monthlyVisits: 8500000, monthOverMonthChange: -3.2,
      threeMonthTrend: -8.5, bounceRate: 38, avgSessionDuration: 220, signal: 'decelerating',
      insight: 'B2B traffic declining — fewer corporate customers actively quoting shipments suggests weakening demand pipeline.',
    },
    appRanking: null,
    jobPostings: {
      openPositions: 1200, thirtyDayChange: -8, ninetyDayChange: -22,
      topRoles: ['Data Analyst', 'Software Engineer', 'Digital Product Manager'],
      hiringSignal: 'freeze', signal: 'decelerating',
      insight: 'Hiring down 22% with a shift toward tech/digital roles and away from operations — consistent with a company in cost-optimization mode.',
    },
  },
  'VWS.CO': {
    symbol: 'VWS.CO', name: 'Vestas Wind Systems',
    googleTrends: {
      searchTerm: 'Vestas wind turbine + offshore wind',
      trend: [
        { month: '2026-01', value: 45 }, { month: '2026-02', value: 48 }, { month: '2026-03', value: 52 },
        { month: '2026-04', value: 58 }, { month: '2026-05', value: 64 }, { month: '2026-06', value: 72 },
      ],
      currentIndex: 72, threeMonthChange: 38.5, signal: 'accelerating',
      insight: 'Offshore wind searches surging 38% in 3 months — EU energy policy pushing demand. Vestas brand mentions rising with recent German tender win.',
    },
    webTraffic: {
      domain: 'vestas.com', monthlyVisits: 1800000, monthOverMonthChange: 12.5,
      threeMonthTrend: 28.2, bounceRate: 35, avgSessionDuration: 245, signal: 'accelerating',
      insight: 'Corporate site traffic up 28% with very low bounce rate — likely driven by project developers evaluating Vestas for new tenders.',
    },
    appRanking: null,
    jobPostings: {
      openPositions: 1650, thirtyDayChange: 22, ninetyDayChange: 35,
      topRoles: ['Offshore Wind Engineer', 'Project Manager', 'Service Technician', 'Blade Manufacturing'],
      hiringSignal: 'aggressive', signal: 'accelerating',
      insight: 'Aggressive hiring in offshore engineering and manufacturing — confirms large orderbook is translating into real execution scaling.',
    },
  },
  'DSV.CO': {
    symbol: 'DSV.CO', name: 'DSV',
    googleTrends: {
      searchTerm: 'DSV logistics + DSV tracking',
      trend: [
        { month: '2026-01', value: 55 }, { month: '2026-02', value: 56 }, { month: '2026-03', value: 57 },
        { month: '2026-04', value: 58 }, { month: '2026-05', value: 58 }, { month: '2026-06', value: 59 },
      ],
      currentIndex: 59, threeMonthChange: 3.5, signal: 'stable',
      insight: 'Steady low-single-digit growth in search interest — consistent with a mature logistics business integrating Schenker.',
    },
    webTraffic: {
      domain: 'dsv.com', monthlyVisits: 3200000, monthOverMonthChange: 2.1,
      threeMonthTrend: 5.8, bounceRate: 40, avgSessionDuration: 195, signal: 'stable',
      insight: 'Web traffic growing modestly — Schenker customers migrating to DSV platform as integration progresses.',
    },
    appRanking: {
      appName: 'DSV Tracking', store: 'both', currentRank: 85,
      rankChange30d: -5, category: 'Business', rating: 4.2, signal: 'stable',
      insight: 'Tracking app steady in rankings — no major shift in B2B customer engagement.',
    },
    jobPostings: {
      openPositions: 3200, thirtyDayChange: 5, ninetyDayChange: 12,
      topRoles: ['Integration Manager', 'Operations Coordinator', 'IT Systems Analyst', 'Account Manager'],
      hiringSignal: 'moderate', signal: 'stable',
      insight: 'Moderate hiring focused on integration roles — consistent with Schenker absorption timeline.',
    },
  },
  'ORSTED.CO': {
    symbol: 'ORSTED.CO', name: 'Ørsted',
    googleTrends: {
      searchTerm: 'Ørsted offshore wind + renewable energy',
      trend: [
        { month: '2026-01', value: 65 }, { month: '2026-02', value: 58 }, { month: '2026-03', value: 52 },
        { month: '2026-04', value: 48 }, { month: '2026-05', value: 42 }, { month: '2026-06', value: 38 },
      ],
      currentIndex: 38, threeMonthChange: -26.9, signal: 'decelerating',
      insight: 'Search interest declining sharply — likely reflecting negative news cycle around US project impairments and cost overruns.',
    },
    webTraffic: {
      domain: 'orsted.com', monthlyVisits: 1200000, monthOverMonthChange: -5.8,
      threeMonthTrend: -12.4, bounceRate: 52, avgSessionDuration: 145, signal: 'decelerating',
      insight: 'Traffic declining with rising bounce rate — potential investors/partners may be losing interest amid negative headlines.',
    },
    appRanking: null,
    jobPostings: {
      openPositions: 680, thirtyDayChange: -15, ninetyDayChange: -35,
      topRoles: ['Financial Analyst', 'Legal Counsel', 'Communications Manager'],
      hiringSignal: 'freeze', signal: 'decelerating',
      insight: 'Hiring down 35% with shift to finance/legal roles — consistent with a company managing impairments and restructuring projects.',
    },
  },
};


// ─── Signal Computation ──────────────────────────────────────────────────────

function computeCombinedSignal(stock: typeof ALT_DATA[string]): {
  signal: AltDataSignal; strength: number; driver: string; summary: string;
} {
  const signals: { source: string; signal: AltDataSignal; weight: number }[] = [];

  if (stock.googleTrends) signals.push({ source: 'Google Trends', signal: stock.googleTrends.signal, weight: 0.3 });
  if (stock.webTraffic) signals.push({ source: 'Web Traffic', signal: stock.webTraffic.signal, weight: 0.2 });
  if (stock.appRanking) signals.push({ source: 'App Rankings', signal: stock.appRanking.signal, weight: 0.2 });
  if (stock.jobPostings) signals.push({ source: 'Job Postings', signal: stock.jobPostings.signal, weight: 0.3 });

  // Score: accelerating=2, stable=1, decelerating=0
  const scoreMap: Record<AltDataSignal, number> = { accelerating: 2, stable: 1, decelerating: 0 };
  const totalWeight = signals.reduce((s, sig) => s + sig.weight, 0);
  const weightedScore = signals.reduce((s, sig) => s + scoreMap[sig.signal] * sig.weight, 0) / totalWeight;

  const signal: AltDataSignal = weightedScore >= 1.5 ? 'accelerating' : weightedScore <= 0.5 ? 'decelerating' : 'stable';
  const strength = Math.round(weightedScore * 5); // 0-10 scale

  // Find primary driver (strongest signal in the direction)
  const driverSignal = signals.find(s => s.signal === signal) || signals[0];
  const driver = driverSignal.source;

  // Summary
  let summary = '';
  if (signal === 'accelerating') {
    const accelCount = signals.filter(s => s.signal === 'accelerating').length;
    summary = `${accelCount} of ${signals.length} alternative data sources show acceleration for ${stock.name}. Primary driver: ${driver.toLowerCase()} data indicates growing momentum.`;
  } else if (signal === 'decelerating') {
    const decelCount = signals.filter(s => s.signal === 'decelerating').length;
    summary = `${decelCount} of ${signals.length} alternative data sources show deceleration for ${stock.name}. Primary driver: ${driver.toLowerCase()} suggests weakening fundamentals.`;
  } else {
    summary = `Alternative data for ${stock.name} is mixed/stable — no clear acceleration or deceleration across the ${signals.length} sources tracked.`;
  }

  return { signal, strength, driver, summary };
}

// ─── Main API ────────────────────────────────────────────────────────────────

/**
 * Get alternative data for all watchlist stocks.
 */
export function getAltDataDashboard(): AltDataDashboard {
  const stocks: StockAltData[] = Object.values(ALT_DATA).map(stock => {
    const { signal, strength, driver, summary } = computeCombinedSignal(stock);
    return {
      ...stock,
      combinedSignal: signal,
      signalStrength: strength,
      primaryDriver: driver,
      summary,
      lastUpdated: new Date().toISOString(),
    };
  });

  return {
    stocks: stocks.sort((a, b) => b.signalStrength - a.signalStrength),
    accelerating: stocks.filter(s => s.combinedSignal === 'accelerating').length,
    stable: stocks.filter(s => s.combinedSignal === 'stable').length,
    decelerating: stocks.filter(s => s.combinedSignal === 'decelerating').length,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Get signal color and label.
 */
export function getSignalStyle(signal: AltDataSignal): { label: string; color: string; bg: string; icon: string } {
  switch (signal) {
    case 'accelerating': return { label: 'Accelerating', color: 'text-[var(--gain)]', bg: 'bg-[var(--gain)]/10 border-[var(--gain)]/30', icon: '🚀' };
    case 'stable': return { label: 'Stable', color: 'text-[var(--muted)]', bg: 'bg-[var(--muted)]/10 border-[var(--card-border)]', icon: '➡️' };
    case 'decelerating': return { label: 'Decelerating', color: 'text-[var(--loss)]', bg: 'bg-[var(--loss)]/10 border-[var(--loss)]/30', icon: '📉' };
  }
}
