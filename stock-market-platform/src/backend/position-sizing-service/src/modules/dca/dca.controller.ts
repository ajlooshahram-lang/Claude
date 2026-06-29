import { Controller, Post, Body } from '@nestjs/common';
import { DCAService, DCAInput, DCASchedule } from './dca.service';

@Controller('api/v1/dca')
export class DCAController {
  constructor(private readonly dcaService: DCAService) {}

  @Post('generate-plan')
  generatePlan(@Body() body: DCAInput): DCASchedule {
    return this.dcaService.generateDCAPlan(body);
  }

  @Post('quick-plan')
  quickPlan(
    @Body() body: { budget: number; monthlyAdd: number; symbols: string[]; prices: number[] },
  ): DCASchedule {
    /**
     * Simplified endpoint: just give budget, monthly contribution, and stock list.
     * Auto-assigns equal weights and moderate settings.
     */
    const stocks = body.symbols.map((symbol, i) => ({
      symbol,
      name: symbol,
      targetPct: 100 / body.symbols.length,
      currentPrice: body.prices[i] ?? 100,
      annualizedVolatility: 0.25, // Default moderate volatility
    }));

    return this.dcaService.generateDCAPlan({
      totalBudget: body.budget,
      monthlyContribution: body.monthlyAdd,
      stocks,
      duration: body.budget >= 5000 ? 'medium' : 'short',
      strategy: 'standard',
    });
  }
}
