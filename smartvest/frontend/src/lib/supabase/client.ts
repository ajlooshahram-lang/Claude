/**
 * Supabase Client
 *
 * Single instance shared across the app.
 * Configured via environment variables:
 *   NEXT_PUBLIC_SUPABASE_URL — Your Supabase project URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY — Your project's anon/public key
 *
 * Setup:
 *   1. Create a Supabase project at https://supabase.com
 *   2. Run supabase/schema.sql in the SQL Editor
 *   3. Set the env vars in .env.local or Vercel dashboard
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from './types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Validate configuration
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[SmartVest] Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. Falling back to localStorage.'
  );
}

export const supabase: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
);

/**
 * Check if Supabase is properly configured.
 * If not, the app falls back to localStorage.
 */
export function isSupabaseConfigured(): boolean {
  return !!(supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('placeholder'));
}

/**
 * Get the currently authenticated user's ID.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}
