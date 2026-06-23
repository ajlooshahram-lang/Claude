# InvestorIQ — Backend Microservice Architecture

**Version:** 1.0  
**Date:** 2026-06-22  
**Status:** Approved  

---

## 1. Service Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BACKEND SERVICE MESH                                  │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        API GATEWAY (Port 3000)                        │   │
│  │  NestJS + Fastify | Auth | Rate Limit | WS Hub | Routing | Cache     │   │
│  └────────────────────────────────┬─────────────────────────────────────┘   │
│                                   │                                          │
│  ┌────────────────────────────────┼─────────────────────────────────────┐   │
│  │                    INTERNAL SERVICE NETWORK                            │   │
│  │                                                                        │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  │   │
│  │  │ User Svc    │  │ Market Data │  │ Portfolio   │  │ AI Orch.   │  │   │
│  │  │ :3001       │  │ Svc :3002   │  │ Svc :3003   │  │ :3004      │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘  │   │
│  │                                                                        │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  │   │
│  │  │ Alert Svc   │  │ Backtest    │  │ Notif. Svc  │  │ Billing    │  │   │
│  │  │ :3005       │  │ Svc :3006   │  │ :3007       │  │ Svc :3008  │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘  │   │
│  │                                                                        │   │
│  │  ┌────────────────────────────────────────────────────────────────┐   │   │
│  │  │            PYTHON ML SERVICES (FastAPI)                         │   │   │
│  │  │  Factor:3010 | Sentiment:3011 | Pattern:3012 | MC:3013 | RD:3014│  │   │
│  │  └────────────────────────────────────────────────────────────────┘   │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐   │
│  │                         MESSAGE BUS (NATS JetStream)                   │   │
│  │  Subjects: market.*, portfolio.*, alerts.*, ai.*, notifications.*      │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐   │
│  │                         DATA STORES                                    │   │
│  │  PostgreSQL:5432 | TimescaleDB:5433 | Redis:6379 | Elasticsearch:9200 │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Service Specifications

### 2.1 API Gateway

```
Purpose: Single entry point; authentication, authorization, routing, rate 
         limiting, WebSocket management, response caching, request validation.

Technology: NestJS 10 + Fastify adapter
Port: 3000
Dependencies: Redis (sessions, rate limits, cache), all downstream services

Module Structure:
src/
├── main.ts
├── app.module.ts
├── config/
│   ├── configuration.ts            # Typed config via @nestjs/config
│   ├── redis.config.ts
│   └── cors.config.ts
├── middleware/
│   ├── request-id.middleware.ts     # Inject X-Request-ID
│   ├── logger.middleware.ts         # Structured request logging
│   └── compression.middleware.ts
├── guards/
│   ├── auth.guard.ts                # JWT validation
│   ├── roles.guard.ts               # RBAC enforcement
│   ├── tier.guard.ts                # Feature gate by subscription tier
│   └── throttle.guard.ts            # Rate limiting
├── interceptors/
│   ├── cache.interceptor.ts         # Redis response cache
│   ├── transform.interceptor.ts     # Envelope: { data, meta, errors }
│   ├── timeout.interceptor.ts       # Per-route timeouts
│   └── logging.interceptor.ts       # Performance tracking
├── pipes/
│   ├── zod-validation.pipe.ts       # Zod schema validation
│   └── sanitize.pipe.ts             # XSS protection
├── modules/
│   ├── proxy/                       # Route proxy to downstream services
│   │   ├── proxy.module.ts
│   │   ├── proxy.controller.ts
│   │   └── proxy.service.ts
│   ├── websocket/                   # WebSocket hub
│   │   ├── ws.gateway.ts
│   │   ├── ws.module.ts
│   │   └── rooms.service.ts
│   └── health/                      # Health checks
│       ├── health.module.ts
│       └── health.controller.ts
├── filters/
│   ├── http-exception.filter.ts     # Global exception handler
│   └── all-exceptions.filter.ts
└── shared/
    ├── decorators/                   # Custom decorators
    │   ├── current-user.decorator.ts
    │   ├── tier-required.decorator.ts
    │   └── public.decorator.ts
    └── dto/                          # Common DTOs
```

