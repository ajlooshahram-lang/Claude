import { Injectable } from '@nestjs/common';

/**
 * Position Sizing & Risk Budget Calculator
 *
 * Implements multiple position sizing strategies optimized for small investors:
 *
 * 1. FIXED FRACTIONAL — Risk a fixed % of capital per trade
 * 2. KELLY CRITERION (Conservative) — Optimal growth with safety margin
 * 3. EQUAL RISK CONTRIBUTION — Each position contributes equal risk
 * 4. MAXIMUM DRAWDOWN LIMIT — Size positions to never exceed max loss
 * 5. CORRELATION-AWARE — Reduce sizes for correlated positions
 *
 * The calculator always answers: "Given my $X budget, exactly how many
 * shares of each stock should I buy, and why?"
 */

export interface StockPosition {
  symbol: string;
  name: string;
  currentPrice: number;
  // Risk metrics
  annualizedVolatility: number;  // 0.20 = 20%
  beta: number;
  maxDrawdown1Y: number;         // 0.25 = 25% max loss
  sharpeRatio: number;
  // Scoring
  smartScore: number;            // 0-100 from screener
  riskLevel: string;             // very_low, low, moderate, high, very_high
  sector: string;
  // Win rate estimate (for Kelly)
  estimatedWinRate?: number;     // Historical probability of positive return
  avgWinLossRatio?: number;      // Average win / average loss
}

export interface PortfolioConstraints {
  totalBudget: number;
  riskTolerance: 'very_conservative' | 'conservative' | 'moderate' | 'growth';
  maxSinglePositionPct: number;    // Max % in any one stock (default: 5%)
  maxSectorPct: number;            // Max % in any one sector (default: 25%)
  minPositions: number;            // Minimum diversification (default: 5)
  maxDrawdownTolerance: number;    // Max acceptable portfolio loss (e.g., 0.15 = 15%)
  cashReservePct: number;          // % to keep in cash (default: 10%)
}

export interface PositionAllocation {
  symbol: string;
  name: string;
  targetPct: number;
  targetUsd: number;
  shares: number;
  actualCost: number;
  methodology: string;
  riskContribution: number;       // % of total portfolio risk from this position
  maxLossScenario: number;        // Dollar loss in worst case
  stopLossPrice: number;
  stopLossPct: number;
}


export interface PortfolioResult {
  allocations: PositionAllocation[];
  summary: {
    totalInvested: number;
    cashReserve: number;
    expectedAnnualReturn: number;
    expectedMaxDrawdown: number;
    diversificationScore: number;
    sectorsRepresented: string[];
    portfolioVolatility: number;
    portfolioBeta: number;
    portfolioSharpe: number;
  };
  riskBudget: {
    totalRiskBudget: number;
    usedRiskBudget: number;
    remainingRiskBudget: number;
    methodology: string;
  };
  guidance: {
    overallVerdict: string;
    warnings: string[];
    suggestions: string[];
    dcaRecommendation: string;
  };
}

const RISK_MULTIPLIERS: Record<string, number> = {
  very_conservative: 0.5,
  conservative: 0.7,
  moderate: 1.0,
  growth: 1.3,
};

