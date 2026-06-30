/**
 * Supabase Module — Public API
 *
 * All database operations go through this module.
 * Import from '@/lib/supabase' for any data access.
 */

export { supabase, isSupabaseConfigured, getCurrentUserId } from './client';
export type { Database } from './types';
export {
  getHoldings, addHolding, updateHolding, deleteHolding,
  getWatchlist, addToWatchlist, removeFromWatchlist,
  getOrders, addOrder,
  getAlerts, addAlert, deleteAlert,
  getTaxRecords, addTaxRecord,
  getAskDeposits, addAskDeposit,
} from './data-service';
