# InvestorIQ — Testing & Deployment Strategy

**Version:** 1.0  
**Date:** 2026-06-22  
**Status:** Approved  

---

## 1. Testing Pyramid

```
                    ╱╲
                   ╱  ╲         E2E Tests (Playwright)
                  ╱ 5% ╲        ~50 critical user journeys
                 ╱──────╲
                ╱        ╲      Integration Tests (Vitest + Testcontainers)
               ╱   15%    ╲     ~300 tests across services
              ╱────────────╲
             ╱              ╲   Unit Tests (Vitest)
            ╱      80%       ╲  ~2000+ tests across all services
           ╱──────────────────╲
```

**Target Coverage:**
- Unit: ≥ 80% line coverage per service
- Integration: All API endpoints, all DB operations, all event flows
- E2E: All P0 user flows, critical P1 flows

---

## 2. Unit Testing

### 2.1 Framework & Configuration

```typescript
// vitest.config.ts (per service)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80,
      },
      exclude: ['**/node_modules/**', '**/dist/**', '**/*.spec.ts'],
    },
    setupFiles: ['./test/setup.ts'],
  },
});
```

### 2.2 Unit Test Categories

| Category | What to Test | Example |
|----------|-------------|---------|
| Services | Business logic, calculations, transformations | Portfolio TWR calculation, indicator computation |
| Guards | Auth validation, role checks, tier gates | AuthGuard rejects expired JWT |
| Pipes | Input validation, sanitization | Zod schema rejects invalid filters |
| Agents | Intent classification, prompt construction | Classifier detects VALUATION intent |
| Utilities | Circuit breaker, retry logic, helpers | Breaker opens after 5 failures |
| Models | Entity validation, computed properties | Holding calculates gain/loss correctly |

### 2.3 Example: Testing the Intent Classifier

```typescript
// src/backend/ai-orchestrator/src/orchestration/__tests__/intent-classifier.spec.ts
import { IntentClassifier, QueryIntent } from '../intent-classifier';

describe('IntentClassifier', () => {
  let classifier: IntentClassifier;

  beforeEach(() => {
    classifier = new IntentClassifier();
  });

  describe('classify', () => {
    it('should detect VALUATION intent for overvalued questions', async () => {
      const result = await classifier.classify('Is NVDA overvalued right now?');
      expect(result.intents).toContain(QueryIntent.VALUATION);
      expect(result.entities).toContain('NVDA');
    });

    it('should detect TECHNICAL intent for chart questions', async () => {
      const result = await classifier.classify('What does the AAPL chart look like?');
      expect(result.intents).toContain(QueryIntent.TECHNICAL);
      expect(result.entities).toContain('AAPL');
    });

    it('should detect multiple intents for complex queries', async () => {
      const result = await classifier.classify('Compare MSFT vs GOOG fundamentals and technicals');
      expect(result.intents).toContain(QueryIntent.COMPARISON);
      expect(result.intents).toContain(QueryIntent.FUNDAMENTAL);
      expect(result.entities).toEqual(expect.arrayContaining(['MSFT', 'GOOG']));
    });

    it('should default to EXPLAIN for educational questions', async () => {
      const result = await classifier.classify('What is a P/E ratio?');
      expect(result.intents).toContain(QueryIntent.EXPLAIN);
    });

    it('should not extract common English words as tickers', async () => {
      const result = await classifier.classify('I want to learn about investing');
      expect(result.entities).not.toContain('I');
    });
  });
});
```

### 2.4 Example: Testing the Circuit Breaker

```typescript
// src/backend/api-gateway/src/modules/proxy/__tests__/proxy.service.spec.ts
import { ProxyService } from '../proxy.service';
import { ConfigService } from '@nestjs/config';

describe('ProxyService — Circuit Breaker', () => {
  let proxyService: ProxyService;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    const configService = { get: () => ({ userService: 'http://localhost:3001' }) } as any;
    proxyService = new ProxyService(configService);
    mockFetch = jest.fn();
    global.fetch = mockFetch;
  });

  it('should open circuit after 5 consecutive failures', async () => {
    mockFetch.mockRejectedValue(new Error('Connection refused'));

    // Trigger 5 failures
    for (let i = 0; i < 5; i++) {
      await expect(
        proxyService.forward('userService', '/users/me', { method: 'GET' })
      ).rejects.toThrow();
    }

    // 6th call should fail immediately (circuit open)
    await expect(
      proxyService.forward('userService', '/users/me', { method: 'GET' })
    ).rejects.toThrow('temporarily unavailable');
  });

  it('should recover after timeout period', async () => {
    // Setup: open the circuit
    mockFetch.mockRejectedValue(new Error('fail'));
    for (let i = 0; i < 5; i++) {
      await proxyService.forward('userService', '/test', { method: 'GET' }).catch(() => {});
    }

    // Advance time past recovery timeout
    jest.advanceTimersByTime(31000);

    // Next call should attempt (half-open state)
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: 'ok' }) });
    const result = await proxyService.forward('userService', '/test', { method: 'GET' });
    expect(result.statusCode).toBe(200);
  });
});
```

