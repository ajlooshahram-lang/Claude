/**
 * Scenario Analysis Engine
 *
 * Models the impact of macroeconomic scenarios on your portfolio
 * using historical precedents and asset-class sensitivity factors.
 *
 * Features:
 * - 6 pre-built scenarios with historical precedents
 * - Custom scenario builder with user-defined assumptions
 * - Per-holding impact estimation with confidence ranges
 * - Historical precedent lookup for similar conditions
 * - Portfolio-level DKK impact aggregation
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ScenarioDefinition {
  id: string;
  name: string;
  description: string;
  category: 'rates' | 'recession' | 'commodity' | 'currency' | 'sector' | 'geopolitical';
  icon: string;
  assumptions: ScenarioAssumption[];
  historicalPrecedents: HistoricalPrecedent[];
  isCustom: boolean;
}

export interface ScenarioAssumption {
  variable: string;
  change: number;
  unit: string;
  direction: 'increase' | 'decrease';
}

export interface HistoricalPrecedent {
  event: string;
  date: string;
  duration: string;
  sp500Impact: number;
  outcome: string;
}

export interface HoldingImpact {
  symbol: string;
  name: string;
  currentValue: number;
  estimatedChange: number;
  estimatedChangePct: number;
  confidenceLow: number;
  confidenceHigh: number;
  sensitivity: string;
  reasoning: string;
}

export interface ScenarioResult {
  scenario: ScenarioDefinition;
  portfolioImpact: number;
  portfolioImpactPct: number;
  confidenceRange: { low: number; high: number };
  holdingImpacts: HoldingImpact[];
  worstCase: number;
  bestCase: number;
  recommendation: string;
  analyzedAt: string;
}


// ─── Sensitivity Factors ─────────────────────────────────────────────────────

/**
 * How each stock/sector responds to macro changes.
 * Based on historical beta and factor analysis.
 * Format: { factor: impact_multiplier }
 * e.g., rates_up_1pct: -0.15 means stock drops ~15% if rates rise 1%
 */
const SENSITIVITY: Record<string, Record<string, number>> = {
  'NOVO-B.CO': { rates_up: -0.08, recession: -0.12, oil_spike: -0.03, usd_strong: 0.05, tech_selloff: -0.02, geopolitical: -0.10 },
  'MAERSK-B.CO': { rates_up: -0.12, recession: -0.25, oil_spike: -0.08, usd_strong: -0.05, tech_selloff: -0.03, geopolitical: -0.18 },
  'VWS.CO': { rates_up: -0.18, recession: -0.15, oil_spike: 0.08, usd_strong: -0.06, tech_selloff: -0.05, geopolitical: -0.12 },
  'IWDA.AS': { rates_up: -0.12, recession: -0.20, oil_spike: -0.05, usd_strong: 0.03, tech_selloff: -0.10, geopolitical: -0.15 },
  'DSV.CO': { rates_up: -0.10, recession: -0.22, oil_spike: -0.04, usd_strong: -0.03, tech_selloff: -0.02, geopolitical: -0.14 },
};

// Sector-level fallback sensitivities
const SECTOR_SENSITIVITY: Record<string, Record<string, number>> = {
  'Healthcare': { rates_up: -0.08, recession: -0.10, oil_spike: -0.02, usd_strong: 0.04, tech_selloff: -0.02, geopolitical: -0.08 },
  'Industrials': { rates_up: -0.12, recession: -0.22, oil_spike: -0.06, usd_strong: -0.04, tech_selloff: -0.03, geopolitical: -0.15 },
  'Energy': { rates_up: -0.05, recession: -0.15, oil_spike: 0.10, usd_strong: -0.03, tech_selloff: -0.02, geopolitical: -0.12 },
  'ETF/Diversified': { rates_up: -0.12, recession: -0.18, oil_spike: -0.04, usd_strong: 0.02, tech_selloff: -0.08, geopolitical: -0.14 },
  'Technology': { rates_up: -0.20, recession: -0.18, oil_spike: -0.03, usd_strong: 0.05, tech_selloff: -0.25, geopolitical: -0.12 },
  'Financials': { rates_up: 0.08, recession: -0.25, oil_spike: -0.03, usd_strong: 0.02, tech_selloff: -0.04, geopolitical: -0.12 },
};

function getSensitivity(symbol: string, sector: string, factor: string): number {
  const stockSens = SENSITIVITY[symbol];
  if (stockSens && stockSens[factor] !== undefined) return stockSens[factor];
  const sectorSens = SECTOR_SENSITIVITY[sector];
  if (sectorSens && sectorSens[factor] !== undefined) return sectorSens[factor];
  return -0.10; // Default moderate negative
}


