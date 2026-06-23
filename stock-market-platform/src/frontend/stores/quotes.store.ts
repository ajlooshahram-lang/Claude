import { create } from 'zustand';

export interface QuoteData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  lastUpdated: number;
}

interface QuotesState {
  quotes: Map<string, QuoteData>;
  subscriptions: Set<string>;

  updateQuote: (symbol: string, data: Partial<QuoteData>) => void;
  subscribe: (symbols: string[]) => void;
  unsubscribe: (symbols: string[]) => void;
  getQuote: (symbol: string) => QuoteData | undefined;
}

export const useQuotesStore = create<QuotesState>((set, get) => ({
  quotes: new Map(),
  subscriptions: new Set(),

  updateQuote: (symbol, data) =>
    set((state) => {
      const newQuotes = new Map(state.quotes);
      const existing = newQuotes.get(symbol) ?? {
        symbol,
        price: 0,
        change: 0,
        changePercent: 0,
        volume: 0,
        lastUpdated: Date.now(),
      };
      newQuotes.set(symbol, { ...existing, ...data, lastUpdated: Date.now() });
      return { quotes: newQuotes };
    }),

  subscribe: (symbols) =>
    set((state) => {
      const newSubs = new Set(state.subscriptions);
      symbols.forEach((s) => newSubs.add(s.toUpperCase()));
      return { subscriptions: newSubs };
    }),

  unsubscribe: (symbols) =>
    set((state) => {
      const newSubs = new Set(state.subscriptions);
      symbols.forEach((s) => newSubs.delete(s.toUpperCase()));
      return { subscriptions: newSubs };
    }),

  getQuote: (symbol) => get().quotes.get(symbol.toUpperCase()),
}));
