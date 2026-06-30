/**
 * Competitive Landscape Mapper
 *
 * Identifies top 5 competitors for any stock and generates a
 * side-by-side quantitative comparison with AI interpretation.
 *
 * For each company provides:
 * - Current price + 1-year performance
 * - Revenue + profit margin
 * - P/E ratio
 * - Beginner score (0-100)
 * - One-sentence differentiator
 * - AI paragraph on most attractive pick
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CompetitorData {
  symbol: string;
  name: string;
  sector: string;
  description: string;          // 1-sentence differentiator
  currentPrice: number;
  currency: string;
  oneYearReturn: number;        // % return over 12 months
  revenue: number;              // Annual revenue
  revenueGrowth: number;        // YoY %
  profitMargin: number;         // Net margin %
  peRatio: number;
  beginnerScore: number;        // 0-100 from scoring engine
  marketCap: number;
  dividendYield: number;
  isTarget: boolean;            // Is this the user's searched stock?
}

export interface CompetitiveLandscape {
  targetSymbol: string;
  targetName: string;
  sector: string;
  companies: CompetitorData[];  // Target + 5 competitors (6 total)
  aiAnalysis: string;           // AI paragraph on most attractive
  generatedAt: string;
  disclaimer: string;
}


// ─── Competitor Database ─────────────────────────────────────────────────────

/**
 * Maps sectors/stocks to their competitive peers.
 * In production this would call a real API.
 */
const COMPETITOR_MAP: Record<string, {
  sector: string;
  competitors: Omit<CompetitorData, 'isTarget'>[];
}> = {
  'NOVO-B.CO': {
    sector: 'Healthcare / GLP-1 & Obesity',
    competitors: [
      { symbol: 'NOVO-B.CO', name: 'Novo Nordisk', description: 'Global leader in GLP-1 drugs (Ozempic, Wegovy) dominating obesity and diabetes treatment with 50%+ market share.', currentPrice: 845, currency: 'DKK', oneYearReturn: 28.4, revenue: 232800000000, revenueGrowth: 31, profitMargin: 34.2, peRatio: 42.3, beginnerScore: 87, marketCap: 3420000000000, dividendYield: 1.2 },
      { symbol: 'LLY', name: 'Eli Lilly', description: 'Primary challenger with Mounjaro/Zepbound — faster growth but at a much higher valuation than Novo.', currentPrice: 892, currency: 'USD', oneYearReturn: 62.1, revenue: 34100000000, revenueGrowth: 32, profitMargin: 21.8, peRatio: 78.5, beginnerScore: 72, marketCap: 850000000000, dividendYield: 0.6 },
      { symbol: 'AZN', name: 'AstraZeneca', description: 'Diversified pharma with growing oncology pipeline — less GLP-1 exposure but strong overall drug portfolio.', currentPrice: 122, currency: 'GBP', oneYearReturn: 8.2, revenue: 45800000000, revenueGrowth: 6, profitMargin: 15.4, peRatio: 35.2, beginnerScore: 68, marketCap: 225000000000, dividendYield: 2.1 },
      { symbol: 'AMGN', name: 'Amgen', description: 'Entering obesity late with MariTide — lower risk/lower growth profile with strong existing biosimilar business.', currentPrice: 312, currency: 'USD', oneYearReturn: -2.8, revenue: 28200000000, revenueGrowth: 3, profitMargin: 26.1, peRatio: 22.8, beginnerScore: 65, marketCap: 167000000000, dividendYield: 3.2 },
      { symbol: 'ZEAL.CO', name: 'Zealand Pharma', description: 'Danish biotech with next-gen GLP-1 pipeline — highest risk but potentially highest reward in the group.', currentPrice: 845, currency: 'DKK', oneYearReturn: 42.7, revenue: 2400000000, revenueGrowth: 89, profitMargin: -45.2, peRatio: -1, beginnerScore: 38, marketCap: 85000000000, dividendYield: 0 },
    ],
  },
  'MAERSK-B.CO': {
    sector: 'Shipping & Logistics',
    competitors: [
      { symbol: 'MAERSK-B.CO', name: 'A.P. Møller-Mærsk', description: 'Largest container shipping company transitioning to integrated logistics — strong brand but cyclical earnings.', currentPrice: 12450, currency: 'DKK', oneYearReturn: -8.2, revenue: 347000000000, revenueGrowth: -12, profitMargin: 8.4, peRatio: 14.2, beginnerScore: 52, marketCap: 230000000000, dividendYield: 4.8 },
      { symbol: 'DSV.CO', name: 'DSV', description: 'Asset-light freight forwarder with industry-best margins — higher valuation reflects consistently superior execution.', currentPrice: 1523, currency: 'DKK', oneYearReturn: 22.5, revenue: 152000000000, revenueGrowth: 5, profitMargin: 12.8, peRatio: 28.4, beginnerScore: 74, marketCap: 355000000000, dividendYield: 0.8 },
      { symbol: 'ZIM', name: 'ZIM Integrated', description: 'Israeli carrier with highest volatility — extremely cheap when rates are high, risky when they drop.', currentPrice: 24.50, currency: 'USD', oneYearReturn: -32.4, revenue: 5800000000, revenueGrowth: -28, profitMargin: -8.2, peRatio: -1, beginnerScore: 28, marketCap: 2900000000, dividendYield: 0 },
      { symbol: 'HLAG.DE', name: 'Hapag-Lloyd', description: 'German carrier, pure container shipping focus — trades at a discount to Mærsk but less diversified.', currentPrice: 142, currency: 'EUR', oneYearReturn: -15.8, revenue: 18200000000, revenueGrowth: -22, profitMargin: 5.1, peRatio: 8.2, beginnerScore: 44, marketCap: 25000000000, dividendYield: 6.2 },
      { symbol: 'FDX', name: 'FedEx', description: 'Express/ground logistics giant focused on Americas and e-commerce — different model but overlapping customer base.', currentPrice: 278, currency: 'USD', oneYearReturn: 12.4, revenue: 87700000000, revenueGrowth: 2, profitMargin: 6.8, peRatio: 16.5, beginnerScore: 62, marketCap: 68000000000, dividendYield: 1.9 },
    ],
  },
  'VWS.CO': {
    sector: 'Renewable Energy / Wind',
    competitors: [
      { symbol: 'VWS.CO', name: 'Vestas Wind Systems', description: 'World\'s largest wind turbine manufacturer — strong orderbook but profitability under pressure from input costs.', currentPrice: 158, currency: 'DKK', oneYearReturn: 18.5, revenue: 115000000000, revenueGrowth: 8, profitMargin: 3.2, peRatio: 48.5, beginnerScore: 58, marketCap: 190000000000, dividendYield: 0.5 },
      { symbol: 'ORSTED.CO', name: 'Ørsted', description: 'Offshore wind developer and operator — complements Vestas by building the farms rather than making the turbines.', currentPrice: 412, currency: 'DKK', oneYearReturn: -22.4, revenue: 82000000000, revenueGrowth: -5, profitMargin: -12.4, peRatio: -1, beginnerScore: 35, marketCap: 172000000000, dividendYield: 2.8 },
      { symbol: 'SGRE', name: 'Siemens Gamesa (Siemens Energy)', description: 'Primary turbine competitor — struggling with quality issues but backed by Siemens AG\'s resources.', currentPrice: 48, currency: 'EUR', oneYearReturn: 125.3, revenue: 31000000000, revenueGrowth: 12, profitMargin: -8.5, peRatio: -1, beginnerScore: 42, marketCap: 58000000000, dividendYield: 0 },
      { symbol: 'GE', name: 'GE Vernova', description: 'US onshore wind leader spun off from GE — turnaround story with improving margins after years of losses.', currentPrice: 342, currency: 'USD', oneYearReturn: 88.2, revenue: 33400000000, revenueGrowth: 6, profitMargin: 4.8, peRatio: 52.1, beginnerScore: 55, marketCap: 94000000000, dividendYield: 0.2 },
      { symbol: 'ENPH', name: 'Enphase Energy', description: 'Solar microinverters not wind — but competes for the same clean energy investment dollars and policy support.', currentPrice: 112, currency: 'USD', oneYearReturn: -38.5, revenue: 2300000000, revenueGrowth: -28, profitMargin: 18.2, peRatio: 34.2, beginnerScore: 48, marketCap: 15200000000, dividendYield: 0 },
    ],
  },
};

