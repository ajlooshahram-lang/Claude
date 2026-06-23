# InvestorIQ — Infrastructure & Deployment Architecture

**Version:** 1.0  
**Date:** 2026-06-22  
**Status:** Approved  

---

## 1. Cloud Architecture Overview

Primary cloud: **AWS** (with abstraction layer for multi-cloud portability)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AWS REGION: us-east-1                               │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                         VPC (10.0.0.0/16)                              │ │
│  │                                                                         │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐   │ │
│  │  │ PUBLIC SUBNETS (10.0.1.0/24, 10.0.2.0/24, 10.0.3.0/24)        │   │ │
│  │  │                                                                  │   │ │
│  │  │  ┌──────────┐  ┌──────────────────────────────────────────────┐ │   │ │
│  │  │  │ NAT GW   │  │ ALB (Application Load Balancer)              │ │   │ │
│  │  │  │ (×3 AZs) │  │ → SSL termination, WAF, routing             │ │   │ │
│  │  │  └──────────┘  └──────────────────────────────────────────────┘ │   │ │
│  │  └─────────────────────────────────────────────────────────────────┘   │ │
│  │                                                                         │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐   │ │
│  │  │ PRIVATE SUBNETS (10.0.10.0/24, 10.0.11.0/24, 10.0.12.0/24)    │   │ │
│  │  │                                                                  │   │ │
│  │  │  ┌──────────────────────────────────────────────────────────┐   │   │ │
│  │  │  │            EKS CLUSTER (Kubernetes 1.29)                  │   │   │ │
│  │  │  │                                                           │   │   │ │
│  │  │  │  Node Group: application (m6i.xlarge × 3-12)              │   │   │ │
│  │  │  │  Node Group: ai-workloads (m6i.2xlarge × 2-8)            │   │   │ │
│  │  │  │  Node Group: ml-gpu (g5.xlarge × 1-3, spot)              │   │   │ │
│  │  │  │                                                           │   │   │ │
│  │  │  └──────────────────────────────────────────────────────────┘   │   │ │
│  │  └─────────────────────────────────────────────────────────────────┘   │ │
│  │                                                                         │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐   │ │
│  │  │ DATA SUBNETS (10.0.20.0/24, 10.0.21.0/24, 10.0.22.0/24)      │   │ │
│  │  │                                                                  │   │ │
│  │  │  ┌────────────┐ ┌─────────────┐ ┌────────────┐ ┌───────────┐  │   │ │
│  │  │  │RDS (PG 16) │ │ElastiCache  │ │OpenSearch  │ │ NATS      │  │   │ │
│  │  │  │Multi-AZ    │ │Redis Cluster│ │(3-node)    │ │ (3-node)  │  │   │ │
│  │  │  │+ 3 replicas│ │(6 nodes)    │ │            │ │           │  │   │ │
│  │  │  └────────────┘ └─────────────┘ └────────────┘ └───────────┘  │   │ │
│  │  └─────────────────────────────────────────────────────────────────┘   │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ MANAGED SERVICES                                                        │ │
│  │  CloudFront (CDN) | S3 (storage) | SES (email) | Secrets Manager      │ │
│  │  CloudWatch (logs) | KMS (encryption) | WAF | Route53 (DNS)            │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Kubernetes Cluster Design

### 2.1 Namespace Strategy

```yaml
namespaces:
  - investoriq-app        # Application services
  - investoriq-ml         # Python ML services (GPU node affinity)
  - investoriq-data       # Stateful data services (if self-managed)
  - investoriq-monitoring # Prometheus, Grafana, Jaeger
  - investoriq-ingress    # Ingress controllers
  - cert-manager          # TLS certificate management
  - nats                  # NATS JetStream cluster
```

### 2.2 Node Groups

| Node Group | Instance Type | Min | Max | Purpose |
|-----------|--------------|-----|-----|---------|
| application | m6i.xlarge (4 vCPU, 16 GB) | 3 | 12 | API services, Gateway |
| ai-workloads | m6i.2xlarge (8 vCPU, 32 GB) | 2 | 8 | AI Orchestrator, heavy queries |
| ml-gpu | g5.xlarge (GPU, 16 GB) | 0 | 3 | ML inference (spot instances) |

