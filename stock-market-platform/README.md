# InvestorIQ — AI-Native Stock Market Platform for Smart Investors

## Overview

InvestorIQ is a production-grade, AI-native stock market platform designed specifically for **small investors who want to minimize risk**. It combines advanced multi-agent AI analytics, risk-first stock screening, position sizing via Kelly Criterion, and global market scanning—all optimized to protect capital while finding the best opportunities worldwide.

### What Makes InvestorIQ Different?

| Traditional Platforms | InvestorIQ |
|---|---|
| Maximize returns first | **Minimize risk of loss first** |
| One-size-fits-all | **Budget-aware recommendations** |
| Generic screeners | **Risk-first scoring (safety 28%, value 22%, quality 18%)** |
| Manual position sizing | **AI-optimized Kelly + ERC + Drawdown-constrained sizing** |
| US-only focus | **11 global exchanges scanned** |
| No guidance for beginners | **Guardian Agent protects from common mistakes** |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                             │
│  Next.js 14 (App Router) + React + TypeScript + Tailwind CSS     │
│  PWA | Responsive | Dark Mode | Accessibility (WCAG 2.1 AA)      │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                     API GATEWAY (NestJS)                          │
│  Auth | Rate Limiting | Request Routing | WebSocket Hub           │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                   APPLICATION SERVICES                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ Market   │ │Portfolio │ │  Alert   │ │   Backtest       │   │
│  │ Data Svc │ │ Service  │ │  Service │ │   Engine         │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────────────────┐│
│  │  User    │ │Notif.    │ │     AI ORCHESTRATOR              ││
│  │ Service  │ │ Service  │ │  ┌─────────┐ ┌────────────────┐  ││
│  └──────────┘ └──────────┘ │  │Analyst  │ │ Technical      │  ││
│                             │  │Agent    │ │ Analyst Agent  │  ││
│                             │  ├─────────┤ ├────────────────┤  ││
│                             │  │Quant    │ │ News Intel     │  ││
│                             │  │Agent    │ │ Agent          │  ││
│                             │  ├─────────┤ ├────────────────┤  ││
│                             │  │Macro    │ │ Portfolio      │  ││
│                             │  │Agent    │ │ Advisor Agent  │  ││
│                             │  ├─────────┤ ├────────────────┤  ││
│                             │  │Edu.     │ │ Orchestrator   │  ││
│                             │  │Agent    │ │ (Router/Merge) │  ││
│                             │  └─────────┘ └────────────────┘  ││
│                             └──────────────────────────────────┘│
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                     DATA & ML LAYER                               │
│  PostgreSQL | Redis | Elasticsearch | TimescaleDB                 │
│  Python ML Services (Factor Models, Monte Carlo, NLP)            │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                 EXTERNAL DATA PROVIDERS                           │
│  Polygon | Alpha Vantage | Finnhub | FRED | SEC | ECB            │
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
stock-market-platform/
├── docs/                          # All documentation
│   ├── architecture/              # System architecture docs
│   ├── api/                       # API specifications (OpenAPI)
│   ├── design/                    # Design documents, PRD
│   └── runbooks/                  # Operational runbooks
├── src/
│   ├── frontend/                  # Next.js 14 application
│   │   ├── app/                   # App Router pages
│   │   ├── components/            # React components
│   │   ├── hooks/                 # Custom React hooks
│   │   ├── lib/                   # Utilities, API clients
│   │   ├── stores/                # Zustand state stores
│   │   ├── types/                 # TypeScript type definitions
│   │   └── styles/                # Global styles, Tailwind config
│   ├── backend/                   # NestJS microservices
│   │   ├── api-gateway/           # API Gateway service
│   │   ├── market-data-service/   # Market data ingestion & serving
│   │   ├── portfolio-service/     # Portfolio management
│   │   ├── ai-orchestrator/       # Multi-agent AI system
│   │   ├── alert-service/         # Alert processing & delivery
│   │   ├── backtest-service/      # Strategy backtesting engine
│   │   ├── user-service/          # Authentication & user management
│   │   ├── notification-service/  # Push, email, in-app notifications
│   │   └── shared/                # Shared types, utilities
│   ├── ml-services/               # Python ML microservices
│   │   ├── factor-model/          # Multi-factor analysis
│   │   ├── sentiment-analysis/    # NLP news sentiment
│   │   ├── pattern-recognition/   # Chart pattern detection
│   │   ├── monte-carlo/           # Monte Carlo simulations
│   │   ├── regime-detection/      # Market regime classification
│   │   └── common/                # Shared ML utilities
│   └── shared/                    # Cross-platform shared code
├── infrastructure/
│   ├── docker/                    # Dockerfiles, compose
│   ├── kubernetes/                # K8s manifests
│   ├── terraform/                 # IaC for cloud resources
│   └── ci-cd/                     # Pipeline definitions
├── scripts/                       # Build, deploy, utility scripts
└── README.md
```

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, TypeScript 5, Tailwind CSS, Zustand, TanStack Query |
| Backend | NestJS 10, TypeScript, Bull (queues), Socket.IO |
| Databases | PostgreSQL 16, TimescaleDB, Redis 7, Elasticsearch 8 |
| AI/ML | Python 3.11, PyTorch, scikit-learn, pandas, numpy |
| AI Providers | OpenAI GPT-4, Anthropic Claude, Local LLM fallback |
| Infrastructure | Docker, Kubernetes, Terraform |
| Observability | Prometheus, Grafana, OpenTelemetry, Sentry |
| CI/CD | GitHub Actions |
| Security | OAuth 2.0/OIDC, JWT, Argon2id, AES-256 |

## Quick Start

```bash
# Prerequisites: Node.js 20+, Python 3.11+, Docker, pnpm

# Install dependencies
pnpm install

# Start infrastructure (Postgres, Redis, Elasticsearch)
docker compose up -d

# Run migrations
pnpm run db:migrate

# Start development
pnpm run dev
```

## Documentation

- [System Architecture](./docs/architecture/SYSTEM_ARCHITECTURE.md)
- [Product Requirements](./docs/design/PRD.md)
- [Technical Design](./docs/design/TECHNICAL_DESIGN.md)
- [API Specification](./docs/api/OPENAPI_SPEC.yaml)
- [AI Agent Design](./docs/architecture/AI_AGENTS.md)
- [Security Design](./docs/architecture/SECURITY.md)
- [Deployment Guide](./docs/runbooks/DEPLOYMENT.md)
- [Implementation Roadmap](./docs/design/ROADMAP.md)

## License

Proprietary — All rights reserved.

## Disclaimer

This platform provides educational information and analytical insights. It does not constitute financial advice. Past performance does not guarantee future results. Always consult a qualified financial advisor before making investment decisions.
