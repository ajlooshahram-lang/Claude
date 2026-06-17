#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Submarine Telecom Project (STP) Application — secure deployment helper
# ---------------------------------------------------------------------------
# One command to stand up the PRIVATE, login-protected deployment for the
# 11 project owners. It:
#   1. creates .env with strong, randomly generated secrets (if missing)
#   2. builds + starts the containers (PostgreSQL + Fastify backend + nginx)
#   3. pushes the database schema and seeds the first admin account
#
# Usage:
#   ./deploy.sh                 # local/LAN test on http://localhost  (NODE_ENV=development)
#   DOMAIN=stp.example.com \
#   TLS_EMAIL=you@example.com \
#   ./deploy.sh --tls           # production with automatic HTTPS (Caddy + Let's Encrypt)
#
# Re-running is safe: an existing .env is never overwritten.
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")"

TLS=0
[ "${1:-}" = "--tls" ] && TLS=1

# ---- prerequisites --------------------------------------------------------
command -v docker >/dev/null 2>&1 || { echo "ERROR: docker is not installed."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "ERROR: 'docker compose' (v2) is required."; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo "ERROR: openssl is required to generate secrets."; exit 1; }

GENERATED_ADMIN_PW=""

# ---- 1) .env with strong secrets -----------------------------------------
if [ -f .env ]; then
  echo "==> .env already exists — leaving it untouched."
else
  echo "==> Creating .env with freshly generated secrets..."
  cp .env.example .env
  POSTGRES_PASSWORD="$(openssl rand -hex 16)"
  SESSION_SECRET="$(openssl rand -hex 32)"
  DATA_ENCRYPTION_KEY="$(openssl rand -base64 32)"
  ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(openssl rand -base64 18)}"
  [ -z "${ADMIN_PASSWORD_PROVIDED:-}" ] && GENERATED_ADMIN_PW="$ADMIN_PASSWORD"

  # NODE_ENV: production only makes sense with TLS (Secure cookies need HTTPS).
  if [ "$TLS" -eq 1 ]; then NODE_ENV_VAL="production"; else NODE_ENV_VAL="development"; fi

  # portable in-place edits (BSD/GNU sed): rewrite via a temp file
  python3 - "$POSTGRES_PASSWORD" "$SESSION_SECRET" "$DATA_ENCRYPTION_KEY" "$ADMIN_PASSWORD" "$NODE_ENV_VAL" <<'PY'
import re, sys
pw, sess, enc, admin, nodeenv = sys.argv[1:6]
f = ".env"
s = open(f).read()
def setkv(s, k, v):
    if re.search(rf"(?m)^{re.escape(k)}=.*$", s):
        return re.sub(rf"(?m)^{re.escape(k)}=.*$", f"{k}={v}", s)
    return s + f"\n{k}={v}\n"
s = setkv(s, "POSTGRES_PASSWORD", pw)
s = setkv(s, "SESSION_SECRET", sess)
s = setkv(s, "DATA_ENCRYPTION_KEY", enc)
s = setkv(s, "ADMIN_PASSWORD", admin)
s = setkv(s, "NODE_ENV", nodeenv)
open(f, "w").write(s)
PY
  chmod 600 .env || true
  echo "    secrets written (POSTGRES_PASSWORD, SESSION_SECRET, DATA_ENCRYPTION_KEY)."
fi

# ---- 2) compose file selection -------------------------------------------
COMPOSE=(-f docker-compose.yml)
if [ "$TLS" -eq 1 ]; then
  : "${DOMAIN:?Set DOMAIN=your.domain for --tls (DNS must point at this host, ports 80+443 open).}"
  export DOMAIN TLS_EMAIL="${TLS_EMAIL:-}"
  COMPOSE+=(-f docker-compose.tls.yml)
  echo "==> TLS mode: automatic HTTPS for https://$DOMAIN via Caddy + Let's Encrypt."
else
  echo "==> HTTP mode (local/LAN test) on http://localhost — NODE_ENV=development so login works without TLS."
  echo "    For production, run with --tls and a real DOMAIN (see DEPLOY.md)."
fi

# ---- 3) build, start, migrate, seed --------------------------------------
echo "==> Building images..."
docker compose "${COMPOSE[@]}" build
echo "==> Starting services..."
docker compose "${COMPOSE[@]}" up -d

echo "==> Waiting for the backend to be ready..."
for i in $(seq 1 30); do
  if docker compose "${COMPOSE[@]}" exec -T backend node -e "process.exit(0)" >/dev/null 2>&1; then break; fi
  sleep 2
done

echo "==> Applying database schema (prisma db push)..."
docker compose "${COMPOSE[@]}" exec -T backend npx prisma db push
echo "==> Seeding the first admin account..."
docker compose "${COMPOSE[@]}" exec -T backend npx tsx prisma/seed.ts || true

# ---- done -----------------------------------------------------------------
echo ""
echo "============================================================"
echo " STP Application is up."
if [ "$TLS" -eq 1 ]; then echo " URL:   https://$DOMAIN"; else echo " URL:   http://localhost"; fi
echo " Admin: $(grep -E '^ADMIN_EMAIL=' .env | cut -d= -f2-)"
if [ -n "$GENERATED_ADMIN_PW" ]; then
  echo " Admin password (generated, shown once): $GENERATED_ADMIN_PW"
  echo "   -> Save it now, then change it after first login."
fi
echo "------------------------------------------------------------"
echo " NEXT (mandatory hardening — see SECURITY.md §3):"
echo "   1. Log in and immediately enable MFA (/auth/mfa/enroll)."
echo "   2. Generate MFA recovery codes and store them safely."
echo "   3. Invite the 10 owners from Settings > Team Management."
echo "   4. Back up the database volume regularly (encrypted)."
echo "   5. Verify hardening:  ./security-check.sh   (URL=$( [ "$TLS" -eq 1 ] && echo https://$DOMAIN || echo http://localhost ) ./security-check.sh to also probe headers)"
echo "============================================================"
