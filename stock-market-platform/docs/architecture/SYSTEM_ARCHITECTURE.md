# InvestorIQ — System Architecture Document

**Version:** 1.0  
**Date:** 2026-06-22  
**Status:** Approved  
**Classification:** Internal — Engineering

---

## 1. Executive Summary

InvestorIQ is a distributed, event-driven platform built on microservice architecture principles. The system employs a multi-agent AI orchestration layer, real-time data pipelines, and a modern reactive frontend to deliver institutional-grade investment analytics to retail investors.

### 1.1 Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Microservices over monolith | Independent scaling, deployment, and failure isolation for market data (bursty), AI (GPU-intensive), and user-facing services |
| Event-driven backbone (NATS/Redis Streams) | Decoupled services, guaranteed delivery, replay capability for audit |
| Multi-agent AI with orchestrator pattern | Specialized agents produce higher-quality outputs; orchestrator handles routing, merging, and conflict resolution |
| TimescaleDB for time-series | Native hypertable compression, continuous aggregates for OHLCV data at scale |
| Next.js App Router (RSC) | Server-side rendering for SEO, streaming for progressive loading, edge caching |
| API-first with OpenAPI | Contract-driven development enables parallel frontend/backend work |
| CQRS for portfolio service | Separate read/write models; reads are 100× more frequent than writes |

---

## 2. System Context Diagram (C4 Level 1)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           EXTERNAL SYSTEMS                               │
│                                                                         │
│  ┌──────────┐ ┌──────────┐ ┌────────┐ ┌──────┐ ┌──────┐ ┌──────────┐ │
│  │ Polygon  │ │Alpha     │ │Finnhub │ │ FRED │ │ SEC  │ │ News APIs│ │
│  │ (Primary)│ │Vantage   │ │        │ │      │ │      │ │          │ │
│  └──────────┘ └──────────┘ └────────┘ └──────┘ └──────┘ └──────────┘ │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         INVESTORIQ PLATFORM                               │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    API Gateway + CDN Edge                        │   │
│  └─────────────────────────────────┬───────────────────────────────┘   │
│                                    │                                     │
│  ┌──────────────┐ ┌──────────────┐ │ ┌──────────────┐ ┌─────────────┐ │
│  │ Market Data  │ │  Portfolio   │ │ │  AI Agent    │ │  Backtest   │ │
│  │ Service      │ │  Service     │ │ │  Orchestrator│ │  Engine     │ │
│  └──────────────┘ └──────────────┘ │ └──────────────┘ └─────────────┘ │
│                                    │                                     │
│  ┌──────────────┐ ┌──────────────┐ │ ┌──────────────┐ ┌─────────────┐ │
│  │ User Service │ │Alert Service │ │ │ Notification │ │  ML Python  │ │
│  │              │ │              │ │ │ Service      │ │  Services   │ │
│  └──────────────┘ └──────────────┘ │ └──────────────┘ └─────────────┘ │
│                                    │                                     │
│  ┌─────────────────────────────────▼───────────────────────────────┐   │
│  │           Data Layer: PostgreSQL | TimescaleDB | Redis |          │   │
│  │                      Elasticsearch | Object Storage               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              USERS                                        │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │ Web App  │  │ Mobile (PWA) │  │ API Clients  │  │ Webhook Subs   │ │
│  └──────────┘  └──────────────┘  └──────────────┘  └────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

---


## 3. Container Diagram (C4 Level 2)

### 3.1 Frontend Container

| Attribute | Value |
|-----------|-------|
| Technology | Next.js 14 (App Router), React 18, TypeScript 5.4 |
| Rendering | Hybrid: SSR for SEO pages, CSR for dashboards, Streaming for AI responses |
| State | Zustand (client), TanStack Query (server state), URL state for filters |
| Real-time | Socket.IO client for live prices, AI streaming |
| Deployment | Vercel Edge / Kubernetes with CDN |

### 3.2 API Gateway Container