### 2.3 Resource Quotas per Service

```yaml
# Example: API Gateway deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
  namespace: investoriq-app
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 1
  template:
    spec:
      containers:
        - name: api-gateway
          image: investoriq/api-gateway:latest
          resources:
            requests:
              cpu: 500m
              memory: 512Mi
            limits:
              cpu: 2000m
              memory: 2Gi
          ports:
            - containerPort: 3000
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health/live
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 30
          env:
            - name: NODE_ENV
              value: production
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: url
```

### 2.4 Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-gateway-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-gateway
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: 5000
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 30
      policies:
        - type: Percent
          value: 50
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 25
          periodSeconds: 60
```

---

## 3. Docker Configuration

### 3.1 Multi-Stage Dockerfile (NestJS Services)

```dockerfile
# Base stage
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Dependencies stage
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile --prod

# Build stage
FROM base AS build
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

# Production stage
FROM base AS production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs
COPY --from=deps --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/dist ./dist
COPY --from=build --chown=nestjs:nodejs /app/package.json ./

USER nestjs
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "dist/main.js"]
```

### 3.2 Docker Compose (Local Development)

```yaml
version: '3.9'

services:
  # Infrastructure
  postgres:
    image: timescale/timescaledb:latest-pg16
    ports: ['5432:5432']
    environment:
      POSTGRES_DB: investoriq
      POSTGRES_USER: investoriq
      POSTGRES_PASSWORD: dev_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./src/backend/shared/database/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U investoriq']
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports: ['6379:6379']
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data

  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.12.0
    ports: ['9200:9200']
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - 'ES_JAVA_OPTS=-Xms512m -Xmx512m'
    volumes:
      - es_data:/usr/share/elasticsearch/data

  nats:
    image: nats:2.10-alpine
    ports: ['4222:4222', '8222:8222']
    command: --jetstream --store_dir /data
    volumes:
      - nats_data:/data

  # Application services
  api-gateway:
    build:
      context: ./src/backend/api-gateway
      dockerfile: Dockerfile
    ports: ['3000:3000']
    environment:
      - DATABASE_URL=postgresql://investoriq:dev_password@postgres:5432/investoriq
      - REDIS_URL=redis://redis:6379
      - NATS_URL=nats://nats:4222
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_started }
      nats: { condition: service_started }

  # Frontend
  frontend:
    build:
      context: ./src/frontend
      dockerfile: Dockerfile.dev
    ports: ['3100:3000']
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:3000
      - NEXT_PUBLIC_WS_URL=ws://localhost:3000
    volumes:
      - ./src/frontend:/app
      - /app/node_modules

volumes:
  postgres_data:
  redis_data:
  es_data:
  nats_data:
