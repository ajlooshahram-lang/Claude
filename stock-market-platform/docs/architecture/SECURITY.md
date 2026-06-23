# InvestorIQ — Security Design Document

**Version:** 1.0  
**Date:** 2026-06-22  
**Status:** Approved  
**Classification:** Confidential — Engineering

---

## 1. Security Principles

1. **Defense in Depth** — Multiple layers; no single point of compromise
2. **Least Privilege** — Services and users get minimum required access
3. **Zero Trust** — Verify every request; never trust network position alone
4. **Secure by Default** — All new features ship with security enabled
5. **Transparency** — Users know what data we collect and why
6. **Fail Secure** — On error, deny access rather than grant it

---

## 2. Authentication Architecture

### 2.1 Authentication Flow

```
┌──────────┐       ┌─────────────┐       ┌──────────────┐       ┌──────────┐
│  Client  │──────▶│ API Gateway │──────▶│ User Service │──────▶│ Auth0 /  │
│ (Browser)│       │             │       │              │       │ Internal │
└──────────┘       └─────────────┘       └──────────────┘       └──────────┘
     │                    │                     │
     │ 1. POST /auth/login                      │
     │ ──────────────────▶│                     │
     │                    │ 2. Validate creds   │
     │                    │ ────────────────────▶│
     │                    │                     │ 3. Verify password (Argon2id)
     │                    │                     │    Check MFA if enabled
     │                    │◀─────────────────── │
     │                    │ 4. Issue tokens      │
     │◀───────────────────│                     │
     │  { accessToken (15min), refreshToken (7d) }
     │                    │                     │
     │ 5. API Request     │                     │
     │  Authorization: Bearer <accessToken>     │
     │ ──────────────────▶│                     │
     │                    │ 6. Validate JWT (RS256)
     │                    │    Check not revoked (Redis)
     │                    │ 7. Forward to service
     │                    │                     │
```

### 2.2 Token Architecture

```typescript
// Access Token (short-lived, stateless)
interface AccessTokenPayload {
  sub: string;          // User ID (UUID)
  email: string;
  tier: UserTier;       // 'free' | 'pro' | 'premium'
  roles: string[];      // ['user', 'admin']
  iat: number;          // Issued at
  exp: number;          // Expires: 15 minutes
  jti: string;          // Unique token ID (for revocation check)
}

// Signing: RS256 (asymmetric — gateway has public key only)
// Key rotation: Every 90 days (both keys active during transition)

// Refresh Token (long-lived, stateful)
interface RefreshToken {
  token: string;         // Cryptographically random (64 bytes, base64url)
  userId: string;
  deviceInfo: DeviceInfo;
  expiresAt: Date;       // 7 days (30 days for "remember me")
  rotationCounter: number;
  // Stored in PostgreSQL + Redis for fast lookup
}

// Token Rotation: Every refresh issues new pair; old refresh invalidated
// Reuse Detection: If old refresh token used → revoke ALL user sessions (compromise signal)
```

### 2.3 Multi-Factor Authentication

```
Supported MFA Methods:
  1. TOTP (Time-based One-Time Password) — Google Authenticator, Authy
  2. WebAuthn / Passkeys — Hardware keys, biometrics (future)

TOTP Implementation:
  - Algorithm: SHA-256
  - Digits: 6
  - Period: 30 seconds
  - Secret: 20 bytes (base32 encoded)
  - Backup codes: 10 single-use codes (Argon2id hashed)
  - Rate limit: 5 attempts per 5 minutes (then lockout 15 min)

Enforcement:
  - Optional for all users (strongly encouraged)
  - Required for: admin accounts, enterprise tier
  - Prompted after 3 failed login attempts from new device
```

### 2.4 OAuth 2.0 / Social Login

```
Providers: Google, Apple

Flow: Authorization Code with PKCE (no client secret in browser)

Security measures:
  - State parameter: cryptographic nonce (CSRF protection)
  - PKCE: code_verifier + code_challenge (S256)
  - Nonce in ID token: replay protection
  - Email verification: require verified email from provider
  - Account linking: match by verified email (user consent required)
```

---