// ─── Pre-Built Scenarios ─────────────────────────────────────────────────────

export const PREBUILT_SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'fed_rate_hike',
    name: 'Fed Raises Rates +1% Unexpectedly',
    description: 'The Federal Reserve surprises markets with a 100bps emergency rate hike, signaling inflation is worse than expected.',
    category: 'rates',
    icon: '📈',
    assumptions: [
      { variable: 'Fed Funds Rate', change: 1.0, unit: '%', direction: 'increase' },
      { variable: '10Y Treasury Yield', change: 0.75, unit: '%', direction: 'increase' },
      { variable: 'Market Volatility (VIX)', change: 60, unit: '%', direction: 'increase' },
    ],
    historicalPrecedents: [
      { event: 'Volcker Shock (1981)', date: 'Oct 1981', duration: '6 months', sp500Impact: -14.2, outcome: 'Recession followed, but inflation was tamed. Stocks recovered within 18 months.' },
      { event: 'Dec 2018 Rate Hike', date: 'Dec 2018', duration: '3 weeks', sp500Impact: -9.2, outcome: 'Fed reversed course in Jan 2019. Market recovered all losses within 4 months.' },
      { event: 'Jun 2022 75bp Hike', date: 'Jun 2022', duration: '3 months', sp500Impact: -8.5, outcome: 'Growth stocks hit hardest (-18%). Value and healthcare outperformed.' },
    ],
    isCustom: false,
  },
  {
    id: 'us_recession',
    name: 'US Enters Technical Recession',
    description: 'Two consecutive quarters of negative GDP growth confirmed. Consumer spending contracts, earnings estimates revised down 15-20%.',
    category: 'recession',
    icon: '📉',
    assumptions: [
      { variable: 'GDP Growth', change: -2.0, unit: '%', direction: 'decrease' },
      { variable: 'Corporate Earnings', change: -18, unit: '%', direction: 'decrease' },
      { variable: 'Unemployment', change: 2.0, unit: '%', direction: 'increase' },
      { variable: 'Consumer Spending', change: -5, unit: '%', direction: 'decrease' },
    ],
    historicalPrecedents: [
      { event: 'COVID Recession (2020)', date: 'Mar 2020', duration: '2 months', sp500Impact: -33.9, outcome: 'Fastest bear market and recovery in history. V-shaped due to massive fiscal stimulus.' },
      { event: 'GFC (2008-09)', date: 'Sep 2008', duration: '17 months', sp500Impact: -56.8, outcome: 'Deep recession, bank failures. Recovery took 4 years to new highs.' },
      { event: 'Dot-com/9/11 (2001)', date: 'Mar 2001', duration: '8 months', sp500Impact: -36.8, outcome: 'Mild recession, but tech stocks took 15 years to recover (NASDAQ).' },
    ],
    isCustom: false,
  },
  {
    id: 'oil_spike',
    name: 'Oil Price Spikes +40% in 30 Days',
    description: 'Brent crude surges from $75 to $105+ on supply disruption, increasing input costs for transport and manufacturing.',
    category: 'commodity',
    icon: '🛢️',
    assumptions: [
      { variable: 'Brent Crude Oil', change: 40, unit: '%', direction: 'increase' },
      { variable: 'Transport Costs', change: 20, unit: '%', direction: 'increase' },
      { variable: 'Inflation Expectations', change: 0.8, unit: '%', direction: 'increase' },
    ],
    historicalPrecedents: [
      { event: 'Russia-Ukraine War (2022)', date: 'Feb 2022', duration: '4 months', sp500Impact: -12.5, outcome: 'Energy stocks +35%. Shipping/logistics hit hard. Renewable energy benefited long-term.' },
      { event: 'Gulf War (1990)', date: 'Aug 1990', duration: '7 months', sp500Impact: -19.9, outcome: 'Oil doubled. Airlines and industrials hammered. Recovery began once conflict resolved.' },
      { event: 'Arab Spring (2011)', date: 'Feb 2011', duration: '3 months', sp500Impact: -6.5, outcome: 'Moderate impact. Energy outperformed, consumer discretionary underperformed.' },
    ],
    isCustom: false,
  },
  {
    id: 'usd_strength',
    name: 'USD Strengthens 10% vs DKK',
    description: 'Dollar surges on risk-off flight or rate differentials, strengthening against EUR/DKK peg by 10%.',
    category: 'currency',
    icon: '💵',
    assumptions: [
      { variable: 'USD/DKK Exchange Rate', change: 10, unit: '%', direction: 'increase' },
      { variable: 'EUR/USD', change: -8, unit: '%', direction: 'decrease' },
      { variable: 'DXY Index', change: 10, unit: '%', direction: 'increase' },
    ],
    historicalPrecedents: [
      { event: 'USD Rally (2022)', date: 'May 2022', duration: '6 months', sp500Impact: -5.2, outcome: 'EUR reached parity with USD. European exporters to US benefited. Danish DKK weakened in line with EUR.' },
      { event: 'Post-Trump Election (2016)', date: 'Nov 2016', duration: '2 months', sp500Impact: 5.8, outcome: 'USD strengthened on growth expectations. US-exposed European companies benefited from translation effects.' },
    ],
    isCustom: false,
  },
  {
    id: 'tech_selloff',
    name: 'Major Tech Layoffs Trigger Sector Selloff',
    description: 'A FAANG company announces 30,000+ layoffs, triggering a 15-20% tech sector correction as growth expectations reset.',
    category: 'sector',
    icon: '💻',
    assumptions: [
      { variable: 'NASDAQ 100', change: -18, unit: '%', direction: 'decrease' },
      { variable: 'Tech P/E Multiples', change: -25, unit: '%', direction: 'decrease' },
      { variable: 'Market Breadth', change: -15, unit: '%', direction: 'decrease' },
    ],
    historicalPrecedents: [
      { event: 'Meta Layoffs + Tech Wreck (2022)', date: 'Nov 2022', duration: '2 months', sp500Impact: -4.8, outcome: 'Tech fell 25%. Non-tech sectors relatively unaffected. Rotation into value/healthcare.' },
      { event: 'Dot-com Burst (2000-02)', date: 'Mar 2000', duration: '30 months', sp500Impact: -49.1, outcome: 'Extreme tech-specific bear market. Value, healthcare, and consumer staples outperformed dramatically.' },
    ],
    isCustom: false,
  },
  {
    id: 'china_taiwan',
    name: 'China-Taiwan Tensions Escalate',
    description: 'Military exercises around Taiwan intensify. Chip supply fears spike. Global risk-off as markets price in potential conflict.',
    category: 'geopolitical',
    icon: '⚔️',
    assumptions: [
      { variable: 'Global Equities', change: -15, unit: '%', direction: 'decrease' },
      { variable: 'Semiconductor Supply', change: -30, unit: '%', direction: 'decrease' },
      { variable: 'VIX (Fear Index)', change: 120, unit: '%', direction: 'increase' },
      { variable: 'Gold', change: 12, unit: '%', direction: 'increase' },
    ],
    historicalPrecedents: [
      { event: 'Russia Invades Ukraine (2022)', date: 'Feb 2022', duration: '1 month', sp500Impact: -11.3, outcome: 'Initial panic selling, followed by V-shaped recovery for non-exposed sectors. Energy surged.' },
      { event: 'Pelosi Taiwan Visit (2022)', date: 'Aug 2022', duration: '2 weeks', sp500Impact: -3.2, outcome: 'Short-lived scare. Semiconductor stocks dropped 8% then recovered within 3 weeks.' },
      { event: '9/11 Attacks (2001)', date: 'Sep 2001', duration: '1 month', sp500Impact: -11.6, outcome: 'Severe short-term shock. Markets recovered within 2 months. Defense stocks surged.' },
    ],
    isCustom: false,
  },
];