**Key Patterns:**
```typescript
// Rate limiting with tiered configuration
@Injectable()
export class TierThrottleGuard extends ThrottlerGuard {
  protected async getLimit(context: ExecutionContext): Promise<number> {
    const user = context.switchToHttp().getRequest().user;
    const limits = { free: 60, pro: 600, premium: 6000, enterprise: 60000 };
    return limits[user?.tier ?? 'free'];
  }
}

// Circuit breaker for downstream calls
@Injectable()
export class ProxyService {
  private breakers: Map<string, CircuitBreaker> = new Map();

  async forward(service: string, path: string, options: RequestOptions) {
    const breaker = this.getBreaker(service);
    return breaker.fire(async () => {
      return this.httpService.request({
        url: `http://${service}:${PORTS[service]}${path}`,
        ...options,
        timeout: 5000,
      });
    });
  }
}
```

---

### 2.2 User Service

```
Purpose: Authentication, user management, profiles, preferences, sessions.

Technology: NestJS 10
Port: 3001
Database: PostgreSQL (identity schema)
Dependencies: Redis (sessions), SendGrid (email verification)

Module Structure:
src/
├── modules/
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── strategies/
│   │   │   ├── jwt.strategy.ts
│   │   │   ├── google.strategy.ts
│   │   │   └── apple.strategy.ts
│   │   ├── guards/
│   │   │   └── mfa.guard.ts
│   │   └── dto/
│   │       ├── register.dto.ts
│   │       ├── login.dto.ts
│   │       └── refresh.dto.ts
│   ├── users/
│   │   ├── users.module.ts
│   │   ├── users.controller.ts
│   │   ├── users.service.ts
│   │   └── entities/
│   │       ├── user.entity.ts
│   │       └── profile.entity.ts
│   └── preferences/
│       ├── preferences.module.ts
│       ├── preferences.controller.ts
│       └── preferences.service.ts
├── events/
│   ├── user-created.event.ts
│   └── user-updated.event.ts
└── config/
    └── auth.config.ts

Domain Events Emitted:
  - user.created → Welcome email, default portfolio creation
  - user.updated → Preference sync, AI personalization refresh
  - user.tier_changed → Feature gate recalculation
  - user.deleted → GDPR cascade deletion
```

---

### 2.3 Market Data Service

```
Purpose: Ingest, normalize, cache, and serve market data from multiple 
         providers with automatic failover.

Technology: NestJS 10 + Bull queues
Port: 3002
Database: TimescaleDB (OHLCV), Redis (quotes cache), Elasticsearch (search)
Dependencies: Polygon, Alpha Vantage, Finnhub, FRED

Module Structure:
src/
├── modules/
│   ├── quotes/
│   │   ├── quotes.module.ts
│   │   ├── quotes.controller.ts      # GET /quotes/:symbol
│   │   ├── quotes.service.ts
│   │   └── quotes.gateway.ts         # WebSocket feed
│   ├── bars/
│   │   ├── bars.module.ts
│   │   ├── bars.controller.ts        # GET /bars/:symbol
│   │   └── bars.service.ts
│   ├── fundamentals/
│   │   ├── fundamentals.module.ts
│   │   ├── fundamentals.controller.ts
│   │   └── fundamentals.service.ts
│   ├── indicators/
│   │   ├── indicators.module.ts
│   │   ├── indicators.controller.ts
│   │   └── indicators.engine.ts      # Compute RSI, MACD, etc.
│   ├── news/
│   │   ├── news.module.ts
│   │   ├── news.controller.ts
│   │   └── news.service.ts
│   └── search/
│       ├── search.module.ts
│       ├── search.controller.ts
│       └── search.service.ts          # Elasticsearch
├── providers/
│   ├── provider.interface.ts          # Abstract provider contract
│   ├── provider.registry.ts           # Failover logic
│   ├── polygon.provider.ts
│   ├── alpha-vantage.provider.ts
│   ├── finnhub.provider.ts
│   └── fred.provider.ts
├── ingestion/
│   ├── ingestion.module.ts
│   ├── schedulers/
│   │   ├── realtime.scheduler.ts      # WebSocket stream
│   │   ├── daily-bars.scheduler.ts    # After market close
│   │   ├── fundamentals.scheduler.ts  # Weekly + earnings
│   │   └── news.scheduler.ts          # Every 30s
│   └── processors/
│       ├── bar.processor.ts           # Bull queue processor
│       └── news.processor.ts
├── cache/
│   ├── quote-cache.service.ts         # Redis hash per symbol
│   └── bar-cache.service.ts
└── transformers/
    ├── normalize-quote.ts
    └── normalize-fundamentals.ts