| Attribute | Value |
|-----------|-------|
| Technology | NestJS 10, Fastify adapter |
| Responsibilities | Authentication, rate limiting, request routing, WebSocket hub, response caching |
| Protocol | REST (HTTP/2) + WebSocket + Server-Sent Events |
| Rate Limiting | Token bucket per user tier (Free: 60/min, Pro: 600/min, Enterprise: 6000/min) |

### 3.3 Market Data Service

| Attribute | Value |
|-----------|-------|
| Technology | NestJS, Bull queues, node-cron |
| Data Sources | Polygon (primary), Alpha Vantage (fallback), Finnhub (supplementary) |
| Storage | TimescaleDB (OHLCV), Redis (latest quotes), Elasticsearch (searchable metadata) |
| Patterns | Provider abstraction, circuit breaker, adaptive rate limiting, intelligent caching |

### 3.4 Portfolio Service

| Attribute | Value |
|-----------|-------|
| Technology | NestJS, TypeORM |
| Pattern | CQRS — separate read/write models |
| Features | Multi-portfolio, performance attribution, dividend tracking, tax lots |
| Events | Portfolio changes emit events consumed by AI Advisor and Alert Service |

### 3.5 AI Orchestrator

| Attribute | Value |
|-----------|-------|
| Technology | NestJS + Python sidecar for ML inference |
| Pattern | Router → Parallel Agent Execution → Merger → Explainability Layer |
| LLM Providers | OpenAI GPT-4o (primary), Anthropic Claude 3.5 (secondary), local Llama (fallback) |
| Caching | Semantic cache (embedding similarity) to reduce redundant LLM calls |

### 3.6 Alert Service

| Attribute | Value |
|-----------|-------|
| Technology | NestJS, Bull queues, Redis pub/sub |
| Trigger Types | Price, technical signal, news sentiment, earnings, portfolio threshold |
| Processing | Continuous evaluation against market data stream; deduplication; cooldown |

### 3.7 Backtest Engine

| Attribute | Value |
|-----------|-------|
| Technology | Python (core engine), NestJS (API wrapper) |
| Capabilities | Walk-forward, out-of-sample, transaction costs, slippage, multi-asset |
| Execution | Async job queue; results stored and cached |

### 3.8 ML Services (Python)

| Service | Purpose |
|---------|---------|
| Factor Model | Multi-factor scoring (value, momentum, quality, size, volatility) |
| Sentiment Analysis | News/social NLP → sentiment scores with entity extraction |
| Pattern Recognition | CNN-based chart pattern detection on OHLCV windows |
| Monte Carlo | Portfolio simulation with correlated asset returns |
| Regime Detection | HMM-based market regime classification (bull/bear/sideways/crisis) |

---

## 4. Component Architecture

### 4.1 Service Communication Patterns

```
┌──────────────────────────────────────────────────────────┐
│                  COMMUNICATION MATRIX                      │
├────────────────────┬─────────────────────────────────────┤
│ Synchronous (gRPC) │ Gateway ↔ Services (low-latency)    │
│ Async Events       │ NATS JetStream (domain events)      │
│ Task Queues        │ Bull/Redis (backtest jobs, alerts)   │
│ Real-time Push     │ Socket.IO (prices, notifications)   │
│ AI Streaming       │ SSE (LLM token streaming)           │
└────────────────────┴─────────────────────────────────────┘
```

### 4.2 Data Flow: User Query → AI Response

```
User: "Is NVIDIA overvalued?"
         │
         ▼
┌─────────────────┐
│   API Gateway   │ → Auth → Rate Limit → Route
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ AI Orchestrator │ → Intent Classification → Agent Selection
└────────┬────────┘
         │
    ┌────┴────┬──────────────┬────────────────┐
    ▼         ▼              ▼                ▼
┌────────┐ ┌────────┐ ┌──────────┐ ┌──────────────┐
│Analyst │ │Tech    │ │Quant     │ │News Intel    │
│Agent   │ │Agent   │ │Agent     │ │Agent         │
└───┬────┘ └───┬────┘ └────┬─────┘ └──────┬───────┘
    │          │            │              │
    └──────────┴────────────┴──────────────┘
                      │
                      ▼
         ┌────────────────────────┐
         │  Response Merger       │ → Conflict Resolution
         │  + Explainability      │ → Confidence Scoring
         │  + Source Attribution  │ → Alternative Views
         └───────────┬────────────┘
                     │
                     ▼
              Streamed Response → User
```

