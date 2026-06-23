# InvestorIQ — Implementation Roadmap

**Version:** 1.0  
**Date:** 2026-06-22  
**Status:** Approved  

---

## 1. Overview

**Total Timeline:** 12 months to full platform (24 months to scale)  
**Team Size:** 8–12 engineers (growing to 20)  
**Methodology:** 2-week sprints, continuous delivery  

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        IMPLEMENTATION TIMELINE                                 │
│                                                                               │
│  Phase 1: Foundation    Phase 2: MVP        Phase 3: Intelligence             │
│  ════════════════════   ════════════════     ═══════════════════════           │
│  Weeks 1-4              Weeks 5-12          Weeks 13-24                       │
│                                                                               │
│  Phase 4: Power         Phase 5: Scale      Phase 6: Platform                 │
│  ════════════════════   ════════════════     ═══════════════════════           │
│  Weeks 25-36            Weeks 37-48         Year 2                            │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Phase 1: Foundation (Weeks 1–4)

**Goal:** Infrastructure, tooling, core services scaffolded, CI/CD operational.

### Sprint 1–2 (Weeks 1–2): Infrastructure & Skeleton

| Task | Owner | Days | Dependencies |
|------|-------|------|-------------|
| Monorepo setup (pnpm workspaces, Turborepo) | Platform | 1 | — |
| Docker Compose (PG, Redis, ES, NATS) | Platform | 1 | — |
| API Gateway scaffold (NestJS + Fastify) | Platform | 2 | — |
| User Service scaffold (auth, JWT, registration) | Platform | 3 | API Gateway |
| Database schema migration system (TypeORM) | Data | 2 | Docker |
| Run initial schema migrations | Data | 1 | Migration system |
| CI pipeline (lint, test, build, Docker) | DevOps | 2 | Monorepo |
| Terraform base (VPC, EKS dev cluster) | DevOps | 3 | — |
| Frontend scaffold (Next.js 14, Tailwind, shadcn) | Frontend | 2 | — |
| Design system foundation (colors, typography, components) | Frontend | 2 | Frontend scaffold |

**Sprint 1–2 Deliverables:**
- Local dev environment running with `docker compose up`
- User can register and login (email/password)
- JWT access/refresh token flow working
- CI runs on every PR
- Frontend renders with layout shell (sidebar, header)

### Sprint 3–4 (Weeks 3–4): Core Data Pipeline

| Task | Owner | Days | Dependencies |
|------|-------|------|-------------|
| Market Data Service scaffold | Data | 2 | API Gateway |
| Polygon provider integration (quotes) | Data | 3 | Market Data Svc |
| Alpha Vantage provider (fallback) | Data | 2 | Market Data Svc |
| Provider registry + circuit breaker | Data | 2 | Both providers |
| Symbol search (Elasticsearch) | Data | 2 | ES running |
| Real-time quote stream (WebSocket) | Data | 3 | Redis pub/sub |
| Redis caching layer (quotes, bars) | Data | 2 | Redis |
| Historical bars endpoint | Data | 2 | TimescaleDB |
| Frontend: Symbol search + autocomplete | Frontend | 2 | Search API |
| Frontend: Basic stock page (price, chart) | Frontend | 3 | Bars API |
| Portfolio Service scaffold | Core | 2 | DB migrations |
| Portfolio CRUD API | Core | 3 | Portfolio Svc |

**Sprint 3–4 Deliverables:**
- Real-time stock quotes flowing through system
- User can search stocks, see prices
- Basic price chart renders (line chart, 1D–1Y)
- Portfolio create/read/update/delete working
- Provider failover tested

---

## 3. Phase 2: MVP Build (Weeks 5–12)

**Goal:** All P0 features functional, ready for closed beta.

### Sprint 5–6 (Weeks 5–6): Portfolio & Charts