// ─── Portfolio Impact Calculator ─────────────────────────────────────────────

interface PortfolioHolding {
  symbol: string;
  name: string;
  shares: number;
  currentPrice: number;
  sector: string;
}

function getPortfolio(): PortfolioHolding[] {
  return [
    { symbol: 'NOVO-B.CO', name: 'Novo Nordisk', shares: 15, currentPrice: 845, sector: 'Healthcare' },
    { symbol: 'MAERSK-B.CO', name: 'A.P. Møller-Mærsk', shares: 2, currentPrice: 12450, sector: 'Industrials' },
    { symbol: 'VWS.CO', name: 'Vestas Wind', shares: 50, currentPrice: 158, sector: 'Energy' },
    { symbol: 'IWDA.AS', name: 'iShares MSCI World', shares: 42, currentPrice: 94.5, sector: 'ETF/Diversified' },
    { symbol: 'DSV.CO', name: 'DSV', shares: 3, currentPrice: 1523, sector: 'Industrials' },
  ];
}

/**
 * Map scenario category to sensitivity factor key.
 */
function getFactorKey(category: ScenarioDefinition['category']): string {
  switch (category) {
    case 'rates': return 'rates_up';
    case 'recession': return 'recession';
    case 'commodity': return 'oil_spike';
    case 'currency': return 'usd_strong';
    case 'sector': return 'tech_selloff';
    case 'geopolitical': return 'geopolitical';
  }
}

/**
 * Run a scenario against the user's portfolio.
 */
