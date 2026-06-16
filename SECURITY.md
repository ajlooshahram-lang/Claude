# Security Policy — Submarine Telecom Project (STP) Application

The STP application is a **private, security-first** project / risk / quality
management platform for a single, fixed group of **11 users** (1 admin + 10
project owners) managing a ~$1.3B submarine fibre programme. Highest-grade
cyber security is a hard, non-negotiable requirement.

This document describes the threat model, the controls that are implemented and
exactly where they are enforced, the **mandatory** deployment hardening
checklist, known gaps on the roadmap, incident-response basics, and how to
report a vulnerability.

> Scope: this document covers the STP backend (`server/`, Fastify 5 + TypeScript
> strict + Prisma + PostgreSQL) and its deployment topology (nginx reverse proxy
> + Docker). It is STP-only.

---

## 1. Threat model

### What we are protecting
- Confidential programme data: cases, risk/quality registers (HAZOP, SIL, NCR,
  MoC, punch lists, RTM, etc.), milestones, decisions, procurement, cashflow and
  other analytical data.
- User accounts and credentials.
- The integrity and availability of the platform for a small, known user base.

### Who/what we defend against
| Adversary | Capability | Primary defences |
|-----------|-----------|------------------|
| Unauthenticated internet attacker | Hits the public endpoint, scans, sprays credentials | TLS, session auth on every API route, per-route + edge rate limiting, account lockout, helmet headers |
| Credential-stuffing / brute-force bot | Tries leaked or guessed passwords | Argon2id hashing, 12-char + complexity + common-password rejection, account lockout, login rate limiting, MFA (TOTP) |
| Cross-site attacker (malicious page in the user's browser) | Tries CSRF, attempts to read cookies/tokens | SameSite=Strict + HttpOnly session cookie, double-submit CSRF token on all state-changing routes, strict CORS allow-list |
| Malicious / curious authenticated user | Tries to read or modify another tenant's data, or escalate role | Hard tenant isolation (every query scoped by session `tenantId`), 404 on cross-tenant, RBAC role hierarchy, "cannot invite ≥ your own role" |
| Attacker with read access to the database (backup theft, disk image) | Tries to replay sessions or recover secrets | Only SHA-256 hashes of session/invite tokens stored; passwords are Argon2id; MFA secrets AES-256-GCM encrypted at rest |
| Network eavesdropper | Sniffs traffic | TLS in front of nginx (cookies are `Secure`), DB on an internal-only Docker network |

### Trust boundaries / assumptions
- The backend container is **never** exposed directly to the host or internet —
  it is reachable only through nginx on the internal Docker network.
- A TLS-terminating proxy sits in front of nginx (required — see §3).
- The 11 users are known, trusted operators; the platform is not multi-customer
  SaaS. Some trade-offs (e.g. registration email enumeration) are accepted on
  that basis and documented in §4.

---

## 2. Security controls (implemented) and where they are enforced

| Control | How it is enforced | Where (source) |
|--------|--------------------|----------------|
| **Password hashing** | Argon2id, memory 64 MB, time cost 3, parallelism 4; versioned PHC prefix for future re-hash | `server/src/auth/password.ts` |
| **Password policy** | Min 12 chars, ≥2 character classes, rejects a common-password list | `validatePasswordStrength()` in `server/src/auth/password.ts` |
| **Server-side sessions** | 32-byte CSPRNG token; only its SHA-256 hash is stored; validated on every request; expiry + revocation checked | `server/src/auth/session.ts`, `server/src/auth/middleware.ts` |
| **Session cookie flags** | `HttpOnly`, `Secure` (in prod), `SameSite=Strict`, `Path=/`; max-age = session expiry | `getSessionCookieOptions()` in `server/src/auth/session.ts` |
| **No session fixation** | A fresh session token is minted on every successful login / MFA completion / invite acceptance (the client never supplies its own session id) | `server/src/auth/routes.ts`, `server/src/invite/routes.ts` |
| **MFA (TOTP, RFC 6238)** | HMAC-SHA1, 30s step, 6 digits, ±1 window; verified with a constant-time compare | `server/src/auth/totp.ts` |
| **MFA secret encryption at rest** | AES-256-GCM with random IV + auth tag, keyed by `DATA_ENCRYPTION_KEY` | `server/src/auth/crypto.ts`, used in `server/src/auth/routes.ts` |
| **CSRF protection** | Double-submit cookie: random token in a JS-readable cookie must match the `X-CSRF-Token` header; enforced on all POST/PUT/PATCH/DELETE | `server/src/auth/csrf.ts`, global preHandler in `server/src/app.ts` |
| **CSRF exemptions** | Only the initial unauthenticated flows: `/auth/register`, `/auth/login`, `/auth/login/mfa`, `/auth/accept-invite` | `CSRF_EXEMPT_ROUTES` in `server/src/app.ts` |
| **Account lockout** | 5 failed attempts / 15 min → 15-min lock, keyed per email (lowercased); counts attempts even for unknown emails | `server/src/auth/lockout.ts` |
| **Rate limiting (app layer)** | Global 300/min; `/auth/register` 5/min; `/auth/login` 10/min; `/auth/login/mfa` 10/min; `/api/invites` & `/auth/accept-invite` 10/min | `server/src/app.ts`, `server/src/auth/routes.ts`, `server/src/invite/routes.ts` |
| **Rate limiting (edge)** | nginx `auth` zone 5 r/s (burst 10), `api` zone 30 r/s (burst 20) | `nginx/nginx.conf` |
| **RBAC** | Role hierarchy OWNER > ADMIN > MANAGER > VIEWER via `requireAuth` + `requireRole`; invites cannot grant a role ≥ the inviter's | `server/src/auth/middleware.ts`, `server/src/invite/routes.ts` |
| **Tenant isolation** | Every data query takes `tenantId` from the **session** (never from the body/params) as its first filter; cross-tenant access returns 404, not 403 | `server/src/data/db-helpers.ts`, `server/src/data/routes.ts` |
| **Invite system** | 32-byte CSPRNG token, only SHA-256 hash stored, 7-day expiry, single-use via atomic conditional update (TOCTOU-safe) | `server/src/invite/routes.ts`, `server/src/invite/db-helpers.ts` |
| **Audit logging** | All auth events and data mutations write an `AuditLog` row (tenant, actor, action, entity, ip) | `server/src/auth/audit.ts`, audit calls throughout `*/routes.ts` |
| **Input validation** | Zod schemas on every request body/param, with explicit max lengths and bulk-operation caps; analytical-data payloads capped at 500 KB | `server/src/auth/routes.ts`, `server/src/data/schemas.ts`, `server/src/invite/schemas.ts` |
| **Security headers** | helmet on every response; nginx adds X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, CSP, Permissions-Policy | `server/src/app.ts`, `nginx/nginx.conf` |
| **Strict CORS** | Only configured origins; credentials allowed; **wildcard rejected in production** | `server/src/app.ts`, `loadConfig()` in `server/src/config.ts` |
| **Fail-closed config** | Process refuses to boot in production without `SESSION_SECRET`, `DATA_ENCRYPTION_KEY`, `DATABASE_URL`, and rejects `*` CORS | `server/src/config.ts` |
| **Network isolation** | DB and backend on an `internal: true` Docker network; only nginx is published | `docker-compose.yml` |
| **Least privilege runtime** | Backend container runs as a non-root user | `server/Dockerfile` |
| **Secret hygiene** | `.env` / `.env.*` git-ignored (only `.env.example` committed); no secrets logged | `server/.gitignore`, root `.gitignore` |

---

## 3. Deployment hardening checklist (the admin MUST follow)

Do **all** of the following before going live.

1. **Generate strong secrets** (never reuse the placeholders in `.env.example`):
   ```sh
   openssl rand -hex 16     # POSTGRES_PASSWORD
   openssl rand -hex 32     # SESSION_SECRET        (≥ 32 bytes)
   openssl rand -base64 32  # DATA_ENCRYPTION_KEY   (32 bytes)
   ```
   Put these in `.env` (copied from `.env.example`). Never commit `.env`.

2. **Put TLS in front of nginx — REQUIRED.** Session and CSRF cookies use the
   `Secure` flag in production, so browsers will refuse them over plain HTTP and
   login will fail. Use Cloudflare Tunnel, Caddy, Traefik, or a cloud load
   balancer for TLS termination. Once TLS is confirmed, enable HSTS (the
   commented block in `nginx/nginx.conf`).

3. **Keep PostgreSQL internal-only.** The provided `docker-compose.yml` already
   places `db` and `backend` on an `internal: true` network with no published
   ports — do not add a `ports:` mapping for them. Only the nginx `frontend`
   service should publish a port.

4. **Set `NODE_ENV=production`** so `Secure` cookies, fail-closed config checks,
   and reduced error verbosity are all active.

5. **Set `CORS_ORIGINS`** to the exact UI origin(s) (e.g.
   `https://stp.example.com`). Never `*`. (In the bundled same-origin nginx
   setup it can be empty.)

6. **Set a strong admin seed password** (`ADMIN_PASSWORD`, 12+ chars) before
   running `prisma/seed.ts`, then unset it from the environment.

7. **Enable MFA for every user**, including the admin, immediately after first
   login (`/auth/mfa/enroll` → `/auth/mfa/verify`).

8. **Run migrations / seed** through the backend container:
   `docker compose exec backend npx prisma db push` then the seed.

9. **Back up the database** regularly and **encrypt the backups** (they contain
   Argon2id password hashes and AES-GCM-encrypted MFA secrets — protect them
   like production data). Test restores.

10. **Rotate secrets** periodically and on any suspected exposure (see §5).
    Rotating `SESSION_SECRET` invalidates cookie signatures; rotating
    `DATA_ENCRYPTION_KEY` requires re-encrypting stored MFA secrets (re-enrol
    MFA is the simple path for 11 users).

11. **Keep dependencies patched:** run `npm audit --omit=dev` and rebuild images
    on a schedule. (At the time of writing: **0 production vulnerabilities.**)

12. **Restrict who can reach the host.** For an 11-user private tool, consider an
    allow-list / VPN / Cloudflare Access in front of the public endpoint as an
    extra layer.

---

## 4. Known gaps / roadmap (honest list)

These are **not yet implemented**. None is a critical hole for the current
private 11-user deployment, but each should be closed for a hardened long-term
operation.

- **No password reset / change flow.** There is no self-service password change
  or reset endpoint, and therefore no session revocation on credential change.
  A `revokeAllUserSessions()` helper exists but is not yet wired to any route.
  *Roadmap:* add `POST /auth/change-password` (re-auth + revoke all other
  sessions) and an admin-driven reset. **Until then, account recovery is a
  manual DB/admin operation.**
- **No email verification or transactional email.** Invites return the raw token
  in the API response for the admin to deliver out-of-band; there is no built-in
  mailer.
- **No 2FA recovery codes.** A user who loses their TOTP device must be recovered
  manually by the admin (disable MFA in the DB). *Roadmap:* one-time recovery
  codes at enrolment.
- **MFA second-factor brute-force is only rate-limited, not lockout-tracked.**
  TOTP failures do not feed the per-email account-lockout counter; they are
  bounded by the per-route rate limit (10/min) + single-use pending tokens +
  nginx edge limit. *Roadmap:* count MFA failures toward lockout.
- **TOTP replay within the validity window.** A captured code can be reused
  within its ±1-step window because the last-used counter is not persisted. Low
  impact (each use still requires a fresh single-use pending token from a
  password login). *Roadmap:* store and reject the last-accepted time-step.
- **User enumeration on registration / invite creation.** `/auth/register` and
  `POST /api/invites` return `409` for an existing email. Accepted trade-off for
  a fixed, known user base; revisit if the user base ever opens up.
- **No automated secret rotation.** Rotation is currently a manual, documented
  procedure (§3.10, §5).
- **No WAF / IDS.** Protection relies on nginx rate limiting, app-layer
  validation, and network isolation. *Roadmap:* front with a WAF (e.g.
  Cloudflare) for an additional layer.
- **No automated session-store cleanup job** for expired session rows (expiry is
  enforced at validation time, so this is hygiene only).
- **Audit log retention/rotation** is not yet automated (see §5).

---

## 5. Incident response basics

**Where the evidence is**
- **Audit log:** the `AuditLog` table in PostgreSQL records authentication events
  (`auth.login`, `auth.login.failed`, `auth.logout`, `auth.register`,
  `auth.mfa.*`) and data mutations (`project.*`, `case.*`, `register.*`,
  `snapshot.*`, `invite.*`) with tenant, actor, entity, and source IP.
- **Application logs:** stdout of the `backend` container (`docker compose logs
  backend`). Request logging is on outside of the test environment.
- **Access logs:** nginx access/error logs inside the `frontend` container.

**Revoke a single session**
- Set `revokedAt = now()` on the relevant `Session` row; the next request with
  that cookie is rejected with 401 (`server/src/auth/middleware.ts`).

**Revoke ALL sessions (e.g. suspected compromise)**
- Bulk-set `revokedAt = now()` on all `Session` rows (or per user). A helper,
  `revokeAllUserSessions(userId)`, exists in
  `server/src/auth/db-helpers.ts` for per-user revocation.
- A platform-wide "log everyone out" can also be achieved by rotating
  `SESSION_SECRET` and redeploying.

**Disable / lock out a user**
- Soft-delete the user (`User.deletedAt = now()`): auth lookups filter on
  `deletedAt: null`, so the account can no longer authenticate, and revoke their
  sessions as above.
- To force re-MFA, clear `mfaSecret`/`mfaEnabled` and re-enrol.

**Rotate compromised secrets**
- `SESSION_SECRET`: rotate + redeploy (invalidates existing cookie signatures →
  forces re-login).
- `DATA_ENCRYPTION_KEY`: rotate, then re-enrol MFA for all users (re-encrypts
  secrets under the new key).
- `POSTGRES_PASSWORD`: rotate in the DB and `.env`, redeploy.

**After an incident**
- Preserve the `AuditLog` and container logs, rotate all secrets, force a global
  logout, and require MFA re-enrolment.

---

## 6. Reporting a vulnerability

This is a private application for a small team. If you discover a security issue:

1. **Do not** open a public issue or include exploit details in any shared
   tracker.
2. Contact the project admin **directly and privately** (the admin account
   owner for this deployment).
3. Include: a description, affected endpoint/file, reproduction steps, and the
   potential impact.
4. Please allow reasonable time to remediate before any disclosure.

We aim to acknowledge a report within a few business days and to prioritise any
issue affecting authentication, tenant isolation, or data confidentiality.