```

---

## 4. CI/CD Pipeline

### 4.1 GitHub Actions Workflow

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_PREFIX: ghcr.io/${{ github.repository }}

jobs:
  # Stage 1: Lint & Type Check
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint
      - run: pnpm run typecheck

  # Stage 2: Unit Tests (parallel per service)
  test:
    runs-on: ubuntu-latest
    needs: lint
    strategy:
      matrix:
        service: [api-gateway, user-service, market-data-service,
                  portfolio-service, ai-orchestrator, alert-service]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm run test --filter=${{ matrix.service }}
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/test
      - uses: actions/upload-artifact@v4
        with:
          name: coverage-${{ matrix.service }}
          path: coverage/

  # Stage 3: Integration Tests
  integration:
    runs-on: ubuntu-latest
    needs: test
    services:
      postgres:
        image: timescale/timescaledb:latest-pg16
        env: { POSTGRES_PASSWORD: test }
        ports: ['5432:5432']
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm run test:integration

  # Stage 4: Build & Push Docker Images
  build:
    runs-on: ubuntu-latest
    needs: integration
    if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop'
    strategy:
      matrix:
        service: [api-gateway, user-service, market-data-service,
                  portfolio-service, ai-orchestrator, alert-service,
                  backtest-service, notification-service, frontend]
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          context: ./src/backend/${{ matrix.service }}
          push: true
          tags: |
            ${{ env.IMAGE_PREFIX }}/${{ matrix.service }}:${{ github.sha }}
            ${{ env.IMAGE_PREFIX }}/${{ matrix.service }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # Stage 5: Deploy
  deploy-staging:
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/develop'
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - run: |
          kubectl set image deployment/api-gateway \
            api-gateway=${{ env.IMAGE_PREFIX }}/api-gateway:${{ github.sha }} \
            -n investoriq-app --context staging

  deploy-production:
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/main'
    environment: production
    steps:
      - uses: actions/checkout@v4
      - name: Canary Deploy (5%)
        run: |
          kubectl apply -f infrastructure/kubernetes/overlays/prod/canary.yaml
      - name: Monitor (5 min)
        run: |
          sleep 300
          ERROR_RATE=$(curl -s prometheus/api/v1/query?query=error_rate_5m | jq .data.result[0].value[1])
          if (( $(echo "$ERROR_RATE > 0.01" | bc -l) )); then
            echo "Error rate too high, rolling back"
            kubectl rollout undo deployment/api-gateway -n investoriq-app
            exit 1
          fi
      - name: Full Rollout
        run: kubectl rollout resume deployment/api-gateway -n investoriq-app
```

---


## 5. Terraform Infrastructure-as-Code

### 5.1 Module Structure

```
infrastructure/terraform/
├── modules/
│   ├── vpc/                    # VPC, subnets, NAT, security groups
│   ├── eks/                    # EKS cluster, node groups, IRSA
│   ├── rds/                    # PostgreSQL + TimescaleDB
│   ├── elasticache/            # Redis cluster
│   ├── opensearch/             # Elasticsearch-compatible
│   ├── s3/                     # Object storage buckets
│   ├── cloudfront/             # CDN distribution
│   ├── secrets/                # Secrets Manager
│   ├── monitoring/             # CloudWatch, alarms
│   └── waf/                    # Web Application Firewall rules
├── environments/
│   ├── dev/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── terraform.tfvars
│   ├── staging/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── terraform.tfvars
│   └── prod/
│       ├── main.tf
│       ├── variables.tf
│       └── terraform.tfvars
└── shared/
    ├── backend.tf              # S3 state backend
    └── providers.tf
```

### 5.2 Key Terraform Resources

```hcl
# Production EKS Cluster
module "eks" {
  source  = "../../modules/eks"

  cluster_name    = "investoriq-prod"
  cluster_version = "1.29"
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnet_ids

  node_groups = {
    application = {
      instance_types = ["m6i.xlarge"]
      min_size       = 3
      max_size       = 12
      desired_size   = 3
      labels         = { workload = "application" }
    }
    ai_workloads = {
      instance_types = ["m6i.2xlarge"]
      min_size       = 2
      max_size       = 8
      desired_size   = 2
      labels         = { workload = "ai" }
      taints = [{
        key    = "workload"
        value  = "ai"
        effect = "NO_SCHEDULE"
      }]
    }
    ml_gpu = {
      instance_types = ["g5.xlarge"]
      min_size       = 0
      max_size       = 3
      desired_size   = 0
      capacity_type  = "SPOT"
      labels         = { workload = "ml-gpu" }
      taints = [{
        key    = "nvidia.com/gpu"
        value  = "true"
        effect = "NO_SCHEDULE"
      }]
    }
  }

  enable_irsa = true  # IAM Roles for Service Accounts
}

# Production RDS (PostgreSQL + TimescaleDB)
module "rds" {
  source = "../../modules/rds"

  identifier     = "investoriq-prod"
  engine         = "postgres"
  engine_version = "16.2"
  instance_class = "db.r6g.xlarge"   # 4 vCPU, 32 GB RAM

  # High availability
  multi_az               = true
  read_replicas          = 3
  backup_retention_days  = 30
  deletion_protection    = true

  # Storage
  allocated_storage     = 500          # GB
  max_allocated_storage = 2000         # Auto-scale up to 2 TB
  storage_encrypted     = true
  kms_key_id           = module.kms.key_id

  # Network
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.data_subnet_ids

  # Parameters
  parameters = {
    shared_preload_libraries = "timescaledb,pg_stat_statements,pgvector"
    max_connections          = 500
    work_mem                = "256MB"
    effective_cache_size    = "24GB"
  }
}

# Production Redis Cluster
module "elasticache" {
  source = "../../modules/elasticache"

  cluster_id         = "investoriq-prod"
  engine             = "redis"
  engine_version     = "7.1"
  node_type          = "cache.r6g.large"   # 13 GB per node
  num_cache_clusters = 6                    # 3 primary + 3 replica
  
  automatic_failover_enabled = true
  multi_az_enabled          = true
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.data_subnet_ids
}
```

