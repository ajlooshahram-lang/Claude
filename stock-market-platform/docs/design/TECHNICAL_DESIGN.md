# InvestorIQ — Technical Design Document

**Version:** 1.0  
**Date:** 2026-06-22  
**Status:** Approved  
**Classification:** Internal — Engineering

---

## 1. Overview

This document specifies the detailed technical design for InvestorIQ, covering service internals, data models, integration patterns, algorithms, and implementation guidance for each subsystem.

---

## 2. Service Decomposition & Boundaries

### 2.1 Domain-Driven Design — Bounded Contexts

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BOUNDED CONTEXTS                               │
├──────────────────┬──────────────────────────────────────────────────┤
│ Identity Context │ Users, Auth, Sessions, Profiles, Preferences     │
├──────────────────┼──────────────────────────────────────────────────┤
│ Market Context   │ Symbols, Quotes, OHLCV, Fundamentals, News      │
├──────────────────┼──────────────────────────────────────────────────┤
│ Portfolio Context│ Portfolios, Holdings, Transactions, Performance  │
├──────────────────┼──────────────────────────────────────────────────┤
│ Analysis Context │ AI Agents, Theses, Screeners, Indicators        │
├──────────────────┼──────────────────────────────────────────────────┤
│ Alerting Context │ Rules, Triggers, Evaluations, Deliveries        │
├──────────────────┼──────────────────────────────────────────────────┤
│ Backtest Context │ Strategies, Runs, Results, Optimization         │
├──────────────────┼──────────────────────────────────────────────────┤
│ Billing Context  │ Subscriptions, Usage, Invoices, Limits          │
└──────────────────┴──────────────────────────────────────────────────┘
```

### 2.2 Service Ownership Matrix

| Service | Team | Language | DB | Ports |
|---------|------|----------|-----|-------|
| api-gateway | Platform | TypeScript/NestJS | Redis | 3000 |
| user-service | Platform | TypeScript/NestJS | PostgreSQL | 3001 |
| market-data-service | Data | TypeScript/NestJS | TimescaleDB + Redis | 3002 |
| portfolio-service | Core | TypeScript/NestJS | PostgreSQL | 3003 |
| ai-orchestrator | AI | TypeScript/NestJS + Python | PostgreSQL + Redis | 3004 |
| alert-service | Core | TypeScript/NestJS | PostgreSQL + Redis | 3005 |
| backtest-service | Quant | Python + NestJS wrapper | PostgreSQL + S3 | 3006 |
| notification-service | Platform | TypeScript/NestJS | PostgreSQL + Redis | 3007 |
| ml-factor-model | Quant | Python/FastAPI | Redis | 3010 |
| ml-sentiment | AI | Python/FastAPI | Redis | 3011 |
| ml-pattern-recognition | AI | Python/FastAPI | Redis | 3012 |
| ml-monte-carlo | Quant | Python/FastAPI | Redis | 3013 |
| ml-regime-detection | Quant | Python/FastAPI | Redis | 3014 |

---

## 3. API Gateway — Detailed Design

### 3.1 Request Pipeline

```
Client Request
    │
    ▼
┌─────────────────────┐
│ TLS Termination     │ (handled by ingress/load balancer)
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│ Rate Limiter        │ Token bucket per user+endpoint
│ (Redis-backed)      │ Free: 60/min, Pro: 600/min
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│ Authentication      │ JWT validation (RS256)
│ Guard               │ Refresh token rotation
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│ Authorization       │ RBAC + Resource ownership check
│ Guard               │ Tier-based feature gates
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│ Request Validation  │ Zod schemas (DTO validation)
│ Pipe                │ Sanitization + type coercion
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│ Response Cache      │ Redis-backed; cache-key = hash(url+params+user_tier)
│ Interceptor         │ ETags for conditional requests
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│ Route to Service    │ Internal HTTP/gRPC call
│                     │ Circuit breaker + timeout (5s default)
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│ Response Transform  │ Consistent envelope: { data, meta, errors }
│ Interceptor         │ Pagination metadata
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│ Audit Logger        │ Async log to audit stream
└──────────┬──────────┘
           │
           ▼
      Client Response
