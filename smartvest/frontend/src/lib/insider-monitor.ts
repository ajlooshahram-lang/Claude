/**
 * Insider Trading Monitor
 *
 * Tracks insider (Form 4 / PDMR) filings for watchlist stocks:
 * - Last 90 days of insider buy/sell activity
 * - Insider name, role, shares, value
 * - Transaction type classification (open market vs plan sale)
 * - Insider track record (6-month post-trade performance)
 * - Cluster detection (multiple buys in 2-week windows)
 *
 * Data sources:
 *   - SEC Form 4 (US stocks)
 *   - EU Market Abuse Regulation PDMR notifications (European stocks)
 *   - Danish Finanstilsynet insider notifications
 *
 * In production, this would pull from SEC EDGAR API, OpenInsider,
 * or a commercial feed. Demo uses curated sample data.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type TransactionType =
  | 'open_market_buy'
  | 'open_market_sell'
  | 'plan_buy'      // 10b5-1 plan purchase
  | 'plan_sell'     // 10b5-1 plan sale (less meaningful)
  | 'option_exercise'
  | 'gift'
  | 'private_transaction';

export type InsiderRole =
  | 'CEO'
  | 'CFO'
  | 'COO'
  | 'CTO'
  | 'Director'
  | 'VP'
  | 'SVP'
  | 'EVP'
  | '10% Owner'
  | 'General Counsel'
  | 'Other Officer';

export interface InsiderTransaction {
  id: string;
  symbol: string;
  companyName: string;
  insiderName: string;
  insiderRole: InsiderRole;
  transactionType: TransactionType;
  direction: 'buy' | 'sell';
  shares: number;
  pricePerShare: number;
  totalValue: number;
  filingDate: string;         // ISO date
  transactionDate: string;    // ISO date
  sharesOwnedAfter: number;
  source: 'SEC Form 4' | 'EU PDMR' | 'DK Finanstilsynet';
}

export interface InsiderTrackRecord {
  insiderName: string;
  role: InsiderRole;
  totalTransactions: number;
  avgReturn6mo: number;       // Average 6-month return after their trades
  winRate: number;            // % of trades that were profitable at 6mo
  bestTrade: { date: string; return6mo: number };
  worstTrade: { date: string; return6mo: number };
  reliability: 'strong' | 'moderate' | 'weak' | 'insufficient_data';
}

export interface ClusterAlert {
  symbol: string;
  companyName: string;
  insiders: { name: string; role: InsiderRole; value: number; date: string }[];
  windowStart: string;
  windowEnd: string;
  totalValue: number;
  strength: 'very_strong' | 'strong' | 'moderate';
  interpretation: string;
}

export interface StockInsiderSummary {
  symbol: string;
  companyName: string;
  transactions: InsiderTransaction[];
  buyCount: number;
  sellCount: number;
  netBuyValue: number;        // Buys - Sells (positive = net buying)
  clusterAlerts: ClusterAlert[];
  trackRecords: InsiderTrackRecord[];
  signal: 'bullish' | 'neutral' | 'bearish';
  signalExplanation: string;
}

export interface InsiderMonitorData {
  watchlistSummaries: StockInsiderSummary[];
  recentTransactions: InsiderTransaction[];
  clusterAlerts: ClusterAlert[];
  lastUpdated: string;
  totalFilingsTracked: number;
}


// ─── Sample Data ─────────────────────────────────────────────────────────────

const INSIDER_DATA: Record<string, InsiderTransaction[]> = {
  'NOVO-B.CO': [
    { id: '1', symbol: 'NOVO-B.CO', companyName: 'Novo Nordisk', insiderName: 'Lars Fruergaard Jørgensen', insiderRole: 'CEO', transactionType: 'open_market_buy', direction: 'buy', shares: 2000, pricePerShare: 798, totalValue: 1596000, filingDate: '2026-06-15', transactionDate: '2026-06-13', sharesOwnedAfter: 45200, source: 'EU PDMR' },
    { id: '2', symbol: 'NOVO-B.CO', companyName: 'Novo Nordisk', insiderName: 'Karsten Munk Knudsen', insiderRole: 'CFO', transactionType: 'open_market_buy', direction: 'buy', shares: 1500, pricePerShare: 802, totalValue: 1203000, filingDate: '2026-06-16', transactionDate: '2026-06-14', sharesOwnedAfter: 28900, source: 'EU PDMR' },
    { id: '3', symbol: 'NOVO-B.CO', companyName: 'Novo Nordisk', insiderName: 'Camilla Sylvest', insiderRole: 'EVP', transactionType: 'open_market_buy', direction: 'buy', shares: 800, pricePerShare: 805, totalValue: 644000, filingDate: '2026-06-18', transactionDate: '2026-06-17', sharesOwnedAfter: 12400, source: 'EU PDMR' },
    { id: '4', symbol: 'NOVO-B.CO', companyName: 'Novo Nordisk', insiderName: 'Lars Fruergaard Jørgensen', insiderRole: 'CEO', transactionType: 'plan_sell', direction: 'sell', shares: 5000, pricePerShare: 845, totalValue: 4225000, filingDate: '2026-06-25', transactionDate: '2026-06-24', sharesOwnedAfter: 40200, source: 'EU PDMR' },
  ],
  'MAERSK-B.CO': [
    { id: '5', symbol: 'MAERSK-B.CO', companyName: 'A.P. Møller-Mærsk', insiderName: 'Vincent Clerc', insiderRole: 'CEO', transactionType: 'open_market_buy', direction: 'buy', shares: 50, pricePerShare: 11800, totalValue: 590000, filingDate: '2026-05-20', transactionDate: '2026-05-18', sharesOwnedAfter: 380, source: 'DK Finanstilsynet' },
    { id: '6', symbol: 'MAERSK-B.CO', companyName: 'A.P. Møller-Mærsk', insiderName: 'Patrick Jany', insiderRole: 'CFO', transactionType: 'open_market_sell', direction: 'sell', shares: 30, pricePerShare: 12200, totalValue: 366000, filingDate: '2026-06-10', transactionDate: '2026-06-08', sharesOwnedAfter: 95, source: 'DK Finanstilsynet' },
  ],
  'VWS.CO': [
    { id: '7', symbol: 'VWS.CO', companyName: 'Vestas Wind Systems', insiderName: 'Henrik Andersen', insiderRole: 'CEO', transactionType: 'open_market_buy', direction: 'buy', shares: 5000, pricePerShare: 145, totalValue: 725000, filingDate: '2026-04-22', transactionDate: '2026-04-20', sharesOwnedAfter: 82000, source: 'DK Finanstilsynet' },
    { id: '8', symbol: 'VWS.CO', companyName: 'Vestas Wind Systems', insiderName: 'Hans Martin Smith', insiderRole: 'CFO', transactionType: 'open_market_buy', direction: 'buy', shares: 3000, pricePerShare: 147, totalValue: 441000, filingDate: '2026-04-23', transactionDate: '2026-04-21', sharesOwnedAfter: 34500, source: 'DK Finanstilsynet' },
    { id: '9', symbol: 'VWS.CO', companyName: 'Vestas Wind Systems', insiderName: 'Jeanette Kofoed Fridthjof', insiderRole: 'Director', transactionType: 'open_market_buy', direction: 'buy', shares: 2000, pricePerShare: 148, totalValue: 296000, filingDate: '2026-04-25', transactionDate: '2026-04-24', sharesOwnedAfter: 15000, source: 'DK Finanstilsynet' },
  ],
  'DSV.CO': [
    { id: '10', symbol: 'DSV.CO', companyName: 'DSV', insiderName: 'Jens Bjørn Andersen', insiderRole: 'CEO', transactionType: 'plan_sell', direction: 'sell', shares: 8000, pricePerShare: 1485, totalValue: 11880000, filingDate: '2026-06-01', transactionDate: '2026-05-30', sharesOwnedAfter: 142000, source: 'DK Finanstilsynet' },
    { id: '11', symbol: 'DSV.CO', companyName: 'DSV', insiderName: 'Michael Ebbe', insiderRole: 'CFO', transactionType: 'plan_sell', direction: 'sell', shares: 3000, pricePerShare: 1510, totalValue: 4530000, filingDate: '2026-06-05', transactionDate: '2026-06-03', sharesOwnedAfter: 45600, source: 'DK Finanstilsynet' },
  ],
  'ORSTED.CO': [
    { id: '12', symbol: 'ORSTED.CO', companyName: 'Ørsted', insiderName: 'Mads Nipper', insiderRole: 'CEO', transactionType: 'open_market_buy', direction: 'buy', shares: 2500, pricePerShare: 385, totalValue: 962500, filingDate: '2026-06-20', transactionDate: '2026-06-19', sharesOwnedAfter: 18500, source: 'DK Finanstilsynet' },
  ],
};

const TRACK_RECORDS: Record<string, InsiderTrackRecord[]> = {
  'NOVO-B.CO': [
    { insiderName: 'Lars Fruergaard Jørgensen', role: 'CEO', totalTransactions: 12, avgReturn6mo: 14.2, winRate: 83, bestTrade: { date: '2023-11-15', return6mo: 38.5 }, worstTrade: { date: '2024-08-01', return6mo: -4.2 }, reliability: 'strong' },
    { insiderName: 'Karsten Munk Knudsen', role: 'CFO', totalTransactions: 8, avgReturn6mo: 11.8, winRate: 75, bestTrade: { date: '2024-02-10', return6mo: 28.1 }, worstTrade: { date: '2025-01-15', return6mo: -2.8 }, reliability: 'strong' },
    { insiderName: 'Camilla Sylvest', role: 'EVP', totalTransactions: 5, avgReturn6mo: 9.4, winRate: 80, bestTrade: { date: '2024-06-01', return6mo: 22.3 }, worstTrade: { date: '2025-03-20', return6mo: 1.2 }, reliability: 'moderate' },
  ],
  'VWS.CO': [
    { insiderName: 'Henrik Andersen', role: 'CEO', totalTransactions: 9, avgReturn6mo: 8.1, winRate: 67, bestTrade: { date: '2023-06-15', return6mo: 32.4 }, worstTrade: { date: '2024-01-10', return6mo: -18.2 }, reliability: 'moderate' },
    { insiderName: 'Hans Martin Smith', role: 'CFO', totalTransactions: 6, avgReturn6mo: 5.8, winRate: 50, bestTrade: { date: '2024-04-01', return6mo: 24.1 }, worstTrade: { date: '2023-09-15', return6mo: -22.5 }, reliability: 'weak' },
  ],
  'MAERSK-B.CO': [
    { insiderName: 'Vincent Clerc', role: 'CEO', totalTransactions: 4, avgReturn6mo: 2.4, winRate: 50, bestTrade: { date: '2024-03-01', return6mo: 15.2 }, worstTrade: { date: '2025-06-01', return6mo: -12.8 }, reliability: 'insufficient_data' },
  ],
};


// ─── Cluster Detection ───────────────────────────────────────────────────────

/**
 * Detect clusters of insider buying within a 2-week window.
 * This is historically one of the strongest positive signals.
 */