Key Design: Provider Registry with Circuit Breaker
```

---

### 2.4 Portfolio Service

```
Purpose: Multi-portfolio management, holdings CRUD, performance calculation,
         risk analysis, dividend tracking.

Technology: NestJS 10 + TypeORM
Port: 3003
Database: PostgreSQL (portfolio schema)
Pattern: CQRS (separate read/write models)

Module Structure:
src/
├── modules/
│   ├── portfolios/
│   │   ├── portfolios.module.ts
│   │   ├── commands/                  # Write side
│   │   │   ├── create-portfolio.handler.ts
│   │   │   ├── add-holding.handler.ts
│   │   │   ├── remove-holding.handler.ts
│   │   │   └── record-transaction.handler.ts
│   │   ├── queries/                   # Read side
│   │   │   ├── get-portfolio-summary.handler.ts
│   │   │   ├── get-performance.handler.ts
│   │   │   └── get-allocation.handler.ts
│   │   ├── portfolios.controller.ts
│   │   └── entities/
│   │       ├── portfolio.entity.ts
│   │       ├── holding.entity.ts
│   │       └── transaction.entity.ts
│   ├── performance/
│   │   ├── performance.module.ts
│   │   ├── performance.service.ts     # TWR, CAGR, benchmarks
│   │   └── snapshot.service.ts        # Daily snapshots
│   ├── risk/
│   │   ├── risk.module.ts
│   │   ├── risk.service.ts            # Beta, Sharpe, VaR
│   │   └── correlation.service.ts
│   ├── dividends/
│   │   ├── dividends.module.ts
│   │   └── dividends.service.ts
│   └── import/
│       ├── import.module.ts
│       ├── csv-parser.service.ts
│       └── validators/
│           └── csv-schema.validator.ts
├── events/
│   ├── portfolio-updated.event.ts
│   ├── holding-added.event.ts
│   └── transaction-recorded.event.ts
└── schedulers/
    └── snapshot.scheduler.ts           # Daily EOD snapshot

Domain Events Emitted:
  - portfolio.updated → AI Advisor refresh, Alert evaluation
  - holding.added → Watchlist sync, Quote subscription
  - transaction.recorded → Performance recalc, Tax lot update
```

---

### 2.5 AI Orchestrator

```
Purpose: Multi-agent AI coordination, LLM provider management, context 
         assembly, response merging, semantic caching, compliance filtering.

Technology: NestJS 10 + Python sidecar (for ML inference)
Port: 3004
Database: PostgreSQL (analysis schema), Redis (semantic cache, queues)
Dependencies: OpenAI API, Anthropic API, ML Services, Market Data Service

