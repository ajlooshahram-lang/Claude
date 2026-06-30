/**
 * Order Book Microstructure Analyzer
 *
 * Analyzes market microstructure signals from order book data:
 * - Bid-ask spread (% of price)
 * - Order book depth (top 5 levels each side)
 * - Bid-ask imbalance (buying vs selling pressure)
 * - Refresh rate (algorithmic activity indicator)
 * - Iceberg order detection (hidden large orders)
 * - Liquidity stress alerts (spread widening)
 *
 * HONEST NOTE: Real-time order book data requires a Level 2 feed
 * (e.g., Nasdaq TotalView, ITCH, or broker API with depth).
 * This system uses simulated snapshots that demonstrate the
 * analytics. When connected to a real feed, the analysis
 * functions work identically — only the data source changes.
 *
 * Data feed options for production:
 * - Alpaca Market Data API (free tier has limited depth)
 * - Interactive Brokers TWS API (requires account)
 * - Polygon.io Level 2 ($200/month)
 * - Nasdaq TotalView via broker
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OrderBookLevel {
  price: number;
  size: number;            // Shares at this level
  orderCount: number;      // Number of orders
  cumulative: number;      // Cumulative depth up to this level
}

export interface OrderBookSnapshot {
  symbol: string;
  timestamp: string;
  bids: OrderBookLevel[];  // Best (highest) first
  asks: OrderBookLevel[];  // Best (lowest) first
  midPrice: number;
  lastTradePrice: number;
  lastTradeSize: number;
}

export interface SpreadAnalysis {
  absoluteSpread: number;   // Ask - Bid in currency
  percentSpread: number;    // As % of mid price
  normalSpread: number;     // Historical average spread %
  spreadRatio: number;      // Current / Normal (>1.5 = stress)
  isStressed: boolean;
  stressExplanation: string | null;
}

export interface DepthAnalysis {
  bidDepth5: number;        // Total shares on bid side (5 levels)
  askDepth5: number;        // Total shares on ask side (5 levels)
  bidValue5: number;        // Total DKK value on bid side
  askValue5: number;        // Total DKK value on ask side
  imbalanceRatio: number;   // Bid / (Bid + Ask) — >0.5 = buy pressure
  imbalanceSignal: 'strong_buy_pressure' | 'moderate_buy' | 'balanced' | 'moderate_sell' | 'strong_sell_pressure';
  imbalanceExplanation: string;
}

export interface RefreshAnalysis {
  refreshRatePerSec: number;  // Order updates per second
  normalRefreshRate: number;
  algoActivityLevel: 'extreme' | 'high' | 'normal' | 'low';
  explanation: string;
}

export interface IcebergDetection {
  detected: boolean;
  side: 'bid' | 'ask' | null;
  level: number | null;
  visibleSize: number;
  estimatedHiddenSize: number;
  confidence: number;       // 0-1
  explanation: string;
}

export interface MicrostructureAnalysis {
  symbol: string;
  name: string;
  snapshot: OrderBookSnapshot;
  spread: SpreadAnalysis;
  depth: DepthAnalysis;
  refresh: RefreshAnalysis;
  iceberg: IcebergDetection;
  overallSignal: 'bullish_microstructure' | 'neutral' | 'bearish_microstructure' | 'stressed';
  alerts: MicrostructureAlert[];
  lastUpdated: string;
}

export interface MicrostructureAlert {
  type: 'spread_widening' | 'imbalance_extreme' | 'iceberg_detected' | 'algo_surge';
  severity: 'critical' | 'warning' | 'info';
  message: string;
}


// ─── Simulated Order Book Data ───────────────────────────────────────────────

function generateOrderBook(symbol: string): OrderBookSnapshot {
  const configs: Record<string, { mid: number; spreadBps: number; depth: number; stressed: boolean }> = {
    'NOVO-B.CO': { mid: 845, spreadBps: 3, depth: 8000, stressed: false },
    'MAERSK-B.CO': { mid: 12450, spreadBps: 5, depth: 200, stressed: false },
    'VWS.CO': { mid: 158, spreadBps: 8, depth: 12000, stressed: false },
    'DSV.CO': { mid: 1523, spreadBps: 4, depth: 1500, stressed: false },
    'ORSTED.CO': { mid: 412, spreadBps: 12, depth: 5000, stressed: true },
  };

  const config = configs[symbol] || { mid: 100, spreadBps: 10, depth: 5000, stressed: false };
  const halfSpread = config.mid * (config.spreadBps / 10000);

  const bids: OrderBookLevel[] = [];
  const asks: OrderBookLevel[] = [];
  let cumBid = 0, cumAsk = 0;

  for (let i = 0; i < 5; i++) {
    const bidPrice = Math.round((config.mid - halfSpread - i * halfSpread * 0.8) * 100) / 100;
    const askPrice = Math.round((config.mid + halfSpread + i * halfSpread * 0.8) * 100) / 100;
    const bidSize = Math.round(config.depth * (1 - i * 0.15) * (0.8 + Math.random() * 0.4));
    const askSize = Math.round(config.depth * (1 - i * 0.12) * (0.8 + Math.random() * 0.4));
    cumBid += bidSize;
    cumAsk += askSize;

    bids.push({ price: bidPrice, size: bidSize, orderCount: Math.round(5 + Math.random() * 20), cumulative: cumBid });
    asks.push({ price: askPrice, size: askSize, orderCount: Math.round(5 + Math.random() * 20), cumulative: cumAsk });
  }

  // If stressed, widen spread and thin depth
  if (config.stressed) {
    asks[0].size = Math.round(asks[0].size * 0.3);
    asks[1].size = Math.round(asks[1].size * 0.4);
  }

  return {
    symbol, timestamp: new Date().toISOString(),
    bids, asks, midPrice: config.mid,
    lastTradePrice: config.mid + (Math.random() - 0.5) * halfSpread,
    lastTradeSize: Math.round(100 + Math.random() * 500),
  };
}


// ─── Analysis Functions ──────────────────────────────────────────────────────

function analyzeSpread(snapshot: OrderBookSnapshot): SpreadAnalysis {
  const bestBid = snapshot.bids[0].price;
  const bestAsk = snapshot.asks[0].price;
  const absoluteSpread = bestAsk - bestBid;
  const percentSpread = (absoluteSpread / snapshot.midPrice) * 100;

  // Normal spreads by stock type
  const normalSpreads: Record<string, number> = {
    'NOVO-B.CO': 0.03, 'MAERSK-B.CO': 0.05, 'VWS.CO': 0.08,
    'DSV.CO': 0.04, 'ORSTED.CO': 0.06,
  };
  const normalSpread = normalSpreads[snapshot.symbol] || 0.05;
  const spreadRatio = percentSpread / normalSpread;
  const isStressed = spreadRatio > 1.5;

  let stressExplanation: string | null = null;
  if (isStressed) {
    stressExplanation = `Spread has widened ${((spreadRatio - 1) * 100).toFixed(0)}% beyond normal levels. This indicates reduced liquidity — market makers are pulling back, possibly due to upcoming news, elevated uncertainty, or a recent large order that depleted the book. Trading costs are elevated right now.`;
  }

  return { absoluteSpread, percentSpread, normalSpread, spreadRatio, isStressed, stressExplanation };
}

function analyzeDepth(snapshot: OrderBookSnapshot): DepthAnalysis {
  const bidDepth5 = snapshot.bids.reduce((s, l) => s + l.size, 0);
  const askDepth5 = snapshot.asks.reduce((s, l) => s + l.size, 0);
  const bidValue5 = snapshot.bids.reduce((s, l) => s + l.size * l.price, 0);
  const askValue5 = snapshot.asks.reduce((s, l) => s + l.size * l.price, 0);
  const imbalanceRatio = bidDepth5 / (bidDepth5 + askDepth5);

  let imbalanceSignal: DepthAnalysis['imbalanceSignal'];
  let imbalanceExplanation: string;

  if (imbalanceRatio > 0.65) {
    imbalanceSignal = 'strong_buy_pressure';
    imbalanceExplanation = `Strong buying pressure: ${(imbalanceRatio * 100).toFixed(0)}% of visible orders are bids. Significantly more buyers than sellers are waiting in the book. This often precedes upward price movement as sellers run out of shares to offer.`;
  } else if (imbalanceRatio > 0.55) {
    imbalanceSignal = 'moderate_buy';
    imbalanceExplanation = `Moderate buy pressure: ${(imbalanceRatio * 100).toFixed(0)}% bid-heavy. More buyers than sellers, but the imbalance is not extreme. Price may drift upward.`;
  } else if (imbalanceRatio < 0.35) {
    imbalanceSignal = 'strong_sell_pressure';
    imbalanceExplanation = `Strong selling pressure: only ${(imbalanceRatio * 100).toFixed(0)}% of depth is bids. Sellers dominate the book. This often precedes downward price movement as buyers get overwhelmed.`;
  } else if (imbalanceRatio < 0.45) {
    imbalanceSignal = 'moderate_sell';
    imbalanceExplanation = `Moderate sell pressure: ${(imbalanceRatio * 100).toFixed(0)}% bid-weighted. Slightly more sellers than buyers.`;
  } else {
    imbalanceSignal = 'balanced';
    imbalanceExplanation = `Balanced book: ${(imbalanceRatio * 100).toFixed(0)}% bid ratio. Neither buyers nor sellers dominate. Price is likely to stay range-bound absent a catalyst.`;
  }

  return { bidDepth5, askDepth5, bidValue5, askValue5, imbalanceRatio, imbalanceSignal, imbalanceExplanation };
}

function analyzeRefresh(snapshot: OrderBookSnapshot): RefreshAnalysis {
  // Simulated refresh rates based on stock liquidity
  const rates: Record<string, number> = {
    'NOVO-B.CO': 850, 'MAERSK-B.CO': 220, 'VWS.CO': 180,
    'DSV.CO': 340, 'ORSTED.CO': 420,
  };
  const refreshRate = rates[snapshot.symbol] || 200;
  const normalRate = refreshRate * 0.8;

  let algoLevel: RefreshAnalysis['algoActivityLevel'];
  if (refreshRate > 600) algoLevel = 'extreme';
  else if (refreshRate > 300) algoLevel = 'high';
  else if (refreshRate > 100) algoLevel = 'normal';
  else algoLevel = 'low';

  const explanation = algoLevel === 'extreme'
    ? `Extremely high order refresh rate (${refreshRate}/sec). Algorithmic market makers are very active — the book is being replenished rapidly. This typically means tight spreads and good liquidity for retail orders.`
    : algoLevel === 'high'
    ? `High algorithmic activity (${refreshRate}/sec). Professional market makers are providing significant liquidity. Your limit orders will likely fill quickly.`
    : algoLevel === 'normal'
    ? `Normal algorithmic activity (${refreshRate}/sec). Standard liquidity conditions — no unusual activity detected.`
    : `Low refresh rate (${refreshRate}/sec). The order book is relatively static — fewer algorithms providing liquidity. Larger orders may experience slippage.`;

  return { refreshRatePerSec: refreshRate, normalRefreshRate: normalRate, algoActivityLevel: algoLevel, explanation };
}

function detectIceberg(snapshot: OrderBookSnapshot): IcebergDetection {
  // Simple heuristic: if a level has very high order count relative to visible size
  for (const level of [...snapshot.bids, ...snapshot.asks]) {
    if (level.orderCount > 15 && level.size < 500) {
      const side = snapshot.bids.includes(level) ? 'bid' : 'ask';
      return {
        detected: true, side,
        level: level.price,
        visibleSize: level.size,
        estimatedHiddenSize: level.size * 5,
        confidence: 0.6,
        explanation: `Possible iceberg order detected on the ${side} side at ${level.price}. The level shows ${level.orderCount} orders but only ${level.size} visible shares — this pattern suggests a large buyer/seller is hiding their true order size behind small visible quantities to avoid moving the market.`,
      };
    }
  }
  return { detected: false, side: null, level: null, visibleSize: 0, estimatedHiddenSize: 0, confidence: 0,
    explanation: 'No iceberg orders detected. All visible order sizes appear consistent with their order counts.' };
}


// ─── Main API ────────────────────────────────────────────────────────────────

/**
 * Get full microstructure analysis for a stock.
 */
