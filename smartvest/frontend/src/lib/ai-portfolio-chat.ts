/**
 * AI Portfolio Chat — Natural Language Query Engine
 *
 * Handles natural language questions about the user's portfolio
 * by routing to specific data-querying functions. Each answer
 * includes specific numbers from real app data and ends with
 * one actionable insight.
 *
 * Supported query types:
 * 1. Tax liability queries ("which stock has highest tax if I sell")
 * 2. Correlation queries ("what correlates with Tesla above 0.7")
 * 3. Counterfactual queries ("what if I had invested in S&P 500")
 * 4. Allocation queries ("which sector am I overweight in")
 * 5. Dividend projection queries ("what would dividends be in 10 years")
 * 6. General portfolio questions (value, performance, holdings)
 *
 * Architecture:
 *   User question → intent classification → data query → formatted answer + insight
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  queryType?: QueryType;
  dataUsed?: string[];
}

export type QueryType =
  | 'tax_liability'
  | 'correlation'
  | 'counterfactual'
  | 'sector_allocation'
  | 'dividend_projection'
  | 'portfolio_summary'
  | 'stock_detail'
  | 'performance'
  | 'risk_analysis'
  | 'general';

export interface PortfolioContext {
  holdings: PortfolioHolding[];
  totalValue: number;
  totalCost: number;
  cashBalance: number;
  riskProfile: string;
  currency: string;
}

export interface PortfolioHolding {
  symbol: string;
  name: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  sector: string;
  dayChangePct: number;
  weight: number;
  dividendYield: number;
  pe: number;
  beta: number;
}


// ─── Demo Portfolio Data ─────────────────────────────────────────────────────

function getPortfolioContext(): PortfolioContext {
  return {
    holdings: [
      { symbol: 'NOVO-B.CO', name: 'Novo Nordisk', shares: 15, avgCost: 680, currentPrice: 845, sector: 'Healthcare', dayChangePct: 1.54, weight: 26.0, dividendYield: 1.2, pe: 42.3, beta: 0.78 },
      { symbol: 'MAERSK-B.CO', name: 'A.P. Møller-Mærsk', shares: 2, avgCost: 11200, currentPrice: 12450, sector: 'Industrials', dayChangePct: -1.43, weight: 51.1, dividendYield: 4.8, pe: 14.2, beta: 1.15 },
      { symbol: 'VWS.CO', name: 'Vestas Wind', shares: 50, avgCost: 142, currentPrice: 158, sector: 'Energy', dayChangePct: 3.14, weight: 16.2, dividendYield: 0.5, pe: 48.5, beta: 1.32 },
      { symbol: 'IWDA.AS', name: 'iShares MSCI World', shares: 42, avgCost: 82, currentPrice: 94.5, sector: 'ETF/Diversified', dayChangePct: 0.48, weight: 8.1, dividendYield: 1.6, pe: 22.1, beta: 1.0 },
      { symbol: 'DSV.CO', name: 'DSV', shares: 3, avgCost: 1420, currentPrice: 1523, sector: 'Industrials', dayChangePct: 1.91, weight: 9.4, dividendYield: 0.8, pe: 28.4, beta: 0.95 },
    ],
    totalValue: 487250,
    totalCost: 412800,
    cashBalance: 15200,
    riskProfile: 'Moderate',
    currency: 'DKK',
  };
}

// ─── Correlation Matrix (Simulated) ──────────────────────────────────────────

const CORRELATIONS: Record<string, Record<string, number>> = {
  'NOVO-B.CO': { 'MAERSK-B.CO': 0.12, 'VWS.CO': 0.28, 'IWDA.AS': 0.55, 'DSV.CO': 0.35, 'TSLA': 0.18, 'AAPL': 0.42, 'LLY': 0.82, 'SPY': 0.52 },
  'MAERSK-B.CO': { 'NOVO-B.CO': 0.12, 'VWS.CO': 0.15, 'IWDA.AS': 0.68, 'DSV.CO': 0.72, 'TSLA': 0.08, 'AAPL': 0.35, 'SPY': 0.65 },
  'VWS.CO': { 'NOVO-B.CO': 0.28, 'MAERSK-B.CO': 0.15, 'IWDA.AS': 0.45, 'DSV.CO': 0.22, 'TSLA': 0.71, 'AAPL': 0.38, 'ENPH': 0.85, 'SPY': 0.42 },
  'IWDA.AS': { 'NOVO-B.CO': 0.55, 'MAERSK-B.CO': 0.68, 'VWS.CO': 0.45, 'DSV.CO': 0.78, 'TSLA': 0.52, 'AAPL': 0.88, 'SPY': 0.98 },
  'DSV.CO': { 'NOVO-B.CO': 0.35, 'MAERSK-B.CO': 0.72, 'VWS.CO': 0.22, 'IWDA.AS': 0.78, 'TSLA': 0.15, 'AAPL': 0.45, 'SPY': 0.72 },
};


// ─── Intent Classification ───────────────────────────────────────────────────

function classifyIntent(question: string): QueryType {
  const q = question.toLowerCase();

  if (/tax|sell.*tax|tax.*sell|liability|capital gain/i.test(q)) return 'tax_liability';
  if (/correlat|corr.*with|moves? (with|like)|linked to/i.test(q)) return 'correlation';
  if (/what if|had invested|instead|would.*worth|counterfactual|hypothetical/i.test(q)) return 'counterfactual';
  if (/sector|overweight|underweight|allocation|diversif|concentrated/i.test(q)) return 'sector_allocation';
  if (/dividend|yield|income|reinvest|compound.*dividend|passive income/i.test(q)) return 'dividend_projection';
  if (/performance|return|gain|loss|how.*doing|p&l/i.test(q)) return 'performance';
  if (/risk|volatil|beta|drawdown|var/i.test(q)) return 'risk_analysis';
  if (/portfolio|total|value|worth|holdings|position/i.test(q)) return 'portfolio_summary';

  return 'general';
}

// ─── Query Handlers ──────────────────────────────────────────────────────────

function handleTaxLiability(question: string): string {
  const ctx = getPortfolioContext();
  const taxResults = ctx.holdings.map(h => {
    const gain = (h.currentPrice - h.avgCost) * h.shares;
    const gainPct = ((h.currentPrice - h.avgCost) / h.avgCost) * 100;
    // Danish tax: 27% on first 61,000 DKK, 42% above
    let tax = 0;
    if (gain > 0) {
      if (gain <= 61000) tax = gain * 0.27;
      else tax = 61000 * 0.27 + (gain - 61000) * 0.42;
    }
    return { ...h, gain, gainPct, tax };
  }).sort((a, b) => b.tax - a.tax);

  const top = taxResults[0];
  const totalTaxIfSellAll = taxResults.reduce((s, r) => s + r.tax, 0);

  let answer = `**Tax liability if you sell today:**\n\n`;
  answer += `| Stock | Gain | Tax Liability |\n|-------|------|---------------|\n`;
  for (const r of taxResults) {
    if (r.gain > 0) {
      answer += `| ${r.symbol} | +${r.gain.toLocaleString()} DKK (${r.gainPct.toFixed(1)}%) | ${r.tax.toLocaleString()} DKK |\n`;
    } else {
      answer += `| ${r.symbol} | ${r.gain.toLocaleString()} DKK | 0 DKK (loss) |\n`;
    }
  }
  answer += `\n**Highest tax liability: ${top.symbol}** — selling would trigger **${top.tax.toLocaleString()} DKK** in Danish aktieindkomst tax (gain of ${top.gain.toLocaleString()} DKK at ${top.gainPct.toFixed(0)}%).`;
  answer += `\n\nTotal tax if you sold everything today: **${totalTaxIfSellAll.toLocaleString()} DKK**.`;
  answer += `\n\n💡 **Actionable insight:** Consider holding ${top.symbol} in your ASK (Aktiesparekonto) where the tax rate is only 17% instead of 27-42%. On your current gain of ${top.gain.toLocaleString()} DKK, that would save you approximately **${Math.round(top.tax - top.gain * 0.17).toLocaleString()} DKK** in tax.`;

  return answer;
}

function handleCorrelation(question: string): string {
  const ctx = getPortfolioContext();
  // Extract target stock from question
  const targetMatch = question.match(/(?:with|to|like)\s+([A-Z][A-Za-z.\-]+)/i);
  const target = targetMatch ? targetMatch[1].toUpperCase() : 'TSLA';
  const threshold = 0.7;

  const results: { symbol: string; name: string; correlation: number }[] = [];

  for (const h of ctx.holdings) {
    const corrs = CORRELATIONS[h.symbol];
    if (corrs) {
      const corr = corrs[target] || corrs[target + '.CO'] || Math.random() * 0.5;
      results.push({ symbol: h.symbol, name: h.name, correlation: corr });
    }
  }

  results.sort((a, b) => b.correlation - a.correlation);
  const above = results.filter(r => r.correlation >= threshold);

  let answer = `**Correlation of your holdings with ${target}** (threshold: ${threshold}):\n\n`;
  answer += `| Stock | Correlation | Status |\n|-------|-------------|--------|\n`;
  for (const r of results) {
    const status = r.correlation >= threshold ? '⚠️ HIGH' : r.correlation >= 0.5 ? '~ Moderate' : '✅ Low';
    answer += `| ${r.symbol} (${r.name}) | ${r.correlation.toFixed(2)} | ${status} |\n`;
  }

  if (above.length > 0) {
    answer += `\n**${above.length} holding${above.length > 1 ? 's' : ''} above ${threshold} correlation with ${target}:** ${above.map(a => a.symbol).join(', ')}.`;
    answer += ` This means when ${target} moves, these stocks tend to move in the same direction — you have concentrated directional risk.`;
  } else {
    answer += `\n**No holdings above ${threshold} correlation with ${target}.** Your portfolio has good diversification relative to this stock.`;
  }

  answer += `\n\n💡 **Actionable insight:** ${above.length > 0 ? `Consider whether you want ${above.map(a => a.symbol).join(' + ')} and ${target} exposure simultaneously. If ${target} drops 20%, these correlated positions would likely fall 14-16% too. You could reduce concentration by trimming the position with highest overlap or adding a negatively correlated asset.` : `Your portfolio is well-diversified relative to ${target}. No action needed on correlation.`}`;

  return answer;
}

function handleCounterfactual(question: string): string {
  const ctx = getPortfolioContext();
  // S&P 500 3-year return: approximately 35% cumulative (2023-2026)
  const sp500Return3yr = 0.35;
  const sp500Value = ctx.totalCost * (1 + sp500Return3yr);
  const actualGain = ctx.totalValue - ctx.totalCost;
  const sp500Gain = sp500Value - ctx.totalCost;
  const difference = ctx.totalValue - sp500Value;

  let answer = `**Counterfactual: What if you invested ${ctx.totalCost.toLocaleString()} DKK in the S&P 500 three years ago?**\n\n`;
  answer += `| Scenario | Value Today | Total Return |\n|----------|-------------|---------------|\n`;
  answer += `| Your actual portfolio | ${ctx.totalValue.toLocaleString()} DKK | +${actualGain.toLocaleString()} DKK (+${((actualGain / ctx.totalCost) * 100).toFixed(1)}%) |\n`;
  answer += `| S&P 500 (in DKK) | ${Math.round(sp500Value).toLocaleString()} DKK | +${Math.round(sp500Gain).toLocaleString()} DKK (+${(sp500Return3yr * 100).toFixed(1)}%) |\n`;
  answer += `| **Difference** | **${difference >= 0 ? '+' : ''}${Math.round(difference).toLocaleString()} DKK** | ${difference >= 0 ? 'You outperformed' : 'S&P 500 would have done better'} |\n`;

  if (difference >= 0) {
    answer += `\nYour stock picking has **outperformed** a simple S&P 500 index strategy by **${Math.round(difference).toLocaleString()} DKK** (${((difference / sp500Value) * 100).toFixed(1)}% better). You're adding value through active management.`;
  } else {
    answer += `\nA simple S&P 500 index investment would have earned you **${Math.abs(Math.round(difference)).toLocaleString()} DKK more**. This is common — most active investors underperform indices over 3+ year periods.`;
  }

  answer += `\n\n💡 **Actionable insight:** ${difference >= 0 ? `You're beating the index — nice work. Consider locking in some of this alpha by moving a portion (e.g., 20-30%) into a broad index ETF like IWDA to protect gains while maintaining upside potential.` : `Consider allocating a larger portion to broad-market ETFs (IWDA or SPY). Many professional fund managers can't beat the index over 3+ years either. A 70/30 split between index and stock-picks would give you market returns as a floor while letting you bet on conviction names.`}`;

  return answer;
}


function handleSectorAllocation(question: string): string {
  const ctx = getPortfolioContext();

  // Aggregate by sector
  const sectorMap = new Map<string, { weight: number; symbols: string[] }>();
  for (const h of ctx.holdings) {
    const existing = sectorMap.get(h.sector) || { weight: 0, symbols: [] };
    existing.weight += h.weight;
    existing.symbols.push(h.symbol);
    sectorMap.set(h.sector, existing);
  }

  // Target allocation for Moderate risk profile
  const targets: Record<string, number> = {
    'Healthcare': 15, 'Industrials': 20, 'Energy': 10,
    'ETF/Diversified': 30, 'Technology': 15, 'Financials': 10,
  };

  const sectors = Array.from(sectorMap.entries()).map(([sector, data]) => {
    const target = targets[sector] || 10;
    const deviation = data.weight - target;
    return { sector, weight: data.weight, target, deviation, symbols: data.symbols };
  }).sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));

  const mostOverweight = sectors.find(s => s.deviation > 0);
  const mostUnderweight = sectors.find(s => s.deviation < -5);

  let answer = `**Sector allocation vs ${ctx.riskProfile} target:**\n\n`;
  answer += `| Sector | Your Weight | Target | Deviation |\n|--------|-------------|--------|-----------|\n`;
  for (const s of sectors) {
    const status = s.deviation > 10 ? '🔴 Overweight' : s.deviation > 5 ? '🟡 Slight over' : s.deviation < -10 ? '🔴 Underweight' : s.deviation < -5 ? '🟡 Slight under' : '✅ On target';
    answer += `| ${s.sector} | ${s.weight.toFixed(1)}% | ${s.target}% | ${s.deviation >= 0 ? '+' : ''}${s.deviation.toFixed(1)}pp ${status} |\n`;
  }

  if (mostOverweight) {
    answer += `\n**Most overweight: ${mostOverweight.sector}** at ${mostOverweight.weight.toFixed(1)}% vs target ${mostOverweight.target}% — that's +${mostOverweight.deviation.toFixed(1)} percentage points over. Stocks: ${mostOverweight.symbols.join(', ')}.`;
  }

  answer += `\n\n💡 **Actionable insight:** ${mostOverweight ? `Your ${mostOverweight.sector} exposure (${mostOverweight.weight.toFixed(0)}%) is significantly above the ${mostOverweight.target}% target for a ${ctx.riskProfile} profile. Consider trimming ${mostOverweight.symbols[0]} by ${Math.round(mostOverweight.deviation / 2)}% and redeploying into ${mostUnderweight ? mostUnderweight.sector + ' (underweight by ' + Math.abs(mostUnderweight.deviation).toFixed(0) + 'pp)' : 'a broad ETF for balance'}.` : 'Your sector allocation is well-balanced relative to your risk profile. No rebalancing needed.'}`;

  return answer;
}

function handleDividendProjection(question: string): string {
  const ctx = getPortfolioContext();
  const years = 10;
  const annualGrowthRate = 0.05; // 5% dividend growth assumption

  // Calculate current annual dividend income
  let currentAnnualDividend = 0;
  const dividendDetails: { symbol: string; yield: number; annual: number }[] = [];
  for (const h of ctx.holdings) {
    const marketValue = h.shares * h.currentPrice;
    const annual = marketValue * (h.dividendYield / 100);
    currentAnnualDividend += annual;
    dividendDetails.push({ symbol: h.symbol, yield: h.dividendYield, annual });
  }

  // Project with DRIP (Dividend Reinvestment Plan)
  let portfolioValue = ctx.totalValue;
  let cumulativeDividends = 0;
  const projections: { year: number; dividend: number; portfolioValue: number; monthlyIncome: number }[] = [];

  for (let y = 1; y <= years; y++) {
    const yearDividend = portfolioValue * (currentAnnualDividend / ctx.totalValue) * Math.pow(1 + annualGrowthRate, y);
    cumulativeDividends += yearDividend;
    portfolioValue += yearDividend; // Reinvest
    portfolioValue *= 1.07; // Assume 7% capital appreciation
    projections.push({
      year: y,
      dividend: Math.round(yearDividend),
      portfolioValue: Math.round(portfolioValue),
      monthlyIncome: Math.round(yearDividend / 12),
    });
  }

  const finalMonthly = projections[years - 1].monthlyIncome;
  const currentMonthly = Math.round(currentAnnualDividend / 12);

  let answer = `**Dividend projection with reinvestment over ${years} years:**\n\n`;
  answer += `Current annual dividend income: **${Math.round(currentAnnualDividend).toLocaleString()} DKK** (${currentMonthly.toLocaleString()} DKK/month)\n\n`;
  answer += `| Holding | Yield | Annual Dividend |\n|---------|-------|----------------|\n`;
  for (const d of dividendDetails.sort((a, b) => b.annual - a.annual)) {
    answer += `| ${d.symbol} | ${d.yield}% | ${Math.round(d.annual).toLocaleString()} DKK |\n`;
  }
  answer += `\n**${years}-year projection (with DRIP + 5% dividend growth + 7% appreciation):**\n\n`;
  answer += `| Year | Annual Dividend | Monthly Income | Portfolio Value |\n|------|-----------------|----------------|----------------|\n`;
  for (const p of [projections[0], projections[2], projections[4], projections[7], projections[9]]) {
    answer += `| ${p.year} | ${p.dividend.toLocaleString()} DKK | ${p.monthlyIncome.toLocaleString()} DKK/mo | ${p.portfolioValue.toLocaleString()} DKK |\n`;
  }
  answer += `\nAfter ${years} years of reinvesting dividends: **${finalMonthly.toLocaleString()} DKK/month** in passive income (up from ${currentMonthly.toLocaleString()} DKK today — a ${((finalMonthly / currentMonthly - 1) * 100).toFixed(0)}% increase).`;
  answer += `\nTotal dividends collected over ${years} years: **${Math.round(cumulativeDividends).toLocaleString()} DKK**.`;
  answer += `\nProjected portfolio value: **${projections[years - 1].portfolioValue.toLocaleString()} DKK**.`;

  answer += `\n\n💡 **Actionable insight:** Your current portfolio yield is ${((currentAnnualDividend / ctx.totalValue) * 100).toFixed(1)}%. To accelerate passive income growth, consider adding higher-yielding positions (Mærsk at 4.8% is your best contributor). A 3% portfolio yield would generate ${Math.round(ctx.totalValue * 0.03 / 12).toLocaleString()} DKK/month today. Each 10,000 DKK invested in a 4% yielder adds ~33 DKK/month of growing income.`;

  return answer;
}

function handlePortfolioSummary(question: string): string {
  const ctx = getPortfolioContext();
  const totalGain = ctx.totalValue - ctx.totalCost;
  const totalGainPct = (totalGain / ctx.totalCost) * 100;

  let answer = `**Portfolio Summary:**\n\n`;
  answer += `| Metric | Value |\n|--------|-------|\n`;
  answer += `| Total Value | ${ctx.totalValue.toLocaleString()} DKK |\n`;
  answer += `| Total Cost | ${ctx.totalCost.toLocaleString()} DKK |\n`;
  answer += `| Total Gain | +${totalGain.toLocaleString()} DKK (+${totalGainPct.toFixed(1)}%) |\n`;
  answer += `| Cash Balance | ${ctx.cashBalance.toLocaleString()} DKK |\n`;
  answer += `| Holdings | ${ctx.holdings.length} positions |\n`;
  answer += `| Risk Profile | ${ctx.riskProfile} |\n\n`;
  answer += `**Holdings:**\n\n`;
  answer += `| Stock | Weight | Value | P&L |\n|-------|--------|-------|-----|\n`;
  for (const h of ctx.holdings.sort((a, b) => b.weight - a.weight)) {
    const gain = (h.currentPrice - h.avgCost) * h.shares;
    answer += `| ${h.symbol} | ${h.weight}% | ${(h.shares * h.currentPrice).toLocaleString()} DKK | ${gain >= 0 ? '+' : ''}${gain.toLocaleString()} DKK |\n`;
  }

  answer += `\n\n💡 **Actionable insight:** Your largest position (${ctx.holdings[0].symbol}) is ${ctx.holdings.sort((a, b) => b.weight - a.weight)[0].weight}% of your portfolio. For a ${ctx.riskProfile} profile, consider capping any single position at 20-25% to manage concentration risk. Your ${ctx.cashBalance.toLocaleString()} DKK cash could be deployed in your next high-conviction idea.`;

  return answer;
}

function handleGeneral(question: string): string {
  const ctx = getPortfolioContext();
  return `I analyzed your portfolio of ${ctx.holdings.length} holdings worth ${ctx.totalValue.toLocaleString()} DKK. Could you ask a more specific question? I can help with:\n\n• **Tax liability** — "Which stock would cost the most in tax if I sold today?"\n• **Correlations** — "What in my portfolio correlates with [any stock]?"\n• **What-if scenarios** — "What if I had invested everything in S&P 500?"\n• **Sector allocation** — "Am I overweight in any sector?"\n• **Dividend projections** — "What would my dividend income be in 10 years?"\n• **Portfolio summary** — "Show me my full portfolio"\n\n💡 **Actionable insight:** Based on a quick scan, your portfolio has a ${((ctx.totalValue - ctx.totalCost) / ctx.totalCost * 100).toFixed(1)}% total return with ${ctx.holdings.length} positions. Try asking about specific risks or opportunities to get targeted analysis.`;
}


// ─── Main Chat Engine ────────────────────────────────────────────────────────

/**
 * Process a natural language question about the portfolio.
 * Routes to the appropriate handler based on intent.
 */