---

## 3. Integration Testing

### 3.1 Strategy

Integration tests verify service boundaries:
- API endpoints return correct responses
- Database operations work correctly
- Events are published and consumed
- External provider mocks behave realistically
- WebSocket connections deliver updates

### 3.2 Infrastructure (Testcontainers)

```typescript
// test/integration/setup.ts
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';

let pgContainer: any;
let redisContainer: any;

beforeAll(async () => {
  pgContainer = await new PostgreSqlContainer('timescale/timescaledb:latest-pg16')
    .withDatabase('investoriq_test')
    .start();

  redisContainer = await new RedisContainer().start();

  process.env.DATABASE_URL = pgContainer.getConnectionUri();
  process.env.REDIS_URL = `redis://${redisContainer.getHost()}:${redisContainer.getPort()}`;

  // Run migrations
  await runMigrations(process.env.DATABASE_URL);
}, 60000);

afterAll(async () => {
  await pgContainer?.stop();
  await redisContainer?.stop();
});
```

### 3.3 API Integration Test Example

```typescript
// test/integration/portfolio.integration.spec.ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Portfolio API (Integration)', () => {
  let app: INestApplication;
  let authToken: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    // Create test user and get token
    authToken = await createTestUserAndLogin(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /portfolios', () => {
    it('should create a portfolio', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/portfolios')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Test Portfolio', currency: 'USD', benchmarkSymbol: 'SPY' })
        .expect(201);

      expect(response.body.data).toMatchObject({
        name: 'Test Portfolio',
        currency: 'USD',
        holdingsCount: 0,
      });
      expect(response.body.data.id).toBeDefined();
    });

    it('should reject unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .post('/v1/portfolios')
        .send({ name: 'Unauthorized' })
        .expect(401);
    });

    it('should enforce portfolio limit for free tier', async () => {
      // Create 2 portfolios (free tier limit)
      await createPortfolio(app, authToken, 'Portfolio 1');
      await createPortfolio(app, authToken, 'Portfolio 2');

      // Third should fail
      await request(app.getHttpServer())
        .post('/v1/portfolios')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Portfolio 3' })
        .expect(403);
    });
  });

  describe('POST /portfolios/:id/holdings', () => {
    it('should add a holding and update portfolio value', async () => {
      const portfolio = await createPortfolio(app, authToken, 'My Portfolio');

      const response = await request(app.getHttpServer())
        .post(`/v1/portfolios/${portfolio.id}/holdings`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ symbol: 'AAPL', quantity: 10, costBasis: 150.00 })
        .expect(201);

      expect(response.body.data.symbol).toBe('AAPL');
      expect(response.body.data.quantity).toBe(10);

      // Verify portfolio updated
      const portfolioResponse = await request(app.getHttpServer())
        .get(`/v1/portfolios/${portfolio.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(portfolioResponse.body.data.holdingsCount).toBe(1);
    });
  });
});
```

---

## 4. End-to-End Testing

### 4.1 Playwright Configuration

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html'], ['junit', { outputFile: 'results/e2e.xml' }]],
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'mobile', use: { ...devices['iPhone 14'] } },
  ],
  webServer: {
    command: 'pnpm run dev',
    port: 3100,
    reuseExistingServer: !process.env.CI,
  },
});
```

### 4.2 Critical User Journeys (P0 E2E Tests)

| # | Journey | Steps | Assertions |
|---|---------|-------|-----------|
| 1 | Registration → Onboarding | Register, verify email, complete wizard | Profile created, preferences saved |
| 2 | Login → Dashboard | Login, view dashboard | Market data loads, portfolio shows |
| 3 | Search → Stock Detail | Search "AAPL", click result, view page | Quote, chart, metrics display |
| 4 | AI Chat | Ask "Is AAPL overvalued?", wait for response | Response streams, confidence shown |
| 5 | Add to Portfolio | Create portfolio, add AAPL holding | Holding appears, value updates |
| 6 | Run Screener | Select "Value" preset, apply, view results | Results table with valid data |
| 7 | Create Alert | Set price alert for AAPL > $200 | Alert created, appears in list |
| 8 | Portfolio Performance | View performance chart, change timeframe | Chart re-renders, metrics update |
| 9 | Theme Toggle | Switch dark → light → dark | Theme applies correctly |
| 10 | Mobile Navigation | Open menu, navigate pages (mobile viewport) | All pages accessible |

### 4.3 E2E Test Example

```typescript
// e2e/ai-chat.spec.ts
import { test, expect } from '@playwright/test';

