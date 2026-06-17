#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# STP Application — post-deploy security self-check
# ---------------------------------------------------------------------------
# Confirms the deployment is hardened per SECURITY.md. Run it after ./deploy.sh.
#
#   ./security-check.sh                 # checks ./.env + compose + (optional) live headers
#   ./security-check.sh path/to/.env    # check a specific env file
#   URL=https://stp.example.com ./security-check.sh   # also probe live TLS/security headers
#
# Read-only: it never changes anything. Exit code is non-zero if any FAIL.
# ---------------------------------------------------------------------------
set -uo pipefail
cd "$(dirname "$0")"

ENV_FILE="${1:-.env}"
PASS=0; WARN=0; FAIL=0
ok()   { echo "  [PASS] $1"; PASS=$((PASS+1)); }
warn() { echo "  [WARN] $1"; WARN=$((WARN+1)); }
bad()  { echo "  [FAIL] $1"; FAIL=$((FAIL+1)); }

getval() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- ; }

echo "STP security self-check — env: $ENV_FILE"
echo "---------------------------------------------------------------"

# 1) .env exists & secrets are real (not placeholders / not weak)
if [ ! -f "$ENV_FILE" ]; then
  bad ".env not found ($ENV_FILE). Run ./deploy.sh first."
else
  chk_secret() { # name minlen
    local v; v="$(getval "$1")"
    if [ -z "$v" ]; then bad "$1 is empty — set a real secret."; 
    elif printf '%s' "$v" | grep -qi '^changeme'; then bad "$1 is still the placeholder value.";
    elif [ "${#v}" -lt "$2" ]; then warn "$1 is shorter than recommended ($2+ chars).";
    else ok "$1 is set and strong (${#v} chars)."; fi
  }
  chk_secret POSTGRES_PASSWORD 16
  chk_secret SESSION_SECRET 32
  chk_secret DATA_ENCRYPTION_KEY 32

  ADMIN_PW="$(getval ADMIN_PASSWORD)"
  if [ -z "$ADMIN_PW" ]; then warn "ADMIN_PASSWORD empty (ok if admin already seeded & you change it on first login)."
  elif [ "${#ADMIN_PW}" -lt 12 ]; then bad "ADMIN_PASSWORD shorter than 12 characters.";
  else ok "ADMIN_PASSWORD meets the 12+ char minimum."; fi

  NODE_ENV_VAL="$(getval NODE_ENV)"
  DOMAIN_VAL="$(getval DOMAIN)"
  if [ "$NODE_ENV_VAL" = "production" ]; then
    if [ -n "$DOMAIN_VAL" ]; then ok "NODE_ENV=production with DOMAIN set (Secure cookies over HTTPS)."
    else warn "NODE_ENV=production but DOMAIN empty — Secure cookies need HTTPS (use ./deploy.sh --tls)."; fi
  else
    warn "NODE_ENV=$NODE_ENV_VAL — fine for local testing, but NOT for the owners' live deployment."
  fi

  # file permissions
  PERM="$(stat -c '%a' "$ENV_FILE" 2>/dev/null || stat -f '%Lp' "$ENV_FILE" 2>/dev/null || echo '?')"
  case "$PERM" in 600|400) ok ".env permissions are restrictive ($PERM).";; *) warn ".env permissions are $PERM — consider 'chmod 600 $ENV_FILE'.";; esac
fi

# 2) .env must be git-ignored (never committed)
if grep -qE '^\.env(\b|$|/|\*)' .gitignore 2>/dev/null || grep -qE '^\.env' .gitignore 2>/dev/null; then
  ok ".env is git-ignored."
else
  bad ".env is NOT in .gitignore — secrets could be committed."
fi

# 3) database / backend must NOT publish host ports (internal-only network)
ports_for_service() { # prints "yes" if the named compose service declares a ports: block
  awk -v target="$1" '
    /^[[:space:]]{2}[a-zA-Z0-9_-]+:[[:space:]]*$/ { svc=$1; sub(/:$/,"",svc); gsub(/^[[:space:]]+/,"",svc) }
    /^[[:space:]]{4}ports:/ { if (svc==target) { print "yes"; exit } }
  ' docker-compose.yml 2>/dev/null
}
if grep -qE '^\s*-\s*"?5432:' docker-compose.yml 2>/dev/null || [ "$(ports_for_service db)" = "yes" ]; then
  bad "PostgreSQL publishes a host port — it must stay on the internal network only."
else
  ok "PostgreSQL is not published to the host (internal-only)."
fi
if [ "$(ports_for_service backend)" = "yes" ]; then
  bad "backend publishes a host port — it must be reachable only via the proxy."
else
  ok "backend is not published to the host (reached only via the proxy)."
fi

# 4) optional: probe the live site's security headers
URL="${URL:-}"
if [ -n "$URL" ] && command -v curl >/dev/null 2>&1; then
  echo "  probing $URL ..."
  H="$(curl -fsSI "$URL" 2>/dev/null || true)"
  if [ -z "$H" ]; then warn "could not reach $URL to check headers."; else
    printf '%s' "$H" | grep -qi '^strict-transport-security:' && ok "HSTS header present." || warn "HSTS (Strict-Transport-Security) header missing."
    printf '%s' "$H" | grep -qi '^content-security-policy:' && ok "Content-Security-Policy present." || warn "Content-Security-Policy header missing."
    printf '%s' "$H" | grep -qi '^x-frame-options:\|^content-security-policy:.*frame-ancestors' && ok "Clickjacking protection present." || warn "X-Frame-Options / frame-ancestors missing."
    printf '%s' "$H" | grep -qi '^x-content-type-options:' && ok "X-Content-Type-Options present." || warn "X-Content-Type-Options: nosniff missing."
  fi
else
  echo "  (set URL=https://your.domain to also probe live security headers)"
fi

echo "---------------------------------------------------------------"
echo "Summary: $PASS pass, $WARN warn, $FAIL fail.  See SECURITY.md for the full checklist."
[ "$FAIL" -eq 0 ]