function detectClusters(transactions: InsiderTransaction[]): ClusterAlert[] {
  const alerts: ClusterAlert[] = [];

  // Group by symbol
  const bySymbol = new Map<string, InsiderTransaction[]>();
  for (const t of transactions) {
    if (t.direction === 'buy' && t.transactionType === 'open_market_buy') {
      const existing = bySymbol.get(t.symbol) || [];
      existing.push(t);
      bySymbol.set(t.symbol, existing);
    }
  }

  for (const [symbol, buys] of bySymbol.entries()) {
    if (buys.length < 2) continue;

    // Sort by date
    const sorted = buys.sort((a, b) => new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime());

    // Sliding window: find groups within 14 days
    for (let i = 0; i < sorted.length; i++) {
      const windowStart = new Date(sorted[i].transactionDate).getTime();
      const windowEnd = windowStart + 14 * 24 * 60 * 60 * 1000;

      const inWindow = sorted.filter(t => {
        const d = new Date(t.transactionDate).getTime();
        return d >= windowStart && d <= windowEnd;
      });

      // Need at least 2 DIFFERENT insiders buying
      const uniqueInsiders = new Set(inWindow.map(t => t.insiderName));
      if (uniqueInsiders.size >= 2) {
        const totalValue = inWindow.reduce((s, t) => s + t.totalValue, 0);
        const strength: ClusterAlert['strength'] =
          uniqueInsiders.size >= 4 ? 'very_strong' :
          uniqueInsiders.size >= 3 ? 'strong' : 'moderate';

        // Avoid duplicate alerts for overlapping windows
        const alertKey = `${symbol}-${sorted[i].transactionDate}`;
        if (!alerts.some(a => a.symbol === symbol && a.windowStart === sorted[i].transactionDate)) {
          let interpretation = '';
          if (strength === 'very_strong') {
            interpretation = `${uniqueInsiders.size} different executives bought within 2 weeks, spending a combined ${formatValue(totalValue)}. This level of coordinated insider buying is historically among the strongest bullish signals available — it suggests management collectively believes the stock is undervalued.`;
          } else if (strength === 'strong') {
            interpretation = `${uniqueInsiders.size} executives bought open-market shares within 2 weeks, totaling ${formatValue(totalValue)}. Multiple insiders buying simultaneously suggests strong internal confidence that isn't yet reflected in the stock price.`;
          } else {
            interpretation = `${uniqueInsiders.size} insiders bought shares within a 2-week window (${formatValue(totalValue)} total). While not as strong as 3+ buyers, this still indicates aligned confidence among key decision-makers.`;
          }

          alerts.push({
            symbol,
            companyName: inWindow[0].companyName,
            insiders: inWindow.map(t => ({ name: t.insiderName, role: t.insiderRole, value: t.totalValue, date: t.transactionDate })),
            windowStart: sorted[i].transactionDate,
            windowEnd: new Date(windowEnd).toISOString().split('T')[0],
            totalValue,
            strength,
            interpretation,
          });
        }
      }
    }
  }

  return alerts.sort((a, b) => {
    const strengthOrder = { very_strong: 3, strong: 2, moderate: 1 };
    return strengthOrder[b.strength] - strengthOrder[a.strength];
  });
}