Module Structure:
src/
├── modules/
│   ├── chat/
│   │   ├── chat.module.ts
│   │   ├── chat.controller.ts         # POST /ai/chat (SSE streaming)
│   │   ├── chat.service.ts
│   │   └── streaming.service.ts       # SSE token streaming
│   ├── thesis/
│   │   ├── thesis.module.ts
│   │   ├── thesis.controller.ts       # POST /ai/thesis/:symbol
│   │   └── thesis.service.ts
│   ├── comparison/
│   │   ├── comparison.module.ts
│   │   └── comparison.service.ts
│   └── conversations/
│       ├── conversations.module.ts
│       ├── conversations.controller.ts
│       └── conversations.service.ts
├── orchestration/
│   ├── orchestrator.service.ts         # Main coordination logic
│   ├── intent-classifier.ts           # Query → intent mapping
│   ├── agent-router.ts                # Intent → agent selection
│   ├── context-assembler.ts           # Build agent context windows
│   ├── response-merger.ts             # Merge multi-agent outputs
│   └── execution-planner.ts           # Parallel vs sequential
├── agents/
│   ├── base-agent.ts                  # Abstract agent class
│   ├── investment-analyst.agent.ts
│   ├── technical-analyst.agent.ts
│   ├── quantitative.agent.ts
│   ├── news-intelligence.agent.ts
│   ├── macro-economics.agent.ts
│   ├── portfolio-advisor.agent.ts
│   └── education.agent.ts
├── providers/
│   ├── llm-provider.interface.ts
│   ├── openai.provider.ts
│   ├── anthropic.provider.ts
│   └── local-llm.provider.ts
├── cache/
│   ├── semantic-cache.service.ts      # pgvector similarity search
│   └── embedding.service.ts           # text-embedding-3-small
├── evaluation/
│   ├── compliance-filter.ts           # No buy/sell language
│   ├── hallucination-check.ts         # Verify numbers match data
│   └── quality-scorer.ts
└── prompts/
    ├── system-prompts/
    │   ├── investment-analyst.md
    │   ├── technical-analyst.md
    │   ├── quantitative.md
    │   ├── news-intelligence.md
    │   ├── macro-economics.md
    │   ├── portfolio-advisor.md
    │   └── education.md
    └── templates/
        ├── intent-classification.md
        ├── response-merger.md
        └── explainability.md
```

---


### 2.6 Alert Service

```
Purpose: Continuous evaluation of alert rules against market data stream,
         deduplication, cooldown management, delivery routing.

Technology: NestJS 10 + Bull queues
Port: 3005
Database: PostgreSQL (alerts schema), Redis (pub/sub consumer, state)
Dependencies: Market Data Service (stream), Notification Service (delivery)

Module Structure:
src/
├── modules/
│   ├── rules/
│   │   ├── rules.module.ts
│   │   ├── rules.controller.ts        # CRUD for alert rules
│   │   └── rules.service.ts
│   ├── evaluation/
│   │   ├── evaluation.module.ts
│   │   ├── evaluation.engine.ts       # Core evaluation loop
│   │   ├── condition-evaluators/
│   │   │   ├── price.evaluator.ts
│   │   │   ├── percent-change.evaluator.ts
│   │   │   ├── technical.evaluator.ts
│   │   │   ├── volume.evaluator.ts
│   │   │   └── portfolio.evaluator.ts
│   │   └── deduplication.service.ts
│   └── history/
│       ├── history.module.ts
│       ├── history.controller.ts
│       └── history.service.ts
├── processors/
│   ├── market-data.consumer.ts        # Redis pub/sub listener
│   └── alert-delivery.processor.ts    # Bull queue → notification svc
└── schedulers/
    ├── daily-reset.scheduler.ts       # Reset daily trigger counts
    └── expiry-cleanup.scheduler.ts    # Remove expired alerts

Evaluation Flow:
  1. Redis pub/sub receives quote update for AAPL
  2. Symbol router finds all active rules referencing AAPL
  3. Condition evaluator checks each rule's conditions
  4. If triggered: check cooldown (last_triggered + cooldown > now?)
  5. If not in cooldown: check daily limit (triggers_today < max)
  6. Create trigger record, queue delivery job
  7. Update rule state (last_triggered_at, triggers_today)
```

---

### 2.7 Backtest Service

```
Purpose: Strategy definition, historical simulation execution, result 
         computation, walk-forward analysis.

Technology: NestJS 10 (API) + Python (engine core)
Port: 3006
Database: PostgreSQL (backtest schema), S3 (large result sets)
Dependencies: Market Data Service (historical bars)

Module Structure:
src/                                    # NestJS API wrapper
├── modules/
│   ├── strategies/
│   │   ├── strategies.controller.ts
│   │   └── strategies.service.ts
│   ├── runs/
│   │   ├── runs.controller.ts
│   │   ├── runs.service.ts
│   │   └── runs.processor.ts          # Bull queue → Python engine
│   └── results/
│       ├── results.controller.ts
│       └── results.service.ts

