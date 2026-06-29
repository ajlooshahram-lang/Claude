/**
 * Order History persistence.
 *
 * Stores manually-logged buy/sell orders in localStorage.
 * Each order records the stock, shares, price, and date.
 * The app then calculates live gain/loss using current prices.
 */

const STORAGE_KEY = 'smartvest_orders';

export type OrderType = 'buy' | 'sell';

export interface Order {
  id: string;
  type: OrderType;
  symbol: string;
  name: string;
  shares: number;
  pricePerShare: number;
  currency: string;
  totalCost: number;
  date: string;         // ISO timestamp
  notes?: string;
}

export function getOrders(): Order[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addOrder(order: Omit<Order, 'id' | 'date' | 'totalCost'>): Order {
  const orders = getOrders();
  const newOrder: Order = {
    ...order,
    id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
    date: new Date().toISOString(),
    totalCost: order.shares * order.pricePerShare,
  };
  orders.unshift(newOrder); // Most recent first
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  return newOrder;
}

export function removeOrder(id: string): void {
  const orders = getOrders().filter(o => o.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}