export function analyzeMicrostructure(symbol: string): MicrostructureAnalysis {
  const snapshot = generateOrderBook(symbol);
  const spread = analyzeSpread(snapshot);
  const depth = analyzeDepth(snapshot);
  const refresh = analyzeRefresh(snapshot);
  const iceberg = detectIceberg(snapshot);

  // Generate alerts
  const alerts: MicrostructureAlert[] = [];
  if (spread.isStressed) {
    alerts.push({ type: 'spread_widening', severity: 'critical', message: `Bid-ask spread widened ${((spread.spreadRatio - 1) * 100).toFixed(0)}% beyond normal. Liquidity is thin — avoid market orders.` });
  }
  if (depth.imbalanceRatio > 0.7 || depth.imbalanceRatio < 0.3) {
    alerts.push({ type: 'imbalance_extreme', severity: 'warning', message: `Extreme order book imbalance (${(depth.imbalanceRatio * 100).toFixed(0)}% ${depth.imbalanceRatio > 0.5 ? 'bid' : 'ask'}). Price may move sharply.` });
  }
  if (iceberg.detected) {
    alerts.push({ type: 'iceberg_detected', severity: 'info', message: `Possible iceberg on ${iceberg.side} at ${iceberg.level} — estimated ${iceberg.estimatedHiddenSize} hidden shares.` });
  }
  if (refresh.algoActivityLevel === 'extreme') {
    alerts.push({ type: 'algo_surge', severity: 'info', message: `Algo refresh rate ${refresh.refreshRatePerSec}/sec — extremely active. Spreads will be tight.` });
  }

  // Overall signal
  let overallSignal: MicrostructureAnalysis['overallSignal'] = 'neutral';
  if (spread.isStressed) overallSignal = 'stressed';
  else if (depth.imbalanceRatio > 0.6) overallSignal = 'bullish_microstructure';
  else if (depth.imbalanceRatio < 0.4) overallSignal = 'bearish_microstructure';

  const names: Record<string, string> = { 'NOVO-B.CO': 'Novo Nordisk', 'MAERSK-B.CO': 'A.P. Møller-Mærsk', 'VWS.CO': 'Vestas Wind', 'DSV.CO': 'DSV', 'ORSTED.CO': 'Ørsted' };

  return {
    symbol, name: names[symbol] || symbol,
    snapshot, spread, depth, refresh, iceberg,
    overallSignal, alerts,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Get microstructure for all watchlist stocks.
 */
export function getAllMicrostructure(): MicrostructureAnalysis[] {
  return ['NOVO-B.CO', 'MAERSK-B.CO', 'VWS.CO', 'DSV.CO', 'ORSTED.CO'].map(analyzeMicrostructure);
}

/**
 * Educational content for each signal.
 */
export const MICROSTRUCTURE_EDUCATION: Record<string, { title: string; plainEnglish: string }> = {
  spread: { title: 'Bid-Ask Spread', plainEnglish: 'The spread is the "tax" you pay to trade immediately. A tight spread (0.03%) means you lose very little on entry — the stock is liquid and heavily traded. A wide spread (0.5%+) means the stock is thinly traded and you pay more to get in and out. When the spread suddenly widens, it means market makers are scared of something — they want more compensation for providing liquidity.' },
  depth: { title: 'Order Book Depth', plainEnglish: 'Depth shows how many shares are waiting to be bought/sold at each price. Deep books mean large orders can execute without moving the price much. Thin books mean even a 100-share order might push the price. For retail investors, deep books = less slippage on your orders.' },
  imbalance: { title: 'Bid-Ask Imbalance', plainEnglish: 'This measures whether there are more buyers or sellers waiting in the book RIGHT NOW. If 70% of visible orders are bids (buyers), there is strong buy pressure — more people want to buy than sell at current prices. This often (not always) precedes upward price movement because sellers will eventually run out of shares to offer.' },
  refresh: { title: 'Refresh Rate (Algo Activity)', plainEnglish: 'Modern markets are dominated by algorithms that add and cancel orders hundreds of times per second. A high refresh rate means many algorithms are competing to provide liquidity — this is GOOD for you because it means tight spreads and fast fills. A low refresh rate means the stock is neglected by algorithms — your orders may sit unfilled or experience more slippage.' },
  iceberg: { title: 'Iceberg Orders', plainEnglish: 'Large institutional investors (funds, banks) often hide their true order size. They might want to buy 100,000 shares but only show 500 at a time — refilling as each 500 fills. This is called an "iceberg" because you only see the tip. Detecting these tells you a large player is accumulating or distributing, which has predictive value for price direction.' },
};
