'use client';

/**
 * Authentication Provider & Route Guard
 *
 * Wraps the app to provide authentication state via React context.
 * Shows login page for unauthenticated users.
 * Provides login, register, and logout functions to all children.
 */

import {
  createContext, useContext, useState, useEffect, useCallback, ReactNode
} from 'react';
import {
  Session, getSession, loginUser, registerUser, logout as authLogout,
  isAuthenticated, AuthResult,
} from '@/lib/auth';
import { migrateLegacyData } from '@/lib/user-data';

// ─── Context Types ───────────────────────────────────────────────────────────

interface AuthContextType {
  session: Session | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  login: (email: string, password: string) => Promise<AuthResult>;
  register: (email: string, password: string, name: string) => Promise<AuthResult>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  isLoading: true,
  isLoggedIn: false,
  login: async () => ({ success: false }),
  register: async () => ({ success: false }),
  logout: () => {},
});

// ─── Provider ────────────────────────────────────────────────────────────────

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const existing = getSession();
    if (existing) {
      setSession(existing);
      // Migrate any legacy data on login
      migrateLegacyData(existing.userId);
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const result = await loginUser(email, password);
    if (result.success && result.session) {
      setSession(result.session);
      migrateLegacyData(result.session.userId);
    }
    return result;
  }, []);

  const register = useCallback(async (email: string, password: string, name: string): Promise<AuthResult> => {
    const result = await registerUser(email, password, name);
    if (result.success && result.session) {
      setSession(result.session);
    }
    return result;
  }, []);

  const logout = useCallback(() => {
    authLogout();
    setSession(null);
  }, []);

  const value: AuthContextType = {
    session,
    isLoading,
    isLoggedIn: session !== null,
    login,
    register,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

/**
 * Access authentication state and functions.
 *
 * @example
 * const { session, isLoggedIn, login, logout } = useAuth();
 */
export function useAuth(): AuthContextType {
  return useContext(AuthContext);
}

/**
 * Get the current user's display name.
 */
export function useUserName(): string {
  const { session } = useAuth();
  return session?.displayName ?? 'Investor';
}

/**
 * Get the current user's ID (null if not logged in).
 */
export function useUserId(): string | null {
  const { session } = useAuth();
  return session?.userId ?? null;
}