## 3. Authorization Model

### 3.1 Role-Based Access Control (RBAC)

```typescript
enum Role {
  USER = 'user',           // Standard user
  ADMIN = 'admin',         // Platform administrator
  SUPPORT = 'support',     // Customer support (read-only user data)
}

enum Permission {
  // Portfolio
  PORTFOLIO_CREATE = 'portfolio:create',
  PORTFOLIO_READ = 'portfolio:read',
  PORTFOLIO_UPDATE = 'portfolio:update',
  PORTFOLIO_DELETE = 'portfolio:delete',

  // AI
  AI_QUERY = 'ai:query',
  AI_THESIS = 'ai:thesis',

  // Screener
  SCREENER_RUN = 'screener:run',
  SCREENER_SAVE = 'screener:save',

  // Backtest
  BACKTEST_CREATE = 'backtest:create',
  BACKTEST_RUN = 'backtest:run',

  // Admin
  ADMIN_USER_MANAGE = 'admin:user:manage',
  ADMIN_SYSTEM_CONFIG = 'admin:system:config',
  ADMIN_AUDIT_VIEW = 'admin:audit:view',
}

// Role → Permission mapping
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.USER]: [
    Permission.PORTFOLIO_CREATE, Permission.PORTFOLIO_READ,
    Permission.PORTFOLIO_UPDATE, Permission.PORTFOLIO_DELETE,
    Permission.AI_QUERY, Permission.AI_THESIS,
    Permission.SCREENER_RUN, Permission.SCREENER_SAVE,
    Permission.BACKTEST_CREATE, Permission.BACKTEST_RUN,
  ],
  [Role.SUPPORT]: [
    Permission.ADMIN_AUDIT_VIEW,
    // Can view user data but not modify
  ],
  [Role.ADMIN]: [
    // All permissions
    ...Object.values(Permission),
  ],
};
```

### 3.2 Tier-Based Feature Gating

```typescript
// Subscription tier controls feature access and limits
const TIER_LIMITS: Record<UserTier, TierLimits> = {
  free: {
    aiQueriesPerDay: 10,
    portfolios: 2,
    alerts: 5,
    screenerFilters: 15,
    backtestYears: 0,       // Not available
    apiAccess: false,
    realTimeData: false,
    maxWebSocketSymbols: 10,
  },
  pro: {
    aiQueriesPerDay: 100,
    portfolios: 10,
    alerts: 50,
    screenerFilters: 55,
    backtestYears: 5,
    apiAccess: false,
    realTimeData: true,
    maxWebSocketSymbols: 50,
  },
  premium: {
    aiQueriesPerDay: Infinity,
    portfolios: Infinity,
    alerts: Infinity,
    screenerFilters: 55,
    backtestYears: 30,
    apiAccess: true,
    realTimeData: true,
    maxWebSocketSymbols: 500,
  },
};
```

### 3.3 Resource Ownership

```typescript
// Every user-owned resource checks ownership before access
@Injectable()
export class OwnershipGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const userId = request.user.sub;
    const resource = request.resource; // populated by param decorator

    if (!resource) throw new NotFoundException();
    if (resource.userId !== userId && !request.user.roles.includes('admin')) {
      throw new ForbiddenException('You do not own this resource');
    }
    return true;
  }
}

// Also enforced at database level via Row-Level Security (see schema.sql)
```

---

## 4. Data Protection

### 4.1 Encryption

```
┌─────────────────────────────────────────────────────────────────┐
│                    ENCRYPTION LAYERS                              │
├──────────────────────┬──────────────────────────────────────────┤
│ In Transit           │ TLS 1.3 (all external connections)       │
│                      │ mTLS between services (Istio mesh)       │
│                      │ Minimum: TLS 1.2 (no SSLv3, TLS 1.0/1.1)│
├──────────────────────┼──────────────────────────────────────────┤
│ At Rest (storage)    │ AES-256-GCM (RDS, S3, EBS)              │
│                      │ AWS KMS managed keys (automatic rotation)│
├──────────────────────┼──────────────────────────────────────────┤
│ Field-Level          │ PII fields encrypted application-side    │
│ (sensitive fields)   │ AES-256-GCM with per-field DEK           │
│                      │ DEK encrypted with KEK (AWS KMS)         │
│                      │ Fields: email, MFA secret, API keys      │
├──────────────────────┼──────────────────────────────────────────┤
│ Secrets              │ AWS Secrets Manager (automatic rotation)  │
│                      │ Never in code, env vars, or logs         │
│                      │ Injected via K8s External Secrets        │
└──────────────────────┴──────────────────────────────────────────┘
```

