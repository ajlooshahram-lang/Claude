# STP Application Inventory

> **Submarine Telecom Project (STP)** -- a $1.3B submarine fibre optic telecom
> deployment across 8 Asian countries. This application is for private use:
> 1 admin + 10 project owners (11 users total).

---

## 1. Products

| # | Product | Type | Location | Status |
|---|---------|------|----------|--------|
| 1 | **QI Intelligence Platform -- Web App (v9)** | Multi-file web app | `qi-webapp/` | Active |
| 2 | **STP Backend** | Fastify 5 + TypeScript + Prisma + PostgreSQL | `server/` | Active (Phase 2 invite system complete) |
| 3 | **QI Platform v9 Integrated** | Excel workbook (.xlsx) | `QI_Platform_v9_Integrated.xlsx` | Active |
| 4 | **FMEA-Lite** | Single-file web app | `fmea-lite.html` | Active |
| 5 | **Trend Product Finder** | Single-file web app | `trend-product-finder/` | Active |
| 6 | **Neon Shooter** | Single-file web app (experiment) | `neon-shooter/` | Experiment |

---

## 2. Product Descriptions

### 1 -- QI Intelligence Platform Web App (v9)

`qi-webapp/` -- Self-contained PM / risk / quality / EVM browser application.

- **43+ views:** Portfolio, Dashboard, Cases, Kanban, Timeline, Risk Matrix,
  Six Sigma (SPC I-MR, X-bar-R), Gage R&R, Process Capability (Cp/Cpk),
  NCR Pareto, HAZOP, Bow-tie, SIL, Requirements Traceability, EVM,
  Cash Flow / S-curve, RICE/WSJF, OKR, AI Assistant, Report Pack, and more.
- **Offline-first:** All computation runs in-browser, localStorage persistence,
  JSON/CSV export, dark mode, command palette.
- **Project Brain** (`js/brain.js`): Offline deterministic engine that generates
  a full project plan (WBS, FMEA risks, milestones, procurement, budget) from a
  description. Includes a built-in fibre/telecom domain profile tuned for
  submarine cable deployment projects.
- **3D Network Map** (`js/globe.js`): Photoreal Three.js (r128) globe with real
  Earth day/normal/specular/cloud/night-lights textures, atmosphere glow, ACES
  tone mapping and UnrealBloom + FXAA. Renders the 8 STP landing stations and the
  submarine cable topology as glowing tubes. **Interactive stakeholder tool:**
  click any station or cable to fly the camera to it, a cinematic auto-tour of
  all stations, a rotation play/pause toggle, in-stage glass detail cards, and a
  **construction replay** that "lays" each cable along its route up to its real
  `% laid` from the Route Progress data (faint full line = planned route, bright
  segment = laid cable), and an **equipment layer** (toggle) rendering subsea
  Branching Units at junction stations plus inline optical repeaters every ~100 km
  that appear only along the laid portion of each cable. Fully feature-detected —
  degrades gracefully (2D legend) where WebGL/Three.js is unavailable, never throws.
- **Route Progress** (`js/store.js` + `routeprogress` view): Tracks each cable
  segment through 7 real lifecycle phases plus overall `% laid`, persisted
  server-side via the login-gated `/api/projects/:id/data` endpoint.

### 2 -- STP Backend (server/)

Secure, multi-tenant backend powering the QI Platform for STP.

- **Stack:** Fastify 5, TypeScript (strict), Prisma ORM, PostgreSQL.
- **Phase 1 Authentication (complete):**
  - Argon2id password hashing (64 MB memory, 3 iterations, 4 parallelism)
  - 32-byte CSPRNG session tokens, SHA-256 hashed in database
  - HttpOnly + Secure + SameSite=Strict session cookies
  - RFC 6238 TOTP MFA (30s step, 6 digits, +/-1 window tolerance)
  - Double-submit cookie CSRF protection
  - Account lockout (5 failed attempts in 15 min triggers 15 min lockout)
  - Full audit logging of all authentication events
  - RBAC middleware (OWNER > ADMIN > MANAGER > VIEWER)
  - Password policy: 12+ characters, not in common passwords list
- **Security by design:** Multi-tenant row-level isolation, encrypted secrets at
  rest, no data-in-URL sharing, append-only audit log.

### 3 -- QI Platform v9 Integrated (Excel)

`QI_Platform_v9_Integrated.xlsx` -- Integrated workbook companion to the web
application, providing spreadsheet-based project management workflows.

