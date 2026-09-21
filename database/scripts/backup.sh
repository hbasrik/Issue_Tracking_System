#!/usr/bin/env bash
# Development backup: custom-format pg_dump + backend/uploads tarball.
# Both artifacts share one timestamp so they can be restored as a pair.
#
# Usage (from repo root or any cwd):
#   ./database/scripts/backup.sh
#   BACKUP_KEEP=14 ./database/scripts/backup.sh
#
# Env (from repo .env unless already set):
#   DATABASE_URL   — source database (user/password/db name)
#   POSTGRES_CONTAINER — docker container (default: karea_postgres)
#   BACKUP_DIR     — output directory (default: <repo>/backups)
#   BACKUP_KEEP    — retain last N dump+uploads pairs (default: 7)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

: "${DATABASE_URL:?DATABASE_URL is not set (add it to .env)}"

POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-karea_postgres}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
BACKUP_KEEP="${BACKUP_KEEP:-7}"

parse_database_url() {
  local url creds rest hostport dbpart
  url="${DATABASE_URL#postgres://}"
  url="${url#postgresql://}"
  creds="${url%%@*}"
  rest="${url#*@}"
  DB_USER="${creds%%:*}"
  DB_PASS="${creds#*:}"
  hostport="${rest%%/*}"
  dbpart="${rest#*/}"
  DB_NAME="${dbpart%%\?*}"
  if [[ "$hostport" == *:* ]]; then
    DB_HOST="${hostport%%:*}"
    DB_PORT="${hostport##*:}"
  else
    DB_HOST="$hostport"
    DB_PORT="5432"
  fi
}

parse_database_url

if ! docker inspect -f '{{.State.Running}}' "$POSTGRES_CONTAINER" 2>/dev/null | grep -qx true; then
  echo "error: docker container '$POSTGRES_CONTAINER' is not running" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
DUMP_PATH="$BACKUP_DIR/karea_${STAMP}.dump"
UPLOADS_PATH="$BACKUP_DIR/karea_${STAMP}_uploads.tar.gz"
UPLOADS_SRC="$ROOT/backend/uploads"

echo "==> dumping database '$DB_NAME' via $POSTGRES_CONTAINER"
docker exec -e PGPASSWORD="$DB_PASS" "$POSTGRES_CONTAINER" \
  pg_dump -U "$DB_USER" -Fc --no-owner --no-acl "$DB_NAME" >"$DUMP_PATH"

echo "==> archiving uploads"
if [[ -d "$UPLOADS_SRC" ]]; then
  tar -czf "$UPLOADS_PATH" -C "$ROOT/backend" uploads
else
  echo "warning: $UPLOADS_SRC missing; writing empty uploads archive" >&2
  tmpdir="$(mktemp -d)"
  mkdir -p "$tmpdir/uploads"
  tar -czf "$UPLOADS_PATH" -C "$tmpdir" uploads
  rm -rf "$tmpdir"
fi

echo "wrote $DUMP_PATH ($(wc -c <"$DUMP_PATH" | tr -d ' ') bytes)"
echo "wrote $UPLOADS_PATH ($(wc -c <"$UPLOADS_PATH" | tr -d ' ') bytes)"
echo "stamp=$STAMP"

# Retention: keep the newest BACKUP_KEEP dump files; remove matching uploads.
if [[ "$BACKUP_KEEP" =~ ^[0-9]+$ ]] && [[ "$BACKUP_KEEP" -gt 0 ]]; then
  ls -1t "$BACKUP_DIR"/karea_*.dump 2>/dev/null | tail -n +"$((BACKUP_KEEP + 1))" | while IFS= read -r old; do
    [[ -n "$old" ]] || continue
    base="$(basename "$old" .dump)"
    echo "==> pruning $base"
    rm -f "$old" "$BACKUP_DIR/${base}_uploads.tar.gz"
  done
fi

echo "==> backup complete"
