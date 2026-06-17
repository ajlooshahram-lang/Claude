# Submarine Telecom Project (STP) Application

A programme-scale project / risk / quality / finance management application for a
large multi-country submarine fiber-optic deployment, plus a photoreal, interactive
**3D submarine-cable Network Map**. Private tool for the project owners.

> **Audience right now:** private & free — the owner + 10 other project owners (11 users).
> **Requirement:** user login + password and **highest cybersecurity** (see [`SECURITY.md`](./SECURITY.md)).

---

## Two ways to run it

### 1. Secure deployment (the real product — login-protected)
The hardened, multi-user system with accounts, passwords, MFA and audit logging.

```sh
# Production, automatic HTTPS, for the 11 owners:
DOMAIN=stp.example.com TLS_EMAIL=you@example.com ./deploy.sh --tls

# Local/LAN test (HTTP only, no TLS):
./deploy.sh
```

Full instructions: [`DEPLOY.md`](./DEPLOY.md). Security controls & hardening
checklist: [`SECURITY.md`](./SECURITY.md).

### 2. Standalone demo (viewing only — no backend, no login)
A single self-contained file for quickly *showing* the app (e.g. to non-technical
stakeholders). **Do not use it for real data** — it has no backend and no login.

- File: `qi-webapp/dist/STP-Application.html` (zipped: `qi-webapp/dist/STP-Application.zip`)
- Download → double-click → opens in any modern browser, offline.

---

## Security posture (summary)
The login-protected deployment enforces:
- **Passwords** hashed with **Argon2id**; strong-password policy.
- **Two-factor auth (TOTP)** with recovery codes; login **lockout** + TOTP replay protection.
- **CSRF** protection; server-side **sessions** with revocation.
- **RBAC** (Owner/Admin/Manager/Viewer) and strict **tenant isolation** of all data.
- **Audit logging** of security-relevant events.
- PostgreSQL + backend run on an **internal-only** network; only the TLS proxy is public.

These are implemented in `server/` and verified by the test suite.

---

## Repository layout
| Path | What |
|------|------|
| `qi-webapp/` | Front-end app (UI, 3D Network Map, Project Brain) + tests + standalone build |
| `server/` | Secure backend (Fastify + Prisma + PostgreSQL): auth, MFA, RBAC, data APIs |
| `nginx/` | Static + reverse-proxy front, security headers |
| `docker-compose.yml` | Base stack (Postgres + backend + nginx) |
| `docker-compose.tls.yml` + `Caddyfile` | Optional automatic-HTTPS overlay (Caddy + Let's Encrypt) |
| `deploy.sh` | One-command secure deploy (secrets, build, migrate, seed) |
| `DEPLOY.md` / `SECURITY.md` / `INVENTORY.md` | Deploy guide / security docs / asset & verification inventory |

---

## Verification (latest run)
- Backend: `cd server && npm run build` clean · `npm test` → **218/218 pass**
  (auth/MFA/CSRF/RBAC/tenant-isolation/invite-TOCTOU).
- Web app: `cd qi-webapp && npm test` → **287 assertions pass**; standalone build
  boots green (**19/19** checks).
- CI (`.github/workflows/`) runs both suites on every push/PR.
