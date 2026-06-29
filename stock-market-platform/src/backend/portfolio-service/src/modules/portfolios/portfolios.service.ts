import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Portfolio, Holding, PortfolioSummary, HoldingView } from './entities/portfolio.entity';
import { randomUUID } from 'crypto';

/**
 * In-memory implementation for scaffolding. Production uses TypeORM + PostgreSQL.
 * All ownership checks are enforced here (defense-in-depth with RLS at DB layer).
 */

interface StoredPortfolio extends Portfolio {
  holdings: Holding[];
}

@Injectable()
export class PortfoliosService {
  private readonly portfolios: Map<string, StoredPortfolio> = new Map();

  async listByUser(userId: string): Promise<PortfolioSummary[]> {
    const userPortfolios = Array.from(this.portfolios.values())
      .filter((p) => p.userId === userId);

    return userPortfolios.map((p) => this.toSummary(p));
  }

  async create(userId: string, dto: {
    name: string;
    description?: string;
    portfolioType?: string;
    currency?: string;
    benchmarkSymbol?: string;
  }): Promise<Portfolio> {
    const portfolio: StoredPortfolio = {
      id: randomUUID(),
      userId,
      name: dto.name,
      description: dto.description ?? null,
      portfolioType: (dto.portfolioType as Portfolio['portfolioType']) ?? 'investment',
      currency: dto.currency ?? 'USD',
      benchmarkSymbol: dto.benchmarkSymbol ?? 'SPY',
      isDefault: this.portfolios.size === 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      holdings: [],
    };

    this.portfolios.set(portfolio.id, portfolio);
    return portfolio;
  }

  async getDetail(id: string, userId: string): Promise<{ portfolio: Portfolio; holdings: HoldingView[] }> {
    const portfolio = this.getOwned(id, userId);
    const holdingViews = portfolio.holdings.map((h) => this.toHoldingView(h, portfolio.holdings));
    return { portfolio, holdings: holdingViews };
  }

  async update(id: string, userId: string, dto: Partial<{
    name: string;
    description: string;
    benchmarkSymbol: string;
  }>): Promise<Portfolio> {
    const portfolio = this.getOwned(id, userId);
    if (dto.name) portfolio.name = dto.name;
    if (dto.description !== undefined) portfolio.description = dto.description;
    if (dto.benchmarkSymbol) portfolio.benchmarkSymbol = dto.benchmarkSymbol;
    portfolio.updatedAt = new Date();
    return portfolio;
  }

  async delete(id: string, userId: string): Promise<void> {
    this.getOwned(id, userId);
    this.portfolios.delete(id);
  }

  async addHolding(portfolioId: string, userId: string, dto: {
    symbol: string;
    quantity: number;
    costBasis: number;
    purchaseDate?: string;
    notes?: string;
  }): Promise<Holding> {
    const portfolio = this.getOwned(portfolioId, userId);

    // Check if symbol already exists in portfolio
    const existing = portfolio.holdings.find((h) => h.symbol === dto.symbol.toUpperCase());
    if (existing) {
      // Update existing: weighted average cost basis
      const totalQuantity = existing.quantity + dto.quantity;
      const totalCost = existing.totalCost + dto.quantity * dto.costBasis;
      existing.quantity = totalQuantity;
      existing.avgCostBasis = totalCost / totalQuantity;
      existing.totalCost = totalCost;
      existing.updatedAt = new Date();
      return existing;
    }

    const holding: Holding = {
      id: randomUUID(),
      portfolioId,
      symbolId: randomUUID(), // In production: resolve from symbols table
      symbol: dto.symbol.toUpperCase(),
      quantity: dto.quantity,
      avgCostBasis: dto.costBasis,
      totalCost: dto.quantity * dto.costBasis,
      currency: portfolio.currency,
      firstPurchased: dto.purchaseDate ?? new Date().toISOString().split('T')[0],
      notes: dto.notes ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    portfolio.holdings.push(holding);
    portfolio.updatedAt = new Date();
    return holding;
  }

  async updateHolding(portfolioId: string, holdingId: string, userId: string, dto: {
    quantity?: number;
    costBasis?: number;
    notes?: string;
  }): Promise<Holding> {
    const portfolio = this.getOwned(portfolioId, userId);
    const holding = portfolio.holdings.find((h) => h.id === holdingId);
    if (!holding) throw new NotFoundException('Holding not found');

    if (dto.quantity !== undefined) {
      holding.quantity = dto.quantity;
      holding.totalCost = dto.quantity * holding.avgCostBasis;
    }
    if (dto.costBasis !== undefined) {
      holding.avgCostBasis = dto.costBasis;
      holding.totalCost = holding.quantity * dto.costBasis;
    }
    if (dto.notes !== undefined) holding.notes = dto.notes;
    holding.updatedAt = new Date();
    return holding;
  }

  async removeHolding(portfolioId: string, holdingId: string, userId: string): Promise<void> {
    const portfolio = this.getOwned(portfolioId, userId);
    portfolio.holdings = portfolio.holdings.filter((h) => h.id !== holdingId);
    portfolio.updatedAt = new Date();
  }

  // --- Private helpers ---

  private getOwned(id: string, userId: string): StoredPortfolio {
    const portfolio = this.portfolios.get(id);
    if (!portfolio) throw new NotFoundException('Portfolio not found');
    if (portfolio.userId !== userId) throw new ForbiddenException('Not your portfolio');
    return portfolio;
  }

  private toSummary(p: StoredPortfolio): PortfolioSummary {
    // In production: join with real-time quotes for currentPrice
    const totalCost = p.holdings.reduce((sum, h) => sum + h.totalCost, 0);
    // Simulated current value (in production from market data service)
    const totalValue = totalCost * 1.12; // placeholder: +12%
    return {
      ...p,
      totalValue,
      totalCost,
      totalGainLoss: totalValue - totalCost,
      totalGainLossPercent: totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0,
      dayChange: totalValue * 0.008, // placeholder: +0.8% today
      dayChangePercent: 0.8,
      holdingsCount: p.holdings.length,
    };
  }

  private toHoldingView(h: Holding, allHoldings: Holding[]): HoldingView {
    // Simulated market price (production fetches from market data service)
    const currentPrice = h.avgCostBasis * 1.15; // placeholder: +15%
    const marketValue = h.quantity * currentPrice;
    const totalPortfolioValue = allHoldings.reduce((sum, x) => sum + x.quantity * x.avgCostBasis * 1.15, 0);
    return {
      ...h,
      currentPrice,
      marketValue,
      gainLoss: marketValue - h.totalCost,
      gainLossPercent: h.totalCost > 0 ? ((marketValue - h.totalCost) / h.totalCost) * 100 : 0,
      weight: totalPortfolioValue > 0 ? (marketValue / totalPortfolioValue) * 100 : 0,
      dayChange: marketValue * 0.005,
      dayChangePercent: 0.5,
    };
  }
}