```

### 3.2 WebSocket Architecture

```typescript
// WebSocket namespaces and rooms
Namespaces:
  /quotes     → Real-time price updates (subscribe by symbol)
  /portfolio  → Portfolio value updates (per-user room)
  /alerts     → Alert notifications (per-user room)
  /ai         → AI response streaming (per-session)

Connection lifecycle:
  1. Client connects with JWT in handshake auth
  2. Server validates token, extracts user_id + tier
  3. Client subscribes to rooms (max symbols: Free=10, Pro=50, Premium=500)
  4. Server pushes updates from Redis pub/sub
  5. Heartbeat every 30s; reconnect with exponential backoff
```

---


## 4. Market Data Service — Detailed Design

### 4.1 Provider Abstraction Layer

```typescript
interface MarketDataProvider {
  name: string;
  priority: number;  // lower = preferred
  healthy: boolean;

  getQuote(symbol: string): Promise<Quote>;
  getHistoricalBars(symbol: string, timeframe: Timeframe, range: DateRange): Promise<Bar[]>;
  getFundamentals(symbol: string): Promise<Fundamentals>;
  searchSymbols(query: string): Promise<SymbolMatch[]>;
  streamQuotes(symbols: string[]): Observable<QuoteUpdate>;
}

// Provider registry with automatic failover
class ProviderRegistry {
  providers: MarketDataProvider[];  // sorted by priority
  circuitBreakers: Map<string, CircuitBreaker>;

  async execute<T>(method: string, ...args: any[]): Promise<T> {
    for (const provider of this.providers) {
      if (!this.circuitBreakers.get(provider.name).isOpen()) {
        try {
          return await provider[method](...args);
        } catch (e) {
          this.circuitBreakers.get(provider.name).recordFailure();
          continue;  // try next provider
        }
      }
    }
    throw new AllProvidersFailedError();
  }
}
```

### 4.2 Data Ingestion Pipeline

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌───────────┐
│ Cron Jobs   │────▶│ Fetch Worker │────▶│ Transform    │────▶│ Store     │
│ (node-cron) │     │ (Bull Queue) │     │ & Validate   │     │ (Timescale│
└─────────────┘     └──────────────┘     └──────────────┘     │ + Redis)  │
                                                                └───────────┘
Schedule:
  - Real-time quotes: WebSocket stream → Redis (continuous during market hours)
  - 1-min bars: Every minute during market hours
  - Daily OHLCV: 18:00 ET (after close) + 09:00 ET (pre-market)
  - Fundamentals: Quarterly (earnings season) + weekly refresh
  - News: Continuous polling (30s interval)
  - Insider trades: Daily at 22:00 ET
```

### 4.3 Caching Architecture for Market Data

```
┌──────────────────────────────────────────────────────────┐
│                   MARKET DATA CACHE LAYERS                 │
├──────────────────┬───────────────────────────────────────┤
│ Latest Quote     │ Redis Hash: quote:{symbol}            │
│                  │ TTL: 15s (real-time) / none (stream)  │
│                  │ Fields: price, change, volume, time   │
├──────────────────┼───────────────────────────────────────┤
│ Daily Bars       │ Redis Sorted Set: bars:daily:{symbol} │
│ (last 30 days)   │ Score: timestamp, TTL: 24h            │
├──────────────────┼───────────────────────────────────────┤
│ Fundamentals     │ Redis Hash: fundamentals:{symbol}     │
│                  │ TTL: 6 hours                           │
├──────────────────┼───────────────────────────────────────┤
│ Search Index     │ Elasticsearch: symbols index          │
│                  │ Refresh: every 24h (full reindex)     │
├──────────────────┼───────────────────────────────────────┤
│ Historical       │ TimescaleDB continuous aggregates     │
│ (long-term)      │ Materialized: 1h, 1d, 1w, 1M        │
└──────────────────┴───────────────────────────────────────┘
```