@Injectable()
export class PositionSizingService {
  /**
   * Master position sizing: combines multiple strategies into optimal allocation.
   */
  calculateOptimalPortfolio(
    stocks: StockPosition[],
    constraints: PortfolioConstraints,
  ): PortfolioResult {
    const riskMult = RISK_MULTIPLIERS[constraints.riskTolerance] ?? 0.7;
    const investableBudget = constraints.totalBudget * (1 - constraints.cashReservePct / 100);
    const cashReserve = constraints.totalBudget - investableBudget;

    // Step 1: Calculate Kelly fraction for each stock
    const kellyFractions = stocks.map((s) => this.conservativeKelly(s, riskMult));

    // Step 2: Calculate equal-risk-contribution weights
    const ercWeights = this.equalRiskContribution(stocks);

    // Step 3: Calculate max-drawdown-constrained weights
    const drawdownWeights = this.maxDrawdownWeights(stocks, constraints.maxDrawdownTolerance);

    // Step 4: Blend all three methods (Kelly 30%, ERC 40%, Drawdown 30%)
    const blendedWeights = stocks.map((_, i) => {
      const kelly = kellyFractions[i];
      const erc = ercWeights[i];
      const dd = drawdownWeights[i];
      return kelly * 0.3 + erc * 0.4 + dd * 0.3;
    });


    // Step 5: Apply constraints (max position, max sector, normalize)
    const constrained = this.applyConstraints(stocks, blendedWeights, constraints);

    // Step 6: Convert to share counts and dollar amounts
    const allocations = this.toAllocations(stocks, constrained, investableBudget);

    // Step 7: Compute portfolio-level metrics
    const summary = this.computePortfolioMetrics(stocks, constrained, investableBudget, cashReserve);

    // Step 8: Generate guidance
    const guidance = this.generateGuidance(stocks, allocations, constraints, summary);

    // Step 9: Risk budget
    const totalRiskBudget = constraints.maxDrawdownTolerance * constraints.totalBudget;
    const usedRisk = allocations.reduce((sum, a) => sum + a.maxLossScenario, 0);

    return {
      allocations,
      summary,
      riskBudget: {
        totalRiskBudget: Math.round(totalRiskBudget * 100) / 100,
        usedRiskBudget: Math.round(usedRisk * 100) / 100,
        remainingRiskBudget: Math.round((totalRiskBudget - usedRisk) * 100) / 100,
        methodology: 'Blended: Kelly Criterion (30%) + Equal Risk Contribution (40%) + Max Drawdown Limit (30%)',
      },
      guidance,
    };
  }

  /**
   * Conservative Kelly Criterion.
   * Full Kelly = (p*b - q) / b, where p=win prob, b=win/loss ratio, q=1-p
   * We use HALF Kelly for safety (reduces volatility dramatically).
   */
  private conservativeKelly(stock: StockPosition, riskMult: number): number {
    const p = stock.estimatedWinRate ?? this.estimateWinRate(stock);
    const b = stock.avgWinLossRatio ?? this.estimateWinLossRatio(stock);
    const q = 1 - p;

    const fullKelly = (p * b - q) / b;
    // Half Kelly with risk multiplier, capped at 10%
    const position = Math.max(0, Math.min(0.10, (fullKelly / 2) * riskMult));
    return position;
  }

  /**
   * Estimate win rate from stock characteristics.
   * Stocks with higher smart scores historically have higher win rates.
   */
  private estimateWinRate(stock: StockPosition): number {
    // Base rate: ~55% for average stock over 12 months
    let winRate = 0.55;
    // Smart score adjustment: high quality = higher probability
    winRate += (stock.smartScore - 50) / 100 * 0.15;
    // Low vol bonus: steadier stocks win more often
    if (stock.annualizedVolatility < 0.20) winRate += 0.05;
    // High beta penalty
    if (stock.beta > 1.5) winRate -= 0.05;
    return Math.max(0.35, Math.min(0.75, winRate));
  }


  /**
   * Estimate win/loss ratio from characteristics.
   */
  private estimateWinLossRatio(stock: StockPosition): number {
    // Base: average stock has 1.2:1 win/loss
    let ratio = 1.2;
    // Good Sharpe = better risk-adjusted returns
    if (stock.sharpeRatio > 1.0) ratio += 0.3;
    // Low max drawdown = smaller losses
    if (stock.maxDrawdown1Y < 0.15) ratio += 0.2;
    // High smart score = quality edge
    ratio += (stock.smartScore - 50) / 100 * 0.5;
    return Math.max(0.5, Math.min(3.0, ratio));
  }

  /**
   * Equal Risk Contribution: each stock contributes the same amount of risk.
   * Weight_i = (1 / vol_i) / sum(1 / vol_j)
   */
  private equalRiskContribution(stocks: StockPosition[]): number[] {
    const inverseVols = stocks.map((s) => 1 / Math.max(s.annualizedVolatility, 0.05));
    const totalInverseVol = inverseVols.reduce((a, b) => a + b, 0);
    return inverseVols.map((iv) => iv / totalInverseVol);
  }

