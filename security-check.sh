#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# security-check.sh — STP Application deployment preflight gate
# ---------------------------------------------------------------------------
# Mechanically validates the mandatory deployment hardening checklist
# (see SECURITY.md §3) against the local .env and committed deployment config.
#
# Usage:
#   ./security-check.sh                 # checks ./.env
#   ./security-check.sh --env path/.env # checks a specific env file
#   ./security-check.sh --tls           # also require TLS settings (DOMAIN, ACME_EMAIL)
#
# Exit code: 0 only when there are ZERO failures. Warnings do not fail the run.
# It is intended to be run by deploy.sh before bringing the stack up.
# ---------------------------------------------------------------------------
set -uo pipefail

# Resolve repo root = directory of this script.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ENV_FILE="$ROOT/.env"
REQUIRE_TLS=0
while [ $# -gt 0 ]; do
  case "$1" in
    --env) ENV_FILE="$2"; shift 2 ;;
    --tls) REQUIRE_TLS=1; shift ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

# ---- output helpers -------------------------------------------------------
if [ -t 1 ]; then
  R=$'\033[31m'; G=$'\033[32m'; Y=$'\033[33m'; B=$'\033[1m'; N=$'\033[0m'
else
  R=""; G=""; Y=""; B=""; N=""
fi
PASS=0; WARN=0; FAILN=0
pass() { printf "  ${G}PASS${N}  %s\n" "$1"; PASS=$((PASS+1)); }
warn() { printf "  ${Y}WARN${N}  %s\n" "$1"; WARN=$((WARN+1)); }
fail() { printf "  ${R}FAIL${N}  %s\n" "$1"; FAILN=$((FAILN+1)); }
section() { printf "\n${B}%s${N}\n" "$1"; }

# ---- read a KEY=VALUE from the env file (no sourcing → no code execution) --
getenv() {
  # last definition wins; strips surrounding quotes; ignores comments
  grep -E "^[[:space:]]*$1[[:space:]]*=" "$ENV_FILE" 2>/dev/null \
    | tail -n1 | sed -E "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//; s/^\"(.*)\"$/\1/; s/^'(.*)'$/\1/"
}

printf "${B}STP security preflight — %s${N}\n" "$ENV_FILE"

# ===========================================================================
section "1. Environment file & secret hygiene"
# ===========================================================================
if [ ! -f "$ENV_FILE" ]; then
  fail ".env not found at $ENV_FILE (copy .env.example → .env and fill in real secrets)"
else
  pass ".env present"
fi

# .env must be git-ignored (never committed)
if git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if git -C "$ROOT" check-ignore -q .env 2>/dev/null; then
    pass ".env is git-ignored"
  else
    fail ".env is NOT git-ignored — add it to .gitignore before committing"
  fi
  if git -C "$ROOT" ls-files --error-unmatch .env >/dev/null 2>&1; then
    fail ".env is TRACKED by git — remove it from history (git rm --cached .env)"
  else
    pass ".env is not tracked by git"
  fi
fi

