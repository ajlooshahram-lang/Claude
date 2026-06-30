/**
 * RL Shadow Portfolio — Frontend Interface
 *
 * This module provides the frontend data layer for displaying
 * results from a reinforcement learning trading agent.
 *
 * ARCHITECTURE:
 *   Python Backend (trains/runs RL agent)
 *       ↓ REST API
 *   This module (fetches + displays results)
 *       ↓
 *   Shadow Portfolio UI page
 *
 * CURRENT STATE: Uses simulated results to demonstrate the UI.
 * When the Python backend is deployed, replace `getAgentResults()`
 * with a fetch() to /api/v1/rl-agent/results.
 *
 * The RL agent specification is in RL-AGENT-SPEC.md
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgentPosition {
  symbol: string;
  name: string;
  side: 'long' | 'short';
  entryPrice: number;
  currentPrice: number;
  positionSize: number;       // % of shadow portfolio
  shares: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  entryDate: string;
  triggerSignals: SignalTrigger[];
  confidence: number;         // Agent's confidence 0-1
}

export interface SignalTrigger {
  signal: string;
  value: number;
  weight: number;             // How much this influenced the decision
}

export interface PerformanceMetrics {
  totalReturn: number;
  annualizedReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  totalTrades: number;
  avgHoldingDays: number;
}

export interface DailyPnL {
  date: string;
  portfolioValue: number;
  dailyReturn: number;
  cumulativeReturn: number;
}

export interface ComparisonBenchmark {
  name: string;
  totalReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
}

export interface TrainingInfo {
  episodes: number;
  convergenceEpisode: number;
  finalReward: number;
  trainingDuration: string;
  dataWindow: string;
  lastTrained: string;
  status: 'training' | 'converged' | 'running' | 'paused';
}

export interface ShadowPortfolioState {
  agentName: string;
  status: 'live' | 'paused' | 'training';
  positions: AgentPosition[];
  cashPct: number;
  performance: PerformanceMetrics;
  dailyPnL: DailyPnL[];
  comparisons: ComparisonBenchmark[];
  training: TrainingInfo;
  lastUpdated: string;
  disclaimer: string;
}


// ─── Simulated Agent Results ─────────────────────────────────────────────────

/**
 * Get current shadow portfolio state.
 * In production: fetch('/api/v1/rl-agent/results')
 */
export function getShadowPortfolio(): ShadowPortfolioState {
  return {
    agentName: 'SmartVest RL Agent v0.1 (PPO)',
    status: 'live',
    positions: [
      {
        symbol: 'NOVO-B.CO', name: 'Novo Nordisk', side: 'long',
        entryPrice: 812, currentPrice: 845, positionSize: 8.5, shares: 10,
        unrealizedPnL: 330, unrealizedPnLPct: 4.06, entryDate: '2026-06-15',
        triggerSignals: [
          { signal: 'Insider cluster buying', value: 9.2, weight: 0.28 },
          { signal: 'Earnings surprise +8%', value: 8.0, weight: 0.22 },
          { signal: 'Google Trends accelerating', value: 7.5, weight: 0.18 },
          { signal: 'Regime: Grinding Higher', value: 7.0, weight: 0.15 },
          { signal: 'Momentum 30d positive', value: 6.8, weight: 0.17 },
        ],
        confidence: 0.82,
      },
      {
        symbol: 'VWS.CO', name: 'Vestas Wind', side: 'long',
        entryPrice: 148, currentPrice: 158, positionSize: 6.2, shares: 40,
        unrealizedPnL: 400, unrealizedPnLPct: 6.76, entryDate: '2026-06-08',
        triggerSignals: [
          { signal: 'Insider cluster (3 execs)', value: 9.5, weight: 0.30 },
          { signal: 'Sector momentum strong', value: 7.8, weight: 0.20 },
          { signal: 'Alt data: hiring +35%', value: 8.2, weight: 0.25 },
          { signal: 'Order book imbalance 68% bid', value: 6.5, weight: 0.12 },
          { signal: 'RSI oversold bounce', value: 6.0, weight: 0.13 },
        ],
        confidence: 0.78,
      },
      {
        symbol: 'DSV.CO', name: 'DSV', side: 'long',
        entryPrice: 1505, currentPrice: 1523, positionSize: 4.5, shares: 3,
        unrealizedPnL: 54, unrealizedPnLPct: 1.20, entryDate: '2026-06-22',
        triggerSignals: [
          { signal: 'Earnings surprise +3.8%', value: 6.8, weight: 0.25 },
          { signal: 'Institutional flow positive', value: 7.2, weight: 0.25 },
          { signal: 'MACD bullish crossover', value: 6.5, weight: 0.20 },
          { signal: 'Sentiment trend positive', value: 6.0, weight: 0.15 },
          { signal: 'Factor momentum 0.65', value: 5.8, weight: 0.15 },
        ],
        confidence: 0.65,
      },
    ],
    cashPct: 80.8, // Agent is conservative — only 19.2% deployed
    performance: {
      totalReturn: 12.4, annualizedReturn: 18.6, sharpeRatio: 1.85,
      maxDrawdown: -6.2, winRate: 58.3, profitFactor: 1.72,
      avgWin: 4.8, avgLoss: -2.9, totalTrades: 48, avgHoldingDays: 12,
    },
    dailyPnL: generateDailyPnL(),
    comparisons: [
      { name: 'Your Real Portfolio', totalReturn: 18.0, sharpeRatio: 1.42, maxDrawdown: -8.5 },
      { name: 'OMX Copenhagen 25', totalReturn: 14.2, sharpeRatio: 1.15, maxDrawdown: -11.2 },
      { name: '60/40 Global/DK', totalReturn: 12.8, sharpeRatio: 1.05, maxDrawdown: -7.8 },
    ],
    training: {
      episodes: 50000, convergenceEpisode: 32000, finalReward: 1.85,
      trainingDuration: '4h 22min', dataWindow: 'Jun 2021 — Jun 2026',
      lastTrained: '2026-06-28', status: 'running',
    },
    lastUpdated: new Date().toISOString(),
    disclaimer: 'This is a SHADOW portfolio only — no real money is at risk. The RL agent runs on simulated capital to test its strategy before any live deployment. Past simulated performance does not predict future results. The agent makes mistakes and will have losing periods.',
  };
}

function generateDailyPnL(): DailyPnL[] {
  const points: DailyPnL[] = [];
  let value = 100000;
  const now = new Date();
  for (let d = 90; d >= 0; d--) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d);
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    const dailyReturn = (Math.random() - 0.45) * 1.2; // Slight positive bias
    value *= (1 + dailyReturn / 100);
    points.push({
      date: date.toISOString().split('T')[0],
      portfolioValue: Math.round(value),
      dailyReturn: Math.round(dailyReturn * 100) / 100,
      cumulativeReturn: Math.round(((value - 100000) / 100000) * 1000) / 10,
    });
  }
  return points;
}