python/                                 # Python backtest engine
├── engine/
│   ├── __init__.py
│   ├── backtest_runner.py             # Main execution loop
│   ├── portfolio_simulator.py         # Simulated portfolio state
│   ├── order_executor.py             # Fill simulation + slippage
│   └── metrics_calculator.py         # All performance metrics
├── strategies/
│   ├── base_strategy.py
│   ├── visual_strategy_interpreter.py # Parse visual builder JSON
│   └── builtin/
│       ├── sma_crossover.py
│       ├── rsi_mean_reversion.py
│       └── momentum_factor.py
├── data/
│   ├── data_loader.py                # Fetch from Market Data Service
│   └── data_cache.py                 # Local file cache for bars
├── api/
│   ├── main.py                       # FastAPI app
│   ├── routes.py
│   └── models.py                     # Pydantic schemas
└── requirements.txt
```

---

### 2.8 Notification Service

```
Purpose: Multi-channel notification delivery (in-app, email, push),
         templating, batching, preference management.

Technology: NestJS 10 + Bull queues
Port: 3007
Database: PostgreSQL (notifications schema), Redis (queues)
Dependencies: SendGrid (email), Web Push (FCM)

Module Structure:
src/
├── modules/
│   ├── inbox/
│   │   ├── inbox.controller.ts        # GET /notifications (in-app)
│   │   └── inbox.service.ts
│   └── subscriptions/
│       ├── subscriptions.controller.ts # Manage push tokens
│       └── subscriptions.service.ts
├── channels/
│   ├── channel.interface.ts
│   ├── in-app.channel.ts             # Write to notifications table
│   ├── email.channel.ts              # SendGrid integration
│   └── push.channel.ts               # Web Push / FCM
├── templates/
│   ├── email/
│   │   ├── alert-triggered.hbs
│   │   ├── welcome.hbs
│   │   └── weekly-digest.hbs
│   └── push/
│       └── alert-triggered.json
├── processors/
│   ├── notification.processor.ts     # Bull queue consumer
│   └── batch.processor.ts            # Batch emails (digest)
└── queue/
    └── notification.queue.ts
```

---

## 3. Inter-Service Communication

### 3.1 Communication Patterns

```
┌──────────────────────────────────────────────────────────────────┐
│                   COMMUNICATION PATTERNS                           │
├─────────────────────┬────────────────────────────────────────────┤
│ Synchronous HTTP    │ Gateway → Any service (via proxy)           │
│                     │ AI Orchestrator → Market Data (context)     │
│                     │ AI Orchestrator → ML Services (inference)   │
├─────────────────────┼────────────────────────────────────────────┤
│ NATS (async events) │ Portfolio updated → Alert evaluation        │
│                     │ User created → Welcome email                │
│                     │ AI response → Store in DB                   │
│                     │ Market close → Snapshot portfolios          │
├─────────────────────┼────────────────────────────────────────────┤
│ Redis Pub/Sub       │ Market Data → Alert Service (quotes)        │
│                     │ Market Data → Gateway WS Hub (quotes)       │
├─────────────────────┼────────────────────────────────────────────┤
│ Bull Queues (Redis) │ Backtest jobs (long-running)                │
│                     │ Notification delivery                       │
│                     │ Market data ingestion                       │
│                     │ AI thesis generation (heavy)                │
├─────────────────────┼────────────────────────────────────────────┤
│ SSE (to client)     │ AI streaming responses                      │
│ WebSocket           │ Real-time quotes to browser                 │
└─────────────────────┴────────────────────────────────────────────┘
```

### 3.2 Event Catalog

```typescript
// NATS subjects and their payloads
const EVENTS = {
  // User domain
  'user.created':       { userId: string; email: string; tier: string },
  'user.updated':       { userId: string; changes: string[] },
  'user.tier_changed':  { userId: string; oldTier: string; newTier: string },
  'user.deleted':       { userId: string },

  // Portfolio domain
  'portfolio.created':  { portfolioId: string; userId: string },
  'portfolio.updated':  { portfolioId: string; holdings: string[] },
  'holding.added':      { portfolioId: string; symbol: string; quantity: number },
  'holding.removed':    { portfolioId: string; symbol: string },
  'transaction.recorded': { portfolioId: string; type: string; symbol: string },

  // Market domain
  'market.open':        { exchange: string; timestamp: string },
  'market.close':       { exchange: string; timestamp: string },
  'market.data_refresh': { type: string; symbols: string[] },

  // Alert domain
  'alert.triggered':    { ruleId: string; userId: string; symbol: string; value: number },
  'alert.created':      { ruleId: string; userId: string },

  // AI domain
  'ai.query_completed': { conversationId: string; messageId: string; tokens: number },
  'ai.feedback':        { messageId: string; rating: number },
  'ai.thesis_generated': { symbolId: string; thesisId: string },

  // Notifications
  'notification.send':  { userId: string; type: string; channels: string[]; payload: object },
};
```

### 3.3 Service Discovery & Health

```typescript
// All services register with health endpoints
// Kubernetes uses these for liveness and readiness probes

