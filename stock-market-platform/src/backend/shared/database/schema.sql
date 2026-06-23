-- ============================================================================
-- InvestorIQ — Database Schema (PostgreSQL 16 + TimescaleDB)
-- Version: 1.0 | Date: 2026-06-22
-- ============================================================================
-- Extensions
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";          -- Trigram similarity for search
CREATE EXTENSION IF NOT EXISTS "vector";           -- pgvector for semantic cache
CREATE EXTENSION IF NOT EXISTS timescaledb;        -- Time-series hypertables

-- ============================================================================
-- SCHEMA: identity (User Service)
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS identity;

CREATE TABLE identity.users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    password_hash   VARCHAR(255),                    -- NULL for OAuth-only users
    display_name    VARCHAR(100) NOT NULL,
    avatar_url      VARCHAR(512),
    auth_provider   VARCHAR(50) NOT NULL DEFAULT 'email', -- email, google, apple
    external_id     VARCHAR(255),                    -- OAuth provider ID
    tier            VARCHAR(20) NOT NULL DEFAULT 'free'
                    CHECK (tier IN ('free', 'pro', 'premium', 'enterprise')),
    mfa_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_secret      VARCHAR(255),                    -- TOTP secret (encrypted)
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'suspended', 'deleted')),
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE identity.user_profiles (
    user_id             UUID PRIMARY KEY REFERENCES identity.users(id) ON DELETE CASCADE,
    expertise_level     VARCHAR(20) NOT NULL DEFAULT 'beginner'
                        CHECK (expertise_level IN ('beginner', 'intermediate', 'advanced')),
    risk_tolerance      VARCHAR(20) NOT NULL DEFAULT 'balanced'
                        CHECK (risk_tolerance IN ('conservative', 'balanced', 'aggressive')),
    investment_goal     VARCHAR(30) NOT NULL DEFAULT 'growth'
                        CHECK (investment_goal IN ('growth', 'income', 'preservation', 'retirement', 'speculation')),
    investment_horizon  VARCHAR(20) NOT NULL DEFAULT 'medium'
                        CHECK (investment_horizon IN ('short', 'medium', 'long')),
    preferred_sectors   TEXT[] DEFAULT '{}',
    preferred_markets   TEXT[] DEFAULT '{}',
    currency            VARCHAR(3) NOT NULL DEFAULT 'USD',
    timezone            VARCHAR(50) NOT NULL DEFAULT 'America/New_York',
    locale              VARCHAR(10) NOT NULL DEFAULT 'en-US',
    onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE identity.sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    refresh_token   VARCHAR(512) NOT NULL UNIQUE,
    device_info     JSONB,                           -- user agent, IP, device type
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON identity.sessions(user_id) WHERE revoked = FALSE;
CREATE INDEX idx_sessions_token ON identity.sessions(refresh_token) WHERE revoked = FALSE;

CREATE TABLE identity.audit_log (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID REFERENCES identity.users(id),
    action      VARCHAR(100) NOT NULL,              -- 'login', 'password_change', 'mfa_enable'
    resource    VARCHAR(100),
    resource_id VARCHAR(255),
    metadata    JSONB,
    ip_address  INET,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON identity.audit_log(user_id, created_at DESC);


-- ============================================================================
-- SCHEMA: market (Market Data Service)
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS market;

CREATE TABLE market.symbols (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol          VARCHAR(20) NOT NULL UNIQUE,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    asset_type      VARCHAR(20) NOT NULL
                    CHECK (asset_type IN ('stock', 'etf', 'crypto', 'forex', 'index', 'mutual_fund', 'reit', 'adr')),
    exchange        VARCHAR(20) NOT NULL,            -- NYSE, NASDAQ, AMEX, CRYPTO
    sector          VARCHAR(100),
    industry        VARCHAR(100),
    country         VARCHAR(3),                      -- ISO 3166-1 alpha-3
    currency        VARCHAR(3) NOT NULL DEFAULT 'USD',
    market_cap      BIGINT,
    shares_outstanding BIGINT,
    ipo_date        DATE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    logo_url        VARCHAR(512),
    website_url     VARCHAR(512),
    metadata        JSONB DEFAULT '{}',              -- Additional provider-specific data
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_symbols_type ON market.symbols(asset_type) WHERE is_active = TRUE;
CREATE INDEX idx_symbols_sector ON market.symbols(sector, industry) WHERE is_active = TRUE;
CREATE INDEX idx_symbols_name_trgm ON market.symbols USING gin(name gin_trgm_ops);
CREATE INDEX idx_symbols_symbol_trgm ON market.symbols USING gin(symbol gin_trgm_ops);

-- TimescaleDB hypertable for OHLCV data
CREATE TABLE market.ohlcv (
    symbol_id       UUID NOT NULL REFERENCES market.symbols(id),
    timestamp       TIMESTAMPTZ NOT NULL,
    timeframe       VARCHAR(5) NOT NULL              -- '1m', '5m', '15m', '1h', '1d', '1w', '1M'
                    CHECK (timeframe IN ('1m', '5m', '15m', '1h', '1d', '1w', '1M')),
    open            NUMERIC(20, 6) NOT NULL,
    high            NUMERIC(20, 6) NOT NULL,
    low             NUMERIC(20, 6) NOT NULL,
    close           NUMERIC(20, 6) NOT NULL,
    volume          BIGINT NOT NULL DEFAULT 0,
    vwap            NUMERIC(20, 6),
    trade_count     INTEGER,
    PRIMARY KEY (symbol_id, timestamp, timeframe)
);

-- Convert to TimescaleDB hypertable
SELECT create_hypertable('market.ohlcv', 'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Compression policy: compress after 7 days
ALTER TABLE market.ohlcv SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'symbol_id, timeframe',
    timescaledb.compress_orderby = 'timestamp DESC'
);

SELECT add_compression_policy('market.ohlcv', INTERVAL '7 days', if_not_exists => TRUE);

-- Continuous aggregates for common rollups
CREATE MATERIALIZED VIEW market.ohlcv_daily
WITH (timescaledb.continuous) AS
SELECT
    symbol_id,
    time_bucket('1 day', timestamp) AS bucket,
    first(open, timestamp) AS open,
    max(high) AS high,
    min(low) AS low,
    last(close, timestamp) AS close,
    sum(volume) AS volume,
    sum(volume * vwap) / NULLIF(sum(volume), 0) AS vwap
FROM market.ohlcv
WHERE timeframe = '1m'
GROUP BY symbol_id, time_bucket('1 day', timestamp)
WITH NO DATA;

-- Latest quotes (updated in real-time via Redis, persisted periodically)
CREATE TABLE market.latest_quotes (
    symbol_id       UUID PRIMARY KEY REFERENCES market.symbols(id),
    price           NUMERIC(20, 6) NOT NULL,
    change          NUMERIC(20, 6) NOT NULL DEFAULT 0,
    change_percent  NUMERIC(10, 4) NOT NULL DEFAULT 0,
    volume          BIGINT NOT NULL DEFAULT 0,
    day_high        NUMERIC(20, 6),
    day_low         NUMERIC(20, 6),
    day_open        NUMERIC(20, 6),
    prev_close      NUMERIC(20, 6),
    week_52_high    NUMERIC(20, 6),
    week_52_low     NUMERIC(20, 6),
    avg_volume_20d  BIGINT,
    market_status   VARCHAR(20) DEFAULT 'closed'
                    CHECK (market_status IN ('pre_market', 'open', 'post_market', 'closed')),
    last_trade_at   TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fundamental data
CREATE TABLE market.fundamentals (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol_id       UUID NOT NULL REFERENCES market.symbols(id),
    period          VARCHAR(10) NOT NULL,            -- 'annual', 'quarterly', 'ttm'
    fiscal_date     DATE NOT NULL,
    -- Valuation
    pe_ratio        NUMERIC(10, 2),
    forward_pe      NUMERIC(10, 2),
    peg_ratio       NUMERIC(10, 3),
    pb_ratio        NUMERIC(10, 2),
    ps_ratio        NUMERIC(10, 2),
    ev_ebitda       NUMERIC(10, 2),
    ev_revenue      NUMERIC(10, 2),
    -- Income Statement
    revenue         BIGINT,
    revenue_growth  NUMERIC(10, 4),                  -- YoY %
    gross_profit    BIGINT,
    operating_income BIGINT,
    net_income      BIGINT,
    eps             NUMERIC(10, 4),
    eps_growth      NUMERIC(10, 4),
    -- Margins
    gross_margin    NUMERIC(10, 4),
    operating_margin NUMERIC(10, 4),
    net_margin      NUMERIC(10, 4),
    -- Profitability
    roe             NUMERIC(10, 4),
    roic            NUMERIC(10, 4),
    roa             NUMERIC(10, 4),
    -- Balance Sheet
    total_assets    BIGINT,
    total_debt      BIGINT,
    total_equity    BIGINT,
    cash_and_equiv  BIGINT,
    debt_equity     NUMERIC(10, 4),
    current_ratio   NUMERIC(10, 4),
    -- Cash Flow
    operating_cf    BIGINT,
    capital_expenditures BIGINT,
    free_cash_flow  BIGINT,
    fcf_yield       NUMERIC(10, 4),
    -- Dividends
    dividend_yield  NUMERIC(10, 4),
    dividend_per_share NUMERIC(10, 4),
    payout_ratio    NUMERIC(10, 4),
    ex_dividend_date DATE,
    -- Metadata
    data_source     VARCHAR(50),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(symbol_id, period, fiscal_date)
);

CREATE INDEX idx_fundamentals_symbol ON market.fundamentals(symbol_id, period, fiscal_date DESC);

-- Analyst estimates & ratings
CREATE TABLE market.analyst_ratings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol_id       UUID NOT NULL REFERENCES market.symbols(id),
    firm            VARCHAR(100),
    analyst_name    VARCHAR(100),
    rating          VARCHAR(20) NOT NULL
                    CHECK (rating IN ('strong_buy', 'buy', 'hold', 'sell', 'strong_sell')),
    price_target    NUMERIC(20, 2),
    previous_rating VARCHAR(20),
    previous_target NUMERIC(20, 2),
    published_at    TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_analyst_symbol ON market.analyst_ratings(symbol_id, published_at DESC);

-- News articles
CREATE TABLE market.news (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title           TEXT NOT NULL,
    summary         TEXT,
    content_url     VARCHAR(512) NOT NULL,
    source          VARCHAR(100) NOT NULL,
    author          VARCHAR(200),
    published_at    TIMESTAMPTZ NOT NULL,
    symbols         TEXT[] NOT NULL DEFAULT '{}',     -- Related symbols
    sentiment_score NUMERIC(4, 3),                   -- -1.0 to +1.0
    impact_level    VARCHAR(10)
                    CHECK (impact_level IN ('low', 'medium', 'high', 'critical')),
    categories      TEXT[] DEFAULT '{}',
    image_url       VARCHAR(512),
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_news_published ON market.news(published_at DESC);
CREATE INDEX idx_news_symbols ON market.news USING gin(symbols);
CREATE INDEX idx_news_sentiment ON market.news(sentiment_score) WHERE sentiment_score IS NOT NULL;


-- ============================================================================
-- SCHEMA: portfolio (Portfolio Service)
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS portfolio;

CREATE TABLE portfolio.portfolios (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    portfolio_type  VARCHAR(20) NOT NULL DEFAULT 'investment'
                    CHECK (portfolio_type IN ('investment', 'retirement', 'watchlist', 'paper_trade')),
    currency        VARCHAR(3) NOT NULL DEFAULT 'USD',
    benchmark_symbol VARCHAR(20) DEFAULT 'SPY',
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    is_public       BOOLEAN NOT NULL DEFAULT FALSE,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_portfolios_user ON portfolio.portfolios(user_id);
CREATE UNIQUE INDEX idx_portfolios_default ON portfolio.portfolios(user_id)
    WHERE is_default = TRUE;

CREATE TABLE portfolio.holdings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    portfolio_id    UUID NOT NULL REFERENCES portfolio.portfolios(id) ON DELETE CASCADE,
    symbol_id       UUID NOT NULL REFERENCES market.symbols(id),
    symbol          VARCHAR(20) NOT NULL,            -- Denormalized for query speed
    quantity        NUMERIC(20, 8) NOT NULL,         -- Supports fractional shares
    avg_cost_basis  NUMERIC(20, 6) NOT NULL,         -- Average cost per share
    total_cost      NUMERIC(20, 2) NOT NULL,
    currency        VARCHAR(3) NOT NULL DEFAULT 'USD',
    first_purchased DATE,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(portfolio_id, symbol_id)
);

CREATE INDEX idx_holdings_portfolio ON portfolio.holdings(portfolio_id);
CREATE INDEX idx_holdings_symbol ON portfolio.holdings(symbol_id);

CREATE TABLE portfolio.transactions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    portfolio_id    UUID NOT NULL REFERENCES portfolio.portfolios(id) ON DELETE CASCADE,
    holding_id      UUID REFERENCES portfolio.holdings(id) ON DELETE SET NULL,
    symbol_id       UUID NOT NULL REFERENCES market.symbols(id),
    symbol          VARCHAR(20) NOT NULL,
    transaction_type VARCHAR(20) NOT NULL
                    CHECK (transaction_type IN ('buy', 'sell', 'dividend', 'split', 'transfer_in', 'transfer_out')),
    quantity        NUMERIC(20, 8) NOT NULL,
    price           NUMERIC(20, 6) NOT NULL,
    total_amount    NUMERIC(20, 2) NOT NULL,
    commission      NUMERIC(10, 2) DEFAULT 0,
    currency        VARCHAR(3) NOT NULL DEFAULT 'USD',
    executed_at     TIMESTAMPTZ NOT NULL,
    notes           TEXT,
    import_source   VARCHAR(50),                     -- 'manual', 'csv', 'plaid'
    external_id     VARCHAR(255),                    -- External reference
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_portfolio ON portfolio.transactions(portfolio_id, executed_at DESC);
CREATE INDEX idx_transactions_symbol ON portfolio.transactions(symbol_id, executed_at DESC);

-- Daily portfolio snapshots for performance tracking
CREATE TABLE portfolio.snapshots (
    portfolio_id    UUID NOT NULL REFERENCES portfolio.portfolios(id) ON DELETE CASCADE,
    date            DATE NOT NULL,
    total_value     NUMERIC(20, 2) NOT NULL,
    total_cost      NUMERIC(20, 2) NOT NULL,
    cash_value      NUMERIC(20, 2) DEFAULT 0,
    day_gain_loss   NUMERIC(20, 2),
    total_gain_loss NUMERIC(20, 2),
    holdings_count  INTEGER NOT NULL DEFAULT 0,
    allocation_data JSONB,                           -- { sector: {...}, geography: {...} }
    PRIMARY KEY (portfolio_id, date)
);

-- Convert to hypertable for efficient time-range queries
SELECT create_hypertable('portfolio.snapshots', 'date',
    chunk_time_interval => INTERVAL '30 days',
    if_not_exists => TRUE
);

-- Dividend tracking
CREATE TABLE portfolio.dividends (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    portfolio_id    UUID NOT NULL REFERENCES portfolio.portfolios(id) ON DELETE CASCADE,
    symbol_id       UUID NOT NULL REFERENCES market.symbols(id),
    symbol          VARCHAR(20) NOT NULL,
    amount_per_share NUMERIC(10, 6) NOT NULL,
    total_amount    NUMERIC(20, 2) NOT NULL,
    quantity        NUMERIC(20, 8) NOT NULL,
    ex_date         DATE NOT NULL,
    pay_date        DATE,
    record_date     DATE,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'received', 'reinvested')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dividends_portfolio ON portfolio.dividends(portfolio_id, ex_date DESC);

-- ============================================================================
-- SCHEMA: analysis (AI Orchestrator + Screener)
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS analysis;

-- AI conversation history
CREATE TABLE analysis.conversations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    title           VARCHAR(255),                    -- Auto-generated from first message
    model_used      VARCHAR(50),
    total_tokens    INTEGER DEFAULT 0,
    message_count   INTEGER DEFAULT 0,
    last_message_at TIMESTAMPTZ,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversations_user ON analysis.conversations(user_id, updated_at DESC);

CREATE TABLE analysis.messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES analysis.conversations(id) ON DELETE CASCADE,
    role            VARCHAR(20) NOT NULL
                    CHECK (role IN ('user', 'assistant', 'system')),
    content         TEXT NOT NULL,
    -- AI metadata
    agents_used     TEXT[] DEFAULT '{}',             -- Which agents contributed
    confidence      NUMERIC(5, 2),                   -- 0-100
    sources         JSONB DEFAULT '[]',              -- [{type, reference, freshness}]
    tokens_used     INTEGER,
    latency_ms      INTEGER,
    model           VARCHAR(50),
    -- User feedback
    feedback_rating INTEGER CHECK (feedback_rating IN (-1, 0, 1)),
    feedback_text   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON analysis.messages(conversation_id, created_at);

-- Semantic cache for AI responses (pgvector)
CREATE TABLE analysis.semantic_cache (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query_text      TEXT NOT NULL,
    query_embedding vector(1536) NOT NULL,           -- text-embedding-3-small
    symbols         TEXT[] NOT NULL DEFAULT '{}',
    response        TEXT NOT NULL,
    agents_used     TEXT[] DEFAULT '{}',
    confidence      NUMERIC(5, 2),
    hit_count       INTEGER DEFAULT 0,
    last_hit_at     TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HNSW index for fast nearest-neighbor search
CREATE INDEX idx_semantic_cache_embedding ON analysis.semantic_cache
    USING hnsw (query_embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- AI-generated investment theses
CREATE TABLE analysis.investment_theses (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol_id       UUID NOT NULL REFERENCES market.symbols(id),
    user_id         UUID REFERENCES identity.users(id),  -- NULL = system-generated
    -- Thesis content
    executive_summary TEXT NOT NULL,
    business_model  TEXT,
    growth_drivers  JSONB NOT NULL DEFAULT '[]',     -- [{driver, impact, confidence}]
    risk_factors    JSONB NOT NULL DEFAULT '[]',     -- [{risk, probability, severity}]
    moat_assessment VARCHAR(20)
                    CHECK (moat_assessment IN ('none', 'narrow', 'wide')),
    -- Valuation
    fair_value_low  NUMERIC(20, 2),
    fair_value_mid  NUMERIC(20, 2),
    fair_value_high NUMERIC(20, 2),
    valuation_method VARCHAR(50),                    -- 'dcf', 'comparables', 'mixed'
    -- Scenarios
    bull_case       JSONB,                           -- {target, probability, assumptions}
    base_case       JSONB,
    bear_case       JSONB,
    -- Meta
    confidence_score NUMERIC(5, 2),
    data_freshness  TIMESTAMPTZ,
    model_version   VARCHAR(20),
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_theses_symbol ON analysis.investment_theses(symbol_id, created_at DESC);

-- Saved screener configurations
CREATE TABLE analysis.saved_screens (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    filters         JSONB NOT NULL,                  -- [{column, operator, value}]
    sort_by         VARCHAR(50) DEFAULT 'market_cap',
    sort_order      VARCHAR(4) DEFAULT 'desc',
    is_template     BOOLEAN NOT NULL DEFAULT FALSE,  -- System templates
    schedule_cron   VARCHAR(50),                     -- For scheduled scans
    last_run_at     TIMESTAMPTZ,
    result_count    INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_screens_user ON analysis.saved_screens(user_id);


-- ============================================================================
-- SCHEMA: alerts (Alert Service)
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS alerts;

CREATE TABLE alerts.rules (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    -- Rule definition
    conditions      JSONB NOT NULL,                  -- [{type, symbol, operator, value}]
    condition_logic VARCHAR(3) NOT NULL DEFAULT 'AND'
                    CHECK (condition_logic IN ('AND', 'OR')),
    -- Delivery
    channels        TEXT[] NOT NULL DEFAULT '{in_app}',  -- in_app, email, push
    -- State
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    cooldown_minutes INTEGER NOT NULL DEFAULT 60,
    max_triggers_per_day INTEGER DEFAULT 10,
    triggers_today  INTEGER DEFAULT 0,
    last_triggered_at TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    -- Metadata
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alert_rules_user ON alerts.rules(user_id) WHERE is_active = TRUE;
CREATE INDEX idx_alert_rules_active ON alerts.rules(is_active, last_triggered_at);

-- Alert trigger history
CREATE TABLE alerts.triggers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_id         UUID NOT NULL REFERENCES alerts.rules(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    -- Trigger details
    condition_met   JSONB NOT NULL,                  -- Which condition(s) fired
    trigger_value   NUMERIC(20, 6),                  -- The value that triggered
    symbol          VARCHAR(20),
    -- Delivery status
    channels_sent   TEXT[] DEFAULT '{}',
    delivery_status JSONB DEFAULT '{}',              -- {channel: status}
    -- User interaction
    acknowledged    BOOLEAN NOT NULL DEFAULT FALSE,
    acknowledged_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_triggers_user ON alerts.triggers(user_id, created_at DESC);
CREATE INDEX idx_triggers_rule ON alerts.triggers(rule_id, created_at DESC);

-- ============================================================================
-- SCHEMA: backtest (Backtest Service)
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS backtest;

CREATE TABLE backtest.strategies (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    strategy_type   VARCHAR(30) NOT NULL
                    CHECK (strategy_type IN ('visual', 'code', 'template')),
    -- Strategy definition
    definition      JSONB NOT NULL,                  -- Visual builder JSON or code reference
    parameters      JSONB DEFAULT '{}',              -- Tunable parameters
    symbols         TEXT[] NOT NULL,                  -- Target symbols
    timeframe       VARCHAR(5) NOT NULL DEFAULT '1d',
    -- Metadata
    is_public       BOOLEAN NOT NULL DEFAULT FALSE,
    version         INTEGER NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_strategies_user ON backtest.strategies(user_id);

CREATE TABLE backtest.runs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    strategy_id     UUID NOT NULL REFERENCES backtest.strategies(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    -- Configuration
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    initial_capital NUMERIC(20, 2) NOT NULL,
    commission_model JSONB NOT NULL DEFAULT '{"type": "per_trade", "value": 0}',
    slippage_bps    NUMERIC(6, 2) DEFAULT 5,
    benchmark       VARCHAR(20) DEFAULT 'SPY',
    -- Status
    status          VARCHAR(20) NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
    progress        NUMERIC(5, 2) DEFAULT 0,         -- 0-100%
    error_message   TEXT,
    -- Results (populated on completion)
    results         JSONB,                           -- Full metrics object
    equity_curve_url VARCHAR(512),                   -- S3 URL for large result sets
    trade_count     INTEGER,
    -- Timing
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    duration_ms     INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_runs_user ON backtest.runs(user_id, created_at DESC);
CREATE INDEX idx_runs_strategy ON backtest.runs(strategy_id, created_at DESC);
CREATE INDEX idx_runs_status ON backtest.runs(status) WHERE status IN ('queued', 'running');

-- ============================================================================
-- SCHEMA: notifications (Notification Service)
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS notifications;

CREATE TABLE notifications.items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    type            VARCHAR(30) NOT NULL
                    CHECK (type IN ('alert', 'system', 'ai_complete', 'backtest_done', 'earnings', 'news')),
    title           VARCHAR(255) NOT NULL,
    body            TEXT,
    icon            VARCHAR(50),
    action_url      VARCHAR(512),
    metadata        JSONB DEFAULT '{}',
    -- State
    read            BOOLEAN NOT NULL DEFAULT FALSE,
    read_at         TIMESTAMPTZ,
    dismissed       BOOLEAN NOT NULL DEFAULT FALSE,
    -- Delivery
    channels_sent   TEXT[] DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications.items(user_id, created_at DESC)
    WHERE dismissed = FALSE;
CREATE INDEX idx_notifications_unread ON notifications.items(user_id)
    WHERE read = FALSE AND dismissed = FALSE;

-- Push subscription tokens
CREATE TABLE notifications.push_subscriptions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    endpoint        TEXT NOT NULL UNIQUE,
    keys            JSONB NOT NULL,                  -- {p256dh, auth} for Web Push
    device_type     VARCHAR(20) DEFAULT 'web',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_push_subs_user ON notifications.push_subscriptions(user_id)
    WHERE is_active = TRUE;

-- ============================================================================
-- SCHEMA: billing (Billing / Subscription Service)
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS billing;

CREATE TABLE billing.subscriptions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    stripe_subscription_id VARCHAR(255) UNIQUE,
    stripe_customer_id VARCHAR(255),
    plan            VARCHAR(20) NOT NULL
                    CHECK (plan IN ('free', 'pro', 'premium', 'enterprise')),
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'past_due', 'cancelled', 'expired', 'trialing')),
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    trial_end       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_subscriptions_user ON billing.subscriptions(user_id)
    WHERE status IN ('active', 'trialing', 'past_due');

-- Usage tracking for metered billing / limits
CREATE TABLE billing.usage (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    resource        VARCHAR(50) NOT NULL,            -- 'ai_queries', 'backtest_runs', 'api_calls'
    quantity        INTEGER NOT NULL DEFAULT 1,
    period_start    DATE NOT NULL,                   -- Billing period start
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usage_user_period ON billing.usage(user_id, resource, period_start);

-- ============================================================================
-- MATERIALIZED VIEWS (Screener + Aggregates)
-- ============================================================================

-- Pre-computed screener data (refreshed every 5 min during market hours)
CREATE MATERIALIZED VIEW market.mv_screener_data AS
SELECT
    s.id AS symbol_id,
    s.symbol,
    s.name,
    s.asset_type,
    s.exchange,
    s.sector,
    s.industry,
    s.country,
    s.market_cap,
    -- Latest quote
    q.price,
    q.change_percent,
    q.volume,
    q.avg_volume_20d,
    q.week_52_high,
    q.week_52_low,
    -- Fundamentals (TTM)
    f.pe_ratio,
    f.forward_pe,
    f.peg_ratio,
    f.pb_ratio,
    f.ps_ratio,
    f.ev_ebitda,
    f.revenue_growth,
    f.eps_growth,
    f.roe,
    f.roic,
    f.gross_margin,
    f.operating_margin,
    f.net_margin,
    f.debt_equity,
    f.current_ratio,
    f.free_cash_flow,
    f.fcf_yield,
    f.dividend_yield,
    f.payout_ratio
FROM market.symbols s
LEFT JOIN market.latest_quotes q ON s.id = q.symbol_id
LEFT JOIN LATERAL (
    SELECT * FROM market.fundamentals
    WHERE symbol_id = s.id AND period = 'ttm'
    ORDER BY fiscal_date DESC LIMIT 1
) f ON TRUE
WHERE s.is_active = TRUE;

CREATE UNIQUE INDEX idx_mv_screener_symbol ON market.mv_screener_data(symbol_id);
CREATE INDEX idx_mv_screener_pe ON market.mv_screener_data(pe_ratio) WHERE pe_ratio IS NOT NULL;
CREATE INDEX idx_mv_screener_growth ON market.mv_screener_data(revenue_growth, eps_growth);
CREATE INDEX idx_mv_screener_div ON market.mv_screener_data(dividend_yield) WHERE dividend_yield > 0;
CREATE INDEX idx_mv_screener_cap ON market.mv_screener_data(market_cap DESC) WHERE market_cap IS NOT NULL;

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON identity.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_portfolios_updated_at BEFORE UPDATE ON portfolio.portfolios
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_holdings_updated_at BEFORE UPDATE ON portfolio.holdings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_alert_rules_updated_at BEFORE UPDATE ON alerts.rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function to refresh screener materialized view
CREATE OR REPLACE FUNCTION market.refresh_screener_view()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY market.mv_screener_data;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ROW-LEVEL SECURITY (Multi-tenant isolation)
-- ============================================================================

-- Enable RLS on user-owned tables
ALTER TABLE portfolio.portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio.holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts.rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications.items ENABLE ROW LEVEL SECURITY;

-- Policies: users can only access their own data
CREATE POLICY portfolio_owner ON portfolio.portfolios
    FOR ALL USING (user_id = current_setting('app.current_user_id')::uuid);
CREATE POLICY holdings_owner ON portfolio.holdings
    FOR ALL USING (portfolio_id IN (
        SELECT id FROM portfolio.portfolios
        WHERE user_id = current_setting('app.current_user_id')::uuid
    ));
CREATE POLICY transactions_owner ON portfolio.transactions
    FOR ALL USING (portfolio_id IN (
        SELECT id FROM portfolio.portfolios
        WHERE user_id = current_setting('app.current_user_id')::uuid
    ));
CREATE POLICY alerts_owner ON alerts.rules
    FOR ALL USING (user_id = current_setting('app.current_user_id')::uuid);
CREATE POLICY conversations_owner ON analysis.conversations
    FOR ALL USING (user_id = current_setting('app.current_user_id')::uuid);
CREATE POLICY notifications_owner ON notifications.items
    FOR ALL USING (user_id = current_setting('app.current_user_id')::uuid);

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
