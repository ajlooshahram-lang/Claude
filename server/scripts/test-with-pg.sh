#!/bin/bash
set -e

# Kill any existing postgres
pgrep postgres | xargs kill 2>/dev/null || true
sleep 1

# Clean up stale files
rm -f /projects/sandbox/.pg_data/postmaster.pid
rm -f /var/run/postgresql/.s.PGSQL.5432
rm -f /var/run/postgresql/.s.PGSQL.5432.lock

# Start postgres in background with Unix socket
su postgres -s /bin/bash -c "postgres -D /projects/sandbox/.pg_data -k /var/run/postgresql -p 5432 -c listen_addresses='' > /projects/sandbox/.pg_data/logfile 2>&1 &"
sleep 3

# Sync schema
export DATABASE_URL="postgresql://qi:qi@localhost:5432/qi_platform?schema=public&host=/var/run/postgresql"
npx prisma db push --accept-data-loss --skip-generate 2>&1 | tail -3

# Run tests
exec npx tsx --test --test-concurrency=1 "$@"