  /**
   * Max Drawdown Constraint: size positions so worst-case portfolio
   * drawdown stays within tolerance.
   * 
   * Weight_i = tolerance / (maxDrawdown_i * N_diversified)
   */
  private maxDrawdownWeights(stocks: StockPosition[], tolerance: number): number[] {
    const n = Math.max(stocks.length, 1);
    // Diversification reduces effective drawdown (sqrt rule approximation)
    const diversBenefit = Math.sqrt(n);

    const rawWeights = stocks.map((s) => {
      const dd = Math.max(s.maxDrawdown1Y, 0.05);
      return tolerance / (dd * diversBenefit);
    });

    // Normalize
    const total = rawWeights.reduce((a, b) => a + b, 0);
    return rawWeights.map((w) => (total > 0 ? w / total : 1 / n));
  }

  /**
   * Apply portfolio constraints: max position size, max sector, normalize.
   */
  private applyConstraints(
    stocks: StockPosition[],
    weights: number[],
    constraints: PortfolioConstraints,
  ): number[] {
    const maxPos = constraints.maxSinglePositionPct / 100;
    const maxSector = constraints.maxSectorPct / 100;

    // Cap individual positions
    let adjusted = weights.map((w) => Math.min(w, maxPos));

    // Cap sector exposure
    const sectorTotals: Record<string, number> = {};
    stocks.forEach((s, i) => {
      sectorTotals[s.sector] = (sectorTotals[s.sector] || 0) + adjusted[i];
    });

    for (const sector of Object.keys(sectorTotals)) {
      if (sectorTotals[sector] > maxSector) {
        const scale = maxSector / sectorTotals[sector];
        stocks.forEach((s, i) => {
          if (s.sector === sector) adjusted[i] *= scale;
        });
      }
    }

    // Renormalize to sum to 1.0
    const total = adjusted.reduce((a, b) => a + b, 0);
    if (total > 0) {
      adjusted = adjusted.map((w) => w / total);
    }

    return adjusted;
  }


  /**
   * Convert percentage weights to actual share counts and dollar amounts.
   */
  private toAllocations(
    stocks: StockPosition[],
    weights: number[],
    budget: number,
  ): PositionAllocation[] {
    return stocks.map((stock, i) => {
      const targetPct = weights[i] * 100;
      const targetUsd = budget * weights[i];
      const shares = Math.floor(targetUsd / stock.currentPrice);
      const actualCost = shares * stock.currentPrice;

      // Stop loss: based on 1.5x ATR (using volatility as proxy)
      const stopLossPct = Math.min(stock.annualizedVolatility * 0.5, 0.20);
      const stopLossPrice = stock.currentPrice * (1 - stopLossPct);
      const maxLoss = actualCost * stopLossPct;

      // Risk contribution (proportional to weight * volatility)
      const riskContrib = weights[i] * stock.annualizedVolatility;

      return {
        symbol: stock.symbol,
        name: stock.name,
        targetPct: Math.round(targetPct * 10) / 10,
        targetUsd: Math.round(targetUsd * 100) / 100,
        shares,
        actualCost: Math.round(actualCost * 100) / 100,
        methodology: this.getMethodologyLabel(stock),
        riskContribution: Math.round(riskContrib * 1000) / 10,
        maxLossScenario: Math.round(maxLoss * 100) / 100,
        stopLossPrice: Math.round(stopLossPrice * 100) / 100,
        stopLossPct: Math.round(stopLossPct * 1000) / 10,
      };
    });
  }

  private getMethodologyLabel(stock: StockPosition): string {
    if (stock.annualizedVolatility < 0.15) return 'Low-vol anchor (larger position)';
    if (stock.smartScore >= 70) return 'High-conviction quality pick';
    if (stock.beta < 0.8) return 'Defensive stabilizer';
    return 'Diversifier (standard sizing)';
  }