| Task | Owner | Days | Dependencies |
|------|-------|------|-------------|
| Add holding to portfolio (manual entry) | Core | 2 | Portfolio Svc |
| CSV import with column mapping | Core | 3 | Portfolio Svc |
| Real-time portfolio value calculation | Core | 3 | Quotes stream |
| Portfolio performance (TWR, benchmark) | Core | 3 | Snapshots |
| Daily portfolio snapshot scheduler | Core | 2 | Cron + DB |
| Interactive candlestick chart (TradingView LC) | Frontend | 4 | Bars API |
| Chart timeframe selector | Frontend | 1 | Chart |
| Basic indicators (SMA, RSI, MACD overlay) | Frontend | 3 | Chart + API |
| Key metrics panel (P/E, EPS, etc.) | Frontend | 2 | Fundamentals API |
| Asset allocation visualization | Frontend | 2 | Portfolio data |

### Sprint 7–8 (Weeks 7–8): AI Chat Foundation

| Task | Owner | Days | Dependencies |
|------|-------|------|-------------|
| AI Orchestrator service scaffold | AI | 2 | — |
| OpenAI provider integration | AI | 2 | — |
| Anthropic provider integration | AI | 2 | — |
| Intent classifier (GPT-4o-mini) | AI | 3 | Provider ready |
| Investment Analyst agent (first agent) | AI | 3 | Classifier |
| Context assembler (market data injection) | AI | 3 | Market Data Svc |
| SSE streaming response | AI | 2 | API Gateway |
| Response compliance filter | AI | 2 | — |
| Frontend: AI chat interface | Frontend | 4 | SSE endpoint |
| Frontend: Streaming typewriter effect | Frontend | 2 | SSE |
| Frontend: Message history | Frontend | 2 | Conversations API |
| Conversation persistence (DB) | AI | 2 | DB |

### Sprint 9–10 (Weeks 9–10): Screener & Alerts

| Task | Owner | Days | Dependencies |
|------|-------|------|-------------|
| Fundamentals data ingestion | Data | 3 | Providers |
| Screener materialized view | Data | 2 | Fundamentals |
| Screener API (filter, sort, paginate) | Core | 3 | Mat. view |
| 10 preset screener templates | Core | 2 | Screener API |
| Save/load custom screens | Core | 2 | Screener API |
| Frontend: Screener filter panel | Frontend | 4 | Screener API |
| Frontend: Results table (sortable) | Frontend | 2 | Screener API |
| Alert Service scaffold | Core | 2 | — |
| Price alert evaluation engine | Core | 3 | Quotes stream |
| Alert CRUD API | Core | 2 | Alert Svc |
| Notification Service (in-app + email) | Platform | 3 | SendGrid |
| Frontend: Alert creation UI | Frontend | 2 | Alert API |
| Frontend: Notification bell + panel | Frontend | 2 | Notif API |

### Sprint 11–12 (Weeks 11–12): Polish, Testing, Beta

| Task | Owner | Days | Dependencies |
|------|-------|------|-------------|
| News feed integration (Finnhub) | Data | 2 | — |
| AI news summaries (per article) | AI | 2 | News + AI |
| Frontend: News feed with sentiment | Frontend | 2 | News API |
| Dark mode implementation | Frontend | 2 | Design system |
| PWA configuration (manifest, SW) | Frontend | 2 | — |
| Mobile responsive pass (all pages) | Frontend | 3 | — |
| OAuth integration (Google) | Platform | 2 | Auth0 setup |
| Onboarding wizard (investment profile) | Frontend | 3 | User profile API |
| E2E testing (Playwright, critical paths) | QA | 4 | All features |
| Performance optimization pass | All | 3 | — |
| Security audit (OWASP checklist) | Platform | 2 | — |
| Staging deployment | DevOps | 2 | CI/CD + Terraform |
| Closed beta invite system | Platform | 1 | — |

**Phase 2 (MVP) Deliverables:**
- ✅ User auth (email + Google OAuth + MFA)
- ✅ Investment profile onboarding
- ✅ AI Chat with streaming responses (1 agent: Analyst)
- ✅ Stock search, quotes, interactive charts
- ✅ Portfolio tracking (manual + CSV)
- ✅ Performance vs benchmark
- ✅ Stock screener (fundamental, 10 presets)
- ✅ Price alerts (email + in-app)
- ✅ News feed with AI summaries
- ✅ Dark/light mode, mobile responsive, PWA
- ✅ Deployed to staging, ready for beta

---

## 4. Phase 3: Intelligence Layer (Weeks 13–24)

**Goal:** Full multi-agent AI, advanced technical analysis, risk analytics.

