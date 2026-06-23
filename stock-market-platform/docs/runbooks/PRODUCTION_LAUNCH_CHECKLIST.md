# InvestorIQ — Production Launch Checklist

**Version:** 1.0  
**Date:** 2026-06-22  
**Status:** Approved  

---

## Pre-Launch Checklist

Complete ALL items before production traffic is enabled. Each item must be signed off by the responsible owner.

---

## 1. Infrastructure Readiness

| # | Item | Owner | Status |
|---|------|-------|--------|
| 1.1 | EKS production cluster provisioned (multi-AZ, 3+ nodes) | DevOps | [ ] |
| 1.2 | RDS PostgreSQL + TimescaleDB live (Multi-AZ, 3 read replicas) | DevOps | [ ] |
| 1.3 | ElastiCache Redis cluster live (6 nodes, cluster mode) | DevOps | [ ] |
| 1.4 | OpenSearch/Elasticsearch cluster live (3 nodes) | DevOps | [ ] |
| 1.5 | NATS JetStream cluster live (3 nodes) | DevOps | [ ] |
| 1.6 | S3 buckets created (backtest results, exports, backups) | DevOps | [ ] |
| 1.7 | CloudFront CDN distribution configured | DevOps | [ ] |
| 1.8 | WAF rules active (OWASP, rate limiting, bot control) | DevOps | [ ] |
| 1.9 | DNS configured (Route53 → CloudFront → ALB) | DevOps | [ ] |
| 1.10 | TLS certificates provisioned (cert-manager, auto-renewal) | DevOps | [ ] |
| 1.11 | VPC network policies applied (deny-all default) | DevOps | [ ] |
| 1.12 | NAT Gateways in all AZs | DevOps | [ ] |
| 1.13 | Auto-scaling configured and tested (HPA for all services) | DevOps | [ ] |
| 1.14 | Pod Disruption Budgets set (minAvailable: 2 for critical) | DevOps | [ ] |
| 1.15 | Resource limits and requests set on all deployments | DevOps | [ ] |

---

## 2. Security

| # | Item | Owner | Status |
|---|------|-------|--------|
| 2.1 | All secrets in AWS Secrets Manager (no env var secrets) | Security | [ ] |
| 2.2 | JWT signing keys generated (RS256, rotated from dev keys) | Security | [ ] |
| 2.3 | Database credentials rotated from dev/staging | Security | [ ] |
| 2.4 | API keys for providers (Polygon, OpenAI, Anthropic) in production vault | Security | [ ] |
| 2.5 | CORS origins set to production domains only | Security | [ ] |
| 2.6 | Security headers verified (CSP, HSTS, X-Frame-Options) | Security | [ ] |
| 2.7 | Rate limiting configured and tested per tier | Security | [ ] |
| 2.8 | MFA enforced for admin accounts | Security | [ ] |
| 2.9 | Audit logging active and writing to immutable store | Security | [ ] |
| 2.10 | Dependency scan: 0 Critical, 0 High vulnerabilities | Security | [ ] |
| 2.11 | Container images scanned (Trivy): no Critical findings | Security | [ ] |
| 2.12 | Penetration test completed (no Critical/High findings open) | Security | [ ] |
| 2.13 | OWASP Top 10 checklist reviewed and signed off | Security | [ ] |
| 2.14 | Kubernetes RBAC: least privilege for all service accounts | Security | [ ] |
| 2.15 | Network policies: services can only reach required dependencies | Security | [ ] |
| 2.16 | Encryption at rest verified (RDS, S3, EBS) | Security | [ ] |
| 2.17 | Encryption in transit verified (all internal TLS/mTLS) | Security | [ ] |

---

## 3. Application Readiness

