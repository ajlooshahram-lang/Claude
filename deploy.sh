#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# deploy.sh — bring up the STP Application stack (gated on the security check)
# ---------------------------------------------------------------------------
# Usage:
#   ./deploy.sh                 HTTP topology (local/testing) — docker-compose.yml
#   ./deploy.sh --tls           HTTPS topology with Caddy auto-HTTPS + HSTS
#   ./deploy.sh --tls --seed    ...and run the admin seed after migrations
#   ./deploy.sh --skip-checks   skip the security preflight (NOT recommended)
#
# The security preflight (security-check.sh) MUST pass (0 failures) before the
# stack is started. With --tls it also requires DOMAIN + ACME_EMAIL.
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

TLS=0; SEED=0; SKIP_CHECKS=0
while [ $# -gt 0 ]; do
  case "$1" in
    --tls) TLS=1; shift ;;
    --seed) SEED=1; shift ;;
    --skip-checks) SKIP_CHECKS=1; shift ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

# docker compose vs docker-compose
if docker compose version >/dev/null 2>&1; then DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then DC="docker-compose"
else echo "ERROR: Docker Compose not found. Install Docker first." >&2; exit 1; fi

if [ "$TLS" -eq 1 ]; then COMPOSE_FILE="docker-compose.tls.yml"; else COMPOSE_FILE="docker-compose.yml"; fi
echo "==> Topology: $([ "$TLS" -eq 1 ] && echo 'HTTPS (Caddy auto-TLS)' || echo 'HTTP (local/testing)')  [$COMPOSE_FILE]"

# .env is required.
if [ ! -f "$ROOT/.env" ]; then
  echo "ERROR: .env not found. Run: cp .env.example .env  then fill in real secrets." >&2
  exit 1
fi

# ---- security preflight gate ----------------------------------------------
if [ "$SKIP_CHECKS" -eq 0 ]; then
  echo "==> Running security preflight..."
  if [ "$TLS" -eq 1 ]; then ./security-check.sh --tls; else ./security-check.sh; fi
else
  echo "==> WARNING: skipping security preflight (--skip-checks)."
fi

# ---- bring up the stack ----------------------------------------------------
echo "==> Building & starting containers..."
$DC -f "$COMPOSE_FILE" up --build -d

# ---- wait for the backend, then run migrations -----------------------------
echo "==> Waiting for the backend container to be healthy..."
for i in $(seq 1 30); do
  if $DC -f "$COMPOSE_FILE" ps backend 2>/dev/null | grep -qiE "healthy|running|up"; then break; fi
  sleep 2
done

echo "==> Applying database schema (prisma db push)..."
$DC -f "$COMPOSE_FILE" exec -T backend npx prisma db push

if [ "$SEED" -eq 1 ]; then
  echo "==> Seeding admin user (prisma/seed.ts)..."
  $DC -f "$COMPOSE_FILE" exec -T backend npx tsx prisma/seed.ts
fi

# ---- done ------------------------------------------------------------------
echo ""
echo "==> Stack is up."
if [ "$TLS" -eq 1 ]; then
  DOMAIN="$(grep -E '^[[:space:]]*DOMAIN[[:space:]]*=' .env | tail -n1 | sed -E 's/^[^=]*=[[:space:]]*//; s/^"(.*)"$/\1/')"
  echo "    Access:  https://${DOMAIN:-<your-domain>}"
  echo "    Caddy will obtain a Let's Encrypt certificate on first request."
  echo "    Reminder: enable MFA for every user immediately after first login."
else
  echo "    Access:  http://localhost  (HTTP only — login needs HTTPS in prod; see ./deploy.sh --tls)"
fi