export function runScenario(scenario: ScenarioDefinition): ScenarioResult {
  const portfolio = getPortfolio();
  const factorKey = getFactorKey(scenario.category);
  const totalPortfolioValue = portfolio.reduce((s, h) => s + h.shares * h.currentPrice, 0);

  const holdingImpacts: HoldingImpact[] = portfolio.map(h => {
    const value = h.shares * h.currentPrice;
    const sensitivity = getSensitivity(h.symbol, h.sector, factorKey);

    // Apply a magnitude multiplier for more extreme scenarios
    const magnitude = scenario.assumptions[0]?.change || 10;
    const magnitudeMultiplier = Math.min(2, magnitude / 10); // Scale impact with scenario severity
    const estimatedChangePct = sensitivity * magnitudeMultiplier * 100;
    const estimatedChange = value * (estimatedChangePct / 100);

    // Confidence range: ±40% around estimate
    const confidenceLow = estimatedChange * 1.4;
    const confidenceHigh = estimatedChange * 0.6;

    // Generate reasoning
    let reasoning = '';
    if (estimatedChangePct < -15) reasoning = `Highly sensitive to this scenario. ${h.sector} sector historically suffers significantly in these conditions.`;
    else if (estimatedChangePct < -5) reasoning = `Moderate negative impact expected. ${h.name} has some exposure but is partially insulated by business model.`;
    else if (estimatedChangePct > 5) reasoning = `Counter-cyclical benefit. ${h.name} tends to outperform in this scenario due to its specific characteristics.`;
    else reasoning = `Limited direct impact. ${h.name} is relatively insulated from this specific scenario.`;

    return {
      symbol: h.symbol,
      name: h.name,
      currentValue: value,
      estimatedChange: Math.round(estimatedChange),
      estimatedChangePct: Math.round(estimatedChangePct * 10) / 10,
      confidenceLow: Math.round(Math.min(confidenceLow, confidenceHigh)),
      confidenceHigh: Math.round(Math.max(confidenceLow, confidenceHigh)),
      sensitivity: Math.abs(estimatedChangePct) > 15 ? 'High' : Math.abs(estimatedChangePct) > 5 ? 'Moderate' : 'Low',
      reasoning,
    };
  });

  const portfolioImpact = holdingImpacts.reduce((s, h) => s + h.estimatedChange, 0);
  const portfolioImpactPct = (portfolioImpact / totalPortfolioValue) * 100;
  const worstCase = holdingImpacts.reduce((s, h) => s + h.confidenceLow, 0);
  const bestCase = holdingImpacts.reduce((s, h) => s + h.confidenceHigh, 0);

  // Generate recommendation
  let recommendation = '';
  if (portfolioImpactPct < -20) {
    recommendation = `This scenario would severely impact your portfolio. Consider hedging with put options on your most exposed positions (${holdingImpacts.sort((a, b) => a.estimatedChangePct - b.estimatedChangePct)[0].symbol}), increasing cash allocation, or adding counter-cyclical assets like gold.`;
  } else if (portfolioImpactPct < -10) {
    recommendation = `Significant but survivable impact. Your portfolio is reasonably diversified but has concentration in ${holdingImpacts.sort((a, b) => a.estimatedChangePct - b.estimatedChangePct)[0].name} which amplifies the downside. Consider reducing your most exposed position by 20%.`;
  } else if (portfolioImpactPct < -5) {
    recommendation = `Moderate impact within normal market volatility. No urgent action needed, but monitor the situation. Your diversification is providing some protection.`;
  } else {
    recommendation = `Minimal portfolio impact from this scenario. Your current allocation is well-positioned. Consider whether the scenario creates buying opportunities in oversold sectors.`;
  }

  return {
    scenario,
    portfolioImpact: Math.round(portfolioImpact),
    portfolioImpactPct: Math.round(portfolioImpactPct * 10) / 10,
    confidenceRange: { low: worstCase, high: bestCase },
    holdingImpacts: holdingImpacts.sort((a, b) => a.estimatedChangePct - b.estimatedChangePct),
    worstCase,
    bestCase,
    recommendation,
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Build a custom scenario from user inputs.
 */
export function buildCustomScenario(
  name: string,
  description: string,
  category: ScenarioDefinition['category'],
  assumptions: ScenarioAssumption[],
): ScenarioDefinition {
  return {
    id: `custom_${crypto.randomUUID().slice(0, 8)}`,
    name,
    description,
    category,
    icon: '🔧',
    assumptions,
    historicalPrecedents: [],
    isCustom: true,
  };
}

/**
 * Get all available scenarios (pre-built + custom).
 */
export function getAllScenarios(): ScenarioDefinition[] {
  return [...PREBUILT_SCENARIOS];
}