### Weeks 13–16: Multi-Agent Expansion

| Deliverable | Effort |
|-------------|--------|
| Technical Analyst agent | 5 days |
| Quantitative agent + factor model ML service | 8 days |
| News Intelligence agent + sentiment ML service | 6 days |
| Macro Economics agent | 4 days |
| Portfolio Advisor agent | 5 days |
| Education agent | 3 days |
| Response merger (multi-agent) | 5 days |
| Semantic cache (pgvector) | 4 days |
| AI Investment Thesis generator | 5 days |
| Frontend: Thesis display, agent badges, confidence | 5 days |
| Frontend: AI comparison tool | 3 days |

### Weeks 17–20: Technical Analysis & Risk

| Deliverable | Effort |
|-------------|--------|
| Full indicator engine (15+ indicators) | 6 days |
| Chart pattern recognition ML service | 8 days |
| Frontend: Advanced chart with all indicators | 6 days |
| Frontend: Pattern detection overlays | 4 days |
| AI technical summary (auto-generated) | 3 days |
| Portfolio risk analysis (VaR, Monte Carlo) | 8 days |
| Monte Carlo simulation ML service | 6 days |
| Regime detection ML service | 6 days |
| Frontend: Risk dashboard (heatmap, fan chart) | 6 days |
| Stress testing scenarios | 4 days |

### Weeks 21–24: Enhanced Alerts & Macro

| Deliverable | Effort |
|-------------|--------|
| Technical signal alerts (RSI, MACD) | 4 days |
| News sentiment alerts | 3 days |
| Portfolio threshold alerts | 3 days |
| Earnings calendar alerts | 2 days |
| Push notifications (Web Push) | 3 days |
| Macro economics dashboard | 6 days |
| FRED data integration | 3 days |
| Sector rotation visualization | 4 days |
| AI macro outlook generator | 3 days |
| Personalization engine (adaptive UI) | 6 days |

---

## 5. Phase 4: Power Features (Weeks 25–36)

**Goal:** Backtesting, API access, advanced quant tools.

### Weeks 25–30: Backtesting Engine

| Deliverable | Effort |
|-------------|--------|
| Python backtest engine (core) | 10 days |
| Visual strategy builder (drag-and-drop) | 10 days |
| Backtest execution queue (async) | 4 days |
| Result metrics computation (20+ metrics) | 5 days |
| Walk-forward optimization | 5 days |
| Frontend: Strategy builder UI | 8 days |
| Frontend: Results dashboard (equity curve, metrics) | 6 days |
| 5 built-in strategy templates | 4 days |
| Parameter sensitivity analysis | 4 days |

### Weeks 31–36: Developer API & Advanced Screener

| Deliverable | Effort |
|-------------|--------|
| Public REST API (rate-limited, documented) | 6 days |
| API key management (user dashboard) | 3 days |
| WebSocket API for real-time data | 4 days |
| API documentation portal (Swagger UI) | 2 days |
| Advanced screener (technical + quant filters) | 5 days |
| Custom formula builder for screener | 6 days |
| Factor model rankings (multi-factor scores) | 5 days |
| Educational learning paths | 5 days |
| Scheduled screener scans | 3 days |
| PDF report generation | 4 days |

---

## 6. Phase 5: Scale & Monetize (Weeks 37–48)

**Goal:** Brokerage integration, billing, European markets, native mobile.

| Deliverable | Effort |
|-------------|--------|
| Stripe billing integration | 5 days |
| Subscription management UI | 3 days |
| Usage tracking + tier enforcement | 4 days |
| Plaid brokerage integration | 8 days |
| Automatic portfolio sync from broker | 5 days |
| European market coverage (London, Frankfurt) | 6 days |
| Multi-currency support | 5 days |
| React Native mobile app (shared components) | 20 days |
| Apple/Google sign-in (native) | 3 days |
| SOC 2 preparation + audit | 10 days |
| Performance optimization at scale | 5 days |
| CDN optimization + edge caching | 3 days |

---

## 7. Phase 6: Platform (Year 2)

