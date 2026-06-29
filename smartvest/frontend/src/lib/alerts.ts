/**
 * Price Alert persistence layer.
 *
 * Stores price alerts in localStorage. Each alert has a target price
 * and a direction (above or below). When the live price crosses the
 * target, the alert is marked as triggered.
 */

const STORAGE_KEY = 'smartvest_alerts';

export type AlertDirection = 'above' | 'below';
export type AlertStatus = 'active' | 'triggered';

export interface PriceAlert {
  id: string;
  symbol: string;
  name: string;
  targetPrice: number;
  direction: AlertDirection;  // "above" = notify when price goes above target
  currency: string;
  createdAt: string;
  status: AlertStatus;
  triggeredAt?: string;
  priceWhenSet: number;      // Price at the time the alert was created
}

export function getAlerts(): PriceAlert[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addAlert(alert: Omit<PriceAlert, 'id' | 'createdAt' | 'status'>): PriceAlert {
  const alerts = getAlerts();
  const newAlert: PriceAlert = {
    ...alert,
    id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
    createdAt: new Date().toISOString(),
    status: 'active',
  };
  alerts.push(newAlert);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
  return newAlert;
}

export function removeAlert(id: string): void {
  const alerts = getAlerts().filter(a => a.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
}

export function triggerAlert(id: string): void {
  const alerts = getAlerts().map(a => {
    if (a.id === id && a.status === 'active') {
      return { ...a, status: 'triggered' as AlertStatus, triggeredAt: new Date().toISOString() };
    }
    return a;
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
}

export function getActiveAlerts(): PriceAlert[] {
  return getAlerts().filter(a => a.status === 'active');
}

export function getTriggeredAlerts(): PriceAlert[] {
  return getAlerts().filter(a => a.status === 'triggered');
}

export function checkAlertTriggered(alert: PriceAlert, currentPrice: number): boolean {
  if (alert.status !== 'active') return false;
  if (alert.direction === 'above') return currentPrice >= alert.targetPrice;
  if (alert.direction === 'below') return currentPrice <= alert.targetPrice;
  return false;
}
