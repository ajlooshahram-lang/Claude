# STP Backend -- QI Platform Server

Secure, multi-tenant backend for the **QI Intelligence Platform** powering the
Submarine Telecom Project (STP) -- a $1.3B submarine fibre optic deployment
across 8 Asian countries.

**Private deployment:** 1 admin + 10 project owners (11 users total).

---

## Stack

| Concern        | Choice                                            |
| -------------- | ------------------------------------------------- |
| Language       | TypeScript (strict), ES2022, NodeNext modules     |
| HTTP framework | Fastify 5 (+ helmet, CORS, rate-limit, cookie)    |
| Database       | PostgreSQL via Prisma ORM                         |
| Auth           | Argon2id + server-side sessions + TOTP MFA        |
| Config         | Zod-validated environment (fails fast in prod)    |
| Tests          | `node:test` via `tsx` (64 tests, no DB needed)    |

---

## Phase 1 Authentication (Complete)

All authentication endpoints are live, tested, and production-ready.

### Auth Endpoints

| Method | Path | Purpose | Auth Required |
|--------|------|---------|---------------|
| POST | `/auth/register` | Create account + tenant (rate-limited 5/min per IP) | No |
| POST | `/auth/login` | Authenticate with email + password | No |
| POST | `/auth/login/mfa` | Complete login with TOTP code (when MFA enabled) | No (pending token) |
| POST | `/auth/logout` | Revoke current session, clear cookie | Yes |
| GET | `/auth/me` | Get current authenticated user info | Yes |
| POST | `/auth/mfa/enroll` | Begin MFA setup (returns otpauth:// URI + QR data) | Yes |
| POST | `/auth/mfa/verify` | Complete MFA setup (verifies first code) | Yes |
| POST | `/auth/mfa/disable` | Remove MFA (requires password + TOTP code) | Yes |

### Infrastructure Endpoints

| Method | Path | Purpose | Auth Required |
|--------|------|---------|---------------|
| GET | `/health` | Liveness check (always DB-free) | No |
| GET | `/ready` | Readiness check (200 when DB reachable, else 503) | No |

---

## Invite Endpoints (Phase 2)

Team invitation system for adding users to an existing tenant.

| Method | Path | Purpose | Auth Required |
|--------|------|---------|---------------|
| POST | `/api/invites` | Create invite, returns one-time token (OWNER/ADMIN only, rate-limited 10/min) | Yes (ADMIN+) |
| GET | `/api/invites` | List pending invites for tenant | Yes (ADMIN+) |
| DELETE | `/api/invites/:id` | Revoke a pending invite | Yes (ADMIN+) |
| POST | `/auth/accept-invite` | Accept invite with token, create user + session (public, rate-limited 10/min) | No |
| GET | `/api/team` | List team members in tenant | Yes |

### Invite Flow

1. OWNER or ADMIN calls `POST /api/invites` with `{ email, role }`.
2. Server generates a 32-byte CSPRNG token, stores only its SHA-256 hash.
3. The raw token is returned **once** in the response (must be shared out-of-band with the invitee).
4. Invitee calls `POST /auth/accept-invite` with `{ token, password, displayName }`.
5. Server validates the token hash, checks expiry (7 days) and not already used.
6. Server creates the user in the inviter's tenant with the specified role, creates a session.
7. All actions are audit-logged: `invite.create`, `invite.accept`, `invite.revoke`.

### Security Controls

- Invite tokens use the same security model as sessions: 32-byte CSPRNG, SHA-256 hash stored.
- Tokens expire after 7 days.
- Cannot invite an email that already exists in the tenant (409).
- Cannot invite with a role equal to or higher than your own (ADMIN cannot invite OWNER or ADMIN).
- Password strength validation applies on accept (12+ chars, not common).
- `POST /auth/accept-invite` is CSRF-exempt (like login/register).

---

## Security Model

### Password Hashing -- Argon2id

- **Algorithm:** Argon2id (memory-hard, GPU-resistant)
- **Memory:** 64 MB (65536 KB)
- **Iterations:** 3
- **Parallelism:** 4
- **Password policy:** Minimum 12 characters, checked against common passwords list
- **Rehashing:** Versioned format supports transparent parameter upgrades

### Session Management

- **Token generation:** 32-byte CSPRNG (`crypto.randomBytes(32)`)
- **Storage:** Only SHA-256 hash of token stored in database (token never persisted)
- **Cookie settings:** `HttpOnly`, `Secure` (in production), `SameSite=Strict`, `Path=/`
- **Expiry:** Configurable via `SESSION_EXPIRY_DAYS` (default: 7 days)
- **Revocation:** Per-session and per-user (revoke all sessions)

### TOTP Multi-Factor Authentication (RFC 6238)

- **Algorithm:** HMAC-SHA1
- **Time step:** 30 seconds
- **Digits:** 6
- **Window:** +/-1 step (tolerates 30s clock drift)
- **Secret:** Base32-encoded, generated via CSPRNG
- **URI format:** `otpauth://totp/QI%20Platform:{email}?secret={secret}&issuer=QI%20Platform`

### MFA Enrollment Flow

1. User calls `POST /auth/mfa/enroll` (must be authenticated)
2. Server generates TOTP secret, returns `otpauth://` URI for QR scanning
3. User scans QR code with authenticator app (Google Authenticator, Authy, etc.)
4. User calls `POST /auth/mfa/verify` with the 6-digit code from their app
5. Server verifies code, enables MFA on the account
6. All future logins require the TOTP code after password verification

To disable: `POST /auth/mfa/disable` requires both current password and valid TOTP code.

### CSRF Protection

- **Method:** Double-submit cookie pattern
- **Header:** `X-CSRF-Token` must match the `csrf` cookie value
- **Scope:** All state-changing methods (POST, PUT, PATCH, DELETE)
- **Exemptions:** `/auth/register` and `/auth/login` (initial entry points)

### Account Lockout

- **Threshold:** 5 failed login attempts within 15 minutes
- **Lockout duration:** 15 minutes (automatic reset)
- **Scope:** Per-email address
- **Implementation:** In-memory store (appropriate for 11-user deployment)

### Audit Logging

Every authentication event is recorded in the append-only `AuditLog` table:

- `auth.register` -- new account created
- `auth.login` -- successful login
- `auth.login.failed` -- failed login attempt
- `auth.logout` -- session revoked
- `auth.mfa.enroll` -- MFA setup initiated
- `auth.mfa.verify` -- MFA setup completed
- `auth.mfa.disable` -- MFA removed
- `auth.session.revoke` -- session invalidated

Each entry includes: tenant ID, actor ID, action, IP address, timestamp, and optional detail.

### RBAC (Role-Based Access Control)

| Role | Level | Description |
|------|-------|-------------|
| OWNER | 4 (highest) | Tenant owner, full control |
| ADMIN | 3 | Administrative access |
| MANAGER | 2 | Project management access |
| VIEWER | 1 (lowest) | Read-only access |

Enforced server-side on every request via `requireRole(minRole)` middleware.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes (prod) | Cookie signing secret, minimum 32 characters |
| `DATA_ENCRYPTION_KEY` | Yes (prod) | Encryption key for tenant secrets, minimum 16 characters |
| `NODE_ENV` | No | `production`, `development`, or `test` (default: `development`) |
| `PORT` | No | Server port (default: `3000`) |
| `HOST` | No | Bind address (default: `0.0.0.0`) |
| `CORS_ORIGINS` | No | Comma-separated allowed origins (no wildcards in production) |
| `SESSION_EXPIRY_DAYS` | No | Session lifetime in days (default: `7`) |
| `DATA_REGION` | No | Data residency label (default: `eu-west-1`) |

**Security notes:**
- `SESSION_SECRET` must be cryptographically random, 32+ characters. Generate with: `openssl rand -base64 48`
- `DATA_ENCRYPTION_KEY` must be 16+ characters. Generate with: `openssl rand -base64 24`
- Never commit `.env` files. Use `.env.example` as a template.

---

## Setup for Private Users (11-user deployment)

```bash
# 1. Clone and install
cd server
cp .env.example .env
# Fill in DATABASE_URL, SESSION_SECRET, DATA_ENCRYPTION_KEY
npm install

# 2. Validate and build
npm run prisma:validate
npm run build

# 3. Run tests (no database needed)
npm test

# 4. Deploy with a PostgreSQL database
npm run prisma:migrate    # when migrations are available
npm start
```

### Creating User Accounts

Each of the 11 users registers via `POST /auth/register`:

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "owner@example.com",
    "password": "secure-password-12-chars-minimum",
    "displayName": "Project Owner Name"
  }'