### 4.2 Password Security

```typescript
// Password hashing: Argon2id (winner of Password Hashing Competition)
const ARGON2_CONFIG = {
  type: argon2.argon2id,
  memoryCost: 65536,     // 64 MB
  timeCost: 3,           // 3 iterations
  parallelism: 4,        // 4 threads
  hashLength: 32,        // 32 bytes output
};

// Password requirements (validated at API + UI)
const PASSWORD_POLICY = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: false,  // NIST 800-63B: no composition rules
  requireNumbers: false,
  requireSpecial: false,
  // Instead: check against breached password database (HaveIBeenPwned k-anonymity API)
  checkBreached: true,
  // Block common passwords (top 100,000 list)
  blockCommon: true,
};
```

### 4.3 PII Handling

```
PII Data Inventory:
┌──────────────────┬───────────────────┬─────────────────────────────┐
│ Field            │ Storage           │ Protection                   │
├──────────────────┼───────────────────┼─────────────────────────────┤
│ Email            │ PostgreSQL        │ Field-level encryption       │
│ Display name     │ PostgreSQL        │ Standard (not PII in EU)     │
│ IP address       │ Audit logs        │ Hashed after 90 days         │
│ Device info      │ Sessions table    │ Deleted with session          │
│ OAuth tokens     │ Never stored      │ Used only during auth flow    │
│ Payment info     │ Stripe (external) │ Never touches our servers    │
│ Portfolio data   │ PostgreSQL        │ Encrypted at rest + RLS      │
└──────────────────┴───────────────────┴─────────────────────────────┘
```

---

## 5. API Security

### 5.1 Input Validation

```typescript
// All inputs validated with Zod schemas at the gateway level
// Never trust client input; validate, sanitize, and coerce

// Example: stock symbol validation
const symbolSchema = z.string()
  .min(1).max(10)
  .regex(/^[A-Z0-9.]+$/)
  .transform(s => s.toUpperCase());

// Example: screener filter validation (prevent SQL injection via column name)
const ALLOWED_COLUMNS = new Set([
  'pe_ratio', 'peg_ratio', 'ev_ebitda', 'revenue_growth',
  'eps_growth', 'roe', 'roic', 'debt_equity', 'dividend_yield',
  'market_cap', 'price', 'volume', 'rsi_14', 'sma_50', 'sma_200',
]);

const filterSchema = z.object({
  column: z.string().refine(c => ALLOWED_COLUMNS.has(c)),
  operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'between']),
  value: z.union([z.number(), z.array(z.number()).length(2)]),
});
```

### 5.2 Rate Limiting

```
Strategy: Token bucket (Redis-backed)

Configuration:
┌─────────────────────┬──────┬──────┬─────────┬────────────┐
│ Endpoint Category   │ Free │ Pro  │ Premium │ Burst      │
├─────────────────────┼──────┼──────┼─────────┼────────────┤
│ General API         │ 60/m │600/m │ 6000/m  │ 2× for 10s │
│ AI Chat             │ 10/d │100/d │ ∞       │ 5/min      │
│ Screener            │ 20/m │200/m │ 2000/m  │ —          │
│ WebSocket subscribe │ 10   │ 50   │ 500     │ symbols    │
│ Auth (login)        │      5/min per IP (all tiers)      │
│ Auth (register)     │      3/hour per IP                  │
└─────────────────────┴──────┴──────┴─────────┴────────────┘

Response headers:
  X-RateLimit-Limit: 60
  X-RateLimit-Remaining: 45
  X-RateLimit-Reset: 1719043260 (Unix timestamp)
```

### 5.3 CORS Configuration