# Secret strength (only meaningful if .env exists)
if [ -f "$ENV_FILE" ]; then
  SESSION_SECRET="$(getenv SESSION_SECRET)"
  DATA_ENCRYPTION_KEY="$(getenv DATA_ENCRYPTION_KEY)"
  POSTGRES_PASSWORD="$(getenv POSTGRES_PASSWORD)"
  NODE_ENV="$(getenv NODE_ENV)"
  CORS_ORIGINS="$(getenv CORS_ORIGINS)"
  ADMIN_PASSWORD="$(getenv ADMIN_PASSWORD)"

  # placeholder detection
  case "$SESSION_SECRET" in ""|*changeme*) fail "SESSION_SECRET is empty or a placeholder";; *)
    if [ "${#SESSION_SECRET}" -ge 64 ]; then pass "SESSION_SECRET set (${#SESSION_SECRET} chars, ≥ 32 bytes hex)"; \
    else fail "SESSION_SECRET too short (${#SESSION_SECRET} chars) — use: openssl rand -hex 32"; fi ;;
  esac

  case "$DATA_ENCRYPTION_KEY" in ""|*changeme*) fail "DATA_ENCRYPTION_KEY is empty or a placeholder";; *)
    # base64 of 32 bytes is 44 chars (with padding)
    if [ "${#DATA_ENCRYPTION_KEY}" -ge 44 ]; then pass "DATA_ENCRYPTION_KEY set (${#DATA_ENCRYPTION_KEY} chars)"; \
    else fail "DATA_ENCRYPTION_KEY too short (${#DATA_ENCRYPTION_KEY} chars) — use: openssl rand -base64 32"; fi ;;
  esac

  case "$POSTGRES_PASSWORD" in ""|*changeme*) fail "POSTGRES_PASSWORD is empty or a placeholder";; *)
    if [ "${#POSTGRES_PASSWORD}" -ge 16 ]; then pass "POSTGRES_PASSWORD set (${#POSTGRES_PASSWORD} chars)"; \
    else warn "POSTGRES_PASSWORD is short (${#POSTGRES_PASSWORD} chars) — prefer: openssl rand -hex 16"; fi ;;
  esac

  # Secure cookies require NODE_ENV=production
  if [ "$NODE_ENV" = "production" ]; then pass "NODE_ENV=production (Secure cookies + fail-closed config active)"
  else fail "NODE_ENV is '${NODE_ENV:-unset}' — must be 'production' for Secure cookies & hardening"; fi

  # CORS must never be a wildcard in production
  case "$CORS_ORIGINS" in
    "*") fail "CORS_ORIGINS is '*' — never use a wildcard in production" ;;
    "") pass "CORS_ORIGINS empty (OK for bundled same-origin nginx)" ;;
    *) pass "CORS_ORIGINS pinned to an explicit origin list" ;;
  esac

  # Admin seed password should not be left in the environment after seeding
  if [ -n "$ADMIN_PASSWORD" ]; then
    if [ "${#ADMIN_PASSWORD}" -lt 12 ]; then fail "ADMIN_PASSWORD set but < 12 chars — use a strong password"
    else warn "ADMIN_PASSWORD is set — unset it from .env after the initial seed"; fi
  else
    pass "ADMIN_PASSWORD not left in .env"
  fi
fi

# ===========================================================================
section "2. Network isolation (DB & backend must be internal-only)"
# ===========================================================================
check_no_published_ports() {
  # $1 = compose file. Fails if db or backend declares a host 'ports:' mapping.
  local f="$1"
  [ -f "$f" ] || { warn "compose file $f not found (skipped)"; return; }
  # Extract each service block and check db/backend for a ports: key.
  for svc in db backend; do
    if awk -v s="$svc" '
      $0 ~ "^  "s":" {inblk=1; next}
      inblk && /^  [a-zA-Z]/ {inblk=0}
      inblk && /^[[:space:]]+ports:/ {found=1}
      END {exit !found}
    ' "$f"; then
      fail "$(basename "$f"): service '$svc' publishes host ports — must stay internal-only"
    else
      pass "$(basename "$f"): '$svc' has no host port mapping"
    fi
  done
}
check_no_published_ports "$ROOT/docker-compose.yml"
[ -f "$ROOT/docker-compose.tls.yml" ] && check_no_published_ports "$ROOT/docker-compose.tls.yml"

# db/backend should be on an internal network
if grep -qE "^[[:space:]]+internal:[[:space:]]*$" "$ROOT/docker-compose.yml" 2>/dev/null \
   && grep -qE "internal:[[:space:]]*true" "$ROOT/docker-compose.yml" 2>/dev/null; then
  pass "docker-compose.yml defines an 'internal: true' network"
else
  fail "docker-compose.yml has no 'internal: true' network for db/backend"
fi

