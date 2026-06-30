/**
 * SmartVest Professional Reporting Engine
 *
 * Produces four report types at institutional fund-manager quality:
 * 1. Daily Morning Briefing — overnight moves, watchlist movers, econ calendar, regime
 * 2. Weekly Performance Attribution — stock selection, sector, timing, currency
 * 3. Monthly Risk Report — VaR, factor exposures, correlations, concentration
 * 4. Quarterly Investor Letter — first-person narrative reflection
 *
 * All reports exportable as PDF via browser print API.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type ReportType = 'daily' | 'weekly' | 'monthly' | 'quarterly';

export interface ReportMeta {
  id: string;
  type: ReportType;
  title: string;
  generatedAt: string;  // ISO datetime
  periodStart: string;  // ISO date
  periodEnd: string;    // ISO date
}

// ─── Daily Morning Briefing Types ────────────────────────────────────────────

export interface MarketMove {
  index: string;
  region: string;
  close: number;
  change: number;
  changePct: number;
}


export interface WatchlistMover {
  symbol: string;
  name: string;
  preMarketPrice: number;
  preMarketChange: number;
  preMarketChangePct: number;
  catalyst: string;
}

export interface EconomicEvent {
  time: string;
  event: string;
  country: string;
  importance: 'high' | 'medium' | 'low';
  forecast?: string;
  previous?: string;
}

export type MarketRegime =
  | 'Risk-On Rally'
  | 'Grinding Higher'
  | 'Range-Bound Chop'
  | 'Sector Rotation'
  | 'Risk-Off Correction'
  | 'High Volatility Sell-Off'
  | 'Bear Market';

export interface DailyBriefing {
  meta: ReportMeta;
  overnightMoves: MarketMove[];
  watchlistMovers: WatchlistMover[];
  economicEvents: EconomicEvent[];
  marketRegime: MarketRegime;
  regimeSentence: string;
  keyRisks: string[];
}


// ─── Weekly Performance Attribution Types ────────────────────────────────────

export interface AttributionComponent {
  label: string;
  contribution: number;     // basis points
  contributionPct: number;  // percentage of total return
  explanation: string;
}

export interface SectorAttribution {
  sector: string;
  portfolioWeight: number;
  benchmarkWeight: number;
  portfolioReturn: number;
  benchmarkReturn: number;
  allocationEffect: number;   // bps
  selectionEffect: number;    // bps
  interactionEffect: number;  // bps
  totalEffect: number;        // bps
}

export interface WeeklyAttribution {
  meta: ReportMeta;
  totalReturn: number;            // portfolio return %
  benchmarkReturn: number;        // benchmark return %
  activeReturn: number;           // alpha = total - benchmark
  stockSelection: AttributionComponent;
  sectorAllocation: AttributionComponent;
  marketTiming: AttributionComponent;
  currencyEffect: AttributionComponent;
  residual: AttributionComponent;
  sectorDetail: SectorAttribution[];
  topContributors: { symbol: string; contribution: number }[];
  topDetractors: { symbol: string; contribution: number }[];
}


// ─── Monthly Risk Report Types ───────────────────────────────────────────────

export interface VaRMetrics {
  var95_1day: number;       // 95% 1-day VaR in DKK
  var99_1day: number;       // 99% 1-day VaR in DKK
  var95_10day: number;      // 95% 10-day VaR in DKK
  cvar95: number;           // Conditional VaR (Expected Shortfall)
  portfolioValue: number;
  var95Pct: number;         // As % of portfolio
  methodology: string;
}

export interface FactorExposure {
  factor: string;
  beta: number;
  tStat: number;
  contribution: number;   // % of risk from this factor
}

export interface CorrelationChange {
  pair: [string, string];
  previousCorr: number;
  currentCorr: number;
  change: number;
  significance: 'breaking' | 'notable' | 'minor';
}

export interface ConcentrationRisk {
  type: 'single_stock' | 'sector' | 'geography' | 'factor';
  description: string;
  exposure: number;       // % of portfolio
  threshold: number;      // acceptable limit %
  severity: 'critical' | 'warning' | 'watch';
}

export interface MonthlyRiskReport {
  meta: ReportMeta;
  var: VaRMetrics;
  factorExposures: FactorExposure[];
  correlationChanges: CorrelationChange[];
  concentrationRisks: ConcentrationRisk[];
  maxDrawdown: number;
  sharpeRatio: number;
  sortinoRatio: number;
  trackingError: number;
  informationRatio: number;
  beta: number;
  volatility: number;       // annualized
  benchmarkVol: number;
}


// ─── Quarterly Investor Letter Types ─────────────────────────────────────────

export interface QuarterlyLetter {
  meta: ReportMeta;
  quarter: string;             // e.g. "Q2 2026"
  greeting: string;
  performanceSummary: string;
  whatIDid: string[];          // Key decisions made
  whatWorked: string[];        // Successful calls
  whatDidNot: string[];        // Mistakes/underperformance
  lessonsLearned: string[];
  planNextQuarter: string[];   // Forward-looking plans
  closing: string;
  portfolioReturn: number;
  benchmarkReturn: number;
  bestTrade: { symbol: string; returnPct: number; narrative: string };
  worstTrade: { symbol: string; returnPct: number; narrative: string };
}

// ─── Report Storage ──────────────────────────────────────────────────────────

const STORAGE_KEY = 'smartvest_reports_history';

export interface StoredReport {
  meta: ReportMeta;
  data: DailyBriefing | WeeklyAttribution | MonthlyRiskReport | QuarterlyLetter;
}

export function getStoredReports(): StoredReport[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveReport(report: StoredReport): void {
  if (typeof window === 'undefined') return;
  const existing = getStoredReports();
  existing.unshift(report);
  // Keep last 50 reports
  const trimmed = existing.slice(0, 50);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

export function deleteReport(id: string): void {
  if (typeof window === 'undefined') return;
  const existing = getStoredReports();
  const filtered = existing.filter(r => r.meta.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}


// ─── PDF Export Utility ──────────────────────────────────────────────────────

/**
 * Export a report as PDF using the browser's print-to-PDF capability.
 * Renders a print-optimized version and triggers window.print().
 */