### 4 -- FMEA-Lite

`fmea-lite.html` -- Standalone single-file Failure Mode and Effects Analysis
tool. Browser-based, no server required.

### 5 -- Trend Product Finder

`trend-product-finder/` -- Product finder tool for identifying and comparing
products relevant to the submarine telecom deployment.

### 6 -- Neon Shooter

`neon-shooter/` -- Experimental demo application.

---

## 3. Verification Status

| Check | Result |
|-------|--------|
| `node --check` on all `qi-webapp/js/*.js` + tests | 12/12 OK |
| `node qi-webapp/test.js` (engine: MSA, cashflow, resource, Cp/Cpk, RICE/WSJF, NCR Pareto, theme, soft-delete/bulk) | PASS |
| `node qi-webapp/brain.test.js` (domain detect, scale parse, cost scaling, fallback, determinism) | 24/24 PASS |
| `node qi-webapp/smoke.js` (all 43+ views, country intelligence, 3D map datasets + interactive API no-throw, Route Progress) | 287/287 PASS |
| `cd server && npm run build` | OK (TypeScript compiles cleanly, strict mode) |
| `cd server && npm test` | 218/218 PASS (health + auth/MFA + data + invite/TOCTOU security tests) |

---

## 4. Session Timeline

| Session | What shipped |
|---------|--------------|
| **STP v1** | QI Platform v9 web app, integrated workbook, FMEA-Lite, Trend Product Finder, Neon Shooter, Project Brain with fibre/telecom domain profile. |
| **STP v2** | Secure backend scaffold (Fastify 5 + Prisma + PostgreSQL), Phase 1 authentication system (Argon2id, sessions, TOTP MFA, CSRF, lockout, audit logging, RBAC), Phase 2 invitation system (invite/accept/revoke, team listing), Project/Case CRUD API, CI pipeline, Docker Compose deployment. |

---

## 5. Deployment

Docker Compose orchestrates three services for production deployment:

| Service | Image | Purpose | Network |
|---------|-------|---------|---------|
| `db` | postgres:16-alpine | PostgreSQL database | internal only |
| `backend` | node:22-alpine (multi-stage) | Fastify 5 API server | internal only |
| `frontend` | nginx:alpine | Static files + reverse proxy | internal + web |

### Quick Start

```bash
# 1. Copy and fill environment secrets
cp .env.example .env
# Edit .env — generate secrets with:
#   openssl rand -hex 16    (POSTGRES_PASSWORD)
#   openssl rand -hex 32    (SESSION_SECRET)
#   openssl rand -base64 32 (DATA_ENCRYPTION_KEY)

# 2. Build and start
docker compose up --build -d

# 3. Initialize database schema
docker compose exec backend npx prisma db push

# 4. Seed admin user
docker compose exec backend npx tsx prisma/seed.ts
```

### Security Notes

- **TLS requirement:** Session cookies use the `Secure` flag in production,
  which requires HTTPS. A TLS-terminating reverse proxy (Cloudflare Tunnel,
  Caddy, Traefik, or a cloud load balancer) MUST sit in front of nginx for
  production deployments. For local testing without TLS, set
  `NODE_ENV=development` in your `.env` file.
- **Database isolation:** PostgreSQL is on an internal-only network, never
  exposed to the host or internet.
- **Backend isolation:** The Fastify server is only reachable through nginx on
  the internal network. No host port mapping.
- **Non-root containers:** Both the backend and database run as non-root users.
- **Security headers:** nginx enforces X-Frame-Options DENY,
  X-Content-Type-Options nosniff, strict CSP, and Referrer-Policy.
- **Rate limiting:** API and auth endpoints have per-IP rate limits enforced
  at the nginx layer.
- **Same-origin architecture:** Frontend and API are served from the same
  origin, enabling SameSite=Strict cookies without CORS complexity.

---

## 6. Architecture Overview

```
Browser (11 users)
    |
    v
[qi-webapp/]  <-- offline-capable PM/risk/quality/EVM app
    |
    v (API calls)
[server/]     <-- Fastify 5, auth, RBAC, audit, tenant isolation
    |
    v
[PostgreSQL]  <-- encrypted at rest, multi-tenant, row-level isolation
```

All users authenticate via email + password (Argon2id) with optional TOTP MFA.
Sessions are server-side with only token hashes stored. Every action is
audit-logged. The system is designed for the highest cybersecurity standards
appropriate to a $1.3B infrastructure project.