# ===========================================================================
section "3. Frontend hardening (nginx security headers + strict CSP)"
# ===========================================================================
NGINX="$ROOT/nginx/nginx.conf"
if [ ! -f "$NGINX" ]; then
  fail "nginx/nginx.conf not found"
else
  csp_line="$(grep -i "Content-Security-Policy" "$NGINX" | head -n1)"
  if [ -z "$csp_line" ]; then
    fail "nginx: no Content-Security-Policy header"
  else
    # script-src must be 'self' with no unsafe-inline and no CDN host
    if printf '%s' "$csp_line" | grep -qiE "script-src[^;]*'unsafe-inline'"; then
      fail "nginx CSP: script-src allows 'unsafe-inline' — remove it"
    else
      pass "nginx CSP: script-src has no 'unsafe-inline'"
    fi
    if printf '%s' "$csp_line" | grep -qiE "script-src[^;]*(https?://|cdn\.|jsdelivr|unpkg|cdnjs)"; then
      fail "nginx CSP: script-src references a third-party/CDN host — self-host instead"
    else
      pass "nginx CSP: script-src has no third-party/CDN host"
    fi
    for d in "object-src 'none'" "frame-ancestors 'none'" "base-uri 'self'"; do
      if printf '%s' "$csp_line" | grep -qiF "$d"; then pass "nginx CSP includes \"$d\""
      else warn "nginx CSP missing \"$d\" (recommended)"; fi
    done
  fi
  for h in "X-Frame-Options" "X-Content-Type-Options" "Referrer-Policy" "Permissions-Policy"; do
    if grep -qi "$h" "$NGINX"; then pass "nginx sends $h"; else warn "nginx missing $h header"; fi
  done
fi

# No CDN <script> in the served app (defence in depth vs the CSP check)
if [ -f "$ROOT/qi-webapp/index.html" ]; then
  if grep -qE '<script[^>]*src="https?://' "$ROOT/qi-webapp/index.html"; then
    fail "qi-webapp/index.html loads a script over http(s):// — vendor it under vendor/"
  else
    pass "qi-webapp/index.html loads no external scripts (self-hosted)"
  fi
fi

# ===========================================================================
section "4. TLS edge (required for production Secure cookies)"
# ===========================================================================
if [ "$REQUIRE_TLS" -eq 1 ]; then
  DOMAIN="$(getenv DOMAIN)"; ACME_EMAIL="$(getenv ACME_EMAIL)"
  if [ -n "$DOMAIN" ] && [ "$DOMAIN" != "example.com" ]; then pass "DOMAIN set ($DOMAIN)"
  else fail "DOMAIN not set — required for Caddy auto-HTTPS (--tls)"; fi
  if printf '%s' "$ACME_EMAIL" | grep -qE '^[^@]+@[^@]+\.[^@]+$'; then pass "ACME_EMAIL set ($ACME_EMAIL)"
  else fail "ACME_EMAIL not a valid email — required for Let's Encrypt (--tls)"; fi
  if [ -f "$ROOT/Caddyfile" ]; then
    grep -qi "Strict-Transport-Security" "$ROOT/Caddyfile" && pass "Caddyfile sets HSTS at the TLS edge" \
      || fail "Caddyfile missing Strict-Transport-Security (HSTS)"
  else
    fail "Caddyfile not found (needed for --tls)"
  fi
else
  warn "TLS checks skipped (run with --tls before production). Secure cookies REQUIRE HTTPS in front of nginx."
fi

# ===========================================================================
section "Summary"
# ===========================================================================
printf "  ${G}%d passed${N}, ${Y}%d warnings${N}, ${R}%d failed${N}\n" "$PASS" "$WARN" "$FAILN"
if [ "$FAILN" -gt 0 ]; then
  printf "${R}%s${N}\n" "✗ Security preflight FAILED — fix the items above before deploying."
  exit 1
fi
printf "${G}%s${N}\n" "✓ Security preflight passed (0 failures)."
exit 0
