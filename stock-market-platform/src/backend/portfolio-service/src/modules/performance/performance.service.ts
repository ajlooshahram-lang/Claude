import { Injectable } from '@nestjs/common';

export interface PerformancePoint {
  date: string;
  portfolioValue: number;
  benchmarkValue: number;
  cumulativeReturn: number;
}

export interface PerformanceMetrics {
  totalReturn: number;
  annualizedReturn: number;
  benchmarkReturn: number;
  alpha: number;
  timeSeries: PerformancePoint[];
}

@Injectable()
export class PerformanceService {
  /**
   * Calculate Time-Weighted Return (TWR) for a portfolio.
   * TWR eliminates the effect of cash flows, giving a pure measure
   * of investment skill.
   *
   * In production: uses daily portfolio snapshots from TimescaleDB.
   */
  calculateTWR(snapshots: Array<{ date: string; value: number }>, cashFlows: Array<{ date: string; amount: number }>): number {
    if (snapshots.length < 2) return 0;

    let compoundReturn = 1.0;

    for (let i = 1; i < snapshots.length; i++) {
      const startValue = snapshots[i - 1].value;
      const endValue = snapshots[i].value;

      // Net cash flows in this period
      const periodFlows = cashFlows.filter(
        (cf) => cf.date > snapshots[i - 1].date && cf.date <= snapshots[i].date,
      );
      const netFlow = periodFlows.reduce((sum, cf) => sum + cf.amount, 0);

      // Period return adjusted for cash flows
      const adjustedStart = startValue + netFlow;
      if (adjustedStart <= 0) continue;

      const periodReturn = (endValue - adjustedStart) / adjustedStart;
      compoundReturn *= 1 + periodReturn;
    }

    return (compoundReturn - 1) * 100; // Return as percentage
  }

  /**
   * Annualize a total return over a given number of years.
   */
  annualizeReturn(totalReturnPercent: number, years: number): number {
    if (years <= 0) return 0;
    const totalMultiple = 1 + totalReturnPercent / 100;
    return (Math.pow(totalMultiple, 1 / years) - 1) * 100;
  }

  /**
   * Calculate alpha: portfolio excess return vs. benchmark.
   */
  calculateAlpha(portfolioReturn: number, benchmarkReturn: number, beta: number, riskFreeRate: number): number {
    // Jensen's Alpha = Rp - [Rf + β(Rm - Rf)]
    return portfolioReturn - (riskFreeRate + beta * (benchmarkReturn - riskFreeRate));
  }

  /**
   * Generate a mock performance time series for a given range.
   * In production: queries portfolio.snapshots hypertable.
   */
  async getPerformance(portfolioId: string, range: string, benchmark: string): Promise<PerformanceMetrics> {
    // Generate simulated daily data for the range
    const days = this.rangeToDays(range);
    const timeSeries: PerformancePoint[] = [];

    let portfolioValue = 100000; // Starting value
    let benchmarkValue = 100000;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    for (let i = 0; i <= days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);

      // Random walk with slight upward bias
      portfolioValue *= 1 + (Math.random() - 0.47) * 0.015;
      benchmarkValue *= 1 + (Math.random() - 0.48) * 0.012;

      timeSeries.push({
        date: date.toISOString().split('T')[0],
        portfolioValue: Math.round(portfolioValue * 100) / 100,
        benchmarkValue: Math.round(benchmarkValue * 100) / 100,
        cumulativeReturn: ((portfolioValue - 100000) / 100000) * 100,
      });
    }

    const totalReturn = ((portfolioValue - 100000) / 100000) * 100;
    const benchmarkReturn = ((benchmarkValue - 100000) / 100000) * 100;
    const years = days / 365;

    return {
      totalReturn: Math.round(totalReturn * 100) / 100,
      annualizedReturn: Math.round(this.annualizeReturn(totalReturn, years) * 100) / 100,
      benchmarkReturn: Math.round(benchmarkReturn * 100) / 100,
      alpha: Math.round((totalReturn - benchmarkReturn) * 100) / 100,
      timeSeries,
    };
  }

  private rangeToDays(range: string): number {
    const map: Record<string, number> = {
      '1d': 1, '1w': 7, '1m': 30, '3m': 90, '6m': 180, '1y': 365, 'ytd': 180, 'max': 1095,
    };
    return map[range] ?? 365;
  }
}