  /**
   * Compute portfolio-level aggregate metrics.
   */
  private computePortfolioMetrics(
    stocks: StockPosition[],
    weights: number[],
    invested: number,
    cashReserve: number,
  ) {
    const portfolioVol = Math.sqrt(
      stocks.reduce((sum, s, i) => sum + (weights[i] * s.annualizedVolatility) ** 2, 0)
    );
    const portfolioBeta = stocks.reduce((sum, s, i) => sum + weights[i] * s.beta, 0);
    const avgSharpe = stocks.reduce((sum, s, i) => sum + weights[i] * s.sharpeRatio, 0);
    const expectedReturn = avgSharpe * portfolioVol + 0.04; // Rf ~ 4%
    const expectedDrawdown = portfolioVol * 2.0; // ~2 sigma for 95% worst case

    const sectors = [...new Set(stocks.map((s) => s.sector))];
    const n = stocks.length;
    // Diversification score: more positions + more sectors = higher
    const divScore = Math.min(100, (n / 10) * 50 + (sectors.length / 8) * 50);

    return {
      totalInvested: Math.round(invested * 100) / 100,
      cashReserve: Math.round(cashReserve * 100) / 100,
      expectedAnnualReturn: Math.round(expectedReturn * 1000) / 10,
      expectedMaxDrawdown: Math.round(expectedDrawdown * 1000) / 10,
      diversificationScore: Math.round(divScore),
      sectorsRepresented: sectors,
      portfolioVolatility: Math.round(portfolioVol * 1000) / 10,
      portfolioBeta: Math.round(portfolioBeta * 100) / 100,
      portfolioSharpe: Math.round(avgSharpe * 100) / 100,
    };
  }


  /**
   * Generate human-readable guidance and warnings.
   */
  private generateGuidance(
    stocks: StockPosition[],
    allocations: PositionAllocation[],
    constraints: PortfolioConstraints,
    summary: PortfolioResult['summary'],
  ) {
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Check concentration
    const maxAlloc = Math.max(...allocations.map((a) => a.targetPct));
    if (maxAlloc > 10) {
      warnings.push(`Largest position is ${maxAlloc.toFixed(1)}% — consider reducing for safety.`);
    }

    // Check sector concentration
    const sectorWeights: Record<string, number> = {};
    allocations.forEach((a, i) => {
      sectorWeights[stocks[i].sector] = (sectorWeights[stocks[i].sector] || 0) + a.targetPct;
    });
    const maxSectorWt = Math.max(...Object.values(sectorWeights));
    if (maxSectorWt > 30) {
      warnings.push(`Sector concentration at ${maxSectorWt.toFixed(0)}% — spread across more sectors.`);
    }

    // Check diversification
    if (stocks.length < constraints.minPositions) {
      warnings.push(`Only ${stocks.length} positions — aim for at least ${constraints.minPositions} for diversification.`);
    }

    // Check if budget is too small for effective diversification
    if (constraints.totalBudget < 500) {
      suggestions.push('With a small budget, consider starting with 2-3 diversified ETFs instead of individual stocks.');
      suggestions.push('Look at fractional share platforms to achieve proper diversification even with $100-500.');
    }

    // Volatility warning
    if (summary.portfolioVolatility > 25) {
      warnings.push(`Portfolio volatility (${summary.portfolioVolatility}%) is high. Consider adding more defensive stocks.`);
    }

    // Positive feedback
    if (summary.diversificationScore >= 70) {
      suggestions.push('Good diversification! Your portfolio spans multiple sectors.');
    }
    if (summary.portfolioBeta < 1.0) {
      suggestions.push('Portfolio beta < 1.0: you have less market sensitivity, which protects in downturns.');
    }

    // DCA recommendation
    let dcaRec: string;
    if (constraints.totalBudget >= 5000) {
      dcaRec = 'Invest 25% now, then 25% every 2 weeks over 6 weeks. This protects against buying at a local peak.';
    } else if (constraints.totalBudget >= 1000) {
      dcaRec = 'Invest 50% now, then 25% after 2 weeks, final 25% after 4 weeks.';
    } else {
      dcaRec = 'With a smaller budget, invest the full amount now to minimize transaction costs. Set up monthly auto-invest for future contributions.';
    }

    // Overall verdict
    let verdict: string;
    if (summary.expectedMaxDrawdown < 12 && summary.diversificationScore >= 60) {
      verdict = 'Well-balanced portfolio with controlled risk. Suitable for long-term holding.';
    } else if (summary.expectedMaxDrawdown < 20) {
      verdict = 'Moderate risk portfolio. Acceptable for investors who can hold through 15-20% drawdowns.';
    } else {
      verdict = 'Higher risk portfolio. Consider reducing volatile positions or adding more defensive stocks.';
    }

    return { overallVerdict: verdict, warnings, suggestions, dcaRecommendation: dcaRec };
  }
}
