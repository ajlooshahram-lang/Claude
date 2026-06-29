import { Controller, Post, Body, Get } from '@nestjs/common';
import {
  PositionSizingService,
  StockPosition,
  PortfolioConstraints,
  PortfolioResult,
} from './position-sizing.service';

interface CalculateRequest {
  stocks: StockPosition[];
  constraints: Partial<PortfolioConstraints> & { totalBudget: number };
}

@Controller('api/v1/position-sizing')
export class CalculatorController {
  constructor(private readonly positionSizing: PositionSizingService) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'position-sizing', version: '1.0.0' };
  }

  @Post('calculate')
  calculate(@Body() body: CalculateRequest): PortfolioResult {
    const constraints: PortfolioConstraints = {
      totalBudget: body.constraints.totalBudget,
      riskTolerance: body.constraints.riskTolerance ?? 'conservative',
      maxSinglePositionPct: body.constraints.maxSinglePositionPct ?? 5,
      maxSectorPct: body.constraints.maxSectorPct ?? 25,
      minPositions: body.constraints.minPositions ?? 5,
      maxDrawdownTolerance: body.constraints.maxDrawdownTolerance ?? 0.15,
      cashReservePct: body.constraints.cashReservePct ?? 10,
    };

    return this.positionSizing.calculateOptimalPortfolio(body.stocks, constraints);
  }

  @Post('quick-size')
  quickSize(
    @Body() body: { budget: number; stock: StockPosition; riskTolerance?: string },
  ) {
    /**
     * Quick single-stock position sizing.
     * Answer: "I have $X — how many shares of THIS stock should I buy?"
     */
    const { budget, stock, riskTolerance = 'conservative' } = body;
    const riskMult = { very_conservative: 0.5, conservative: 0.7, moderate: 1.0, growth: 1.3 }[
      riskTolerance
    ] ?? 0.7;

    // Max position for a single stock: 5% of budget (conservative)
    const maxPositionPct = 5 * riskMult;
    const maxPositionUsd = budget * (maxPositionPct / 100);

    // Risk-adjusted sizing: use volatility to further limit
    const volAdjusted = maxPositionUsd * (0.20 / Math.max(stock.annualizedVolatility, 0.05));
    const targetUsd = Math.min(maxPositionUsd, volAdjusted);
    const shares = Math.floor(targetUsd / stock.currentPrice);
    const actualCost = shares * stock.currentPrice;

    const stopLossPct = Math.min(stock.annualizedVolatility * 0.5, 0.20);
    const maxLoss = actualCost * stopLossPct;

    return {
      symbol: stock.symbol,
      budget,
      recommendation: {
        shares,
        costPerShare: stock.currentPrice,
        totalCost: Math.round(actualCost * 100) / 100,
        portfolioPct: Math.round((actualCost / budget) * 1000) / 10,
        stopLossPrice: Math.round(stock.currentPrice * (1 - stopLossPct) * 100) / 100,
        stopLossPct: Math.round(stopLossPct * 1000) / 10,
        maxLossDollars: Math.round(maxLoss * 100) / 100,
        maxLossPctOfBudget: Math.round((maxLoss / budget) * 1000) / 10,
      },
      reasoning: shares > 0
        ? `Buy ${shares} shares ($${actualCost.toFixed(2)}) = ${((actualCost / budget) * 100).toFixed(1)}% of your portfolio. ` +
          `Set stop-loss at $${(stock.currentPrice * (1 - stopLossPct)).toFixed(2)} to limit loss to $${maxLoss.toFixed(2)} (${((maxLoss / budget) * 100).toFixed(1)}% of budget).`
        : `This stock at $${stock.currentPrice} is too expensive for your budget with proper risk management. Consider a fractional share or an ETF containing this stock.`,
      warnings: this.generateQuickWarnings(stock, actualCost, budget),
    };
  }

  private generateQuickWarnings(stock: StockPosition, cost: number, budget: number): string[] {
    const warnings: string[] = [];
    if (cost / budget > 0.05) warnings.push('Position exceeds 5% of budget — higher concentration risk.');
    if (stock.beta > 1.5) warnings.push(`Beta=${stock.beta.toFixed(1)}: this stock moves 50%+ more than the market.`);
    if (stock.annualizedVolatility > 0.40) warnings.push('Very volatile: expect 40%+ annual price swings.');
    if (stock.riskLevel === 'high' || stock.riskLevel === 'very_high') warnings.push(`Risk level: ${stock.riskLevel} — consider safer alternatives.`);
    return warnings;
  }
}