### 4.4 Technical Indicator Computation

```python
# Indicator computation runs server-side for consistency
# Computed on-demand with caching (TTL: bar interval)

class IndicatorEngine:
    """Computes technical indicators from OHLCV data."""

    def compute(self, bars: List[Bar], indicators: List[IndicatorConfig]) -> Dict:
        results = {}
        for config in indicators:
            match config.type:
                case "SMA":
                    results[config.id] = self._sma(bars, config.period)
                case "EMA":
                    results[config.id] = self._ema(bars, config.period)
                case "RSI":
                    results[config.id] = self._rsi(bars, config.period)
                case "MACD":
                    results[config.id] = self._macd(bars, config.fast, config.slow, config.signal)
                case "BOLLINGER":
                    results[config.id] = self._bollinger(bars, config.period, config.std_dev)
                case "ATR":
                    results[config.id] = self._atr(bars, config.period)
                case "VWAP":
                    results[config.id] = self._vwap(bars)
                case "ICHIMOKU":
                    results[config.id] = self._ichimoku(bars, config.tenkan, config.kijun, config.senkou)
        return results

    def _rsi(self, bars: List[Bar], period: int = 14) -> List[float]:
        """Wilder's RSI implementation."""
        deltas = [bars[i].close - bars[i-1].close for i in range(1, len(bars))]
        gains = [d if d > 0 else 0 for d in deltas]
        losses = [-d if d < 0 else 0 for d in deltas]
        # Wilder's smoothing (exponential)
        avg_gain = sum(gains[:period]) / period
        avg_loss = sum(losses[:period]) / period
        rsi_values = []
        for i in range(period, len(deltas)):
            avg_gain = (avg_gain * (period - 1) + gains[i]) / period
            avg_loss = (avg_loss * (period - 1) + losses[i]) / period
            rs = avg_gain / avg_loss if avg_loss != 0 else float('inf')
            rsi_values.append(100 - (100 / (1 + rs)))
        return rsi_values
```

---

## 5. Portfolio Service — CQRS Design

### 5.1 Command Side (Writes)

```typescript
// Commands are validated, then emit domain events
interface PortfolioCommands {
  createPortfolio(cmd: CreatePortfolioCmd): Promise<Portfolio>;
  addHolding(cmd: AddHoldingCmd): Promise<Holding>;
  removeHolding(cmd: RemoveHoldingCmd): Promise<void>;
  recordTransaction(cmd: RecordTransactionCmd): Promise<Transaction>;
  importCSV(cmd: ImportCSVCmd): Promise<ImportResult>;
}

// Domain Events emitted:
// - PortfolioCreated
// - HoldingAdded
// - HoldingRemoved
// - TransactionRecorded
// - PortfolioRebalanced
```

### 5.2 Query Side (Reads)

```typescript
// Read models are denormalized views optimized for display
interface PortfolioQueries {
  getPortfolioSummary(portfolioId: string): Promise<PortfolioSummary>;
  getHoldings(portfolioId: string): Promise<HoldingView[]>;
  getPerformance(portfolioId: string, range: DateRange): Promise<PerformanceTimeSeries>;
  getAllocation(portfolioId: string): Promise<AllocationBreakdown>;
  getDividendSchedule(portfolioId: string): Promise<DividendSchedule>;
}

// PortfolioSummary (pre-computed, refreshed every 5 min + on events)
interface PortfolioSummary {
  totalValue: Money;
  totalCost: Money;
  totalGainLoss: Money;
  totalGainLossPercent: number;
  dayChange: Money;
  dayChangePercent: number;
  allocation: { sector: Record<string, number>; geography: Record<string, number> };
  riskMetrics: { beta: number; sharpe: number; volatility: number };
  lastUpdated: Date;
}
```

### 5.3 Performance Calculation Engine