test.describe('AI Chat', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/ai');
  });

  test('should stream AI response for stock question', async ({ page }) => {
    // Type a question
    const input = page.locator('[data-testid="chat-input"]');
    await input.fill('Is NVIDIA overvalued?');
    await input.press('Enter');

    // Verify user message appears
    await expect(page.locator('[data-testid="user-message"]').last()).toContainText('NVIDIA');

    // Wait for AI response to start streaming
    const aiMessage = page.locator('[data-testid="assistant-message"]').last();
    await expect(aiMessage).toBeVisible({ timeout: 10000 });

    // Verify response contains expected elements
    await expect(aiMessage).toContainText(/analysis|valuation|metric/i, { timeout: 20000 });

    // Verify confidence score appears
    await expect(page.locator('[data-testid="confidence-score"]')).toBeVisible();

    // Verify disclaimer
    await expect(page.locator('text=does not constitute financial advice')).toBeVisible();

    // Verify suggested follow-ups
    await expect(page.locator('[data-testid="suggested-followup"]').first()).toBeVisible();
  });

  test('should maintain conversation context', async ({ page }) => {
    await askQuestion(page, 'Tell me about AAPL');
    await waitForResponse(page);

    await askQuestion(page, 'How about its competitors?');
    await waitForResponse(page);

    // Second response should reference Apple/AAPL context
    const lastResponse = page.locator('[data-testid="assistant-message"]').last();
    await expect(lastResponse).toContainText(/Apple|AAPL|competitor/i);
  });
});
```

---

## 5. Performance Testing

### 5.1 Load Testing (k6)

```javascript
// k6/load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '2m', target: 100 },   // Ramp up to 100 users
    { duration: '5m', target: 100 },   // Stay at 100
    { duration: '2m', target: 500 },   // Ramp to 500
    { duration: '5m', target: 500 },   // Stay at 500
    { duration: '2m', target: 1000 },  // Ramp to 1000
    { duration: '5m', target: 1000 },  // Stay at 1000
    { duration: '3m', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],  // 95% of requests under 2s
    http_req_duration: ['p(99)<5000'],  // 99% under 5s
    errors: ['rate<0.01'],              // Error rate < 1%
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000';
const TOKEN = __ENV.AUTH_TOKEN;

export default function () {
  // Simulate typical user behavior
  const scenarios = [
    () => getQuote('AAPL'),
    () => getQuote('MSFT'),
    () => searchSymbols('tech'),
    () => getPortfolio(),
    () => getScreenerResults(),
  ];

  const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
  scenario();
  sleep(Math.random() * 3 + 1); // 1-4 second think time
}

