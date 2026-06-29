/**
 * Admin Dashboard Library
 *
 * Provides aggregate analytics for the admin dashboard WITHOUT exposing
 * any individual user's data. All metrics are computed as totals/averages.
 *
 * Security:
 * - All functions check isAdminSession() before returning data
 * - Individual user portfolios are never exposed — only aggregates
 * - Admin can see user count, system health, popular stocks
 * - Admin CANNOT see individual holdings, balances, or personal info
 */

import { isAdminSession, getAllUsers, UserAccount } from './auth';
import { getDataForUser, getUserStorageSize, UserDataKey } from './user-data';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AdminStats {
  totalUsers: number;
  activeUsersLast7Days: number;
  activeUsersLast30Days: number;
  usersWithPortfolio: number;
  usersCompletedOnboarding: number;
  averageHoldingsPerUser: number;
  totalPortfolioValueAllUsers: number;  // Aggregate — no individual exposed
  registrationsThisMonth: number;
}

export interface PopularStock {
  symbol: string;
  name: string;
  watchlistCount: number;
  holdersCount: number;
}

export interface SystemHealth {
  totalStorageUsedMB: number;
  storageQuotaMB: number;
  storageUtilizationPct: number;
  averageStoragePerUserKB: number;
  largestUserStorageKB: number;
  totalReportsGenerated: number;
  totalOrdersLogged: number;
  totalAlertsConfigured: number;
  appVersion: string;
  lastDeployDate: string;
}

export interface UserSummary {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  lastLoginAt: string;
  isAdmin: boolean;
  onboardingCompleted: boolean;
  storageUsedKB: number;
  holdingsCount: number;
}

export interface AdminDashboardData {
  stats: AdminStats;
  popularStocks: PopularStock[];
  systemHealth: SystemHealth;
  recentUsers: UserSummary[];
  riskProfileDistribution: { profile: string; count: number }[];
}

// ─── Guard ───────────────────────────────────────────────────────────────────

/**
 * Verify admin access. Throws if not admin.
 */
function requireAdmin(): void {
  if (!isAdminSession()) {
    throw new Error('UNAUTHORIZED: Admin access required');
  }
}

// ─── Aggregate Analytics ─────────────────────────────────────────────────────

/**
 * Get aggregate statistics across all users.
 * Individual data is NEVER exposed — only totals and averages.
 */
export function getAdminStats(): AdminStats {
  requireAdmin();

  const users = getAllUsers().filter(u => !u.isAdmin);
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

  let usersWithPortfolio = 0;
  let totalHoldings = 0;
  let totalPortfolioValue = 0;

  for (const user of users) {
    // Check portfolio without exposing individual data
    const portfolio = getDataForUser<{ holdings?: { shares: number; currentPricePerShare: number }[] }>(user.id, 'portfolio');
    if (portfolio?.holdings && portfolio.holdings.length > 0) {
      usersWithPortfolio++;
      totalHoldings += portfolio.holdings.length;
      totalPortfolioValue += portfolio.holdings.reduce(
        (sum, h) => sum + (h.shares || 0) * (h.currentPricePerShare || 0), 0
      );
    }

    // Also check ASK holdings
    const ask = getDataForUser<{ holdings?: { shares: number; currentPricePerShare: number }[] }>(user.id, 'ask_account');
    if (ask?.holdings && ask.holdings.length > 0) {
      if (!portfolio?.holdings?.length) usersWithPortfolio++;
      totalHoldings += ask.holdings.length;
      totalPortfolioValue += ask.holdings.reduce(
        (sum, h) => sum + (h.shares || 0) * (h.currentPricePerShare || 0), 0
      );
    }
  }

  return {
    totalUsers: users.length,
    activeUsersLast7Days: users.filter(u => new Date(u.lastLoginAt).getTime() > sevenDaysAgo).length,
    activeUsersLast30Days: users.filter(u => new Date(u.lastLoginAt).getTime() > thirtyDaysAgo).length,
    usersWithPortfolio,
    usersCompletedOnboarding: users.filter(u => u.onboardingCompleted).length,
    averageHoldingsPerUser: users.length > 0 ? Math.round((totalHoldings / users.length) * 10) / 10 : 0,
    totalPortfolioValueAllUsers: Math.round(totalPortfolioValue),
    registrationsThisMonth: users.filter(u => new Date(u.createdAt).getTime() > monthStart).length,
  };
}

/**
 * Get the most popular stocks across all users' watchlists and portfolios.
 * Does NOT reveal which user holds what — only aggregate counts.
 */