@Controller('health')
export class HealthController {
  @Get('live')
  liveness() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  async readiness() {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkDependencies(),
    ]);
    const allHealthy = checks.every(c => c.status === 'fulfilled');
    if (!allHealthy) throw new ServiceUnavailableException();
    return { status: 'ready', checks: this.formatChecks(checks) };
  }
}
```

---

## 4. Shared Libraries & Patterns

### 4.1 Shared Package (@investoriq/common)

```typescript
// src/backend/shared/ — published as internal package

// Types
export * from './types/user.types';
export * from './types/market.types';
export * from './types/portfolio.types';
export * from './types/ai.types';

// Utilities
export { CircuitBreaker } from './utils/circuit-breaker';
export { RetryWithBackoff } from './utils/retry';
export { validateSchema } from './utils/validation';
export { encrypt, decrypt } from './utils/encryption';

// Decorators
export { CurrentUser } from './decorators/current-user.decorator';
export { Roles } from './decorators/roles.decorator';
export { TierRequired } from './decorators/tier-required.decorator';
export { Cacheable } from './decorators/cacheable.decorator';

// Constants
export { ERROR_CODES } from './constants/error-codes';
export { EVENT_SUBJECTS } from './constants/event-subjects';
export { TIER_LIMITS } from './constants/tier-limits';
```

### 4.2 Standard Service Template

```typescript
// Every NestJS service follows this structure:
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({ useFactory: dbConfig }),
    BullModule.forRootAsync({ useFactory: redisConfig }),
    NatsModule.register({ servers: ['nats://nats:4222'] }),
    PrometheusModule.register(),
    OpenTelemetryModule.forRoot(),
    HealthModule,
  ],
  controllers: [...],
  providers: [...],
})
export class AppModule {}

// Standard main.ts bootstrap
async function bootstrap() {
  const app = await NestFactory.create(AppModule, new FastifyAdapter());

  // Global pipes
  app.useGlobalPipes(new ZodValidationPipe());

  // Global filters
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global interceptors
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TimeoutInterceptor(5000),
    new TransformInterceptor(),
  );

  // Graceful shutdown
  app.enableShutdownHooks();

  // Swagger (dev only)
  if (process.env.NODE_ENV !== 'production') {
    setupSwagger(app);
  }

  await app.listen(PORT, '0.0.0.0');
}
```

---

## 5. Database Access Patterns

### 5.1 Repository Pattern (TypeORM)

```typescript
// Entity → Repository → Service → Controller
// All database access through repositories; never raw queries in controllers

@Injectable()
export class PortfolioRepository {
  constructor(
    @InjectRepository(Portfolio)
    private readonly repo: Repository<Portfolio>,
  ) {}

  async findByUser(userId: string): Promise<Portfolio[]> {
    return this.repo.find({
      where: { userId },
      relations: ['holdings'],
      order: { createdAt: 'ASC' },
    });
  }