// ─── Signal Generation ───────────────────────────────────────────────────────

function generateSignal(transactions: InsiderTransaction[], clusters: ClusterAlert[]): { signal: StockInsiderSummary['signal']; explanation: string } {
  const openMarketBuys = transactions.filter(t => t.transactionType === 'open_market_buy');
  const openMarketSells = transactions.filter(t => t.transactionType === 'open_market_sell');
  const planSells = transactions.filter(t => t.transactionType === 'plan_sell');

  const buyValue = openMarketBuys.reduce((s, t) => s + t.totalValue, 0);
  const sellValue = openMarketSells.reduce((s, t) => s + t.totalValue, 0);

  if (clusters.length > 0 && clusters[0].strength !== 'moderate') {
    return { signal: 'bullish', explanation: `Cluster buying detected: ${clusters[0].insiders.length} executives bought within 2 weeks. This is one of the strongest insider signals. Plan-based sells (${planSells.length}) are routine and less meaningful.` };
  }

  if (openMarketBuys.length >= 2 && buyValue > sellValue * 2) {
    return { signal: 'bullish', explanation: `Net insider buying with ${openMarketBuys.length} open-market purchases totaling ${formatValue(buyValue)}. Open-market buys are the most meaningful signal — insiders are spending their own money.` };
  }

  if (openMarketSells.length > 0 && sellValue > buyValue * 3) {
    return { signal: 'bearish', explanation: `Significant open-market selling (${formatValue(sellValue)}) outweighs any buying. Open-market sells (not plan-based) are more concerning as they represent active decisions to reduce exposure.` };
  }

  if (planSells.length > 0 && openMarketBuys.length === 0 && openMarketSells.length === 0) {
    return { signal: 'neutral', explanation: `Only plan-based (10b5-1 or equivalent) sales detected. These are pre-scheduled and automated — they do NOT indicate insider concern about the stock. They're typically for tax planning or diversification.` };
  }

  return { signal: 'neutral', explanation: `Mixed activity with no clear directional signal. Some insider buying and selling is normal — look for clusters or large open-market purchases for meaningful signals.` };
}