| Quarter | Deliverable |
|---------|-------------|
| Q1 Y2 | Social features (idea sharing, follow), Community strategies marketplace |
| Q1 Y2 | Multi-language support (5 languages) |
| Q2 Y2 | Advisor tools (RIA dashboard, client management) |
| Q2 Y2 | Institutional API tier + enterprise features |
| Q3 Y2 | Alternative data integrations (satellite, web traffic) |
| Q3 Y2 | Real-time options flow analysis |
| Q4 Y2 | Machine learning custom model training (user models) |
| Q4 Y2 | Global expansion (Asia-Pacific markets) |

---

## 8. Team Structure

### MVP Phase (Months 1–3): 8 Engineers

| Role | Count | Responsibilities |
|------|-------|-----------------|
| Tech Lead / Architect | 1 | Architecture decisions, code review, unblocking |
| Senior Backend (Platform) | 2 | Gateway, Auth, User, Notifications |
| Senior Backend (Data/AI) | 2 | Market Data, AI Orchestrator, ML services |
| Senior Frontend | 2 | All UI, charts, responsive, PWA |
| DevOps / SRE | 1 | Infrastructure, CI/CD, monitoring |

### Growth Phase (Months 4–12): 12 Engineers

| Added Role | Count |
|-----------|-------|
| Quant Engineer (Python) | 1 | Backtest engine, factor models |
| ML Engineer | 1 | Sentiment, pattern recognition, regime |
| Junior Frontend | 1 | Feature pages, polish |
| QA Engineer | 1 | E2E testing, performance testing |

### Scale Phase (Year 2): 20 Engineers

| Added Role | Count |
|-----------|-------|
| Mobile Engineers (React Native) | 2 |
| Backend Engineers | 2 |
| Data Engineer | 1 |
| Security Engineer | 1 |
| Product Designer | 1 |

---

## 9. Risk Register

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| LLM API costs exceed budget | Medium | High | Semantic cache, token budgets, cheaper models for simple queries |
| Data provider rate limits hit | Medium | High | Multi-provider failover, aggressive caching, request batching |
| AI hallucination in financial context | Medium | Critical | Compliance filter, number verification, prominent disclaimers |
| Performance issues at scale | Low | High | Load testing early, horizontal scaling, caching strategy |
| Regulatory challenges (financial advice) | Low | Critical | Clear disclaimers, legal review, no execution capability |
| Key person dependency | Medium | Medium | Documentation, pair programming, shared ownership |
| Market data freshness issues | Medium | Medium | Monitoring, alerting on staleness, fallback to cached |
| Security breach | Low | Critical | Defense in depth, pentest, bug bounty, incident plan |

---

## 10. Cost Estimate by Phase

| Phase | Duration | Team Cost | Infrastructure | Data/API | Total |
|-------|----------|-----------|---------------|----------|-------|
| Phase 1 (Foundation) | 4 weeks | $80K | $2K | $1K | $83K |
| Phase 2 (MVP) | 8 weeks | $160K | $4K | $5K | $169K |
| Phase 3 (Intelligence) | 12 weeks | $240K | $8K | $15K | $263K |
| Phase 4 (Power) | 12 weeks | $300K | $12K | $20K | $332K |
| Phase 5 (Scale) | 12 weeks | $360K | $25K | $30K | $415K |
| **Total to Scale** | **48 weeks** | **$1.14M** | **$51K** | **$71K** | **$1.26M** |

*Assumes US-based senior engineers at $200K–250K annual fully loaded.*

---

## 11. Success Milestones

| Milestone | Target Date | Success Criteria |
|-----------|------------|-----------------|
| Dev environment operational | Week 2 | All services run locally |
| First AI response | Week 8 | User gets streaming AI answer about a stock |
| MVP Beta Launch | Week 12 | 100 beta users, all P0 features working |
| Multi-agent AI | Week 16 | 4+ agents active, merged responses |
| 1,000 Users | Week 16 | Organic + beta invites |
| Revenue Start | Week 20 | First paid subscriptions |
| 10,000 Users | Week 28 | Marketing + product-led growth |
| Backtest Live | Week 30 | Users running custom strategies |
| 50,000 Users | Week 40 | Scaling infrastructure proven |
| SOC 2 Certified | Week 44 | Audit passed |
| Mobile App Store | Week 48 | iOS + Android live |
| 100,000 Users | Week 52 | Platform status achieved |

---

*End of Implementation Roadmap*
