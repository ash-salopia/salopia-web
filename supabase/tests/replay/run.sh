#!/bin/bash
# Replay every migration in supabase/migrations/ from an empty database,
# in filename order, and fail loudly on the first one that errors.
#
# Purpose: catch drift between the migration files and the live schema
# BEFORE it bites when standing up a staging / dev database. The
# production DB was built incrementally and has had objects created by
# hand in the SQL editor over time — this check keeps the files honest.
#
# Requires a local Postgres 16 (`brew install postgresql@16`). Does not
# touch any real database — spins up a throwaway cluster in a temp dir.
#
#   ./supabase/tests/replay/run.sh
#
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
MIGR="$HERE/../../migrations"
PGBIN="$(brew --prefix postgresql@16 2>/dev/null)/bin"
[ -x "$PGBIN/initdb" ] || { echo "Postgres 16 not found — brew install postgresql@16"; exit 1; }
export PATH="$PGBIN:$PATH"

TMP="$(mktemp -d)"
DATA="$TMP/data"
SOCK="$TMP/s"
PORT=54329
mkdir -p "$SOCK"
trap 'pg_ctl -D "$DATA" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT

initdb -D "$DATA" -U postgres -A trust --no-locale -E UTF8 >/dev/null 2>&1
pg_ctl -D "$DATA" -o "-p $PORT -k $SOCK -c listen_addresses=127.0.0.1" -w start >/dev/null
export PGHOST=127.0.0.1 PGPORT=$PORT PGUSER=postgres
createdb testdb

psql -q -v ON_ERROR_STOP=1 -d testdb -f "$HERE/platform-shim.sql" >/dev/null

n=0
for f in $(ls "$MIGR"/*.sql | sort); do
  n=$((n + 1))
  if ! psql -q -v ON_ERROR_STOP=1 -d testdb -f "$f" >"$TMP/out" 2>&1; then
    echo "❌ $(basename "$f") failed on a clean database:"
    grep -E "ERROR|FATAL" "$TMP/out" | head -8 | sed 's/^/   /'
    echo
    echo "The file assumes schema state that no earlier migration creates."
    echo "Either add the missing DDL to an earlier migration, or guard the"
    echo "statement so it's a no-op when the object is absent."
    exit 1
  fi
done

echo "✅ all $n migrations replay cleanly from an empty database"
