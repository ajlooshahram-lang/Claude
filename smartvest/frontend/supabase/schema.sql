-- SmartVest Database Schema for Supabase (PostgreSQL)
-- Run this in the Supabase SQL Editor to create all tables.
-- Row Level Security (RLS) ensures users only see their own data.

-- ─── Enable UUID extension ───────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Users ───────────────────────────────────────────────────────────────────
-- Supabase Auth handles authentication. This table stores app-specific profile data.
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT 'Investor',
  risk_profile TEXT CHECK (risk_profile IN ('Conservative', 'Moderate', 'Aggressive')),
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  subscription_tier TEXT NOT NULL DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'institutional')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Portfolios (Holdings) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS holdings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  shares NUMERIC(18, 6) NOT NULL CHECK (shares > 0),
  avg_cost_per_share NUMERIC(18, 4) NOT NULL,
  current_price NUMERIC(18, 4),
  sector TEXT,
  account_type TEXT NOT NULL DEFAULT 'regular' CHECK (account_type IN ('regular', 'ask')),
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, symbol, account_type)
);

-- ─── Watchlist ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS watchlist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  notes TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, symbol)
);

-- ─── Orders ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  shares NUMERIC(18, 6) NOT NULL CHECK (shares > 0),
  price_per_share NUMERIC(18, 4) NOT NULL,
  total_value NUMERIC(18, 4) NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'regular' CHECK (account_type IN ('regular', 'ask')),
  idempotency_key UUID NOT NULL DEFAULT uuid_generate_v4(),
  order_type TEXT NOT NULL DEFAULT 'market' CHECK (order_type IN ('market', 'limit', 'stop', 'stop_limit')),
  status TEXT NOT NULL DEFAULT 'filled' CHECK (status IN ('filled', 'pending', 'cancelled', 'rejected')),
  commission NUMERIC(10, 2) DEFAULT 0,
  notes TEXT,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(idempotency_key)
);

-- ─── Alerts ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('price_above', 'price_below', 'pct_change', 'volume_spike')),
  target_value NUMERIC(18, 4) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Tax Records ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tax_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  shares NUMERIC(18, 6) NOT NULL,
  proceeds NUMERIC(18, 4),
  cost_basis NUMERIC(18, 4),
  gain_loss NUMERIC(18, 4),
  account_type TEXT NOT NULL DEFAULT 'regular' CHECK (account_type IN ('regular', 'ask')),
  transaction_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── ASK Account ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ask_deposits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
  deposit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Row Level Security ──────────────────────────────────────────────────────
-- Every table gets RLS so users can ONLY access their own rows.

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE ask_deposits ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own profile
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
-- Users can update their own profile BUT cannot change is_admin or subscription_tier.
-- Those fields can only be changed by server-side functions using the service_role key.
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND is_admin = (SELECT p.is_admin FROM profiles p WHERE p.id = auth.uid())
    AND subscription_tier = (SELECT p.subscription_tier FROM profiles p WHERE p.id = auth.uid())
  );

-- Holdings: full CRUD on own data only
CREATE POLICY "Users can view own holdings" ON holdings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own holdings" ON holdings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own holdings" ON holdings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own holdings" ON holdings FOR DELETE USING (auth.uid() = user_id);

-- Watchlist: full CRUD on own data only
CREATE POLICY "Users can view own watchlist" ON watchlist FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own watchlist" ON watchlist FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own watchlist" ON watchlist FOR DELETE USING (auth.uid() = user_id);

-- Orders: read/insert own only
CREATE POLICY "Users can view own orders" ON orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own orders" ON orders FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Alerts: full CRUD on own data only
CREATE POLICY "Users can view own alerts" ON alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own alerts" ON alerts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own alerts" ON alerts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own alerts" ON alerts FOR DELETE USING (auth.uid() = user_id);

-- Tax records: read/insert own only
CREATE POLICY "Users can view own tax records" ON tax_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tax records" ON tax_records FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ASK deposits: full CRUD
CREATE POLICY "Users can view own ASK deposits" ON ask_deposits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ASK deposits" ON ask_deposits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own ASK deposits" ON ask_deposits FOR DELETE USING (auth.uid() = user_id);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX idx_holdings_user ON holdings(user_id);
CREATE INDEX idx_watchlist_user ON watchlist(user_id);
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_user_symbol ON orders(user_id, symbol);
CREATE INDEX idx_alerts_user_active ON alerts(user_id) WHERE is_active = TRUE;
CREATE INDEX idx_tax_records_user_year ON tax_records(user_id, tax_year);
CREATE INDEX idx_ask_deposits_user ON ask_deposits(user_id);

-- ─── Trigger: auto-update updated_at ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_profiles BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at_holdings BEFORE UPDATE ON holdings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