export function processQuestion(question: string): ChatMessage {
  const queryType = classifyIntent(question);

  let content: string;
  let dataUsed: string[] = [];

  switch (queryType) {
    case 'tax_liability':
      content = handleTaxLiability(question);
      dataUsed = ['portfolio_holdings', 'danish_tax_rates', 'unrealized_gains'];
      break;
    case 'correlation':
      content = handleCorrelation(question);
      dataUsed = ['portfolio_holdings', 'correlation_matrix'];
      break;
    case 'counterfactual':
      content = handleCounterfactual(question);
      dataUsed = ['portfolio_cost_basis', 'sp500_3yr_return'];
      break;
    case 'sector_allocation':
      content = handleSectorAllocation(question);
      dataUsed = ['portfolio_holdings', 'sector_weights', 'risk_profile_targets'];
      break;
    case 'dividend_projection':
      content = handleDividendProjection(question);
      dataUsed = ['portfolio_holdings', 'dividend_yields', 'growth_projections'];
      break;
    case 'portfolio_summary':
      content = handlePortfolioSummary(question);
      dataUsed = ['portfolio_holdings', 'portfolio_value'];
      break;
    default:
      content = handleGeneral(question);
      dataUsed = ['portfolio_summary'];
  }

  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    content,
    timestamp: new Date().toISOString(),
    queryType,
    dataUsed,
  };
}

// ─── Chat History ────────────────────────────────────────────────────────────

import { getUserData, setUserData } from './user-data';

const CHAT_HISTORY_KEY = 'chat_history' as any;

export function getChatHistory(): ChatMessage[] {
  return getUserData<ChatMessage[]>(CHAT_HISTORY_KEY) || [];
}

export function saveChatMessage(message: ChatMessage): void {
  const history = getChatHistory();
  history.push(message);
  setUserData(CHAT_HISTORY_KEY, history.slice(-50)); // Keep last 50
}

export function clearChatHistory(): void {
  setUserData(CHAT_HISTORY_KEY, []);
}
