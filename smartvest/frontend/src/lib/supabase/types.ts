/**
 * Supabase Database Type Definitions
 *
 * Generated from the schema. These types provide full type safety
 * for all database operations.
 */

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string;
          risk_profile: 'Conservative' | 'Moderate' | 'Aggressive' | null;
          onboarding_completed: boolean;
          is_admin: boolean;
          subscription_tier: 'free' | 'pro' | 'institutional';
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          subscription_period_end: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      holdings: {
        Row: {
          id: string;
          user_id: string;
          symbol: string;
          name: string;
          shares: number;
          avg_cost_per_share: number;
          current_price: number | null;
          sector: string | null;
          account_type: 'regular' | 'ask';
          added_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['holdings']['Row'], 'id' | 'added_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['holdings']['Insert']>;
      };
      watchlist: {
        Row: {
          id: string;
          user_id: string;
          symbol: string;
          name: string;
          notes: string | null;
          added_at: string;
        };
        Insert: Omit<Database['public']['Tables']['watchlist']['Row'], 'id' | 'added_at'>;
        Update: Partial<Database['public']['Tables']['watchlist']['Insert']>;
      };
      orders: {
        Row: {
          id: string;
          user_id: string;
          symbol: string;
          side: 'buy' | 'sell';
          shares: number;
          price_per_share: number;
          total_value: number;
          account_type: 'regular' | 'ask';
          idempotency_key: string;
          order_type: 'market' | 'limit' | 'stop' | 'stop_limit';
          status: 'filled' | 'pending' | 'cancelled' | 'rejected';
          commission: number;
          notes: string | null;
          executed_at: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['orders']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['orders']['Insert']>;
      };
      alerts: {
        Row: {
          id: string;
          user_id: string;
          symbol: string;
          alert_type: 'price_above' | 'price_below' | 'pct_change' | 'volume_spike';
          target_value: number;
          is_active: boolean;
          triggered_at: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['alerts']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['alerts']['Insert']>;
      };
      tax_records: {
        Row: {
          id: string;
          user_id: string;
          tax_year: number;
          symbol: string;
          side: 'buy' | 'sell';
          shares: number;
          proceeds: number | null;
          cost_basis: number | null;
          gain_loss: number | null;
          account_type: 'regular' | 'ask';
          transaction_date: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['tax_records']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['tax_records']['Insert']>;
      };
      ask_deposits: {
        Row: {
          id: string;
          user_id: string;
          amount: number;
          deposit_date: string;
          note: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['ask_deposits']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['ask_deposits']['Insert']>;
      };
    };
  };
}
