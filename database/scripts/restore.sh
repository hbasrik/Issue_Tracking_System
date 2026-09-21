#!/usr/bin/env bash
# Restore a backup.sh pair into a named database (+ optional uploads dir).
#
# Usage:
#   ./database/scripts/restore.sh <target_db> <stamp|dump_path> [--uploads-dir DIR]
#
# target_db is REQUIRED so the live database cannot be overwritten by
# accident. Restoring into the DATABASE_URL database name is refused unless
# ALLOW_RESTORE_TO_SOURCE=1.
#
# Examples:
#   ./database/scripts/restore.sh karea_restore_test 20260321_131500
#   ./database/scripts/restore.sh karea_restore_test backups/karea_20260321_131500.dump
#   ./database/scripts/restore.sh karea_restore_test 20260321_131500 --uploads-dir /tmp/karea_uploads_test
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
UPLOADS_DIR="$ROOT/backend/uploads"
ALLOW_RESTORE_TO_SOURCE="${ALLOW_RESTORE_TO_SOURCE:-0}"

usage() {
  echo "usage: $0 <target_db> <stamp|dump_path> [--uploads-dir DIR]" >&2
  exit 1
}

[[ $# -ge 2 ]] || usage

TARGET_DB="$1"
SHIFT_ARG="$2"
shift 2

while [[ $# -gt 0 ]]; do
  case "$1" in
    --uploads-dir)
      [[ $# -ge 2 ]] || usage
      UPLOADS_DIR="$2"
      shift 2
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage
      ;;
  esac
done

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
}

parse_database_url

if [[ "$TARGET_DB" == "$DB_NAME" && "$ALLOW_RESTORE_TO_SOURCE" != "1" ]]; then
  echo "error: refusing to restore into source database '$DB_NAME' from DATABASE_URL." >&2
  echo "       pick a different target name, or set ALLOW_RESTORE_TO_SOURCE=1" >&2
  exit 1
fi

if [[ "$SHIFT_ARG" == *.dump && -f "$SHIFT_ARG" ]]; then
  DUMP_PATH="$SHIFT_ARG"
  base="$(basename "$DUMP_PATH" .dump)"
  UPLOADS_TAR="$(dirname "$DUMP_PATH")/${base}_uploads.tar.gz"
elif [[ -f "$BACKUP_DIR/karea_${SHIFT_ARG}.dump" ]]; then
  DUMP_PATH="$BACKUP_DIR/karea_${SHIFT_ARG}.dump"
  UPLOADS_TAR="$BACKUP_DIR/karea_${SHIFT_ARG}_uploads.tar.gz"
elif [[ -f "$BACKUP_DIR/${SHIFT_ARG}.dump" ]]; then
  DUMP_PATH="$BACKUP_DIR/${SHIFT_ARG}.dump"
  base="$(basename "$DUMP_PATH" .dump)"
  UPLOADS_TAR="$BACKUP_DIR/${base}_uploads.tar.gz"
else
  echo "error: backup not found for '$SHIFT_ARG' (looked under $BACKUP_DIR)" >&2
  exit 1
fi

if [[ ! -f "$UPLOADS_TAR" ]]; then
  echo "error: matching uploads archive missing: $UPLOADS_TAR" >&2
  exit 1
fi

if ! docker inspect -f '{{.State.Running}}' "$POSTGRES_CONTAINER" 2>/dev/null | grep -qx true; then
  echo "error: docker container '$POSTGRES_CONTAINER' is not running" >&2
  exit 1
fi

echo "==> ensuring database '$TARGET_DB' exists"
exists="$(docker exec -e PGPASSWORD="$DB_PASS" "$POSTGRES_CONTAINER" \
  psql -U "$DB_USER" -d postgres -At -c \
  "SELECT 1 FROM pg_database WHERE datname = '$TARGET_DB'")"
if [[ "$exists" != "1" ]]; then
  docker exec -e PGPASSWORD="$DB_PASS" "$POSTGRES_CONTAINER" \
    psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 -c \
    "CREATE DATABASE \"$TARGET_DB\" OWNER \"$DB_USER\";"
fi

# Terminate other sessions so --clean restore can drop objects.
docker exec -e PGPASSWORD="$DB_PASS" "$POSTGRES_CONTAINER" \
  psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity
   WHERE datname = '$TARGET_DB' AND pid <> pg_backend_pid();" >/dev/null

echo "==> restoring $DUMP_PATH -> $TARGET_DB"
set +e
docker exec -i -e PGPASSWORD="$DB_PASS" "$POSTGRES_CONTAINER" \
  pg_restore -U "$DB_USER" -d "$TARGET_DB" --clean --if-exists --no-owner --no-acl \
  <"$DUMP_PATH"
restore_rc=$?
set -e
# pg_restore exits 1 when some objects warn (e.g. missing on --clean); 0/1 OK, >=2 fail.
if [[ "$restore_rc" -ge 2 ]]; then
  echo "error: pg_restore failed with exit code $restore_rc" >&2
  exit "$restore_rc"
fi
if [[ "$restore_rc" -eq 1 ]]; then
  echo "warning: pg_restore reported non-fatal warnings (exit 1)" >&2
fi

echo "==> extracting uploads -> $UPLOADS_DIR"
mkdir -p "$UPLOADS_DIR"
tar -xzf "$UPLOADS_TAR" -C "$UPLOADS_DIR" --strip-components=1

echo "==> row counts in '$TARGET_DB'"
docker exec -e PGPASSWORD="$DB_PASS" "$POSTGRES_CONTAINER" \
  psql -U "$DB_USER" -d "$TARGET_DB" -v ON_ERROR_STOP=1 -c "
SELECT 'vehicles' AS entity, count(*)::text AS n FROM vehicles
UNION ALL
SELECT 'checklist_template_items', count(*)::text FROM checklist_template_items
UNION ALL
SELECT 'issue_list', count(*)::text FROM issue_list
UNION ALL
SELECT 'users', count(*)::text FROM users
ORDER BY 1;
"

echo "==> restore complete (db=$TARGET_DB uploads=$UPLOADS_DIR)"