```typescript
// Time-Weighted Return (TWR) for accurate performance measurement
function calculateTWR(snapshots: PortfolioSnapshot[], cashFlows: CashFlow[]): number {
  let compoundReturn = 1.0;
  for (let i = 1; i < snapshots.length; i++) {
    const startValue = snapshots[i - 1].totalValue;
    const endValue = snapshots[i].totalValue;
    const flows = cashFlows.filter(cf =>
      cf.date >= snapshots[i - 1].date && cf.date < snapshots[i].date
    );
    const netFlow = flows.reduce((sum, cf) => sum + cf.amount, 0);
    const periodReturn = (endValue - startValue - netFlow) / (startValue + netFlow);
    compoundReturn *= (1 + periodReturn);
  }
  return compoundReturn - 1;
}
```

---

## 6. AI Orchestrator — Detailed Design

### 6.1 Request Processing Pipeline

```
User Query: "Is NVIDIA overvalued considering the AI spending slowdown?"
    │
    ▼
┌────────────────────────────────────────────────────────────────┐
│ 1. INTENT CLASSIFICATION                                        │
│    Model: Fine-tuned classifier (or GPT-4o function calling)    │
│    Output: { intents: [VALUATION, FUNDAMENTAL, NEWS_AWARE],     │
│              entities: [NVDA], confidence: 0.94 }               │
└────────────────────┬───────────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────────────┐
│ 2. AGENT SELECTION & ROUTING                                    │
│    Based on intents → select agents:                            │
│    - InvestmentAnalyst (VALUATION + FUNDAMENTAL)                │
│    - NewsIntelligence (NEWS_AWARE → "AI spending slowdown")     │
│    - QuantAgent (valuation metrics comparison)                  │
│    Execution: Parallel (all independent)                        │
└────────────────────┬───────────────────────────────────────────┘
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
┌──────────────┐ ┌────────┐ ┌──────────┐
│ Analyst Agent│ │News    │ │Quant     │
│              │ │Agent   │ │Agent     │
│ Context:     │ │        │ │          │
│ - NVDA fins  │ │Context:│ │Context:  │
│ - Peers data │ │- News  │ │- Metrics │
│ - Hist vals  │ │- Sent. │ │- Peers   │
└──────┬───────┘ └───┬────┘ └────┬─────┘
       │             │           │
       └─────────────┼───────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────────────┐
│ 3. RESPONSE MERGER                                              │
│    - Combine agent outputs (eliminate redundancy)                │
│    - Detect contradictions → present both sides                 │
│    - Weight by agent confidence scores                          │
│    - Generate unified narrative                                  │
└────────────────────┬───────────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────────────┐
│ 4. EXPLAINABILITY LAYER                                         │
│    - Add confidence score (weighted average of agents)           │
│    - Cite data sources with freshness timestamps                │
│    - Generate "Why this conclusion?" section                    │
│    - Add caveats and limitations                                │
│    - Suggest follow-up questions                                 │
└────────────────────┬───────────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────────────┐
│ 5. COMPLIANCE FILTER                                            │
│    - Append disclaimer                                          │
│    - Verify no specific buy/sell recommendation language         │
│    - Check for hallucination signals (numbers without sources)  │
└────────────────────┬───────────────────────────────────────────┘
                     │
                     ▼
              Streamed to Client (SSE)
```

### 6.2 Semantic Cache Design

```typescript
// Semantic caching to avoid redundant LLM calls for similar questions
interface SemanticCache {
  // Store response with embedding of the query
  set(query: string, response: AIResponse, embedding: number[]): Promise<void>;

  // Find cached response if semantically similar query exists
  find(query: string, embedding: number[], threshold: number): Promise<AIResponse | null>;
}

// Implementation using pgvector
// 1. Embed query using text-embedding-3-small (1536 dims)
// 2. Vector similarity search: cosine > 0.92 threshold
// 3. Additional filters: same symbols, recency < 1 hour
// 4. Cache hit → return stored response (saves ~$0.03-0.10 per query)
// Expected hit rate: 15-25% (many users ask similar questions about popular stocks)
```

### 6.3 Context Assembly