```typescript
const CORS_CONFIG = {
  origin: [
    'https://app.investoriq.com',
    'https://www.investoriq.com',
    process.env.NODE_ENV === 'development' && 'http://localhost:3100',
  ].filter(Boolean),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  credentials: true,
  maxAge: 86400, // 24 hours preflight cache
};
```

### 5.4 Security Headers

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 0  (deprecated, rely on CSP)
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://js.stripe.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https: blob:;
  font-src 'self';
  connect-src 'self' https://api.investoriq.com wss://api.investoriq.com https://api.stripe.com;
  frame-src https://js.stripe.com;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
```

---

## 5. OWASP Top 10 Mitigations

| # | Vulnerability | Mitigation |
|---|--------------|------------|
| A01 | Broken Access Control | RBAC + ownership guards + RLS + tier gating |
| A02 | Cryptographic Failures | TLS 1.3, AES-256, Argon2id, KMS-managed keys |
| A03 | Injection | Parameterized queries (TypeORM), Zod validation, column whitelist |
| A04 | Insecure Design | Threat modeling, secure defaults, rate limiting |
| A05 | Security Misconfiguration | IaC (Terraform), security headers, no defaults in prod |
| A06 | Vulnerable Components | Dependabot, npm audit, weekly dependency review |
| A07 | Auth Failures | MFA, account lockout, breach detection, token rotation |
| A08 | Data Integrity Failures | Signed JWTs (RS256), CSP, SRI for external scripts |
| A09 | Logging & Monitoring | Structured audit logs, anomaly detection, SIEM |
| A10 | SSRF | URL allowlist for external fetches, no user-controlled URLs to internal services |

---

## 6. GDPR & Privacy Compliance

### 6.1 Data Subject Rights

```typescript
// Right to Access (Article 15)
async function handleDataAccessRequest(userId: string): Promise<DataExport> {
  return {
    profile: await getUserProfile(userId),
    portfolios: await getPortfolios(userId),
    conversations: await getConversations(userId),
    alerts: await getAlerts(userId),
    auditLog: await getAuditLog(userId),
    exportedAt: new Date(),
    format: 'JSON',
  };
  // Delivered within 30 days; usually < 24 hours (automated)
}

// Right to Erasure (Article 17)
async function handleDeletionRequest(userId: string): Promise<void> {
  // 1. Anonymize audit logs (retain structure, remove PII)
  await anonymizeAuditLogs(userId);
  // 2. Delete all user data
  await deletePortfolios(userId);
  await deleteConversations(userId);
  await deleteAlerts(userId);
  await deleteNotifications(userId);
  // 3. Delete account
  await deleteUser(userId);
  // 4. Purge from caches
  await purgeUserFromCache(userId);
  // 5. Emit event for downstream cleanup
  await emit('user.deleted', { userId });
  // Retention exception: billing records (legal obligation, 7 years)
}

// Right to Portability (Article 20)
// Export in machine-readable format (JSON, CSV)
```

### 6.2 Data Processing Records

```
┌───────────────────────┬───────────────────────────────────────────┐
│ Processing Activity   │ Lawful Basis                               │
├───────────────────────┼───────────────────────────────────────────┤
│ Account management    │ Contract (Art. 6(1)(b))                    │
│ Portfolio tracking    │ Contract (Art. 6(1)(b))                    │
│ AI analysis           │ Contract (Art. 6(1)(b))                    │
│ Usage analytics       │ Legitimate interest (Art. 6(1)(f))         │
│ Marketing emails      │ Consent (Art. 6(1)(a)) — opt-in only      │
│ Security monitoring   │ Legitimate interest (Art. 6(1)(f))         │
│ Billing/tax records   │ Legal obligation (Art. 6(1)(c))            │
└───────────────────────┴───────────────────────────────────────────┘
```

### 6.3 Cookie Policy

```
Essential (no consent required):
  - Session cookie (httpOnly, secure, sameSite=strict)
  - CSRF token
  - Theme preference

Functional (consent required):
  - Recently viewed symbols
  - UI preferences not tied to account