function formatValue(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M DKK`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K DKK`;
  return `${value.toFixed(0)} DKK`;
}


// ─── Main API ────────────────────────────────────────────────────────────────

/**
 * Get insider activity summary for a single stock.
 */
export function getInsiderSummary(symbol: string): StockInsiderSummary {
  const upper = symbol.toUpperCase();
  const transactions = INSIDER_DATA[upper] || [];
  const trackRecords = TRACK_RECORDS[upper] || [];

  const buys = transactions.filter(t => t.direction === 'buy');
  const sells = transactions.filter(t => t.direction === 'sell');
  const buyValue = buys.reduce((s, t) => s + t.totalValue, 0);
  const sellValue = sells.reduce((s, t) => s + t.totalValue, 0);

  const clusters = detectClusters(transactions);
  const { signal, explanation } = generateSignal(transactions, clusters);

  return {
    symbol: upper,
    companyName: transactions[0]?.companyName || upper,
    transactions,
    buyCount: buys.length,
    sellCount: sells.length,
    netBuyValue: buyValue - sellValue,
    clusterAlerts: clusters,
    trackRecords,
    signal,
    signalExplanation: explanation,
  };
}

/**
 * Get insider monitor data for all watchlist stocks.
 */
export function getInsiderMonitorData(watchlistSymbols: string[]): InsiderMonitorData {
  const summaries = watchlistSymbols.map(s => getInsiderSummary(s));
  const allTransactions = summaries.flatMap(s => s.transactions)
    .sort((a, b) => new Date(b.filingDate).getTime() - new Date(a.filingDate).getTime());
  const allClusters = summaries.flatMap(s => s.clusterAlerts);

  return {
    watchlistSummaries: summaries,
    recentTransactions: allTransactions.slice(0, 20),
    clusterAlerts: allClusters,
    lastUpdated: new Date().toISOString(),
    totalFilingsTracked: allTransactions.length,
  };
}