```typescript
// Each agent receives a curated context window
interface AgentContext {
  // Market data relevant to the query
  marketData: {
    quotes: Quote[];              // Current prices
    historicalBars: Bar[];        // Last 252 trading days
    fundamentals: Fundamentals;   // Latest financial data
    peers: PeerComparison[];      // Industry comparables
  };
  // User context (personalization)
  userContext: {
    expertiseLevel: 'beginner' | 'intermediate' | 'advanced';
    riskTolerance: 'conservative' | 'balanced' | 'aggressive';
    holdings: string[];           // User's current positions (for conflict awareness)
  };
  // Conversation history (last 5 turns)
  conversationHistory: Message[];
  // Query metadata
  queryMetadata: {
    symbols: string[];
    intents: string[];
    timeframe: string;
  };
}
```

---


## 7. Alert Service — Event Processing Design

### 7.1 Alert Evaluation Architecture

```
Market Data Stream (Redis pub/sub)
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│ ALERT EVALUATION ENGINE                                       │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ Symbol Router                                           │ │
│  │ - Maintains map: symbol → [alert_rule_ids]              │ │
│  │ - On quote update: find matching rules                  │ │
│  └────────────────────────┬────────────────────────────────┘ │
│                           │                                   │
│  ┌────────────────────────▼────────────────────────────────┐ │
│  │ Condition Evaluator                                      │ │
│  │ - Price: current vs. target (above/below/crosses)       │ │
│  │ - % Change: daily change vs. threshold                  │ │
│  │ - Technical: RSI/MACD vs. level (requires indicator)    │ │
│  │ - Volume: current vs. N-day average ratio               │ │
│  └────────────────────────┬────────────────────────────────┘ │
│                           │                                   │
│  ┌────────────────────────▼────────────────────────────────┐ │
│  │ Deduplication & Cooldown                                 │ │
│  │ - Same alert: cooldown 1h (configurable)                │ │
│  │ - Max alerts per user per day: Free=10, Pro=50          │ │
│  │ - Suppression during market closed (optional)           │ │
│  └────────────────────────┬────────────────────────────────┘ │
│                           │                                   │
│  ┌────────────────────────▼────────────────────────────────┐ │
│  │ Delivery Router                                          │ │
│  │ - In-app: WebSocket push (immediate)                    │ │
│  │ - Email: SendGrid queue (batch if > 3/min)              │ │
│  │ - Push: FCM/APNs (immediate for critical)               │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 7.2 Alert Rule DSL

```typescript
// Alert rules stored as JSON; evaluated against market data stream
interface AlertRule {
  id: string;
  userId: string;
  name: string;
  active: boolean;
  conditions: AlertCondition[];       // AND logic between conditions
  conditionLogic: 'AND' | 'OR';
  actions: AlertAction[];
  cooldownMinutes: number;
  expiresAt?: Date;
  lastTriggeredAt?: Date;
}

type AlertCondition =
  | { type: 'PRICE_ABOVE'; symbol: string; value: number }
  | { type: 'PRICE_BELOW'; symbol: string; value: number }
  | { type: 'PRICE_CROSSES'; symbol: string; value: number; direction: 'up' | 'down' }
  | { type: 'PERCENT_CHANGE'; symbol: string; period: '1d' | '1w'; threshold: number; direction: 'up' | 'down' }
  | { type: 'RSI_ABOVE'; symbol: string; value: number; period: number }
  | { type: 'RSI_BELOW'; symbol: string; value: number; period: number }
  | { type: 'VOLUME_SPIKE'; symbol: string; multiplier: number }
  | { type: 'EARNINGS_WITHIN'; symbol: string; days: number }
  | { type: 'PORTFOLIO_CHANGE'; portfolioId: string; threshold: number; direction: 'down' | 'up' };