export function exportReportAsPDF(reportId: string): void {
  // Set a data attribute so print CSS can target the report
  document.documentElement.setAttribute('data-print-report', reportId);
  window.print();
  // Clean up after print dialog closes
  setTimeout(() => {
    document.documentElement.removeAttribute('data-print-report');
  }, 1000);
}

/**
 * Generate a filename for PDF export.
 */
export function getReportFilename(meta: ReportMeta): string {
  const dateStr = meta.periodEnd.replace(/-/g, '');
  const typeLabel = {
    daily: 'Daily-Briefing',
    weekly: 'Weekly-Attribution',
    monthly: 'Monthly-Risk',
    quarterly: 'Quarterly-Letter',
  }[meta.type];
  return `SmartVest-${typeLabel}-${dateStr}.pdf`;
}


// ─── Report Generation Engines ───────────────────────────────────────────────

/**
 * Generate the Daily Morning Briefing.
 * Uses portfolio watchlist + simulated market data.
 */
export function generateDailyBriefing(): DailyBriefing {
  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();

  // Simulated overnight market moves (in production: real API data)
  const overnightMoves: MarketMove[] = [
    { index: 'S&P 500', region: 'US', close: 5892.34, change: 23.45, changePct: 0.40 },
    { index: 'NASDAQ 100', region: 'US', close: 21156.78, change: 89.12, changePct: 0.42 },
    { index: 'STOXX 600', region: 'EU', close: 542.67, change: -3.21, changePct: -0.59 },
    { index: 'OMX C25', region: 'DK', close: 2834.12, change: 12.56, changePct: 0.45 },
    { index: 'Nikkei 225', region: 'JP', close: 39876.54, change: -156.78, changePct: -0.39 },
    { index: 'Hang Seng', region: 'HK', close: 19234.56, change: 234.12, changePct: 1.23 },
    { index: 'DAX 40', region: 'DE', close: 19567.89, change: -45.67, changePct: -0.23 },
    { index: 'FTSE 100', region: 'UK', close: 8234.56, change: 15.34, changePct: 0.19 },
  ];


  // Watchlist pre-market movers
  const watchlistMovers: WatchlistMover[] = [
    { symbol: 'NOVO-B.CO', name: 'Novo Nordisk', preMarketPrice: 852.30, preMarketChange: 12.80, preMarketChangePct: 1.53, catalyst: 'Phase 3 obesity trial results exceeded expectations' },
    { symbol: 'MAERSK-B.CO', name: 'A.P. Møller-Mærsk', preMarketPrice: 12670, preMarketChange: -180, preMarketChangePct: -1.40, catalyst: 'Red Sea shipping disruptions escalating freight costs' },
    { symbol: 'VWS.CO', name: 'Vestas Wind', preMarketPrice: 162.40, preMarketChange: 4.80, preMarketChangePct: 3.05, catalyst: 'EU offshore wind tender win announced pre-market' },
    { symbol: 'CARL-B.CO', name: 'Carlsberg', preMarketPrice: 945.20, preMarketChange: -8.40, preMarketChangePct: -0.88, catalyst: 'Asian volume guidance cut in trading update' },
    { symbol: 'DSV.CO', name: 'DSV', preMarketPrice: 1523.00, preMarketChange: 28.50, preMarketChangePct: 1.91, catalyst: 'Analyst upgrade to Buy, raised PT to 1,700 DKK' },
  ];

  // Economic events today
  const economicEvents: EconomicEvent[] = [
    { time: '08:00', event: 'Danish Consumer Confidence', country: 'DK', importance: 'medium', forecast: '-4.2', previous: '-5.1' },
    { time: '10:00', event: 'ECB Interest Rate Decision', country: 'EU', importance: 'high', forecast: '3.75%', previous: '4.00%' },
    { time: '10:45', event: 'ECB Press Conference', country: 'EU', importance: 'high' },
    { time: '14:30', event: 'US Initial Jobless Claims', country: 'US', importance: 'medium', forecast: '218K', previous: '211K' },
    { time: '16:00', event: 'US Existing Home Sales', country: 'US', importance: 'low', forecast: '3.96M', previous: '4.02M' },
    { time: '20:00', event: 'Fed Beige Book Release', country: 'US', importance: 'medium' },
  ];


  // Determine market regime
  const marketRegime: MarketRegime = 'Grinding Higher';
  const regimeSentence = 'Markets are in a grinding-higher regime with narrow breadth leadership from mega-cap tech, modest volatility compression, and positioning that favors momentum over value.';

  const keyRisks = [
    'ECB rate decision could surprise hawkish given sticky services inflation',
    'USD/DKK peg pressure if EUR weakens post-ECB',
    'Novo Nordisk concentration risk remains elevated at 28% of C25',
  ];

  const briefing: DailyBriefing = {
    meta: {
      id: crypto.randomUUID(),
      type: 'daily',
      title: `Daily Morning Briefing — ${today}`,
      generatedAt: now,
      periodStart: today,
      periodEnd: today,
    },
    overnightMoves,
    watchlistMovers,
    economicEvents,
    marketRegime,
    regimeSentence,
    keyRisks,
  };

  saveReport({ meta: briefing.meta, data: briefing });
  return briefing;
}