// Default/generic competitor template for unknown stocks
const DEFAULT_SECTOR = {
  sector: 'General / Unknown',
  competitors: [
    { symbol: 'SPY', name: 'S&P 500 ETF', description: 'Benchmark index ETF — use this to compare any stock against broad market performance.', currentPrice: 589, currency: 'USD', oneYearReturn: 18.2, revenue: 0, revenueGrowth: 0, profitMargin: 0, peRatio: 24.5, beginnerScore: 75, marketCap: 0, dividendYield: 1.3 },
    { symbol: 'IWDA.AS', name: 'iShares MSCI World', description: 'Global diversified ETF — represents the entire developed world stock market in one holding.', currentPrice: 94.5, currency: 'EUR', oneYearReturn: 15.8, revenue: 0, revenueGrowth: 0, profitMargin: 0, peRatio: 22.1, beginnerScore: 80, marketCap: 0, dividendYield: 1.6 },
  ],
};


// ─── AI Analysis Generator ───────────────────────────────────────────────────

function generateAIAnalysis(companies: CompetitorData[]): string {
  // Find the "most attractive" based on quantitative scoring
  const scored = companies
    .filter(c => c.peRatio > 0) // Exclude unprofitable
    .map(c => {
      // Composite score: weighted blend of key metrics
      const growthScore = Math.min(40, Math.max(0, c.revenueGrowth * 1.2)); // 0-40
      const marginScore = Math.min(25, Math.max(0, c.profitMargin * 0.7)); // 0-25
      const valueScore = Math.min(20, Math.max(0, (40 - c.peRatio) * 0.5)); // 0-20 (lower PE = higher score)
      const momentumScore = Math.min(15, Math.max(0, c.oneYearReturn * 0.3)); // 0-15
      const total = growthScore + marginScore + valueScore + momentumScore;
      return { ...c, quantScore: Math.round(total * 10) / 10 };
    })
    .sort((a, b) => b.quantScore - a.quantScore);

  if (scored.length === 0) {
    return 'Insufficient data to determine a quantitative leader — most companies in this set are currently unprofitable, making valuation-based comparison unreliable.';
  }

  const top = scored[0];
  const runner = scored[1];
  const parts: string[] = [];

  parts.push(`Based purely on the quantitative data,`);
  parts.push(`${top.name} (${top.symbol}) currently looks the most attractive in this competitive set.`);

  // Explain why
  const reasons: string[] = [];
  if (top.revenueGrowth > 15) reasons.push(`revenue growing at ${top.revenueGrowth}% year-over-year`);
  if (top.profitMargin > 15) reasons.push(`strong ${top.profitMargin.toFixed(0)}% profit margins`);
  if (top.peRatio < 30 && top.peRatio > 0) reasons.push(`reasonable valuation at ${top.peRatio.toFixed(0)}x earnings`);
  if (top.oneYearReturn > 15) reasons.push(`strong momentum with ${top.oneYearReturn.toFixed(0)}% gains over the past year`);
  if (top.beginnerScore >= 70) reasons.push(`a high beginner-friendliness score of ${top.beginnerScore}/100`);

  if (reasons.length > 0) {
    parts.push(`It combines ${reasons.slice(0, 3).join(', ')}${reasons.length > 3 ? ', among other positive metrics' : ''}.`);
  }

  // Runner up mention
  if (runner) {
    parts.push(`${runner.name} is the closest alternative,`);
    if (runner.peRatio < top.peRatio && runner.peRatio > 0) {
      parts.push(`trading at a cheaper ${runner.peRatio.toFixed(0)}x P/E but with weaker growth (${runner.revenueGrowth}% vs ${top.revenueGrowth}%).`);
    } else if (runner.revenueGrowth > top.revenueGrowth) {
      parts.push(`offering faster growth (${runner.revenueGrowth}%) but at a premium valuation of ${runner.peRatio.toFixed(0)}x earnings.`);
    } else {
      parts.push(`offering a different risk/reward tradeoff.`);
    }
  }

  // Caveat about unprofitable names
  const unprofitable = companies.filter(c => c.profitMargin < 0);
  if (unprofitable.length > 0) {
    parts.push(`Note: ${unprofitable.map(c => c.name).join(' and ')} ${unprofitable.length > 1 ? 'are' : 'is'} currently unprofitable, which makes valuation comparison meaningless for ${unprofitable.length > 1 ? 'them' : 'it'} — higher risk, but potentially higher reward if execution improves.`);
  }

  return parts.join(' ');
}

