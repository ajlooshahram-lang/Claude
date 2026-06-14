# QI Platform — Backend

Secure, multi-tenant backend for the QI **project / risk / finance** platform.
This is **Phase 0**: the scaffold that compiles, validates its data model, passes
a health test, and runs in CI. It deliberately ships **no business endpoints yet**
and changes **nothing** in the existing web UI.

## Why this exists

The current `qi-webapp` is a 100% client-side app: all data lives in the
browser's `localStorage` and its "share" feature base64-encodes the entire
dataset into a URL. That is fundamentally incompatible with a private, secure
finance application. Security must live on a server we control — authentication,
per-request authorization, encryption at rest, tenant isolation, and an audit
trail. This backend is that server.

## Stack

| Concern        | Choice                                            |
| -------------- | ------------------------------------------------- |
| Language       | TypeScript (strict), ES modules                   |
| HTTP framework | Fastify 5 (+ helmet, CORS, rate-limit)            |
| Database       | PostgreSQL via Prisma                             |
| Config         | zod-validated environment (fails fast)            |
| Tests          | `node:test` via `tsx` (no DB needed for health)   |

Same language as the existing front-end code, so there is no second ecosystem
to maintain. The proven domain logic (`qi-webapp/js/calc.js`) and UI are kept;
only the unsafe storage/sharing layer is being replaced.

## Security model

- **Multi-tenant isolation** — every tenant-owned row carries `tenantId`; the
  data-access layer (Phase 1) scopes every query by the authenticated tenant.
- **RBAC** — `Membership.role` ∈ `OWNER | ADMIN | MANAGER | VIEWER`; enforced
  server-side on every request.
- **Authentication (Phase 1)** — email + password hashed with **Argon2id**
  (`@node-rs/argon2`, prebuilt, no native toolchain), server-side **sessions**
  (only a token *hash* is stored), and optional **TOTP MFA**.
- **Secrets at rest** — tenant integration secrets (e.g. AI keys) are encrypted
  with `DATA_ENCRYPTION_KEY`; passwords are hashed, never encrypted.
- **Transport** — TLS terminated at the proxy; strict CORS allow-list (wildcard
  origins are rejected in production); baseline rate limiting.
- **GDPR / data residency** — `DATA_REGION` documents where data lives;
  soft-delete (`deletedAt`) supports the right-to-erasure workflow; `AuditLog`
  is append-only and doubles as the record of processing.
- **No more data-in-URL sharing** — replaced by `ShareToken`: scoped, expiring,
  revocable, and stored only as a hash.

## Data model

Mirrors the current web app state (see `prisma/schema.prisma`):

- First-class, queryable, access-controlled tables: `Case`, `RegisterRow`
  (one table for all 13 register types), `Snapshot`, `ShareToken`, `AuditLog`.
- Opaque analytical blobs the UI treats as whole units (`spec`, `roster`,
  `stakeholders`, `sigma`, `gage`, `cashflow`, `xbarR`) are JSON columns on
  `Project`, validated by zod at the API edge.

## Local development

```bash
cd server
cp .env.example .env        # fill in real values; never commit .env
npm install
npm run prisma:validate     # check the schema
npm run build               # prisma generate + tsc
npm test                    # health + config tests (no DB required)
npm run dev                 # watch-mode server on PORT
```

A live database is **not** required for `npm test`; `/health` never touches the
DB and `/ready` reports `degraded` until `DATABASE_URL` points at a reachable
PostgreSQL instance.

## Endpoints (Phase 0)

| Method | Path      | Purpose                                              |
| ------ | --------- | ---------------------------------------------------- |
| GET    | `/health` | Liveness. Always DB-free. Returns service + region.  |
| GET    | `/ready`  | Readiness. 200 when the database is reachable, else 503. |

## Migration roadmap

- **Phase 0 (this PR)** — remove Excel; scaffold backend; schema; health + CI. No UI change.
- **Phase 1** — auth (Argon2 + sessions + MFA), tenancy, RBAC middleware, and
  `Case` CRUD end-to-end through the API, behind a login, with tests.
- **Phase 2+** — migrate each module to the API, retire `localStorage`, wire the
  audit log to be server-authoritative, add revocable share tokens, and provide
  a one-time import from existing `localStorage` exports.

Each phase ships green tests before the next begins.