---


## 5. Data Architecture

### 5.1 Database Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                     DATA STORES                                   │
├─────────────────────┬───────────────────────────────────────────┤
│ PostgreSQL 16       │ Users, portfolios, orders, configs,       │
│                     │ AI outputs, audit logs                     │
├─────────────────────┼───────────────────────────────────────────┤
│ TimescaleDB         │ OHLCV data, tick data, indicator values,  │
│ (PG extension)      │ portfolio snapshots (time-series)         │
├─────────────────────┼───────────────────────────────────────────┤
│ Redis 7             │ Session cache, real-time quotes,          │
│                     │ rate limit counters, pub/sub, queues      │
├─────────────────────┼───────────────────────────────────────────┤
│ Elasticsearch 8     │ Full-text search (stocks, news),          │
│                     │ AI response indexing, log aggregation     │
├─────────────────────┼───────────────────────────────────────────┤
│ S3-Compatible       │ Backtest results, PDF reports,            │
│ Object Storage      │ ML model artifacts, user uploads          │
└─────────────────────┴───────────────────────────────────────────┘
```

### 5.2 Data Retention Policy

| Data Type | Hot (SSD) | Warm (HDD) | Cold (S3) | Total |
|-----------|-----------|------------|-----------|-------|
| Tick data | 7 days | 90 days | 5 years | 5 years |
| Daily OHLCV | 2 years | 10 years | 30 years | 30 years |
| AI responses | 30 days | 1 year | 5 years | 5 years |
| User activity | 90 days | 1 year | 7 years | 7 years (GDPR) |
| Backtest results | 30 days | 1 year | Indefinite | Indefinite |

### 5.3 Caching Strategy

```
Layer 1: CDN Edge Cache (static assets, public pages) — TTL: 1h
Layer 2: Redis Application Cache
  - Quote data: TTL 15s (real-time tier) / 60s (free tier)
  - Screener results: TTL 5min
  - AI responses (semantic): TTL 1h
  - User sessions: TTL 24h
Layer 3: In-process LRU Cache
  - Config/metadata: TTL 5min
  - Computed indicators: TTL 1min
Layer 4: Database Materialized Views
  - Portfolio aggregates: Refresh every 5min
  - Leaderboard scores: Refresh every 15min
```

---

## 6. Scalability Architecture

### 6.1 Horizontal Scaling Strategy

| Service | Scaling Trigger | Min Pods | Max Pods |
|---------|----------------|----------|----------|
| API Gateway | CPU > 60% OR RPS > 5000/pod | 3 | 20 |
| Market Data | Queue depth > 1000 | 2 | 10 |
| Portfolio | CPU > 70% | 2 | 8 |
| AI Orchestrator | Concurrent requests > 50/pod | 3 | 30 |
| Alert Service | Pending alerts > 10000 | 2 | 15 |
| Backtest Engine | Queue depth > 50 | 1 | 20 |
| ML Services | GPU utilization > 80% | 1 | 5 |

### 6.2 Load Estimation (100K Concurrent Users)

```
Peak requests/second:      ~50,000
WebSocket connections:     ~100,000
Database queries/second:   ~200,000 (80% reads from replicas)
AI inference requests/min: ~5,000
Cache hit ratio target:    > 95%
Event throughput:          ~500,000 events/min
```

### 6.3 Database Scaling

```
PostgreSQL:
  - Primary (writes) + 3 Read Replicas (reads)
  - Connection pooling via PgBouncer (max 10,000 connections)
  - Partitioning by tenant_id for multi-tenant isolation

