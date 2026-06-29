import { Controller, Get, Post, Patch, Delete, Body, Param, Req, HttpCode } from '@nestjs/common';
import { PortfoliosService } from './portfolios.service';

interface CreatePortfolioDto {
  name: string;
  description?: string;
  portfolioType?: 'investment' | 'retirement' | 'watchlist' | 'paper_trade';
  currency?: string;
  benchmarkSymbol?: string;
}

interface AddHoldingDto {
  symbol: string;
  quantity: number;
  costBasis: number;
  purchaseDate?: string;
  notes?: string;
}

interface UpdateHoldingDto {
  quantity?: number;
  costBasis?: number;
  notes?: string;
}

@Controller('portfolios')
export class PortfoliosController {
  constructor(private readonly service: PortfoliosService) {}

  @Get()
  async listPortfolios(@Req() req: any) {
    const userId = req.headers['x-user-id'] ?? 'demo-user';
    const portfolios = await this.service.listByUser(userId);
    return { data: portfolios };
  }

  @Post()
  async createPortfolio(@Body() body: CreatePortfolioDto, @Req() req: any) {
    const userId = req.headers['x-user-id'] ?? 'demo-user';
    const portfolio = await this.service.create(userId, body);
    return { data: portfolio };
  }

  @Get(':id')
  async getPortfolio(@Param('id') id: string, @Req() req: any) {
    const userId = req.headers['x-user-id'] ?? 'demo-user';
    const portfolio = await this.service.getDetail(id, userId);
    return { data: portfolio };
  }

  @Patch(':id')
  async updatePortfolio(@Param('id') id: string, @Body() body: Partial<CreatePortfolioDto>, @Req() req: any) {
    const userId = req.headers['x-user-id'] ?? 'demo-user';
    const portfolio = await this.service.update(id, userId, body);
    return { data: portfolio };
  }

  @Delete(':id')
  @HttpCode(204)
  async deletePortfolio(@Param('id') id: string, @Req() req: any) {
    const userId = req.headers['x-user-id'] ?? 'demo-user';
    await this.service.delete(id, userId);
  }

  // --- Holdings ---

  @Post(':id/holdings')
  async addHolding(@Param('id') portfolioId: string, @Body() body: AddHoldingDto, @Req() req: any) {
    const userId = req.headers['x-user-id'] ?? 'demo-user';
    const holding = await this.service.addHolding(portfolioId, userId, body);
    return { data: holding };
  }

  @Patch(':id/holdings/:holdingId')
  async updateHolding(
    @Param('id') portfolioId: string,
    @Param('holdingId') holdingId: string,
    @Body() body: UpdateHoldingDto,
    @Req() req: any,
  ) {
    const userId = req.headers['x-user-id'] ?? 'demo-user';
    const holding = await this.service.updateHolding(portfolioId, holdingId, userId, body);
    return { data: holding };
  }

  @Delete(':id/holdings/:holdingId')
  @HttpCode(204)
  async removeHolding(
    @Param('id') portfolioId: string,
    @Param('holdingId') holdingId: string,
    @Req() req: any,
  ) {
    const userId = req.headers['x-user-id'] ?? 'demo-user';
    await this.service.removeHolding(portfolioId, holdingId, userId);
  }
}
