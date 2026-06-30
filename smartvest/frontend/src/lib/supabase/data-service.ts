/**
 * Supabase Data Service
 *
 * Replaces all localStorage reads/writes with Supabase queries.
 * Falls back to localStorage if Supabase is not configured
 * (for local development without a database).
 *
 * This is the ONLY file that touches the database.
 * All other modules import from here.
 */

import { supabase, isSupabaseConfigured, getCurrentUserId } from './client';
import { Database } from './types';

type Holdings = Database['public']['Tables']['holdings'];
type Watchlist = Database['public']['Tables']['watchlist'];
type Orders = Database['public']['Tables']['orders'];
type Alerts = Database['public']['Tables']['alerts'];
type TaxRecords = Database['public']['Tables']['tax_records'];
type AskDeposits = Database['public']['Tables']['ask_deposits'];

// ─── Holdings (Portfolio) ────────────────────────────────────────────────────

export async function getHoldings(): Promise<Holdings['Row'][]> {
  if (!isSupabaseConfigured()) return getLocalStorage('holdings');
  const { data, error } = await (supabase as any)
    .from('holdings')
    .select('*')
    .order('added_at', { ascending: false });
  if (error) { console.error('getHoldings:', error); return []; }
  return data || [];
}

export async function addHolding(holding: Holdings['Insert']): Promise<Holdings['Row'] | null> {
  if (!isSupabaseConfigured()) return addLocalStorage<Holdings['Row']>('holdings', holding) as any;
  const { data, error } = await (supabase as any)
    .from('holdings')
    .upsert(holding, { onConflict: 'user_id,symbol,account_type' })
    .select()
    .single();
  if (error) { console.error('addHolding:', error); return null; }
  return data;
}

export async function updateHolding(id: string, updates: Holdings['Update']): Promise<void> {
  if (!isSupabaseConfigured()) { updateLocalStorage('holdings', id, updates as any); return; }
  const { error } = await (supabase as any).from('holdings').update(updates).eq('id', id);
  if (error) console.error('updateHolding:', error);
}

export async function deleteHolding(id: string): Promise<void> {
  if (!isSupabaseConfigured()) { deleteLocalStorage('holdings', id); return; }
  const { error } = await (supabase as any).from('holdings').delete().eq('id', id);
  if (error) console.error('deleteHolding:', error);
}

// ─── Watchlist ───────────────────────────────────────────────────────────────

export async function getWatchlist(): Promise<Watchlist['Row'][]> {
  if (!isSupabaseConfigured()) return getLocalStorage('watchlist');
  const { data, error } = await (supabase as any)
    .from('watchlist')
    .select('*')
    .order('added_at', { ascending: false });
  if (error) { console.error('getWatchlist:', error); return []; }
  return data || [];
}

export async function addToWatchlist(item: Watchlist['Insert']): Promise<Watchlist['Row'] | null> {
  if (!isSupabaseConfigured()) return addLocalStorage<Watchlist['Row']>('watchlist', item) as any;
  const { data, error } = await (supabase as any)
    .from('watchlist')
    .upsert(item, { onConflict: 'user_id,symbol' })
    .select()
    .single();
  if (error) { console.error('addToWatchlist:', error); return null; }
  return data;
}