Analytics (consent required):
  - Anonymous usage metrics
  - Performance monitoring (Web Vitals)

Marketing: None (no third-party tracking)
```

---

## 7. Infrastructure Security

### 7.1 Network Security

```
┌────────────────────────────────────────────────────────────────┐
│                    NETWORK SECURITY LAYERS                       │
├──────────────────────┬─────────────────────────────────────────┤
│ Edge (WAF + CDN)     │ AWS WAF: OWASP rules, rate limiting,    │
│                      │ bot detection, geo-blocking (if needed)  │
├──────────────────────┼─────────────────────────────────────────┤
│ Load Balancer        │ TLS termination, health checks,          │
│                      │ connection limiting                      │
├──────────────────────┼─────────────────────────────────────────┤
│ Kubernetes           │ NetworkPolicies: deny-all default,       │
│                      │ allow only required service→service      │
│                      │ Istio mTLS: service mesh encryption      │
├──────────────────────┼─────────────────────────────────────────┤
│ Data Layer           │ Private subnets only (no public IP)      │
│                      │ Security groups: app→DB only             │
│                      │ VPC endpoints for AWS services           │
└──────────────────────┴─────────────────────────────────────────┘
```

### 7.2 Kubernetes Security

```yaml
# Pod Security Standard: Restricted
apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: restricted
spec:
  privileged: false
  runAsUser:
    rule: MustRunAsNonRoot
  runAsGroup:
    rule: MustRunAs
    ranges: [{ min: 1000, max: 65534 }]
  fsGroup:
    rule: MustRunAs
    ranges: [{ min: 1000, max: 65534 }]
  volumes: ['configMap', 'emptyDir', 'secret', 'projected']
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  hostNetwork: false
  hostPID: false
  hostIPC: false
```

### 7.3 Secrets Management

```
Strategy: External Secrets Operator + AWS Secrets Manager

Flow:
  1. Secrets stored in AWS Secrets Manager (encrypted, access-controlled)
  2. External Secrets Operator syncs to K8s Secrets
  3. K8s Secrets mounted as env vars or files in pods
  4. Automatic rotation for:
     - Database passwords (every 30 days)
     - API keys (every 90 days)
     - JWT signing keys (every 90 days, overlap period)

Never:
  - Commit secrets to git
  - Log secrets (even at debug level)
  - Include in error responses
  - Pass via query parameters
  - Store in client-side storage
```

---

## 8. Audit & Monitoring

### 8.1 Audit Log Design

```typescript
// Immutable audit log for all security-relevant events
interface AuditEntry {
  id: bigint;                    // Sequential (tamper-evident)
  timestamp: Date;
  userId: string | null;         // null for system events
  action: AuditAction;
  resource: string;              // 'portfolio', 'user', 'alert'
  resourceId: string;
  outcome: 'success' | 'failure' | 'denied';
  metadata: {
    ipAddress: string;
    userAgent: string;
    method: string;
    path: string;
    statusCode: number;
    durationMs: number;
    changes?: object;            // Before/after for mutations
  };
}

// Security-relevant actions logged:
enum AuditAction {
  LOGIN_SUCCESS = 'auth.login.success',
  LOGIN_FAILURE = 'auth.login.failure',
  LOGIN_MFA_CHALLENGE = 'auth.mfa.challenge',
  LOGOUT = 'auth.logout',
  TOKEN_REFRESH = 'auth.token.refresh',
  PASSWORD_CHANGE = 'auth.password.change',
  MFA_ENABLE = 'auth.mfa.enable',
  MFA_DISABLE = 'auth.mfa.disable',
  ACCOUNT_LOCKOUT = 'auth.account.lockout',
  SESSION_REVOKE = 'auth.session.revoke',
  DATA_EXPORT = 'gdpr.data_export',
  DATA_DELETE = 'gdpr.data_delete',
  ADMIN_ACTION = 'admin.action',
  TIER_CHANGE = 'billing.tier_change',
}
```

### 8.2 Security Monitoring & Anomaly Detection

```
Real-time alerts for:
  - 5+ failed logins from same IP in 5 minutes
  - Login from new country (notify user)
  - Concurrent sessions from different countries
  - API usage spike (10× normal for user)
  - Attempt to access another user's resources
  - Token reuse after rotation (compromise indicator)
  - Admin actions outside business hours
  - Bulk data access patterns (scraping)