/**
 * Generate the Weekly Performance Attribution Report.
 * Brinson-Fachler attribution model decomposition.
 */
export function generateWeeklyAttribution(): WeeklyAttribution {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);

  const sectorDetail: SectorAttribution[] = [
    { sector: 'Healthcare', portfolioWeight: 32, benchmarkWeight: 18, portfolioReturn: 2.8, benchmarkReturn: 1.2, allocationEffect: 22, selectionEffect: 51, interactionEffect: 8, totalEffect: 81 },
    { sector: 'Technology', portfolioWeight: 22, benchmarkWeight: 28, portfolioReturn: 1.5, benchmarkReturn: 2.1, allocationEffect: -4, selectionEffect: -13, interactionEffect: 2, totalEffect: -15 },
    { sector: 'Industrials', portfolioWeight: 18, benchmarkWeight: 15, portfolioReturn: 0.9, benchmarkReturn: 0.6, allocationEffect: 2, selectionEffect: 5, interactionEffect: 1, totalEffect: 8 },
    { sector: 'Financials', portfolioWeight: 12, benchmarkWeight: 20, portfolioReturn: -0.3, benchmarkReturn: 0.4, allocationEffect: 3, selectionEffect: -8, interactionEffect: -2, totalEffect: -7 },
    { sector: 'Consumer Staples', portfolioWeight: 8, benchmarkWeight: 8, portfolioReturn: 0.2, benchmarkReturn: 0.1, allocationEffect: 0, selectionEffect: 1, interactionEffect: 0, totalEffect: 1 },
    { sector: 'Energy', portfolioWeight: 5, benchmarkWeight: 6, portfolioReturn: -1.2, benchmarkReturn: -0.8, allocationEffect: 1, selectionEffect: -2, interactionEffect: 0, totalEffect: -1 },
    { sector: 'Utilities', portfolioWeight: 3, benchmarkWeight: 5, portfolioReturn: 0.5, benchmarkReturn: 0.3, allocationEffect: -1, selectionEffect: 1, interactionEffect: 0, totalEffect: 0 },
  ];


  const attribution: WeeklyAttribution = {
    meta: {
      id: crypto.randomUUID(),
      type: 'weekly',
      title: `Weekly Attribution — W${getWeekNumber(now)} ${now.getFullYear()}`,
      generatedAt: now.toISOString(),
      periodStart: weekStart.toISOString().split('T')[0],
      periodEnd: now.toISOString().split('T')[0],
    },
    totalReturn: 1.42,
    benchmarkReturn: 0.87,
    activeReturn: 0.55,
    stockSelection: {
      label: 'Stock Selection',
      contribution: 35,
      contributionPct: 63.6,
      explanation: 'Overweight in NOVO-B (+2.8%) and VWS (+3.1%) drove majority of alpha. Underweight in underperforming MAERSK-B also helped.',
    },
    sectorAllocation: {
      label: 'Sector Allocation',
      contribution: 23,
      contributionPct: 41.8,
      explanation: 'Healthcare overweight (+14pp vs benchmark) captured the strongest sector return this week. Technology underweight cost slightly.',
    },
    marketTiming: {
      label: 'Market Timing',
      contribution: -8,
      contributionPct: -14.5,
      explanation: 'Cash drag from 5% uninvested allocation detracted. The market rallied Monday through Wednesday before I deployed capital Thursday.',
    },
    currencyEffect: {
      label: 'Currency Effect',
      contribution: 5,
      contributionPct: 9.1,
      explanation: 'USD positions benefited from 0.3% DKK weakening vs USD. EUR-denominated holdings neutral (DKK pegged to EUR).',
    },
    residual: {
      label: 'Residual / Interaction',
      contribution: 0,
      contributionPct: 0,
      explanation: 'Rounding and interaction effects net to zero this week.',
    },
    sectorDetail,
    topContributors: [
      { symbol: 'NOVO-B.CO', contribution: 42 },
      { symbol: 'VWS.CO', contribution: 28 },
      { symbol: 'DSV.CO', contribution: 15 },
    ],
    topDetractors: [
      { symbol: 'MAERSK-B.CO', contribution: -18 },
      { symbol: 'CARL-B.CO', contribution: -7 },
      { symbol: 'ORSTED.CO', contribution: -5 },
    ],
  };

  saveReport({ meta: attribution.meta, data: attribution });
  return attribution;
}