export function getPopularStocks(): PopularStock[] {
  requireAdmin();

  const users = getAllUsers().filter(u => !u.isAdmin);
  const stockMap = new Map<string, { name: string; watchlistCount: number; holdersCount: number }>();

  for (const user of users) {
    // Count watchlist appearances
    const watchlist = getDataForUser<{ symbol: string; name?: string }[]>(user.id, 'watchlist');
    if (Array.isArray(watchlist)) {
      for (const item of watchlist) {
        const existing = stockMap.get(item.symbol) || { name: item.name || item.symbol, watchlistCount: 0, holdersCount: 0 };
        existing.watchlistCount++;
        stockMap.set(item.symbol, existing);
      }
    }

    // Count portfolio holdings
    const portfolio = getDataForUser<{ holdings?: { symbol: string; name?: string }[] }>(user.id, 'portfolio');
    if (portfolio?.holdings) {
      for (const h of portfolio.holdings) {
        const existing = stockMap.get(h.symbol) || { name: h.name || h.symbol, watchlistCount: 0, holdersCount: 0 };
        existing.holdersCount++;
        stockMap.set(h.symbol, existing);
      }
    }

    // Count ASK holdings
    const ask = getDataForUser<{ holdings?: { symbol: string; name?: string }[] }>(user.id, 'ask_account');
    if (ask?.holdings) {
      for (const h of ask.holdings) {
        const existing = stockMap.get(h.symbol) || { name: h.name || h.symbol, watchlistCount: 0, holdersCount: 0 };
        existing.holdersCount++;
        stockMap.set(h.symbol, existing);
      }
    }
  }

  // Sort by total popularity (watchlist + holders)
  return Array.from(stockMap.entries())
    .map(([symbol, data]) => ({ symbol, ...data }))
    .sort((a, b) => (b.watchlistCount + b.holdersCount) - (a.watchlistCount + a.holdersCount))
    .slice(0, 20);
}

/**
 * Get system health metrics.
 */
export function getSystemHealth(): SystemHealth {
  requireAdmin();

  const users = getAllUsers().filter(u => !u.isAdmin);
  let totalStorageBytes = 0;
  let maxUserStorageBytes = 0;
  let totalReports = 0;
  let totalOrders = 0;
  let totalAlerts = 0;

  for (const user of users) {
    const userStorage = getUserStorageSize(user.id);
    totalStorageBytes += userStorage;
    if (userStorage > maxUserStorageBytes) maxUserStorageBytes = userStorage;

    const reports = getDataForUser<unknown[]>(user.id, 'reports');
    if (Array.isArray(reports)) totalReports += reports.length;

    const orders = getDataForUser<unknown[]>(user.id, 'orders');
    if (Array.isArray(orders)) totalOrders += orders.length;

    const alerts = getDataForUser<unknown[]>(user.id, 'alerts');
    if (Array.isArray(alerts)) totalAlerts += alerts.length;
  }

  // localStorage limit is typically 5-10MB
  const quotaMB = 10;

  return {
    totalStorageUsedMB: Math.round((totalStorageBytes / (1024 * 1024)) * 100) / 100,
    storageQuotaMB: quotaMB,
    storageUtilizationPct: Math.round((totalStorageBytes / (quotaMB * 1024 * 1024)) * 1000) / 10,
    averageStoragePerUserKB: users.length > 0 ? Math.round(totalStorageBytes / users.length / 1024) : 0,
    largestUserStorageKB: Math.round(maxUserStorageBytes / 1024),
    totalReportsGenerated: totalReports,
    totalOrdersLogged: totalOrders,
    totalAlertsConfigured: totalAlerts,
    appVersion: '0.2.0',
    lastDeployDate: new Date().toISOString().split('T')[0],
  };
}

/**
 * Get user summaries for the admin user list.
 * Shows metadata ONLY — never portfolio values or personal financial data.
 */
export function getUserSummaries(): UserSummary[] {
  requireAdmin();

  const users = getAllUsers().filter(u => !u.isAdmin);

  return users.map(user => {
    const storageBytes = getUserStorageSize(user.id);
    const portfolio = getDataForUser<{ holdings?: unknown[] }>(user.id, 'portfolio');
    const ask = getDataForUser<{ holdings?: unknown[] }>(user.id, 'ask_account');
    const holdingsCount = (portfolio?.holdings?.length || 0) + (ask?.holdings?.length || 0);

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      isAdmin: user.isAdmin,
      onboardingCompleted: user.onboardingCompleted,
      storageUsedKB: Math.round(storageBytes / 1024),
      holdingsCount,
    };
  }).sort((a, b) => new Date(b.lastLoginAt).getTime() - new Date(a.lastLoginAt).getTime());
}

/**
 * Get risk profile distribution across all users.
 */
export function getRiskProfileDistribution(): { profile: string; count: number }[] {
  requireAdmin();

  const users = getAllUsers().filter(u => !u.isAdmin);
  const dist = new Map<string, number>();

  for (const user of users) {
    const profile = user.riskProfile || 'Not Set';
    dist.set(profile, (dist.get(profile) || 0) + 1);
  }

  return Array.from(dist.entries())
    .map(([profile, count]) => ({ profile, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Get the full admin dashboard data in one call.
 */
export function getAdminDashboardData(): AdminDashboardData {
  requireAdmin();

  return {
    stats: getAdminStats(),
    popularStocks: getPopularStocks(),
    systemHealth: getSystemHealth(),
    recentUsers: getUserSummaries(),
    riskProfileDistribution: getRiskProfileDistribution(),
  };
}
