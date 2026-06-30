'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard, TrendingUp, MessageSquare, Search,
  BookOpen, Bell, Briefcase, Settings, Shield, Bookmark, Calculator,
  Calendar, BarChart3, Sparkles, ArrowLeftRight, PieChart, Receipt,
  Lock, AlertTriangle, Brain, FlaskConical, ClipboardCheck, Eye, Activity,
  Landmark, FileText,
} from 'lucide-react';
import { getProfile, RiskProfile } from '@/lib/profile';
import { getUserFirstName } from '@/lib/onboarding';
import { getSavedTheme, saveTheme, applyTheme, Theme } from '@/lib/theme';
import { isLockEnabled, setPIN, isPINSet } from '@/lib/app-lock';
import { useConfig } from '@/lib/white-label/config-context';
import { getEnabledNavItems } from '@/lib/white-label/nav-config';
import { BrandLogo } from './brand-logo';
import { NavLockBadge } from './upgrade-gate';

export function Sidebar() {
  const pathname = usePathname();
  const { branding, features, theme: themeConfig, locale } = useConfig();
  const nav = useMemo(() => getEnabledNavItems(features), [features]);
  const [profileLabel, setProfileLabel] = useState<RiskProfile | null>(null);
  const [firstName, setFirstName] = useState('');
  const [theme, setTheme] = useState<Theme>('dark');
  const [lockActive, setLockActive] = useState(false);

  useEffect(() => {
    const profile = getProfile();
    if (profile) setProfileLabel(profile.riskProfile);
    setFirstName(getUserFirstName());
    const t = getSavedTheme();
    setTheme(t);
    applyTheme(t);
    setLockActive(isLockEnabled());
  }, []);

  return (
    <aside className="hidden lg:flex w-60 flex-col border-r border-[var(--card-border)] bg-[var(--card)]">
      {/* Logo — driven by config */}
      <div className="flex items-center gap-2 px-5 h-16 border-b border-[var(--card-border)]">
        <BrandLogo size="md" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                  : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-white/5'
              }`}
            >
              <item.icon className="h-[18px] w-[18px]" />
              {item.name}
              {item.subscriptionGate && <NavLockBadge featureKey={item.subscriptionGate} />}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t border-[var(--card-border)] px-3 py-4">
        {/* Risk Profile Badge */}
        {profileLabel && (
          <div className={`mb-3 mx-3 rounded-lg border px-3 py-2 ${
            profileLabel === 'Conservative' ? 'border-[var(--gain)]/30 bg-[var(--gain)]/5' :
            profileLabel === 'Moderate' ? 'border-[var(--primary)]/30 bg-[var(--primary)]/5' :
            'border-[var(--warning)]/30 bg-[var(--warning)]/5'
          }`}>
            <div className="flex items-center gap-2">
              <span className="text-sm">
                {profileLabel === 'Conservative' ? '🛡️' : profileLabel === 'Moderate' ? '⚖️' : '🚀'}
              </span>
              <span className={`text-xs font-semibold ${
                profileLabel === 'Conservative' ? 'text-[var(--gain)]' :
                profileLabel === 'Moderate' ? 'text-[var(--primary)]' :
                'text-[var(--warning)]'
              }`}>
                {profileLabel}
              </span>
            </div>
            <p className="text-[9px] text-[var(--muted)] mt-0.5 pl-6">Your risk profile</p>
          </div>
        )}
        {/* Theme Toggle — only shown if config allows */}
        {themeConfig.allowThemeToggle && (
        <button
          onClick={() => {
            const next = theme === 'dark' ? 'light' : 'dark';
            setTheme(next);
            saveTheme(next);
            applyTheme(next);
          }}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-white/5 w-full"
        >
          {theme === 'dark' ? (
            <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          ) : (
            <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </button>
        )}
        {/* App Lock — only shown if config enables it */}
        {features.appLock && !lockActive && (
          <button
            onClick={() => {
              // Trigger PIN setup by setting a flag
              setPIN(''); // This will trigger the setup screen via AppLockScreen
              window.location.reload();
            }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-white/5 w-full"
          >
            <Lock className="h-[18px] w-[18px]" />
            Set Up App Lock
          </button>
        )}
        {features.appLock && lockActive && (
          <div className="flex items-center gap-3 px-3 py-2.5 text-sm text-[var(--gain)]">
            <Lock className="h-[18px] w-[18px]" />
            <span className="text-[11px]">App Lock Active</span>
          </div>
        )}
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-white/5"
        >
          <Settings className="h-[18px] w-[18px]" />
          Settings
        </Link>
        <div className="mt-3 px-3 text-[10px] text-[var(--muted)]">
          {firstName && firstName !== 'Investor' && <span>{firstName} &middot; </span>}{locale.defaultCurrency} &middot; {locale.country} &middot; v0.1
        </div>
      </div>
    </aside>
  );
}



// ─── Mobile Bottom Navigation ────────────────────────────────────────────────

const mobileNav = [
  { name: 'Home', href: '/portfolio', icon: LayoutDashboard },
  { name: 'Search', href: '/search', icon: Search },
  { name: 'Picks', href: '/picks', icon: Sparkles },
  { name: 'Watchlist', href: '/watchlist', icon: Bookmark },
  { name: 'More', href: '/sectors', icon: BarChart3 },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex lg:hidden border-t border-[var(--card-border)] bg-[var(--card)]">
      {mobileNav.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.name}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors ${
              active ? 'text-[var(--primary)]' : 'text-[var(--muted)]'
            }`}
          >
            <item.icon className="h-5 w-5" />
            {item.name}
          </Link>
        );
      })}
    </nav>
  );
}