/**
 * Get default watchlist symbols for demo.
 */
export function getDefaultWatchlist(): string[] {
  return ['NOVO-B.CO', 'MAERSK-B.CO', 'VWS.CO', 'DSV.CO', 'ORSTED.CO'];
}

/**
 * Get the transaction type label in plain English.
 */
export function getTransactionTypeLabel(type: TransactionType): { label: string; meaningful: boolean; explanation: string } {
  switch (type) {
    case 'open_market_buy': return { label: 'Open Market Buy', meaningful: true, explanation: 'The insider spent their own money to buy shares on the open market. This is the most meaningful bullish signal.' };
    case 'open_market_sell': return { label: 'Open Market Sell', meaningful: true, explanation: 'The insider actively chose to sell shares. More meaningful than plan sales, but executives sell for many reasons.' };
    case 'plan_buy': return { label: 'Plan Purchase', meaningful: false, explanation: 'Pre-scheduled automatic purchase under a trading plan. Less meaningful as it was set up in advance.' };
    case 'plan_sell': return { label: 'Plan Sale (10b5-1)', meaningful: false, explanation: 'Pre-scheduled automatic sale under a 10b5-1 plan. This is routine tax planning — NOT a negative signal.' };
    case 'option_exercise': return { label: 'Option Exercise', meaningful: false, explanation: 'Exercising stock options, often part of compensation. Not a trading signal.' };
    case 'gift': return { label: 'Gift', meaningful: false, explanation: 'Shares gifted (to charity, family trust, etc.). Not a trading signal.' };
    case 'private_transaction': return { label: 'Private Transaction', meaningful: false, explanation: 'Private transaction — details may not reveal trading intent.' };
  }
}
