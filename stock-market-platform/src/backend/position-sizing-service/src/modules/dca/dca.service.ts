import { Injectable } from '@nestjs/common';

/**
 * Dollar-Cost Averaging (DCA) Plan Generator
 *
 * Creates personalized DCA schedules that:
 * 1. Spread purchases over time to reduce timing risk
 * 2. Automatically increase positions in downturns (value averaging)
 * 3. Respect budget constraints
 * 4. Include rebalancing triggers
 */

export interface DCAInput {
  totalBudget: number;
  monthlyContribution: number;
  stocks: Array<{
    symbol: string;
    name: string;
    targetPct: number;          // Target portfolio percentage
    currentPrice: number;
    annualizedVolatility: number;
  }>;
  duration: 'short' | 'medium' | 'long';  // 3mo, 6mo, 12mo
  strategy: 'standard' | 'value_averaging' | 'aggressive_dip';
}

export interface DCASchedule {
  plan: DCAInstallment[];
  summary: {
    totalInvestments: number;
    totalAmount: number;
    averagePerInstallment: number;
    durationWeeks: number;
    strategy: string;
    expectedBenefit: string;
  };
  rules: {
    rebalanceTrigger: string;
    dipBuyRule: string;
    stopRule: string;
    reviewFrequency: string;
  };
}

export interface DCAInstallment {
  week: number;
  date: string;       // Relative "Week 1", "Week 2" etc.
  totalAmount: number;
  allocations: Array<{
    symbol: string;
    amount: number;
    shares: number;  // Approximate shares at current price
    note: string;
  }>;
  cumulativeInvested: number;
}

@Injectable()
export class DCAService {
  generateDCAPlan(input: DCAInput): DCASchedule {
    const durationWeeks = { short: 12, medium: 26, long: 52 }[input.duration] ?? 26;
    const frequency = durationWeeks <= 12 ? 2 : 4; // Bi-weekly for short, monthly for long
    const installmentCount = Math.ceil(durationWeeks / frequency);

    // Determine how to split: lump sum + ongoing contributions
    const lumpSumPortion = input.totalBudget;
    const perInstallmentBase = lumpSumPortion / installmentCount;
    const monthlyAdd = input.monthlyContribution * (frequency / 4); // Scale to frequency

    const plan: DCAInstallment[] = [];
    let cumulative = 0;

    for (let i = 0; i < installmentCount; i++) {
      const week = i * frequency + 1;
      let amount: number;

      if (input.strategy === 'standard') {
        // Equal installments
        amount = perInstallmentBase + (i > 0 ? monthlyAdd : 0);
      } else if (input.strategy === 'value_averaging') {
        // Front-load slightly (40% first, then equal remainder)
        if (i === 0) {
          amount = lumpSumPortion * 0.4 + monthlyAdd;
        } else {
          amount = (lumpSumPortion * 0.6) / (installmentCount - 1) + monthlyAdd;
        }
      } else {
        // aggressive_dip: even split but with dip-buy reserve
        const baseAmount = lumpSumPortion * 0.7 / installmentCount;
        amount = baseAmount + (i > 0 ? monthlyAdd : 0);
        // Reserve 30% for dip-buying (noted in rules)
      }

      amount = Math.round(amount * 100) / 100;
      cumulative += amount;

      // Allocate across stocks by target weight
      const allocations = input.stocks.map((stock) => {
        const stockAmount = amount * (stock.targetPct / 100);
        const shares = Math.floor(stockAmount / stock.currentPrice);
        return {
          symbol: stock.symbol,
          amount: Math.round(stockAmount * 100) / 100,
          shares,
          note: this.getInstallmentNote(i, installmentCount, stock, input.strategy),
        };
      });

      plan.push({
        week,
        date: `Week ${week}`,
        totalAmount: amount,
        allocations,
        cumulativeInvested: Math.round(cumulative * 100) / 100,
      });
    }

    const dipReserve = input.strategy === 'aggressive_dip'
      ? lumpSumPortion * 0.3
      : 0;

    return {
      plan,
      summary: {
        totalInvestments: installmentCount,
        totalAmount: Math.round((cumulative + dipReserve) * 100) / 100,
        averagePerInstallment: Math.round((cumulative / installmentCount) * 100) / 100,
        durationWeeks,
        strategy: input.strategy,
        expectedBenefit: this.getStrategyBenefit(input.strategy),
      },
      rules: {
        rebalanceTrigger: 'Rebalance when any position drifts >5% from target weight.',
        dipBuyRule: input.strategy === 'aggressive_dip'
          ? `Reserve $${dipReserve.toFixed(0)} for dip-buying. Deploy when a stock drops >10% from your average cost.`
          : 'If a quality stock drops >15% on no fundamental change, consider adding to your next installment.',
        stopRule: 'Pause investing if a stock drops >30% — reassess fundamentals before continuing.',
        reviewFrequency: durationWeeks <= 12 ? 'Review positions bi-weekly.' : 'Review positions monthly.',
      },
    };
  }

  private getInstallmentNote(idx: number, total: number, stock: any, strategy: string): string {
    if (idx === 0) return 'Initial position — start building';
    if (idx === total - 1) return 'Final installment — review full position';
    if (stock.annualizedVolatility > 0.30) return 'High-vol stock: check if price is below your average';
    return 'Regular DCA installment';
  }

  private getStrategyBenefit(strategy: string): string {
    switch (strategy) {
      case 'standard':
        return 'Steady, predictable investing. Smooths out price fluctuations over time.';
      case 'value_averaging':
        return 'Front-loads capital deployment. Better returns if market trends up, ' +
          'but slightly more timing risk.';
      case 'aggressive_dip':
        return 'Keeps dry powder for buying dips. Best for volatile markets ' +
          'but requires discipline to deploy reserves.';
      default:
        return 'Automated investing removes emotional decision-making.';
    }
  }
}
