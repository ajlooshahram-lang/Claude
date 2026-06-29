/**
 * Stop-Loss persistence.
 *
 * Stores stop-loss levels for portfolio holdings.
 * When the price drops to this level, the app alerts you to sell.
 * (The app does NOT automatically sell — it warns you to take action.)
 */

const STORAGE_KEY = 'smartvest_stop_losses';
const WARNING_KEY = 'smartvest_stoploss_warning_seen';

export interface StopLoss {
  id: string;
  symbol: string;
  name: string;
  stopPrice: number;
  currency: string;
  priceWhenSet: number;
  setAt: string;
  status: 'active' | 'triggered';
  triggeredAt?: string;
}

export function getStopLosses(): StopLoss[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addStopLoss(sl: Omit<StopLoss, 'id' | 'setAt' | 'status'>): StopLoss {
  const list = getStopLosses();
  const newSl: StopLoss = {
    ...sl,
    id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
    setAt: new Date().toISOString(),
    status: 'active',
  };
  list.push(newSl);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return newSl;
}

export function removeStopLoss(id: string): void {
  const list = getStopLosses().filter(sl => sl.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function triggerStopLoss(id: string): void {
  const list = getStopLosses().map(sl => {
    if (sl.id === id && sl.status === 'active') {
      return { ...sl, status: 'triggered' as const, triggeredAt: new Date().toISOString() };
    }
    return sl;
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function getActiveStopLosses(): StopLoss[] {
  return getStopLosses().filter(sl => sl.status === 'active');
}

export function hasSeenWarning(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(WARNING_KEY) === 'true';
}

export function markWarningSeen(): void {
  localStorage.setItem(WARNING_KEY, 'true');
}