TimescaleDB:
  - Hypertable auto-partitioning by time (1-day chunks)
  - Continuous aggregates for 1h, 1d, 1w, 1M rollups
  - Compression after 7 days (10:1 ratio)

Redis:
  - Cluster mode (6 nodes: 3 primary + 3 replica)
  - Separate instances for cache vs. queues vs. pub/sub

Elasticsearch:
  - 3-node cluster with dedicated master nodes
  - Index lifecycle management (hot → warm → cold → delete)
```

---

## 7. Resilience & Fault Tolerance

### 7.1 Circuit Breaker Pattern

```typescript
// Applied to all external data provider calls
CircuitBreaker Config:
  - Failure threshold: 5 failures in 60s
  - Recovery timeout: 30s
  - Half-open max requests: 3
  - Fallback: secondary provider → cached data → degraded response
```

### 7.2 Failure Modes & Recovery

| Failure | Impact | Mitigation |
|---------|--------|------------|
| Primary data provider down | No live quotes | Auto-failover to secondary provider; serve cached |
| Database primary down | No writes | Promote replica; queue writes in Redis |
| AI provider rate limited | Slow AI responses | Queue + retry; semantic cache; local LLM fallback |
| Redis cluster partition | Degraded caching | In-process cache; direct DB queries |
| Kubernetes node failure | Pod rescheduling | Pod disruption budgets; multi-AZ deployment |

### 7.3 Observability Stack

```
Metrics:    Prometheus → Grafana dashboards
Tracing:    OpenTelemetry → Jaeger (distributed tracing)
Logging:    Structured JSON → Fluentd → Elasticsearch → Kibana
Alerting:   Grafana Alertmanager → PagerDuty / Slack
Profiling:  Pyroscope (continuous profiling)
Uptime:     Synthetic monitors (Grafana Cloud)
```

---

## 8. Security Architecture (Summary)

Detailed in [SECURITY.md](./SECURITY.md). Key points:

- **Authentication:** OAuth 2.0 / OIDC (Auth0/Keycloak) + MFA (TOTP/WebAuthn)
- **Authorization:** RBAC with resource-level permissions; JWT with short TTL (15min)
- **Encryption:** TLS 1.3 in transit; AES-256-GCM at rest; field-level encryption for PII
- **API Security:** Rate limiting, request signing, CORS, CSP, input validation (Zod)
- **Data Protection:** GDPR-compliant; data residency controls; right to erasure
- **Audit:** Immutable audit log for all state-changing operations
- **Infrastructure:** Network policies, pod security standards, secrets via Vault

---

## 9. Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      PRODUCTION (Multi-AZ)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────┐    ┌─────────────────────────────────────────┐     │
│  │  CDN    │    │         Kubernetes Cluster               │     │
│  │(CloudFr)│    │                                         │     │
│  │         │    │  ┌───────────────────────────────────┐  │     │
│  │ Static  │    │  │  Ingress (NGINX + cert-manager)   │  │     │
│  │ Assets  │    │  └───────────────┬───────────────────┘  │     │
│  └─────────┘    │                  │                      │     │
│                 │  ┌───────────────▼───────────────────┐  │     │
│                 │  │        Service Mesh (Istio)       │  │     │
│                 │  │                                   │  │     │
│                 │  │  [Gateway] [Market] [Portfolio]   │  │     │
│                 │  │  [AI]     [Alert]  [Backtest]    │  │     │
│                 │  │  [User]   [Notif]  [ML-Svcs]    │  │     │
│                 │  └───────────────────────────────────┘  │     │
│                 │                                         │     │
│                 │  ┌───────────────────────────────────┐  │     │
│                 │  │        Data Plane                 │  │     │
│                 │  │  [PG Primary] [PG Replicas ×3]   │  │     │
│                 │  │  [TimescaleDB] [Redis Cluster]   │  │     │
│                 │  │  [Elasticsearch] [NATS]          │  │     │
│                 │  └───────────────────────────────────┘  │     │
│                 └─────────────────────────────────────────┘     │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 9.1 Environment Progression

```
Feature Branch → Dev (auto-deploy) → Staging (manual gate) → Production (canary → full)
```

### 9.2 Deployment Strategy

- **Canary releases:** 5% → 25% → 50% → 100% traffic shift
- **Feature flags:** LaunchDarkly for gradual rollout
- **Database migrations:** Zero-downtime with expand/contract pattern
- **Rollback:** Automated on error rate > 1% or latency > 2× baseline

---

## 10. Cost Architecture (Estimated Monthly at Scale)

| Component | Cost Estimate (USD/month) |
|-----------|--------------------------|
| Kubernetes cluster (production) | $3,000–5,000 |
| Database (managed PostgreSQL + replicas) | $1,500–3,000 |
| Redis (managed cluster) | $500–1,000 |
| Elasticsearch (managed) | $800–1,500 |
| AI/LLM API costs (GPT-4o + Claude) | $5,000–15,000 |
| Market data providers | $2,000–5,000 |
| CDN + bandwidth | $500–1,000 |
| Monitoring + observability | $500–1,000 |
| Object storage | $200–500 |
| **Total (at 100K users)** | **$14,000–33,000** |

---

## 11. Technology Decision Records

### ADR-001: Next.js over Remix/SvelteKit

**Context:** Need SSR, streaming, edge deployment, large ecosystem.  
**Decision:** Next.js 14 with App Router.  
**Rationale:** Largest ecosystem, Vercel edge integration, React Server Components for optimal loading, mature community.

### ADR-002: NestJS over Express/Fastify Raw

**Context:** Need structured backend with DI, decorators, modular architecture.  
**Decision:** NestJS with Fastify adapter.  
**Rationale:** Enterprise patterns (DI, guards, interceptors, pipes), TypeScript-native, Fastify for performance.

### ADR-003: TimescaleDB over InfluxDB/QuestDB

**Context:** Need time-series storage that integrates with existing PostgreSQL stack.  
**Decision:** TimescaleDB (PostgreSQL extension).  
**Rationale:** Full SQL compatibility, no separate system to manage, excellent compression, continuous aggregates.

### ADR-004: Multi-Agent over Single-LLM

**Context:** Complex queries require diverse expertise (fundamental, technical, macro).  
**Decision:** Specialized agents with orchestrator.  
**Rationale:** Better accuracy through specialization; parallel execution; independent improvement; transparent reasoning chains.

### ADR-005: NATS JetStream over Kafka

**Context:** Need event streaming with lower operational overhead.  
**Decision:** NATS JetStream.  
**Rationale:** Lighter footprint, built-in persistence, simpler operations than Kafka, sufficient throughput for our scale, native K8s integration.

---

## 12. Cross-Cutting Concerns

### 12.1 Internationalization

- UI: i18next with namespace separation
- Currency: Multi-currency with configurable base
- Time zones: All timestamps UTC internally; user-local display
- Number formatting: Intl.NumberFormat per locale

### 12.2 Accessibility

- WCAG 2.1 AA compliance
- Screen reader support for charts (data tables as alternatives)
- Keyboard navigation for all interactions
- Color-blind safe palettes for visualizations
- Reduced motion support

### 12.3 Performance Budgets

| Metric | Target |
|--------|--------|
| First Contentful Paint | < 1.2s |
| Largest Contentful Paint | < 2.0s |
| Time to Interactive | < 2.5s |
| Cumulative Layout Shift | < 0.1 |
| First Input Delay | < 50ms |
| JavaScript bundle (initial) | < 150KB gzipped |

---

## 13. Future Architecture Considerations

- **Multi-region deployment** for global latency optimization
- **Edge AI inference** for real-time technical analysis (WebAssembly models)
- **Federated learning** for privacy-preserving portfolio insights
- **GraphQL federation** if service count exceeds 15
- **Event sourcing** for complete portfolio history reconstruction
- **Native mobile** (React Native) sharing component library with web

---

*End of System Architecture Document*