| # | Item | Owner | Status |
|---|------|-------|--------|
| 3.1 | All services passing health checks (liveness + readiness) | Backend | [ ] |
| 3.2 | Database migrations applied successfully | Backend | [ ] |
| 3.3 | Seed data loaded (symbol catalog, screener presets) | Backend | [ ] |
| 3.4 | Market data provider connected and streaming quotes | Data | [ ] |
| 3.5 | Provider failover tested (kill primary, verify fallback) | Data | [ ] |
| 3.6 | AI orchestrator responding to queries (all 7 agents) | AI | [ ] |
| 3.7 | AI compliance filter verified (no buy/sell language leaks) | AI | [ ] |
| 3.8 | Semantic cache operational (pgvector index created) | AI | [ ] |
| 3.9 | WebSocket connections stable (10K connection load test) | Backend | [ ] |
| 3.10 | Email delivery working (SendGrid verified sender, DKIM/SPF) | Platform | [ ] |
| 3.11 | OAuth providers configured (Google production credentials) | Platform | [ ] |
| 3.12 | Stripe billing integration tested (test → live keys) | Platform | [ ] |
| 3.13 | Frontend builds without errors (production build) | Frontend | [ ] |
| 3.14 | PWA manifest and service worker configured | Frontend | [ ] |
| 3.15 | All feature flags set to production state | Platform | [ ] |

---

## 4. Testing Sign-off

| # | Item | Owner | Status |
|---|------|-------|--------|
| 4.1 | Unit tests passing: ≥ 80% coverage all services | QA | [ ] |
| 4.2 | Integration tests passing: all API endpoints verified | QA | [ ] |
| 4.3 | E2E tests passing: all 10 critical user journeys | QA | [ ] |
| 4.4 | Performance test passed: P95 < 2s, P99 < 5s | QA | [ ] |
| 4.5 | Load test passed: 1000 concurrent users, error rate < 0.1% | QA | [ ] |
| 4.6 | Mobile responsive verified: iOS Safari, Android Chrome | QA | [ ] |
| 4.7 | Cross-browser tested: Chrome, Firefox, Safari, Edge | QA | [ ] |
| 4.8 | Accessibility audit passed: WCAG 2.1 AA (axe-core 0 violations) | QA | [ ] |
| 4.9 | AI response quality: ≥ 85% relevance score on test suite | AI | [ ] |
| 4.10 | Stress test: graceful degradation under 5× expected load | QA | [ ] |

---

## 5. Observability & Operations

| # | Item | Owner | Status |
|---|------|-------|--------|
| 5.1 | Prometheus scraping all services (metrics endpoint /metrics) | SRE | [ ] |
| 5.2 | Grafana dashboards deployed (service health, business, infra) | SRE | [ ] |
| 5.3 | Alert rules configured (PagerDuty for Critical, Slack for Warn) | SRE | [ ] |
| 5.4 | Distributed tracing active (OpenTelemetry → Jaeger/Tempo) | SRE | [ ] |
| 5.5 | Structured logging flowing to Elasticsearch/Loki | SRE | [ ] |
| 5.6 | Error tracking active (Sentry, source maps uploaded) | SRE | [ ] |
| 5.7 | Synthetic monitors configured (uptime, critical endpoints) | SRE | [ ] |
| 5.8 | On-call rotation established (PagerDuty schedule) | SRE | [ ] |
| 5.9 | Runbooks written for top 10 incident scenarios | SRE | [ ] |
| 5.10 | Cost alerting configured (daily spend threshold) | SRE | [ ] |

---

## 6. Data & Backup

| # | Item | Owner | Status |
|---|------|-------|--------|
| 6.1 | Database backup verified (automated daily + PITR) | Data | [ ] |
| 6.2 | Backup restore tested (full restore drill completed) | Data | [ ] |
| 6.3 | Cross-region replica operational (DR region) | Data | [ ] |
| 6.4 | Data retention policies configured (per schema) | Data | [ ] |
| 6.5 | TimescaleDB compression policy active (7-day threshold) | Data | [ ] |
| 6.6 | Elasticsearch index lifecycle management configured | Data | [ ] |
| 6.7 | S3 versioning enabled on all production buckets | Data | [ ] |
| 6.8 | Historical market data backfilled (5+ years daily, 1+ year intraday) | Data | [ ] |

---

## 7. Compliance & Legal