---

## 6. Monitoring & Observability Stack

### 6.1 Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                    OBSERVABILITY STACK                           │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    GRAFANA (UI)                           │   │
│  │  Dashboards: Service health | Business metrics |          │   │
│  │              Infrastructure | AI performance | Costs      │   │
│  └──────────────────────┬──────────────────────────────────┘   │
│                          │                                       │
│  ┌───────────┐  ┌───────┴─────┐  ┌──────────────┐  ┌────────┐│
│  │Prometheus │  │ Loki        │  │ Jaeger/Tempo │  │ Sentry ││
│  │(metrics)  │  │ (logs)      │  │ (traces)     │  │(errors)││
│  └─────┬─────┘  └──────┬──────┘  └──────┬───────┘  └────────┘│
│        │               │                │                       │
│  ┌─────▼─────────────────▼────────────────▼───────────────────┐│
│  │              OpenTelemetry Collector                         ││
│  │  (receives metrics, logs, traces from all services)         ││
│  └─────────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────────┘
```

### 6.2 Key Dashboards

| Dashboard | Metrics |
|-----------|---------|
| Service Health | Request rate, error rate, latency (P50/P95/P99), pod count |
| Business Metrics | DAU, AI queries/min, new registrations, conversion |
| AI Performance | Tokens/query, latency by agent, cache hit rate, cost/query |
| Market Data | Provider health, quote freshness, ingestion lag |
| Infrastructure | CPU, memory, disk, network, pod scaling events |
| Database | Connection pool, query latency, replication lag, disk I/O |
| Cost Tracker | LLM API spend, compute, storage, data providers |

### 6.3 Alerting Rules

```yaml
# Critical alerts (PagerDuty)
- alert: HighErrorRate
  expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.01
  for: 2m
  labels: { severity: critical }

- alert: DatabaseDown
  expr: pg_up == 0
  for: 30s
  labels: { severity: critical }

- alert: AIProviderAllDown
  expr: ai_provider_healthy == 0
  for: 1m
  labels: { severity: critical }

# Warning alerts (Slack)
- alert: HighLatency
  expr: histogram_quantile(0.95, http_request_duration_seconds_bucket) > 2
  for: 5m
  labels: { severity: warning }

- alert: CacheHitRateLow
  expr: redis_cache_hit_ratio < 0.80
  for: 10m
  labels: { severity: warning }

- alert: DiskSpaceRunningLow
  expr: node_filesystem_avail_bytes / node_filesystem_size_bytes < 0.15
  for: 10m
  labels: { severity: warning }
