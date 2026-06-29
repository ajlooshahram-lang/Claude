import { Controller, Get, Param, Query } from '@nestjs/common';
import { PerformanceService } from './performance.service';

@Controller('portfolios')
export class PerformanceController {
  constructor(private readonly service: PerformanceService) {}

  @Get(':id/performance')
  async getPerformance(
    @Param('id') portfolioId: string,
    @Query('range') range: string = '1y',
    @Query('benchmark') benchmark: string = 'SPY',
  ) {
    const data = await this.service.getPerformance(portfolioId, range, benchmark);
    return { data };
  }
}
