import { Injectable } from '@nestjs/common';

export interface RiskMetrics {
  beta: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  volatility: number;
  valueAtRisk95: number;
  valueAtRisk99: number;
  diversificationScore: number;
  correlationMatrix: Record<string, Record<string, number>>;
  concentrationRisk: {
    topHoldingWeight: number;
    topSectorWeight: number;
    herfindahlIndex: number;
  };
}

@Injectable()
export class RiskService {
  /**
   * Compute portfolio risk metrics.
   * Production: uses historical return series from TimescaleDB + Monte Carlo from ML service.
   */
  async calculateRisk(portfolioId: string): Promise<RiskMetrics> {
    // Simulated metrics for scaffolding
    return {
      beta: 1.12,
      sharpeRatio: 1.45,
      sortinoRatio: 1.82,
      maxDrawdown: -18.3,
      volatility: 22.5,
      valueAtRisk95: -3.2,
      valueAtRisk99: -5.8,
      diversificationScore: 68,
      correlationMatrix: {
        AAPL: { AAPL: 1.0, MSFT: 0.72, GOOGL: 0.65 },
        MSFT: { AAPL: 0.72, MSFT: 1.0, GOOGL: 0.68 },
        GOOGL: { AAPL: 0.65, MSFT: 0.68, GOOGL: 1.0 },
      },
      concentrationRisk: {
        topHoldingWeight: 28.5,
        topSectorWeight: 42.0,
        herfindahlIndex: 0.18,
      },
    };
  }

  /**
   * Calculate portfolio beta against a benchmark.
   * β = Cov(Rp, Rm) / Var(Rm)
   */
  calculateBeta(portfolioReturns: number[], benchmarkReturns: number[]): number {
    if (portfolioReturns.length !== benchmarkReturns.length || portfolioReturns.length < 2) return 1.0;

    const n = portfolioReturns.length;
    const meanP = portfolioReturns.reduce((a, b) => a + b, 0) / n;
    const meanB = benchmarkReturns.reduce((a, b) => a + b, 0) / n;

    let covariance = 0;
    let varianceBenchmark = 0;

    for (let i = 0; i < n; i++) {
      const dp = portfolioReturns[i] - meanP;
      const db = benchmarkReturns[i] - meanB;
      covariance += dp * db;
      varianceBenchmark += db * db;
    }

    covariance /= n - 1;
    varianceBenchmark /= n - 1;

    return varianceBenchmark > 0 ? covariance / varianceBenchmark : 1.0;
  }

  /**
   * Calculate Sharpe Ratio.
   * Sharpe = (Rp - Rf) / σp
   */
  calculateSharpe(annualizedReturn: number, riskFreeRate: number, annualizedVol: number): number {
    if (annualizedVol <= 0) return 0;
    return (annualizedReturn - riskFreeRate) / annualizedVol;
  }

  /**
   * Calculate Sortino Ratio (uses downside deviation only).
   * Sortino = (Rp - Rf) / σ_downside
   */
  calculateSortino(annualizedReturn: number, riskFreeRate: number, returns: number[]): number {
    const downsideReturns = returns.filter((r) => r < 0);
    if (downsideReturns.length === 0) return annualizedReturn > 0 ? 999 : 0;

    const sumSquares = downsideReturns.reduce((sum, r) => sum + r * r, 0);
    const downsideDeviation = Math.sqrt((sumSquares / downsideReturns.length) * 252); // Annualize

    return downsideDeviation > 0 ? (annualizedReturn - riskFreeRate) / downsideDeviation : 0;
  }

  /**
   * Calculate maximum drawdown from equity curve.
   */
  calculateMaxDrawdown(equityCurve: number[]): number {
    if (equityCurve.length < 2) return 0;

    let maxDrawdown = 0;
    let peak = equityCurve[0];

    for (const value of equityCurve) {
      if (value > peak) peak = value;
      const drawdown = (value - peak) / peak;
      if (drawdown < maxDrawdown) maxDrawdown = drawdown;
    }

    return maxDrawdown * 100; // Return as percentage
  }

  /**
   * Calculate Value at Risk (historical method).
   * VaR_α = -percentile(returns, 1-α)
   */
  calculateVaR(returns: number[], confidence: number): number {
    const sorted = [...returns].sort((a, b) => a - b);
    const index = Math.floor((1 - confidence) * sorted.length);
    return -(sorted[index] ?? 0);
  }

  /**
   * Herfindahl-Hirschman Index for concentration.
   * HHI = Σ(wi²), where wi is the weight of each holding.
   * HHI=1 means fully concentrated; HHI=1/N means perfectly diversified.
   */
  calculateHHI(weights: number[]): number {
    return weights.reduce((sum, w) => sum + (w / 100) ** 2, 0);
  }
}