```

Registration creates a tenant and assigns the OWNER role. Additional users can
be invited to existing tenants in Phase 2.

### Enabling MFA (Recommended for all users)

```bash
# 1. Enroll (while authenticated)
curl -X POST http://localhost:3000/auth/mfa/enroll \
  -H "Cookie: session=<token>" \
  -H "X-CSRF-Token: <csrf-token>"

# 2. Scan the returned otpauth:// URI with your authenticator app

# 3. Verify with the 6-digit code
curl -X POST http://localhost:3000/auth/mfa/verify \
  -H "Cookie: session=<token>" \
  -H "X-CSRF-Token: <csrf-token>" \
  -H "Content-Type: application/json" \
  -d '{"code": "123456"}'
```

---

## Local Development

```bash
cd server
cp .env.example .env        # fill in real values; never commit .env
npm install
npm run prisma:validate     # check the schema
npm run build               # prisma generate + tsc
npm test                    # 64 tests (health + auth), no DB required
npm run dev                 # watch-mode server on PORT
```

A live database is **not** required for `npm test`; tests use `app.inject()`
with mocked database helpers.

---

## Migration Roadmap

- **Phase 0** -- Backend scaffold, Prisma schema, health endpoint, CI pipeline. **Complete.**
- **Phase 1** -- Authentication (Argon2id + sessions + TOTP MFA), CSRF, lockout,
  audit logging, RBAC middleware. **Complete (64 tests passing).**
- **Phase 2** -- Tenant management, user invitations, `Case` CRUD end-to-end
  through the API, migrate from localStorage to server-authoritative storage.
- **Phase 3** -- Module-by-module API migration (risk register, EVM, budget,
  etc.), revocable share tokens, one-time localStorage import utility.

Each phase ships green tests before the next begins.
