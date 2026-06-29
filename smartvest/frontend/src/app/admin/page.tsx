'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Shield, Users, TrendingUp, Database, Activity,
  BarChart3, Lock, LogOut, Mail, Clock, HardDrive,
  AlertTriangle, Eye, EyeOff,
} from 'lucide-react';
import {
  loginAdmin, isAdminSession, logout as authLogout, getSession,
} from '@/lib/auth';
import {
  AdminDashboardData, getAdminDashboardData,
} from '@/lib/admin';

export default function AdminPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AdminDashboardData | null>(null);

  // Login form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    if (isAdminSession()) {
      setIsAdmin(true);
      loadDashboard();
    }
    setLoading(false);
  }, []);


  function loadDashboard() {
    try {
      const dashData = getAdminDashboardData();
      setData(dashData);
    } catch (err) {
      console.error('Failed to load admin data:', err);
    }
  }

  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const result = await loginAdmin(email, password);
      if (result.success) {
        setIsAdmin(true);
        loadDashboard();
      } else {
        setLoginError(result.error || 'Login failed');
      }
    } catch {
      setLoginError('An error occurred');
    } finally {
      setLoginLoading(false);
    }
  }

  function handleLogout() {
    authLogout();
    setIsAdmin(false);
    setData(null);
    router.push('/login');
  }

  if (loading) return null;


  // ─── Admin Login Form ────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-red-500/10 border border-red-500/30 mb-4">
              <Shield className="h-7 w-7 text-red-400" />
            </div>
            <h1 className="text-2xl font-bold">Admin Access</h1>
            <p className="text-sm text-[var(--muted)] mt-1">
              Separate login required for admin dashboard
            </p>
          </div>

          <form onSubmit={handleAdminLogin} className="space-y-4">
            {loginError && (
              <div className="rounded-lg border border-[var(--loss)]/30 bg-[var(--loss)]/5 px-4 py-3">
                <p className="text-xs text-[var(--loss)] font-medium">{loginError}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--muted)]">Admin Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--muted)]" />
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="admin@smartvest.app"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-[var(--card-border)] bg-[var(--card)] text-sm focus:border-red-400 focus:outline-none"
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--muted)]">Admin Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--muted)]" />
                <input
                  type={showPassword ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)} placeholder="Admin password"
                  className="w-full pl-10 pr-11 py-3 rounded-xl border border-[var(--card-border)] bg-[var(--card)] text-sm focus:border-red-400 focus:outline-none"
                  required
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loginLoading}
              className="w-full py-3 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-50">
              {loginLoading ? 'Authenticating...' : 'Access Admin Dashboard'}
            </button>
          </form>

          <div className="text-center">
            <button onClick={() => router.push('/login')}
              className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]">
              ← Back to User Login
            </button>
          </div>
        </div>
      </div>
    );
  }


  // ─── Admin Dashboard ─────────────────────────────────────────────────────────
  if (!data) return null;

  const { stats, popularStocks, systemHealth, recentUsers, riskProfileDistribution } = data;

  return (
    <div className="min-h-screen bg-[var(--background)] p-4 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center">
              <Shield className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Admin Dashboard</h1>
              <p className="text-xs text-[var(--muted)]">
                System overview &mdash; aggregate data only, no individual exposure
              </p>
            </div>
          </div>
          <button onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-[var(--muted)] hover:text-[var(--loss)] hover:bg-[var(--loss)]/10 transition-colors">
            <LogOut className="h-3.5 w-3.5" /> Logout
          </button>
        </div>

        {/* Privacy Notice */}
        <div className="rounded-xl border border-[var(--warning)]/30 bg-[var(--warning)]/5 p-3 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-[var(--warning)] flex-shrink-0" />
          <p className="text-[10px] text-[var(--warning)]">
            <strong>Privacy:</strong> This dashboard shows aggregate metrics only. Individual user portfolios, holdings, and financial data are never displayed. User isolation is enforced at the data layer.
          </p>
        </div>


        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={Users} label="Total Users" value={stats.totalUsers.toString()} sub={`${stats.registrationsThisMonth} this month`} color="blue" />
          <StatCard icon={Activity} label="Active (7d)" value={stats.activeUsersLast7Days.toString()} sub={`${stats.activeUsersLast30Days} in 30d`} color="green" />
          <StatCard icon={TrendingUp} label="Aggregate AUM" value={`${(stats.totalPortfolioValueAllUsers / 1000).toFixed(0)}k DKK`} sub={`${stats.usersWithPortfolio} users invested`} color="primary" />
          <StatCard icon={BarChart3} label="Avg Holdings" value={stats.averageHoldingsPerUser.toFixed(1)} sub={`${stats.usersCompletedOnboarding} onboarded`} color="purple" />
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Popular Stocks */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--card-border)] flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[var(--primary)]" />
              <h2 className="text-sm font-semibold">Most Popular Stocks</h2>
              <span className="text-[9px] text-[var(--muted)] ml-auto">Across all users</span>
            </div>
            {popularStocks.length === 0 ? (
              <div className="p-8 text-center text-xs text-[var(--muted)]">No stock data yet</div>
            ) : (
              <div className="divide-y divide-[var(--card-border)] max-h-[300px] overflow-y-auto">
                {popularStocks.slice(0, 10).map((stock, i) => (
                  <div key={stock.symbol} className="px-5 py-2.5 flex items-center gap-3">
                    <span className="text-[10px] text-[var(--muted)] w-5 font-tabular">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{stock.symbol}</p>
                      <p className="text-[9px] text-[var(--muted)] truncate">{stock.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-tabular">{stock.watchlistCount} watchlist</p>
                      <p className="text-[10px] text-[var(--muted)] font-tabular">{stock.holdersCount} holders</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>


          {/* System Health */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--card-border)] flex items-center gap-2">
              <Database className="h-4 w-4 text-[var(--gain)]" />
              <h2 className="text-sm font-semibold">System Health</h2>
            </div>
            <div className="p-5 space-y-3">
              <HealthRow label="Storage Used" value={`${systemHealth.totalStorageUsedMB} MB`} sub={`of ${systemHealth.storageQuotaMB} MB`} pct={systemHealth.storageUtilizationPct} />
              <HealthRow label="Avg per User" value={`${systemHealth.averageStoragePerUserKB} KB`} sub="" pct={0} />
              <HealthRow label="Largest User" value={`${systemHealth.largestUserStorageKB} KB`} sub="" pct={0} />
              <div className="pt-3 border-t border-[var(--card-border)] grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-lg font-bold font-tabular">{systemHealth.totalReportsGenerated}</p>
                  <p className="text-[9px] text-[var(--muted)]">Reports</p>
                </div>
                <div>
                  <p className="text-lg font-bold font-tabular">{systemHealth.totalOrdersLogged}</p>
                  <p className="text-[9px] text-[var(--muted)]">Orders</p>
                </div>
                <div>
                  <p className="text-lg font-bold font-tabular">{systemHealth.totalAlertsConfigured}</p>
                  <p className="text-[9px] text-[var(--muted)]">Alerts</p>
                </div>
              </div>
              <div className="pt-3 border-t border-[var(--card-border)] flex items-center justify-between text-[10px] text-[var(--muted)]">
                <span>Version: {systemHealth.appVersion}</span>
                <span>Last deploy: {systemHealth.lastDeployDate}</span>
              </div>
            </div>
          </div>
        </div>


        {/* Risk Profile Distribution */}
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-purple-400" />
            Risk Profile Distribution
          </h2>
          <div className="flex items-end gap-3 h-24">
            {riskProfileDistribution.map(({ profile, count }) => {
              const maxCount = Math.max(...riskProfileDistribution.map(r => r.count), 1);
              const height = (count / maxCount) * 100;
              const color = profile === 'Conservative' ? 'bg-[var(--gain)]' :
                           profile === 'Moderate' ? 'bg-[var(--primary)]' :
                           profile === 'Aggressive' ? 'bg-[var(--warning)]' : 'bg-[var(--muted)]';
              return (
                <div key={profile} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] font-tabular font-medium">{count}</span>
                  <div className={`w-full rounded-t ${color}`} style={{ height: `${height}%` }} />
                  <span className="text-[9px] text-[var(--muted)] truncate max-w-full">{profile}</span>
                </div>
              );
            })}
            {riskProfileDistribution.length === 0 && (
              <p className="text-xs text-[var(--muted)] w-full text-center py-8">No users yet</p>
            )}
          </div>
        </div>

        {/* Recent Users Table */}
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--card-border)] flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-semibold">Registered Users</h2>
            <span className="text-[9px] text-[var(--muted)] ml-auto">{stats.totalUsers} total</span>
          </div>
          {recentUsers.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--muted)]">No registered users yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-[var(--card-border)] bg-[var(--background)]/50">
                    <th className="text-left px-4 py-2 font-medium text-[var(--muted)]">User</th>
                    <th className="text-left px-4 py-2 font-medium text-[var(--muted)]">Joined</th>
                    <th className="text-left px-4 py-2 font-medium text-[var(--muted)]">Last Active</th>
                    <th className="text-right px-4 py-2 font-medium text-[var(--muted)]">Holdings</th>
                    <th className="text-right px-4 py-2 font-medium text-[var(--muted)]">Storage</th>
                    <th className="text-center px-4 py-2 font-medium text-[var(--muted)]">Onboarded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--card-border)]">
                  {recentUsers.map(user => (
                    <tr key={user.id}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{user.displayName}</p>
                        <p className="text-[9px] text-[var(--muted)]">{user.email}</p>
                      </td>
                      <td className="px-4 py-2.5 text-[var(--muted)] font-tabular">
                        {new Date(user.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--muted)] font-tabular">
                        {new Date(user.lastLoginAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </td>
                      <td className="px-4 py-2.5 text-right font-tabular">{user.holdingsCount}</td>
                      <td className="px-4 py-2.5 text-right font-tabular text-[var(--muted)]">{user.storageUsedKB} KB</td>
                      <td className="px-4 py-2.5 text-center">
                        {user.onboardingCompleted ? (
                          <span className="text-[var(--gain)]">✓</span>
                        ) : (
                          <span className="text-[var(--muted)]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: typeof Users; label: string; value: string; sub: string;
  color: 'blue' | 'green' | 'primary' | 'purple';
}) {
  const colorMap = {
    blue: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    green: 'text-[var(--gain)] bg-[var(--gain)]/10 border-[var(--gain)]/30',
    primary: 'text-[var(--primary)] bg-[var(--primary)]/10 border-[var(--primary)]/30',
    purple: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
  }[color];

  return (
    <div className={`rounded-xl border p-4 ${colorMap}`}>
      <Icon className="h-5 w-5 mb-2" />
      <p className="text-lg font-bold font-tabular">{value}</p>
      <p className="text-[10px] font-medium mt-0.5">{label}</p>
      <p className="text-[9px] opacity-70 mt-0.5">{sub}</p>
    </div>
  );
}

function HealthRow({ label, value, sub, pct }: {
  label: string; value: string; sub: string; pct: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-medium">{label}</span>
          <span className="text-[10px] font-tabular text-[var(--muted)]">{value} {sub}</span>
        </div>
        {pct > 0 && (
          <div className="h-1.5 rounded-full bg-[var(--card-border)] overflow-hidden">
            <div
              className={`h-full rounded-full ${pct > 80 ? 'bg-[var(--loss)]' : pct > 50 ? 'bg-[var(--warning)]' : 'bg-[var(--gain)]'}`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