function getQuote(symbol) {
  const res = http.get(`${BASE_URL}/v1/market/quotes/${symbol}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  check(res, { 'quote 200': (r) => r.status === 200 });
  errorRate.add(res.status !== 200);
}
```

### 5.2 Performance Targets

| Endpoint Category | P50 | P95 | P99 | Max |
|------------------|-----|-----|-----|-----|
| Static pages (SSR) | 100ms | 300ms | 500ms | 1s |
| Quote API | 30ms | 100ms | 200ms | 500ms |
| Historical bars | 100ms | 300ms | 500ms | 1s |
| Screener | 200ms | 500ms | 1s | 2s |
| AI Chat (first token) | 1s | 2s | 3s | 5s |
| AI Chat (full response) | 5s | 10s | 15s | 20s |
| Portfolio operations | 50ms | 150ms | 300ms | 1s |

---

## 6. Deployment Strategy

### 6.1 Environment Progression

```
Feature Branch → Dev (auto) → Staging (auto) → Production (manual gate + canary)

┌──────────────┐    ┌──────────┐    ┌─────────┐    ┌────────────────┐
│ Pull Request │───▶│   Dev    │───▶│ Staging │───▶│  Production    │
│              │    │(auto)    │    │(auto)   │    │(manual + canary)│
└──────────────┘    └──────────┘    └─────────┘    └────────────────┘
       │                 │                │                  │
   CI checks      Integration      Full E2E           Canary 5%
   Unit tests     tests run         suite             → Monitor
   Lint + type    Smoke tests       Performance       → 25% → 100%
```

### 6.2 Canary Deployment Process

```
1. Deploy canary (5% traffic)
   - New version deployed alongside stable
   - Ingress routes 5% of traffic to canary pods

2. Automated monitoring (5 minutes)
   - Error rate comparison: canary vs. stable
   - Latency comparison: P50, P95
   - Custom metric comparison: AI response quality

3. Decision gate
   - IF error_rate_canary > error_rate_stable * 1.5 → ROLLBACK
   - IF p95_latency_canary > p95_latency_stable * 2 → ROLLBACK
   - IF both OK → PROCEED

4. Progressive rollout
   - 5% → 25% (hold 5 min) → 50% (hold 5 min) → 100%

5. Post-deployment validation
   - Synthetic monitors confirm all endpoints healthy
   - Alert on anomalies for next 30 minutes
```

### 6.3 Database Migration Strategy

```
Zero-downtime migrations using expand/contract pattern:

Phase 1: EXPAND (deploy alongside current code)
  - Add new columns (nullable or with defaults)
  - Add new tables
  - Add new indexes (CONCURRENTLY)
  - Do NOT remove or rename anything

Phase 2: MIGRATE (new code deployed, reads both old+new)
  - Backfill new columns from old data
  - New code writes to both old and new locations
  - Old code still works

Phase 3: CONTRACT (after all instances updated)
  - Remove old columns/tables
  - Remove compatibility code
  - Only in next release cycle (not same deploy)

Tool: TypeORM migrations with manual review
Rule: Every migration must have a rollback script
Rule: Migrations run before code deployment
```

### 6.4 Rollback Procedures

```
Automated Rollback Triggers:
  - Error rate > 1% sustained for 2 minutes
  - P95 latency > 2× baseline for 3 minutes
  - Health check failures on > 10% of pods
  - Memory leak detection (OOM kills > 2)

Rollback Steps:
  1. kubectl rollout undo deployment/<service> (immediate)
  2. Traffic shift back to stable (if canary)
  3. Incident channel notification (Slack + PagerDuty)
  4. Database: rollback migration if needed
  5. DNS: revert if any DNS changes were made

Rollback SLA: < 5 minutes from detection to full rollback
```

---

## 7. Monitoring in Deployment

### 7.1 Deployment Dashboard

```
During deployment, monitor:
  ┌─────────────────────────────────────────────────┐
  │ DEPLOYMENT HEALTH                                │
  ├───────────────────┬─────────────────────────────┤
  │ Error Rate (5xx)  │ ████░░░░░░ 0.3% (OK < 1%)  │
  │ Latency P95       │ ██████░░░░ 450ms (OK < 2s)  │
  │ Request Rate      │ ████████░░ 12,400 req/min   │
  │ Pod Health        │ ██████████ 12/12 ready       │
  │ DB Connections    │ ████████░░ 78/100 active     │
  │ Redis Memory      │ ██████░░░░ 58% used          │
  │ AI Response Time  │ █████░░░░░ 4.2s median       │
  └───────────────────┴─────────────────────────────┘
```

### 7.2 Post-Deployment Checklist

```
□ All pods healthy (readiness + liveness probes passing)
□ Error rate stable (within normal range)
□ No increase in P95 latency
□ Database connection pool healthy
□ Redis cache hit ratio normal
□ WebSocket connections stable
□ AI provider responses normal
□ No new Sentry errors in first 10 minutes
□ Synthetic monitors all passing
□ No user-facing degradation reports
```

---

## 8. Testing in CI/CD Pipeline

```yaml
# Pipeline stages and timing targets:
┌────────────────────────────────────────────────────────────────┐
│ Stage              │ Duration │ Failure Action                  │
├────────────────────┼──────────┼─────────────────────────────────┤
│ Lint + Typecheck   │ ~1 min   │ Block merge                     │
│ Unit Tests         │ ~3 min   │ Block merge                     │
│ Integration Tests  │ ~5 min   │ Block merge                     │
│ Build Docker       │ ~3 min   │ Block deploy                    │
│ Security Scan      │ ~2 min   │ Block if Critical/High          │
│ Deploy to Dev      │ ~2 min   │ Alert team                      │
│ E2E on Dev         │ ~8 min   │ Block staging deploy            │
│ Deploy to Staging  │ ~2 min   │ Alert team                      │
│ E2E on Staging     │ ~10 min  │ Block production deploy         │
│ Performance Test   │ ~15 min  │ Warn (block if > 2× regression) │
│ Deploy to Prod     │ ~5 min   │ Auto-rollback                   │
├────────────────────┼──────────┼─────────────────────────────────┤
│ TOTAL (to prod)    │ ~56 min  │                                 │
└────────────────────┴──────────┴─────────────────────────────────┘
```

---

*End of Testing & Deployment Strategy*