Automated responses:
  - Account lockout after 10 failed attempts (15-min cooldown)
  - IP ban after 50 failed attempts across accounts (24h)
  - Forced re-authentication for suspicious sessions
  - Rate limit tightening on anomalous traffic
```

---

## 9. Vulnerability Management

### 9.1 Dependency Scanning

```yaml
# Automated via GitHub Dependabot + Snyk
schedule:
  - daily: npm audit (all services)
  - weekly: full Snyk scan (including transitive deps)
  - on PR: license compliance check

SLA for patching:
  - Critical (CVSS 9.0+): 24 hours
  - High (CVSS 7.0-8.9): 7 days
  - Medium (CVSS 4.0-6.9): 30 days
  - Low (CVSS < 4.0): Next sprint

Container scanning:
  - Trivy scan on every Docker build
  - Base images: only official, regularly updated
  - No root in containers
  - Minimal images (Alpine/distroless)
```

### 9.2 Penetration Testing

```
Cadence:
  - Annual: Third-party pentest (full scope)
  - Quarterly: Automated DAST scan (OWASP ZAP)
  - Continuous: Bug bounty program (after 6 months)

Scope:
  - External: API, WebSocket, frontend application
  - Internal: Service-to-service, data layer
  - AI-specific: Prompt injection, data leakage via AI responses
```

---

## 10. AI-Specific Security

### 10.1 Prompt Injection Prevention

```typescript
// AI queries are sandboxed; user input never becomes part of system prompt
class SafePromptBuilder {
  build(systemPrompt: string, userMessage: string, context: AgentContext): Message[] {
    return [
      // System prompt: static, never includes user content
      { role: 'system', content: systemPrompt },
      // Context: structured data, not free text
      { role: 'system', content: this.formatContext(context) },
      // User message: clearly delimited
      { role: 'user', content: this.sanitize(userMessage) },
    ];
  }

  private sanitize(input: string): string {
    // Remove attempts to override system instructions
    // Truncate to max length (2000 chars)
    // Strip control characters
    return input
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .substring(0, 2000);
  }
}
```

### 10.2 Data Leakage Prevention

```
Guardrails:
  - AI never reveals other users' portfolio data
  - AI never outputs its system prompts
  - AI never generates content that could be mistaken for official advice
  - User data used in AI context is scoped to requesting user only
  - Conversations not used for training without explicit consent
  - PII never included in AI context sent to external providers
```

---

## 11. Incident Response Plan

```
┌───────────────────────────────────────────────────────────────────┐
│                 INCIDENT RESPONSE FRAMEWORK                        │
├──────────┬────────────────────────────────────────────────────────┤
│ Severity │ Description                                            │
├──────────┼────────────────────────────────────────────────────────┤
│ SEV-1    │ Data breach, service compromise, data loss             │
│          │ Response: Immediate (< 15 min), all-hands              │
├──────────┼────────────────────────────────────────────────────────┤
│ SEV-2    │ Authentication bypass, privilege escalation            │
│          │ Response: < 1 hour, security team + engineering lead   │
├──────────┼────────────────────────────────────────────────────────┤
│ SEV-3    │ Vulnerability discovered (unexploited), DDoS attempt   │
│          │ Response: < 4 hours, security team                     │
├──────────┼────────────────────────────────────────────────────────┤
│ SEV-4    │ Minor security issue, hardening opportunity            │
│          │ Response: Next business day                             │
└──────────┴────────────────────────────────────────────────────────┘

Steps:
  1. DETECT — Alert fired or report received
  2. CONTAIN — Isolate affected systems, revoke compromised credentials
  3. ASSESS — Determine scope, affected users, data exposed
  4. REMEDIATE — Fix vulnerability, restore systems
  5. NOTIFY — Inform affected users within 72 hours (GDPR requirement)
  6. REVIEW — Post-incident report, update defenses
```

---

*End of Security Design Document*