```

---

## 7. CDN & Edge Configuration

### 7.1 CloudFront Distribution

```
Origins:
  1. S3 (static assets: JS, CSS, images, fonts)
     - Cache: 1 year (immutable with content hash)
     - Compression: Brotli + gzip
  
  2. ALB (API + SSR pages)
     - Cache: Per-route TTL
       /api/* → no-cache (pass through)
       / → 60s (ISR revalidation)
       /stock/* → 30s
     - WebSocket: passthrough (no caching)

Behaviors:
  - /static/* → S3 origin (aggressive cache)
  - /api/* → ALB origin (no cache, all methods)
  - /_next/* → S3 origin (immutable)
  - /* → ALB origin (short cache for SSR)

Security:
  - WAF attached (OWASP Top 10 rules)
  - Bot detection (AWS Bot Control)
  - Geo-restriction: none (global access)
  - Custom headers: Strict-Transport-Security, X-Content-Type-Options
```

### 7.2 Performance Targets

| Metric | Target |
|--------|--------|
| Global TTFB (P50) | < 200ms |
| Cache hit ratio | > 85% (static) |
| Origin requests | < 30% of total |
| Bandwidth cost optimization | ~60% savings vs direct |

---

## 8. Disaster Recovery & Business Continuity

### 8.1 Recovery Objectives

| Scenario | RTO | RPO |
|----------|-----|-----|
| Single AZ failure | 0 (automatic) | 0 |
| Full region failure | < 4 hours | < 1 hour |
| Database corruption | < 2 hours | < 5 minutes |
| Accidental deletion | < 30 minutes | < 5 minutes |
| Ransomware/security breach | < 8 hours | < 1 hour |

### 8.2 Backup Strategy

```
PostgreSQL:
  - Automated daily snapshots (RDS, 30-day retention)
  - Continuous WAL archiving to S3 (point-in-time recovery)
  - Cross-region replica (us-west-2) for DR
  - Weekly logical backup (pg_dump) to separate S3 bucket

Redis:
  - RDB snapshots every 6 hours
  - AOF persistence enabled
  - Cross-AZ replication (automatic failover)

Elasticsearch:
  - Daily index snapshots to S3
  - 7-day retention
  - Rebuild from PostgreSQL if needed (source of truth)

S3:
  - Versioning enabled on all buckets
  - Cross-region replication for critical data
  - Lifecycle: IA after 90 days, Glacier after 1 year

Secrets:
  - AWS Secrets Manager with rotation
  - Encrypted backups in separate account
```

### 8.3 Failover Architecture

```
Primary: us-east-1
  └── All services active

DR: us-west-2
  ├── Read replica (PostgreSQL) — promoted on failover
  ├── Pre-provisioned EKS cluster (scaled to 0, configs ready)
  ├── CloudFront origin failover configured
  └── Route53 health check → automatic DNS failover
```

---

## 9. Environment Comparison

| Aspect | Development | Staging | Production |
|--------|------------|---------|------------|
| EKS Nodes | 2 (t3.large) | 3 (m6i.large) | 3-12 (m6i.xlarge) |
| RDS Instance | db.t3.medium | db.r6g.large | db.r6g.xlarge |
| RDS Replicas | 0 | 1 | 3 |
| Redis | Single node | 2-node | 6-node cluster |
| Elasticsearch | Single node | 2-node | 3-node |
| CDN | None | CloudFront (staging) | CloudFront (production) |
| Auto-scaling | Disabled | Limited | Full |
| Monitoring | Basic | Full | Full + PagerDuty |
| Backups | Daily | Daily + PITR | Continuous + DR |
| WAF | Disabled | Enabled | Enabled + Bot Control |
| Estimated Cost | $500/mo | $2,000/mo | $14,000-33,000/mo |

---

## 10. Cost Optimization Strategies

```
1. Spot instances for ML GPU workloads          → 60-70% savings
2. Reserved instances for predictable workloads  → 30-40% savings
3. Right-sizing via Compute Optimizer            → 15-20% savings
4. S3 Intelligent-Tiering                        → 20-30% storage savings
5. ElastiCache reserved nodes                    → 30% savings
6. Data transfer optimization (VPC endpoints)    → Reduced NAT costs
7. Graviton instances (ARM) where possible       → 20% savings
8. Scheduled scaling (scale down off-hours)      → 30% compute savings
9. LLM response caching (semantic cache)         → 20% AI API savings
10. Elasticsearch index lifecycle management     → 40% storage savings
```

---

*End of Infrastructure & Deployment Architecture Document*