  async findWithPerformance(id: string): Promise<PortfolioWithPerformance> {
    // Complex query using query builder
    return this.repo.createQueryBuilder('p')
      .leftJoinAndSelect('p.holdings', 'h')
      .leftJoin('market.latest_quotes', 'q', 'q.symbol_id = h.symbol_id')
      .addSelect('q.price', 'current_price')
      .where('p.id = :id', { id })
      .getOne();
  }
}
```

### 5.2 Connection Pooling

```
PostgreSQL:
  - PgBouncer in front of all DB connections
  - Pool size per service: 20 connections
  - Total pool: ~160 connections (8 services × 20)
  - Transaction mode pooling (default)
  - Statement timeout: 30s

Redis:
  - ioredis with cluster mode
  - Connection pool: 10 per service
  - Separate Redis instances for:
    - Cache (eviction policy: allkeys-lru)
    - Queues (no eviction)
    - Pub/Sub (dedicated connections)
```

---

## 6. Error Handling Strategy

```typescript
// Consistent error handling across all services

// Base application error
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly message: string,
    public readonly statusCode: number = 500,
    public readonly retryable: boolean = false,
    public readonly context?: Record<string, any>,
  ) {
    super(message);
  }
}

// Domain-specific errors
export class SymbolNotFoundError extends AppError {
  constructor(symbol: string) {
    super('SYMBOL_NOT_FOUND', `Symbol ${symbol} not found`, 404, false);
  }
}

export class RateLimitExceededError extends AppError {
  constructor(limit: number, resetAt: Date) {
    super('RATE_LIMIT_EXCEEDED', `Rate limit of ${limit}/min exceeded`, 429, true, { resetAt });
  }
}

export class AIProviderUnavailableError extends AppError {
  constructor(provider: string) {
    super('AI_PROVIDER_UNAVAILABLE', `${provider} is currently unavailable`, 503, true);
  }
}

// Global exception filter transforms all errors to standard envelope
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const { statusCode, body } = this.transformError(exception);
    response.status(statusCode).send(body);
    // Also emit to error tracking (Sentry)
    if (statusCode >= 500) this.reportToSentry(exception);
  }
}
```

---

## 7. Observability Integration

```typescript
// Every service exports metrics, traces, and structured logs

// Metrics (Prometheus)
@Injectable()
export class MetricsService {
  private readonly httpRequestDuration: Histogram;
  private readonly httpRequestTotal: Counter;
  private readonly activeConnections: Gauge;

  constructor() {
    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    });
  }
}

// Distributed tracing (OpenTelemetry)
// Auto-instrumented: HTTP, PostgreSQL, Redis, NATS
// Custom spans for business logic:
const span = tracer.startSpan('ai.orchestrate_query');
span.setAttributes({
  'ai.intents': intents.join(','),
  'ai.agents_count': agents.length,
  'ai.user_tier': user.tier,
});
// ... work ...
span.end();

// Structured logging (JSON to stdout → Fluentd → Elasticsearch)
{
  "level": "info",
  "timestamp": "2026-06-22T10:30:00Z",
  "service": "portfolio-service",
  "traceId": "abc123",
  "spanId": "def456",
  "message": "Portfolio performance calculated",
  "context": {
    "portfolioId": "uuid",
    "duration_ms": 45,
    "holdings_count": 12
  }
}
```

---

## 8. Python ML Services Architecture

```
All ML services follow identical FastAPI structure:

ml-services/{service-name}/
├── app/
│   ├── __init__.py
│   ├── main.py                # FastAPI app with CORS, health
│   ├── routes.py              # API endpoints
│   ├── models.py              # Pydantic request/response schemas
│   ├── service.py             # Core business logic
│   ├── config.py              # Settings via environment
│   └── dependencies.py        # Dependency injection
├── ml/
│   ├── __init__.py
│   ├── model.py               # ML model loading & inference
│   ├── preprocessing.py       # Data normalization
│   └── postprocessing.py      # Output formatting
├── tests/
│   └── test_service.py
├── Dockerfile
├── requirements.txt
└── pyproject.toml

Communication with NestJS services:
  - HTTP/REST (synchronous inference)
  - Response cached in Redis (TTL based on model type)
  - Timeout: 10s (inference should be fast; models pre-loaded)
  - Health endpoint: /health (model loaded? memory ok?)
```

---

*End of Backend Microservice Architecture Document*