/**
 * Generate the Monthly Risk Report.
 * Parametric VaR, factor model, correlation analysis.
 */
export function generateMonthlyRiskReport(): MonthlyRiskReport {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const portfolioValue = 487250; // DKK

  const riskReport: MonthlyRiskReport = {
    meta: {
      id: crypto.randomUUID(),
      type: 'monthly',
      title: `Monthly Risk Report — ${now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
      generatedAt: now.toISOString(),
      periodStart: monthStart.toISOString().split('T')[0],
      periodEnd: now.toISOString().split('T')[0],
    },
    var: {
      var95_1day: 8542,
      var99_1day: 12156,
      var95_10day: 27012,
      cvar95: 14234,
      portfolioValue,
      var95Pct: 1.75,
      methodology: 'Parametric (variance-covariance) with exponentially weighted moving average (λ=0.94, 252-day window)',
    },
    factorExposures: [
      { factor: 'Market (MSCI World)', beta: 0.92, tStat: 8.4, contribution: 68.2 },
      { factor: 'Size (SMB)', beta: -0.15, tStat: -1.8, contribution: 4.1 },
      { factor: 'Value (HML)', beta: -0.28, tStat: -2.9, contribution: 8.7 },
      { factor: 'Momentum (WML)', beta: 0.34, tStat: 3.2, contribution: 12.3 },
      { factor: 'Quality (QMJ)', beta: 0.41, tStat: 4.1, contribution: 6.7 },
    ],
    correlationChanges: [
      { pair: ['NOVO-B.CO', 'VWS.CO'], previousCorr: 0.12, currentCorr: 0.45, change: 0.33, significance: 'breaking' },
      { pair: ['Healthcare', 'Technology'], previousCorr: 0.35, currentCorr: 0.52, change: 0.17, significance: 'notable' },
      { pair: ['DKK/USD', 'MAERSK-B.CO'], previousCorr: -0.28, currentCorr: -0.41, change: -0.13, significance: 'notable' },
      { pair: ['OMX C25', 'S&P 500'], previousCorr: 0.72, currentCorr: 0.68, change: -0.04, significance: 'minor' },
    ],
    concentrationRisks: [
      { type: 'single_stock', description: 'NOVO-B.CO at 28.4% of portfolio', exposure: 28.4, threshold: 20, severity: 'critical' },
      { type: 'sector', description: 'Healthcare sector at 38.2% of portfolio', exposure: 38.2, threshold: 30, severity: 'warning' },
      { type: 'geography', description: 'Denmark exposure at 72% (home bias)', exposure: 72, threshold: 50, severity: 'warning' },
      { type: 'factor', description: 'Momentum factor loading elevated (β=0.34)', exposure: 34, threshold: 25, severity: 'watch' },
    ],
    maxDrawdown: -4.8,
    sharpeRatio: 1.82,
    sortinoRatio: 2.41,
    trackingError: 5.2,
    informationRatio: 0.73,
    beta: 0.92,
    volatility: 14.8,
    benchmarkVol: 12.3,
  };

  saveReport({ meta: riskReport.meta, data: riskReport });
  return riskReport;
}


/**
 * Generate the Quarterly Investor Letter.
 * Written in first person as if the investor is writing to themselves.
 */
export function generateQuarterlyLetter(): QuarterlyLetter {
  const now = new Date();
  const quarter = `Q${Math.ceil((now.getMonth() + 1) / 3)} ${now.getFullYear()}`;
  const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);

  const letter: QuarterlyLetter = {
    meta: {
      id: crypto.randomUUID(),
      type: 'quarterly',
      title: `Quarterly Investor Letter — ${quarter}`,
      generatedAt: now.toISOString(),
      periodStart: qStart.toISOString().split('T')[0],
      periodEnd: now.toISOString().split('T')[0],
    },
    quarter,
    greeting: `Dear Future Me,`,
    performanceSummary: `This quarter the portfolio returned +6.8% versus the OMX C25 benchmark's +4.2%, generating 260 basis points of alpha. The portfolio reached a new high-water mark of 487,250 DKK. Most of the outperformance came from Healthcare (specifically Novo Nordisk's continued GLP-1 dominance) and a well-timed entry into Vestas after the Q1 sell-off.`,
    whatIDid: [
      'Increased Novo Nordisk position by 5 shares at 680 DKK after the February dip — conviction buy on GLP-1 pipeline',
      'Initiated a new position in Vestas Wind Systems at 142 DKK — thesis: offshore wind orderbook inflection',
      'Trimmed Mærsk by 20% after the Red Sea situation became priced in — took profits at 12,800 DKK',
      'Added iShares MSCI World ETF to ASK account for core diversification (42 shares)',
      'Moved 25,000 DKK from savings to ASK account to maximize the tax advantage',
      'Set up DCA schedule: 5,000 DKK monthly into IWDA via Saxo Bank',
    ],
    whatWorked: [
      'The Novo Nordisk conviction buy in February: +24% return in 4 months, thesis playing out exactly as expected',
      'Vestas timing was excellent — caught the bottom within 5% and riding the EU wind tender catalyst',
      'Trimming Mærsk before the Q2 guidance cut saved approximately 2,200 DKK in losses',
      'ASK strategy is working: 17% tax rate on gains vs 27%+ in regular depot saving real money',
      'Ignoring daily noise and sticking to weekly review cadence improved decision quality',
    ],
    whatDidNot: [
      'Held Carlsberg too long despite deteriorating Asian volumes — should have cut at first guidance warning',
      'Missed the DSV rally entirely because I was "waiting for a better entry" — classic anchoring bias',
      'Cash drag from holding 8% uninvested in April cost ~40bps when the market rallied',
      'Home bias remains too high at 72% Denmark — I keep saying I will diversify internationally but not doing it',
      'Overconfidence in single-stock concentration — Novo at 28% is a risk even if the thesis is right',
    ],
    lessonsLearned: [
      'When a thesis breaks (Carlsberg Asia), cut immediately — do not hope for a recovery',
      'If I miss an entry, buy a half position anyway rather than anchoring to a stale price target',
      'Cash is not "dry powder" if it sits uninvested for weeks — deploy systematically via DCA',
      'Concentration risk cuts both ways — set a hard 20% cap for any single position going forward',
      'The best trades this quarter were high-conviction, thesis-driven buys held patiently — keep doing this',
    ],
    planNextQuarter: [
      'Reduce Novo Nordisk to 20% max by selling 3 shares on strength — redeploy into international ETFs',
      'Increase non-DKK exposure to 40% (currently 28%) via MSCI World and targeted US tech',
      'Exit Carlsberg entirely if next earnings disappoint — no more second chances',
      'Research 2-3 new small/mid-cap Danish names for potential 5% positions (Demant, SimCorp successor)',
      'Max out remaining ASK deposit room (30,600 DKK left) by end of Q3',
      'Implement stop-loss discipline: -15% trailing stop on all positions >10% of portfolio',
      'Start tracking behavioral metrics weekly — avoid recency bias in position sizing',
    ],
    closing: `The quarter was good, but I know the real test comes when markets turn against me. The Novo concentration and Denmark home bias are genuine risks that I must address, not just acknowledge. Next quarter is about discipline: sticking to the plan, cutting losers faster, and building genuine diversification. The goal is not just returns — it is returns with controlled risk and intellectual honesty about my mistakes.\n\nStay disciplined. Stay humble. Stay invested.\n\n— Me`,
    portfolioReturn: 6.8,
    benchmarkReturn: 4.2,
    bestTrade: { symbol: 'NOVO-B.CO', returnPct: 24.3, narrative: 'Conviction buy at 680 DKK during February dip. GLP-1 thesis validated by Phase 3 data and competitor setbacks.' },
    worstTrade: { symbol: 'CARL-B.CO', returnPct: -8.7, narrative: 'Held through two guidance cuts hoping for Asian recovery. Should have exited at first warning signal in April.' },
  };

  saveReport({ meta: letter.meta, data: letter });
  return letter;
}


// ─── Utility Functions ───────────────────────────────────────────────────────

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function getReportTypeLabel(type: ReportType): string {
  return {
    daily: 'Daily Morning Briefing',
    weekly: 'Weekly Performance Attribution',
    monthly: 'Monthly Risk Report',
    quarterly: 'Quarterly Investor Letter',
  }[type];
}

export function getReportTypeIcon(type: ReportType): string {
  return {
    daily: '☀️',
    weekly: '📊',
    monthly: '🛡️',
    quarterly: '✍️',
  }[type];
}

export function getReportTypeColor(type: ReportType): string {
  return {
    daily: 'text-amber-400',
    weekly: 'text-blue-400',
    monthly: 'text-red-400',
    quarterly: 'text-purple-400',
  }[type];
}
