# InvestorIQ — Cost Estimation

**Version:** 1.0  
**Date:** 2026-06-22  
**Status:** Approved  

---

## 1. Overview

This document estimates the operational costs of running InvestorIQ across the development lifecycle and at various scale points. All figures are in USD/month unless stated otherwise.

---

## 2. Cost Drivers

The platform's cost is driven by five primary categories:

1. **Compute** (Kubernetes nodes, serverless functions)
2. **Data Stores** (PostgreSQL, Redis, Elasticsearch, S3)
3. **AI/LLM** (OpenAI + Anthropic API usage)
4. **Market Data** (Polygon, Alpha Vantage, Finnhub, FRED)
5. **Supporting Services** (CDN, email, monitoring, DNS)

---

## 3. Cost by User Scale

### 3.1 Development / Pre-Launch (0 users)

| Category | Monthly Cost |
|----------|-------------|
| Dev EKS cluster (2× t3.large) | $150 |
| RDS (db.t3.medium) | $120 |
| Redis (single node) | $50 |
| Elasticsearch (single node) | $80 |
| Market data (free/dev tiers) | $0 |
| LLM (dev usage) | $200 |
| Misc (DNS, storage) | $50 |
| **Total** | **~$650/month** |

### 3.2 Beta / Early (1,000 users)

| Category | Monthly Cost |
|----------|-------------|
| EKS cluster (3× m6i.large) | $600 |
| RDS (db.r6g.large + 1 replica) | $700 |
| Redis (2-node) | $200 |
| Elasticsearch (2-node) | $350 |
| Market data (Polygon Starter + Finnhub) | $400 |
| LLM API (~2K queries/day) | $1,500 |
| CDN + bandwidth | $150 |
| Email (SendGrid) | $50 |
| Monitoring | $200 |
| **Total** | **~$4,150/month** |

### 3.3 Growth (10,000 users)

| Category | Monthly Cost |
|----------|-------------|
| EKS cluster (3-6× m6i.xlarge, auto-scaled) | $1,800 |
| RDS (db.r6g.xlarge + 2 replicas) | $1,800 |
| Redis (4-node cluster) | $600 |
| Elasticsearch (3-node) | $800 |
| Market data (Polygon Developer + Finnhub) | $1,200 |
| LLM API (~20K queries/day, with caching) | $6,000 |
| CDN + bandwidth | $400 |
| Email | $150 |
| Monitoring + observability | $500 |
| Object storage (S3) | $150 |
| **Total** | **~$13,400/month** |

### 3.4 Scale (100,000 users)

| Category | Monthly Cost (Low) | Monthly Cost (High) |
|----------|-------------------|---------------------|
| EKS cluster (production, multi-AZ) | $3,000 | $5,000 |
| RDS (db.r6g.2xlarge + 3 replicas) | $3,500 | $5,000 |
| Redis (6-node cluster) | $800 | $1,200 |
| Elasticsearch (managed) | $1,200 | $1,800 |
| Market data (Polygon Advanced + multi-provider) | $3,000 | $5,000 |
| LLM API (with semantic cache) | $8,000 | $15,000 |
| CDN + bandwidth | $600 | $1,200 |
| Email | $300 | $500 |
| Monitoring + observability | $600 | $1,000 |
| Object storage | $300 | $600 |
| Backup + DR (cross-region) | $700 | $1,200 |
| **Total** | **~$22,000** | **~$37,500** |

---

## 4. LLM Cost Deep-Dive

LLM is the most variable and significant cost. Detailed modeling:

### 4.1 Per-Query Cost Breakdown

| Query Complexity | Agents | Input Tokens | Output Tokens | Cost (GPT-4o) |
|-----------------|--------|--------------|---------------|---------------|
| Simple (1 agent) | 1 | ~4,000 | ~800 | $0.018 |
| Medium (2-3 agents) | 2.5 | ~10,000 | ~2,000 | $0.055 |
| Complex (4 agents + merge) | 5 | ~20,000 | ~4,000 | $0.120 |
| Thesis generation | 4 | ~25,000 | ~5,000 | $0.150 |

*Based on GPT-4o pricing: ~$2.50/M input, ~$10/M output tokens (2026 estimates).*

### 4.2 Cost Optimization Impact

