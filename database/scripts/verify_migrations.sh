#!/usr/bin/env bash
# Prove migrations apply cleanly on an empty database:
#   1) migrate up (fresh)
#   2) migrate up again (no-op)
#   3) re-apply every *.up.sql via psql (idempotent DDL)
#   4) migrate down to version 0, then up again (up → down → up)
# Uses an ephemeral Postgres container; never touches the live DB.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MIG="$ROOT/database/migrations"
NAME="karea_migrate_verify_$$"
PORT="${MIGRATE_VERIFY_PORT:-55432}"
URL="postgres://karea:karea_secret@127.0.0.1:${PORT}/karea?sslmode=disable"

MIGRATE_BIN="${MIGRATE_BIN:-$(command -v migrate || true)}"
if [[ -z "$MIGRATE_BIN" && -x "${HOME}/go/bin/migrate" ]]; then
  MIGRATE_BIN="${HOME}/go/bin/migrate"
fi
if [[ -z "$MIGRATE_BIN" ]]; then
  echo "migrate CLI not found (install golang-migrate)" >&2
  exit 1
fi

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> starting ephemeral postgres on :${PORT}"
docker run -d --rm --name "$NAME" \
  -e POSTGRES_USER=karea \
  -e POSTGRES_PASSWORD=karea_secret \
  -e POSTGRES_DB=karea \
  -p "${PORT}:5432" \
  postgres:16-alpine >/dev/null

for _ in $(seq 1 40); do
  if docker exec "$NAME" pg_isready -U karea -d karea >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$NAME" pg_isready -U karea -d karea >/dev/null

psql_file() {
  local f="$1"
  docker exec -i "$NAME" psql -U karea -d karea -v ON_ERROR_STOP=1 <"$f" >/dev/null
}

echo "==> [1/4] migrate up (fresh)"
"$MIGRATE_BIN" -path "$MIG" -database "$URL" up
VER="$("$MIGRATE_BIN" -path "$MIG" -database "$URL" version 2>&1 || true)"
echo "    version: $VER"

echo "==> [2/4] migrate up again (must be no-op / already at latest)"
OUT="$("$MIGRATE_BIN" -path "$MIG" -database "$URL" up 2>&1 || true)"
echo "    ${OUT:-"(no output — already up)"}"
"$MIGRATE_BIN" -path "$MIG" -database "$URL" version

echo "==> [3/4] re-apply every *.up.sql via psql (full idempotency)"
shopt -s nullglob
for f in "$MIG"/*.up.sql; do
  base="$(basename "$f")"
  echo "    $base"
  psql_file "$f"
done
echo "    re-apply complete; migrate version still: $("$MIGRATE_BIN" -path "$MIG" -database "$URL" version 2>&1 || true)"

echo "==> [4/4] up → down → up"
echo "    migrate down to 0"
"$MIGRATE_BIN" -path "$MIG" -database "$URL" down -all
echo "    version after down: $("$MIGRATE_BIN" -path "$MIG" -database "$URL" version 2>&1 || true)"
echo "    migrate up again"
"$MIGRATE_BIN" -path "$MIG" -database "$URL" up
echo "    version after re-up: $("$MIGRATE_BIN" -path "$MIG" -database "$URL" version 2>&1 || true)"

echo "==> OK: fresh up + second up + full SQL re-apply + up/down/up"
