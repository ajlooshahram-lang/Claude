import { Controller, Get, Param } from '@nestjs/common';
import { RiskService } from './risk.service';

@Controller('portfolios')
export class RiskController {
  constructor(private readonly service: RiskService) {}

  @Get(':id/risk')
  async getRisk(@Param('id') portfolioId: string) {
    const data = await this.service.calculateRisk(portfolioId);
    return { data };
  }
}
