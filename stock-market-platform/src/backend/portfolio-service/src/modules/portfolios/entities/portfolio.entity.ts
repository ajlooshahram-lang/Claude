export interface Portfolio {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  portfolioType: 'investment' | 'retirement' | 'watchlist' | 'paper_trade';
  currency: string;
  benchmarkSymbol: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Holding {
  id: string;
  portfolioId: string;
  symbolId: string;
  symbol: string;
  quantity: number;
  avgCostBasis: number;
  totalCost: number;
  currency: string;
  firstPurchased: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Transaction {
  id: string;
  portfolioId: string;
  holdingId: string | null;
  symbolId: string;
  symbol: string;
  transactionType: 'buy' | 'sell' | 'dividend' | 'split' | 'transfer_in' | 'transfer_out';
  quantity: number;
  price: number;
  totalAmount: number;
  commission: number;
  currency: string;
  executedAt: Date;
  notes: string | null;
  createdAt: Date;
}

export interface PortfolioSummary extends Portfolio {
  totalValue: number;
  totalCost: number;
  totalGainLoss: number;
  totalGainLossPercent: number;
  dayChange: number;
  dayChangePercent: number;
  holdingsCount: number;
}

export interface HoldingView extends Holding {
  currentPrice: number;
  marketValue: number;
  gainLoss: number;
  gainLossPercent: number;
  weight: number;
  dayChange: number;
  dayChangePercent: number;
}
