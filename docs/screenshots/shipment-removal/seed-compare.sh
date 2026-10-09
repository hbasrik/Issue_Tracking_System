#!/usr/bin/env bash
# Rebuilds a *_test database from migrations 0001-0044 and the seed files in
# SEED_DIR, then prints seed-counts.sql. Used to compare the seed before and
# after the Shipment checklist removal (Karar 33).
#   seed-compare.sh <db_name_ending_in__test> <seed_dir>
set -euo pipefail
db="$1"
seed_dir="$2"
case "$db" in *_test) ;; *) echo "refusing: $db is not a *_test database" >&2; exit 1 ;; esac
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../../.." && pwd)"
psql=/opt/homebrew/opt/libpq/bin/psql
admin="postgres://karea:karea_secret@localhost:5432/postgres?sslmode=disable"
url="postgres://karea:karea_secret@localhost:5432/$db?sslmode=disable"

"$psql" "$admin" -qc "DROP DATABASE IF EXISTS $db" -c "CREATE DATABASE $db"
/opt/homebrew/bin/migrate -path "$repo/database/migrations" -database "$url" up 44 >/dev/null 2>&1
for f in "$seed_dir"/0[1-6]_*.sql; do
  "$psql" "$url" -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null
done
"$psql" "$url" -c "SELECT version, dirty FROM schema_migrations"
"$psql" "$url" -f "$here/seed-counts.sql"