```

---

## 8. Backtest Engine — Technical Design

### 8.1 Execution Model

```python
class BacktestEngine:
    """Event-driven backtesting engine with realistic execution simulation."""

    def __init__(self, config: BacktestConfig):
        self.initial_capital = config.initial_capital
        self.commission_model = config.commission_model  # flat, per-share, percentage
        self.slippage_model = config.slippage_model      # fixed bps, volume-dependent
        self.data_provider = HistoricalDataProvider(config.data_range)

    def run(self, strategy: Strategy) -> BacktestResult:
        portfolio = SimulatedPortfolio(self.initial_capital)
        equity_curve = []
        trade_log = []

        for bar in self.data_provider.iter_bars():
            # 1. Update portfolio with current prices
            portfolio.mark_to_market(bar)

            # 2. Process pending orders (fill simulation)
            fills = self._process_orders(portfolio.pending_orders, bar)
            trade_log.extend(fills)

            # 3. Run strategy logic
            signals = strategy.on_bar(bar, portfolio.state)

            # 4. Convert signals to orders
            for signal in signals:
                order = self._signal_to_order(signal, bar, portfolio)
                portfolio.submit_order(order)

            # 5. Record equity
            equity_curve.append(EquityPoint(
                timestamp=bar.timestamp,
                equity=portfolio.total_equity,
                cash=portfolio.cash,
                positions_value=portfolio.positions_value
            ))

        return self._compute_results(equity_curve, trade_log)

    def _process_orders(self, orders: List[Order], bar: Bar) -> List[Fill]:
        """Simulate realistic order execution with slippage."""
        fills = []
        for order in orders:
            fill_price = self._apply_slippage(order, bar)
            commission = self._compute_commission(order, fill_price)
            fills.append(Fill(
                order_id=order.id,
                price=fill_price,
                quantity=order.quantity,
                commission=commission,
                timestamp=bar.timestamp
            ))
        return fills
```

### 8.2 Strategy Interface

```python
class Strategy(ABC):
    """Base class for all trading strategies."""

    @abstractmethod
    def on_bar(self, bar: Bar, state: PortfolioState) -> List[Signal]:
        """Called on each new bar. Return buy/sell signals."""
        pass

    def on_start(self, context: BacktestContext) -> None:
        """Called once at backtest start. Initialize indicators."""
        pass

    def on_end(self, context: BacktestContext) -> None:
        """Called once at backtest end. Cleanup."""
        pass

# Example: Simple Moving Average Crossover
class SMACrossover(Strategy):
    def __init__(self, fast_period: int = 20, slow_period: int = 50):
        self.fast_period = fast_period
        self.slow_period = slow_period

    def on_bar(self, bar: Bar, state: PortfolioState) -> List[Signal]:
        fast_sma = bar.indicators.get(f'SMA_{self.fast_period}')
        slow_sma = bar.indicators.get(f'SMA_{self.slow_period}')
        if fast_sma is None or slow_sma is None:
            return []

        prev_fast = bar.prev_indicators.get(f'SMA_{self.fast_period}')
        prev_slow = bar.prev_indicators.get(f'SMA_{self.slow_period}')

        signals = []
        # Golden cross: fast crosses above slow
        if prev_fast <= prev_slow and fast_sma > slow_sma:
            signals.append(Signal(type='BUY', symbol=bar.symbol, strength=1.0))
        # Death cross: fast crosses below slow
        elif prev_fast >= prev_slow and fast_sma < slow_sma:
            signals.append(Signal(type='SELL', symbol=bar.symbol, strength=1.0))

        return signals
```

### 8.3 Result Metrics Computation

```python
@dataclass
class BacktestMetrics:
    # Returns
    total_return: float           # Total % return
    cagr: float                   # Compound Annual Growth Rate
    annualized_volatility: float  # Annualized std dev of returns

    # Risk-Adjusted
    sharpe_ratio: float           # (return - rf) / volatility
    sortino_ratio: float          # (return - rf) / downside_deviation
    calmar_ratio: float           # CAGR / max_drawdown

    # Drawdown
    max_drawdown: float           # Worst peak-to-trough
    avg_drawdown: float           # Average drawdown
    max_drawdown_duration: int    # Days in worst drawdown

    # Trade Statistics
    total_trades: int
    win_rate: float               # % of profitable trades
    profit_factor: float          # gross_profit / gross_loss
    avg_win: float                # Average winning trade %
    avg_loss: float               # Average losing trade %
    max_consecutive_losses: int

    # Exposure
    time_in_market: float         # % of time with positions
    avg_position_duration: int    # Days

    # Benchmark Comparison
    alpha: float                  # Excess return vs benchmark
    beta: float                   # Sensitivity to benchmark
    information_ratio: float      # Alpha / tracking_error
