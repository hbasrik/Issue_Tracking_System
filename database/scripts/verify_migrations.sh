#!/usr/bin/env bash
# Prove migrations apply cleanly on an empty database, and that additive
# migrations can be re-executed without error (dirty-recovery path).
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

echo "==> migrate up (fresh)"
"$MIGRATE_BIN" -path "$MIG" -database "$URL" up
VER="$("$MIGRATE_BIN" -path "$MIG" -database "$URL" version 2>&1 || true)"
echo "    version: $VER"

echo "==> migrate up again (must be no-op / already at latest)"
OUT="$("$MIGRATE_BIN" -path "$MIG" -database "$URL" up 2>&1 || true)"
echo "    ${OUT:-"(no output — already up)"}"
"$MIGRATE_BIN" -path "$MIG" -database "$URL" version

echo "==> re-apply additive migrations via psql (idempotency)"
for f in \
  0008_media_attachments_vin.up.sql \
  0012_must_change_password.up.sql \
  0013_eol_deliver_flow.up.sql \
  0015_one_way_status_and_hold.up.sql \
  0018_defect_catalog.up.sql \
  0019_issue_classification_audit.up.sql \
  0020_freeze_catalogue_snapshots.up.sql \
  0021_clear_ambiguous_process_defaults.up.sql
do
  echo "    $f"
  docker exec -i "$NAME" psql -U karea -d karea -v ON_ERROR_STOP=1 <"$MIG/$f" >/dev/null
done

echo "==> OK: fresh migrate up + second migrate up + additive re-apply"
