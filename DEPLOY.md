# Deploy — Submarine Telecom Project (STP) Application

The **secure, login-protected** deployment for you + the 10 project owners
(private, 11 users). This is the real product: user accounts, passwords
(Argon2id), TOTP MFA, CSRF, RBAC, tenant isolation, audit logging — see
[`SECURITY.md`](./SECURITY.md) for the full control list and the mandatory
hardening checklist.

> The single-file `qi-webapp/dist/STP-Application.html` is a **demo for viewing
> only** (no backend, no login). Do **not** use it to manage real data. Use the
> deployment below for anything real.

---

## Prerequisites
- A Linux host (VM or server) with **Docker** + **Docker Compose v2** and
  **openssl**.
- For production HTTPS: a **domain name** with a DNS record pointing at the host,
  and ports **80** + **443** open to the internet.

---

## Option A — Production (recommended): one command with automatic HTTPS

```sh
DOMAIN=stp.example.com TLS_EMAIL=you@example.com ./deploy.sh --tls
```

This generates strong secrets into `.env`, builds and starts PostgreSQL + the
Fastify backend + nginx, fronts them with **Caddy** (automatic Let's Encrypt
TLS), applies the database schema, and seeds the first admin. When it finishes
it prints your admin email and a one-time generated admin password.

Open `https://stp.example.com`, log in, and **immediately**:
1. Enable MFA: Settings → your account → enable authenticator (TOTP).
2. Generate and safely store MFA recovery codes.
3. Invite the 10 owners: Settings → Team Management → Invite.

## Option B — Local / LAN test (HTTP only, no TLS)

```sh
./deploy.sh
```

Runs on `http://localhost` with `NODE_ENV=development` so login works without
TLS. **Do not expose this to the internet** — it is for trying the app locally.

---

## What the script does (and is safe to re-run)
1. Creates `.env` from `.env.example` with freshly generated secrets
   (`POSTGRES_PASSWORD`, `SESSION_SECRET`, `DATA_ENCRYPTION_KEY`, admin password).
   An existing `.env` is **never** overwritten.
2. `docker compose build` + `up -d`.
3. `prisma db push` (schema) + seeds the admin (`prisma/seed.ts`).

To set your own admin password instead of a generated one, export it before the
first run: `ADMIN_PASSWORD='your-strong-12+char-pw' ADMIN_PASSWORD_PROVIDED=1 ./deploy.sh --tls`.

---

## Manual equivalent (if you prefer not to use the script)
```sh
cp .env.example .env
# fill secrets:
#   openssl rand -hex 16    -> POSTGRES_PASSWORD
#   openssl rand -hex 32    -> SESSION_SECRET
#   openssl rand -base64 32 -> DATA_ENCRYPTION_KEY
#   set a strong ADMIN_PASSWORD (12+ chars), DOMAIN, TLS_EMAIL

# production w/ HTTPS:
docker compose -f docker-compose.yml -f docker-compose.tls.yml up -d --build
# or local http test:
# docker compose up -d --build

docker compose exec backend npx prisma db push
docker compose exec backend npx tsx prisma/seed.ts
```

---

## Operations
- **Logs:** `docker compose logs -f backend`
- **Stop:** `docker compose down` (data persists in the `pgdata` volume)
- **Backups:** back up the `pgdata` volume regularly and **encrypt** the backups
  (they contain password hashes + encrypted MFA secrets). Test restores.
- **Updates:** `git pull` → re-run `./deploy.sh` (or `docker compose ... up -d --build`).
- **Incident response, secret rotation, revoking sessions:** see
  [`SECURITY.md`](./SECURITY.md) §3–§5.

---

## Security model in one line
PostgreSQL and the backend run on an **internal-only** Docker network (never
published); only the TLS proxy is public; every API route requires an
authenticated, server-side session; all data is scoped to the caller's tenant.
Full details and the hardening checklist: [`SECURITY.md`](./SECURITY.md).