// ─── Main API ────────────────────────────────────────────────────────────────

/**
 * Generate a competitive landscape for a given stock ticker.
 */
export function getCompetitiveLandscape(ticker: string): CompetitiveLandscape {
  const upperTicker = ticker.toUpperCase();
  const data = COMPETITOR_MAP[upperTicker] || null;

  let companies: CompetitorData[];
  let sector: string;
  let targetName: string;

  if (data) {
    // Known stock — use curated competitor list
    companies = data.competitors.map(c => ({
      ...c,
      isTarget: c.symbol.toUpperCase() === upperTicker,
    }));
    sector = data.sector;
    targetName = companies.find(c => c.isTarget)?.name || upperTicker;
  } else {
    // Unknown stock — generate placeholder with market benchmarks
    const target: CompetitorData = {
      symbol: upperTicker,
      name: `${upperTicker} Corp`,
      description: 'The stock you searched for. Compare its metrics against the benchmarks below.',
      currentPrice: 100,
      currency: 'DKK',
      oneYearReturn: 0,
      revenue: 10000000000,
      revenueGrowth: 5,
      profitMargin: 10,
      peRatio: 20,
      beginnerScore: 50,
      marketCap: 50000000000,
      dividendYield: 2,
      isTarget: true,
    };
    companies = [target, ...DEFAULT_SECTOR.competitors.map(c => ({ ...c, isTarget: false }))];
    sector = DEFAULT_SECTOR.sector;
    targetName = upperTicker;
  }

  // Generate AI analysis
  const aiAnalysis = generateAIAnalysis(companies);

  return {
    targetSymbol: upperTicker,
    targetName,
    sector,
    companies,
    aiAnalysis,
    generatedAt: new Date().toISOString(),
    disclaimer: 'This is quantitative data analysis only — NOT financial advice. Numbers are estimates based on publicly available data. Always do your own research and consider your personal financial situation before investing.',
  };
}

/**
 * Get the list of supported tickers with curated competitor maps.
 */
export function getSupportedTickers(): string[] {
  return Object.keys(COMPETITOR_MAP);
}