```

---

## 9. Screener Engine — Query Optimization

### 9.1 Query Execution Plan

```sql
-- Screener queries must execute < 500ms for 8000+ symbols
-- Strategy: pre-computed materialized views + composite indexes

-- Materialized View: refreshed every 5 minutes during market hours
CREATE MATERIALIZED VIEW mv_screener_data AS
SELECT
    s.symbol, s.name, s.sector, s.industry, s.market_cap,
    q.price, q.change_pct, q.volume,
    f.pe_ratio, f.forward_pe, f.peg_ratio, f.pb_ratio, f.ps_ratio,
    f.ev_ebitda, f.revenue_growth_yoy, f.eps_growth_yoy,
    f.roe, f.roic, f.gross_margin, f.net_margin,
    f.debt_equity, f.current_ratio, f.free_cash_flow,
    f.dividend_yield, f.payout_ratio,
    t.rsi_14, t.sma_50, t.sma_200, t.macd_signal,
    t.atr_14, t.volume_avg_20d
FROM symbols s
JOIN latest_quotes q ON s.id = q.symbol_id
JOIN fundamentals f ON s.id = f.symbol_id
LEFT JOIN technical_indicators t ON s.id = t.symbol_id;

-- Composite index for common filter combinations
CREATE INDEX idx_screener_value ON mv_screener_data (pe_ratio, peg_ratio, ev_ebitda)
    WHERE pe_ratio IS NOT NULL;
CREATE INDEX idx_screener_growth ON mv_screener_data (revenue_growth_yoy, eps_growth_yoy, roe);
CREATE INDEX idx_screener_dividend ON mv_screener_data (dividend_yield, payout_ratio)
    WHERE dividend_yield > 0;
```

### 9.2 Filter Execution

```typescript
// Dynamic query builder with injection protection
class ScreenerQueryBuilder {
  private conditions: QueryCondition[] = [];
  private sorts: SortClause[] = [];
  private limit: number = 50;
  private offset: number = 0;

  addFilter(filter: ScreenerFilter): this {
    // Validate filter against allowed columns (whitelist)
    if (!ALLOWED_COLUMNS.includes(filter.column)) {
      throw new InvalidFilterError(filter.column);
    }
    // Parameterized query construction (no SQL injection)
    this.conditions.push({
      column: filter.column,
      operator: this.validateOperator(filter.operator),
      value: filter.value,  // bound as parameter
    });
    return this;
  }

  build(): { sql: string; params: any[] } {
    // Generates parameterized SQL against materialized view
    // Always includes: WHERE active = true AND market_cap > 0
  }
}
```

---

## 10. Real-Time Data Pipeline

### 10.1 Quote Distribution Architecture

```
External WebSocket (Polygon)
    │
    ▼
┌─────────────────────────────────┐
│ Market Data Ingestion Worker    │
│ - Parse incoming messages       │
│ - Validate & normalize          │
│ - Publish to Redis pub/sub      │
│ - Update Redis hash (latest)    │
│ - Buffer for TimescaleDB write  │
└────────────────┬────────────────┘
                 │
    ┌────────────┼────────────────┐
    ▼            ▼                ▼
┌────────┐  ┌────────────┐  ┌──────────────┐
│ Redis  │  │ Alert      │  │ Portfolio    │
│ Pub/Sub│  │ Evaluator  │  │ Value Update │
│        │  │ (consumer) │  │ (consumer)   │
└───┬────┘  └────────────┘  └──────────────┘
    │
    ▼
