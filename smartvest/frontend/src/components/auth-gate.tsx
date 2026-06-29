'use client';

/**
 * Auth Gate — Route Guard Component
 *
 * Wraps the main app content and controls access:
 * - If user is authenticated → show app content (children)
 * - If user is NOT authenticated → show login page
 * - Exception: /admin route bypasses this gate (has its own auth)
 * - Exception: /login route bypasses this gate
 *
 * This ensures no user can access any data without logging in.
 */

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from './auth-provider';
import LoginPage from '@/app/login/page';

interface AuthGateProps {
  children: ReactNode;
}

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/admin'];

export function AuthGate({ children }: AuthGateProps) {
  const { isLoggedIn, isLoading } = useAuth();
  const pathname = usePathname();

  // Don't block while checking session
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-[var(--primary)]/30 border-t-[var(--primary)] rounded-full animate-spin" />
      </div>
    );
  }

  // Allow public routes through without auth
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return <>{children}</>;
  }

  // If not logged in, show login page inline
  if (!isLoggedIn) {
    return <LoginPage />;
  }

  // Authenticated — render app
  return <>{children}</>;
}