| # | Item | Owner | Status |
|---|------|-------|--------|
| 7.1 | Financial disclaimer displayed on all AI outputs | Legal | [ ] |
| 7.2 | Terms of Service published and linked | Legal | [ ] |
| 7.3 | Privacy Policy published (GDPR + CCPA compliant) | Legal | [ ] |
| 7.4 | Cookie consent banner implemented | Legal | [ ] |
| 7.5 | Data Processing Agreement available for EU users | Legal | [ ] |
| 7.6 | Risk disclosure acknowledged during onboarding | Legal | [ ] |
| 7.7 | No "financial advice" language in any UI or AI output | Legal | [ ] |
| 7.8 | Market data attribution displayed per provider license | Legal | [ ] |
| 7.9 | GDPR data export/deletion endpoints working | Eng | [ ] |
| 7.10 | Audit trail meets regulatory retention (7 years) | Eng | [ ] |

---

## 8. Business Readiness

| # | Item | Owner | Status |
|---|------|-------|--------|
| 8.1 | Pricing page live with clear tier comparison | Product | [ ] |
| 8.2 | Payment flow tested end-to-end (signup → paid plan) | Product | [ ] |
| 8.3 | Onboarding flow complete (profile wizard, first portfolio) | Product | [ ] |
| 8.4 | Help/support channel operational (email, in-app) | Support | [ ] |
| 8.5 | Status page configured (statuspage.io or similar) | SRE | [ ] |
| 8.6 | Marketing landing page live | Marketing | [ ] |
| 8.7 | Analytics tracking configured (privacy-respecting) | Product | [ ] |
| 8.8 | Feedback collection mechanism active (in-app + NPS) | Product | [ ] |
| 8.9 | Launch announcement prepared (blog, email, social) | Marketing | [ ] |
| 8.10 | Customer support documentation written (FAQ, guides) | Support | [ ] |

---

## 9. Launch Day Procedures

### T-24 Hours
- [ ] Final staging smoke test passed
- [ ] All team members confirmed available for launch window
- [ ] War room channel created (Slack/Teams)
- [ ] Rollback plan reviewed with team

### T-2 Hours
- [ ] Production deploy initiated (canary at 5%)
- [ ] All monitoring dashboards open
- [ ] PagerDuty on-call confirmed
- [ ] Status page set to "Under Maintenance" (if needed)

### T-0 (Launch)
- [ ] Canary promoted to 100%
- [ ] DNS cutover completed (if new domain)
- [ ] Status page updated to "Operational"
- [ ] First user registration verified
- [ ] First AI query verified end-to-end
- [ ] WebSocket quote feed verified
- [ ] Email notifications verified

### T+1 Hour
- [ ] Error rates within normal range (< 0.1%)
- [ ] Latency within targets (P95 < 2s)
- [ ] No degradation signals
- [ ] First 10 users' experience spot-checked

### T+24 Hours
- [ ] Full day of operation without incident
- [ ] Overnight batch jobs executed (snapshots, materialized views)
- [ ] DAU metric confirmed tracking
- [ ] Team debrief scheduled

---

## 10. Post-Launch (Week 1)

| # | Item | Owner | Due |
|---|------|-------|-----|
| 10.1 | Daily error rate review | SRE | Daily |
| 10.2 | User feedback triage | Product | Daily |
| 10.3 | AI quality audit (sample 50 responses) | AI | Day 3 |
| 10.4 | Performance baseline established | SRE | Day 3 |
| 10.5 | Cost tracking vs. estimate | SRE | Day 5 |
| 10.6 | Hotfix process tested (if any bugs found) | Eng | As needed |
| 10.7 | Week 1 retrospective conducted | All | Day 7 |
| 10.8 | Success metrics vs. targets report | Product | Day 7 |

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Engineering Lead | _____________ | ____/____/____ | _________ |
| Security Lead | _____________ | ____/____/____ | _________ |
| SRE Lead | _____________ | ____/____/____ | _________ |
| Product Owner | _____________ | ____/____/____ | _________ |
| QA Lead | _____________ | ____/____/____ | _________ |

**All sections must be 100% complete before launch is authorized.**

---

*End of Production Launch Checklist*