┌────────────────────────────────────────┐
│ WebSocket Hub (API Gateway)            │
│ - Route updates to subscribed clients  │
│ - Apply tier-based throttling          │
│   Free: 1 update/15s per symbol        │
│   Pro/Premium: real-time               │
└────────────────────────────────────────┘
```

### 10.2 Throughput Targets

| Metric | Target |
|--------|--------|
| Quote messages/second (ingest) | 50,000+ |
| Redis pub/sub latency | < 1ms |
| Client WebSocket delivery | < 50ms from source |
| Concurrent WebSocket connections | 100,000+ |
| TimescaleDB batch insert rate | 100,000 rows/second |

---

## 11. Search & Discovery

### 11.1 Elasticsearch Index Design

```json
{
  "symbols": {
    "mappings": {
      "properties": {
        "symbol": { "type": "keyword" },
        "name": { "type": "text", "analyzer": "autocomplete" },
        "description": { "type": "text" },
        "sector": { "type": "keyword" },
        "industry": { "type": "keyword" },
        "exchange": { "type": "keyword" },
        "market_cap": { "type": "long" },
        "popularity_score": { "type": "float" },
        "suggest": {
          "type": "completion",
          "contexts": [
            { "name": "asset_type", "type": "category" }
          ]
        }
      }
    },
    "settings": {
      "analysis": {
        "analyzer": {
          "autocomplete": {
            "tokenizer": "autocomplete_tokenizer",
            "filter": ["lowercase"]
          }
        },
        "tokenizer": {
          "autocomplete_tokenizer": {
            "type": "edge_ngram",
            "min_gram": 1,
            "max_gram": 10,
            "token_chars": ["letter", "digit"]
          }
        }
      }
    }
  }
}
```

---

## 12. Error Handling & Observability

### 12.1 Error Classification

```typescript
enum ErrorSeverity {
  LOW = 'low',         // UI glitch, non-blocking
  MEDIUM = 'medium',   // Degraded feature, user can continue
  HIGH = 'high',       // Feature unavailable
  CRITICAL = 'critical' // System-wide impact, data integrity risk
}

// Structured error response (consistent across all services)
interface APIError {
  code: string;           // Machine-readable: 'MARKET_DATA_UNAVAILABLE'
  message: string;        // Human-readable
  severity: ErrorSeverity;
  retryable: boolean;
  retryAfterMs?: number;
  context?: Record<string, any>;  // Debug info (non-sensitive)
  traceId: string;        // OpenTelemetry trace ID for debugging
}
```

### 12.2 Distributed Tracing

```
Every request gets a trace ID propagated through all services:

Client → Gateway (trace created) → Service A → Service B → ML Service
   │         │                          │            │           │
   └─────────┴──────────────────────────┴────────────┴───────────┘
                        All spans linked to same trace

Instrumentation:
- HTTP: auto-instrumented via OpenTelemetry SDK
- Database: query spans with timing
- Redis: command spans
- LLM calls: spans with token counts, model, latency
- Custom: business-logic spans (e.g., "compute_portfolio_risk")
```

---

## 13. Configuration & Feature Flags

### 13.1 Configuration Hierarchy

```
1. Environment variables (secrets, infrastructure)
2. Config service (dynamic, runtime-changeable)
3. Feature flags (gradual rollout, A/B testing)
4. User preferences (personalization)

Priority: env > config service > feature flags > defaults
```

### 13.2 Feature Flag Schema

```typescript
interface FeatureFlag {
  key: string;                    // 'ai_thesis_generator_v2'
  enabled: boolean;               // Global kill switch
  rolloutPercentage: number;      // 0-100 (gradual rollout)
  allowedTiers: UserTier[];       // ['pro', 'premium']
  allowedUsers: string[];         // Specific user IDs (beta testers)
  metadata: Record<string, any>;  // Additional config for the feature
}
```

---

*End of Technical Design Document*