export async function removeFromWatchlist(id: string): Promise<void> {
  if (!isSupabaseConfigured()) { deleteLocalStorage('watchlist', id); return; }
  const { error } = await (supabase as any).from('watchlist').delete().eq('id', id);
  if (error) console.error('removeFromWatchlist:', error);
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export async function getOrders(): Promise<Orders['Row'][]> {
  if (!isSupabaseConfigured()) return getLocalStorage('orders');
  const { data, error } = await (supabase as any)
    .from('orders')
    .select('*')
    .order('executed_at', { ascending: false });
  if (error) { console.error('getOrders:', error); return []; }
  return data || [];
}

export async function addOrder(order: Orders['Insert']): Promise<Orders['Row'] | null> {
  if (!isSupabaseConfigured()) return addLocalStorage<Orders['Row']>('orders', order) as any;
  const { data, error } = await (supabase as any)
    .from('orders')
    .insert(order)
    .select()
    .single();
  if (error) { console.error('addOrder:', error); return null; }
  return data;
}

// ─── Alerts ──────────────────────────────────────────────────────────────────

export async function getAlerts(): Promise<Alerts['Row'][]> {
  if (!isSupabaseConfigured()) return getLocalStorage('alerts');
  const { data, error } = await (supabase as any)
    .from('alerts')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (error) { console.error('getAlerts:', error); return []; }
  return data || [];
}

export async function addAlert(alert: Alerts['Insert']): Promise<Alerts['Row'] | null> {
  if (!isSupabaseConfigured()) return addLocalStorage<Alerts['Row']>('alerts', alert) as any;
  const { data, error } = await (supabase as any)
    .from('alerts')
    .insert(alert)
    .select()
    .single();
  if (error) { console.error('addAlert:', error); return null; }
  return data;
}

export async function deleteAlert(id: string): Promise<void> {
  if (!isSupabaseConfigured()) { deleteLocalStorage('alerts', id); return; }
  const { error } = await (supabase as any).from('alerts').delete().eq('id', id);
  if (error) console.error('deleteAlert:', error);
}

// ─── Tax Records ─────────────────────────────────────────────────────────────

export async function getTaxRecords(year?: number): Promise<TaxRecords['Row'][]> {
  if (!isSupabaseConfigured()) return getLocalStorage('tax_records');
  let query = supabase.from('tax_records').select('*');
  if (year) query = query.eq('tax_year', year);
  const { data, error } = await query.order('transaction_date', { ascending: false });
  if (error) { console.error('getTaxRecords:', error); return []; }
  return data || [];
}

export async function addTaxRecord(record: TaxRecords['Insert']): Promise<TaxRecords['Row'] | null> {
  if (!isSupabaseConfigured()) return addLocalStorage<TaxRecords['Row']>('tax_records', record) as any;
  const { data, error } = await (supabase as any)
    .from('tax_records')
    .insert(record)
    .select()
    .single();
  if (error) { console.error('addTaxRecord:', error); return null; }
  return data;
}

// ─── ASK Deposits ────────────────────────────────────────────────────────────

export async function getAskDeposits(): Promise<AskDeposits['Row'][]> {
  if (!isSupabaseConfigured()) return getLocalStorage('ask_deposits');
  const { data, error } = await (supabase as any)
    .from('ask_deposits')
    .select('*')
    .order('deposit_date', { ascending: false });
  if (error) { console.error('getAskDeposits:', error); return []; }
  return data || [];
}

export async function addAskDeposit(deposit: AskDeposits['Insert']): Promise<AskDeposits['Row'] | null> {
  if (!isSupabaseConfigured()) return addLocalStorage<AskDeposits['Row']>('ask_deposits', deposit) as any;
  const { data, error } = await (supabase as any)
    .from('ask_deposits')
    .insert(deposit)
    .select()
    .single();
  if (error) { console.error('addAskDeposit:', error); return null; }
  return data;
}


// ─── localStorage Fallback ───────────────────────────────────────────────────
// Used when Supabase is not configured (local dev without database)

function getLocalStorage<T>(table: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`smartvest_sb_${table}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function addLocalStorage<T>(table: string, item: any): T {
  const items = getLocalStorage<T>(table);
  const newItem = { ...item, id: crypto.randomUUID(), created_at: new Date().toISOString() } as unknown as T;
  items.push(newItem);
  localStorage.setItem(`smartvest_sb_${table}`, JSON.stringify(items));
  return newItem;
}

function updateLocalStorage(table: string, id: string, updates: any): void {
  const items = getLocalStorage<any>(table);
  const idx = items.findIndex((i: any) => i.id === id);
  if (idx >= 0) {
    items[idx] = { ...items[idx], ...updates, updated_at: new Date().toISOString() };
    localStorage.setItem(`smartvest_sb_${table}`, JSON.stringify(items));
  }
}

function deleteLocalStorage(table: string, id: string): void {
  const items = getLocalStorage<any>(table).filter((i: any) => i.id !== id);
  localStorage.setItem(`smartvest_sb_${table}`, JSON.stringify(items));
}