| Optimization | Savings | Annual Savings (100K users) |
|--------------|---------|----------------------------|
| Semantic cache (20% hit rate) | ~20% of LLM cost | ~$28,800 |
| GPT-4o-mini for classification | ~$0.001/query saved | ~$7,300 |
| Token budget enforcement | Prevents overruns | Variable |
| Response caching (popular stocks) | ~10% additional | ~$14,400 |
| Local LLM for simple queries | Marginal cost $0 | ~$10,000 |
| **Combined effect** | **~40% reduction** | **~$60,000/year** |

### 4.3 LLM Cost by Tier (Monthly, 100K users)

```
Assumptions:
  - Free users: 60% of base, 10 queries/day cap
  - Pro users: 30%, ~30 queries/day average
  - Premium: 10%, ~60 queries/day average

Free (60K users × 5 queries/day avg × $0.04):     $360K/mo gross
  → With aggressive caching for free tier:         ~$120K/mo
Pro (30K × 30 × $0.06):                            $1.6M/mo gross
  → Net with cache + budget:                       ~$8K/mo (most cached/simple)
Premium (10K × 60 × $0.08):                        unlimited

NOTE: These gross figures assume worst-case full utilization. Real-world
usage is far lower (most users query a few times/week). Effective LLM
spend at 100K users with realistic engagement: $8K–15K/month.
```

---

## 5. Market Data Cost

| Provider | Plan | Monthly Cost | Coverage |
|----------|------|-------------|----------|
| Polygon.io | Stocks Advanced | $200–2,000 | US equities, real-time |
| Alpha Vantage | Premium | $50–250 | Fundamentals, fallback |
| Finnhub | Professional | $50–500 | News, sentiment, insider |
| FRED | Free | $0 | Macro economic data |
| SEC EDGAR | Free | $0 | Filings |

**Total market data:** $300–3,250/month depending on scale and real-time requirements.

---

## 6. Cost per User Analysis

| Scale | Total Cost/mo | Cost/User/mo | Revenue/User/mo (8% paid @ $25 avg) | Margin |
|-------|--------------|--------------|-------------------------------------|--------|
| 1,000 | $4,150 | $4.15 | $2.00 | Negative (investment phase) |
| 10,000 | $13,400 | $1.34 | $2.00 | +$0.66/user |
| 100,000 | $30,000 | $0.30 | $2.00 | +$1.70/user |

**Key insight:** Unit economics improve dramatically with scale due to:
- Fixed infrastructure costs amortized
- Caching effectiveness increases with traffic (popular stocks)
- Reserved instance discounts
- Bulk data provider pricing

**Break-even:** ~6,000–8,000 users (at 8% paid conversion).

---

## 7. One-Time / Capital Costs

| Item | Cost |
|------|------|
| Initial development (48 weeks, see ROADMAP) | ~$1.26M |
| SOC 2 Type II audit | $30,000–50,000 |
| Penetration testing (annual) | $15,000–30,000 |
| Legal (ToS, privacy, compliance review) | $20,000–40,000 |
| Design (brand, UI/UX) | $30,000–60,000 |
| **Total Capital** | **~$1.35M–1.44M** |

---

## 8. 3-Year TCO Projection

| Year | Users (EOY) | Avg Monthly OpEx | Annual OpEx | Cumulative |
|------|-------------|-----------------|-------------|------------|
| Year 1 | 50,000 | $12,000 | $144,000 | $144K |
| Year 2 | 200,000 | $35,000 | $420,000 | $564K |
| Year 3 | 500,000 | $70,000 | $840,000 | $1.4M |

*Plus ~$1.4M Year-1 development capital = ~$2.8M total 3-year investment.*

---

## 9. Cost Monitoring & Governance

```
Controls:
  1. Per-service cost allocation (Kubernetes labels → cost tags)
  2. Daily spend alerts (threshold breach → Slack)
  3. LLM cost tracked per query (logged with token counts)
  4. Monthly cost review (vs. budget, per-feature attribution)
  5. Anomaly detection (sudden spend spikes flagged)
  6. Quarterly right-sizing review (Compute Optimizer)

Budget guardrails:
  - LLM monthly cap with degradation (queue/cache when approaching limit)
  - Auto-scaling max limits prevent runaway compute
  - Reserved instance commitments for predictable baseline
```

---

*End of Cost Estimation Document*
