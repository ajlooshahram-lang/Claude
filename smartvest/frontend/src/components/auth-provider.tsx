'use client';

/**
 * Authentication Provider
 *
 * NOW USES: Supabase Auth (bcrypt, server sessions)
 * PREVIOUSLY: Custom SHA-256 + localStorage
 *
 * Wraps the app with auth state. All pages get login/register/logout
 * via the useAuth() hook.
 */

import {
  createContext, useContext, useState, useEffect, useCallback, ReactNode
} from 'react';
import {
  signUp, signIn, signOut, getSession, getUser,
  onAuthStateChange, AuthResult,
} from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

// ─── Context Types ───────────────────────────────────────────────────────────

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  login: (email: string, password: string) => Promise<AuthResult>;
  register: (email: string, password: string, name: string) => Promise<AuthResult>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isLoading: true,
  isLoggedIn: false,
  login: async () => ({ success: false }),
  register: async () => ({ success: false }),
  logout: () => {},
});

// ─── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check existing session
    getSession().then(s => {
      setSession(s);
      if (s) getUser().then(u => setUser(u));
      setIsLoading(false);
    });

    // Listen for auth changes
    const { unsubscribe } = onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (newSession) {
        getUser().then(u => setUser(u));
      } else {
        setUser(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const result = await signIn(email, password);
    if (result.success && result.session) {
      setSession(result.session);
      setUser(result.user ?? null);
    }
    return result;
  }, []);

  const register = useCallback(async (email: string, password: string, name: string): Promise<AuthResult> => {
    const result = await signUp(email, password, name);
    if (result.success && result.session) {
      setSession(result.session);
      setUser(result.user ?? null);
    }
    return result;
  }, []);

  const logout = useCallback(async () => {
    await signOut();
    setSession(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      user, session, isLoading,
      isLoggedIn: session !== null,
      login, register, logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextType {
  return useContext(AuthContext);
}

export function useUserName(): string {
  const { user } = useAuth();
  return user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Investor';
}

export function useUserId(): string | null {
  const { user } = useAuth();
  return user?.id ?? null;
}
