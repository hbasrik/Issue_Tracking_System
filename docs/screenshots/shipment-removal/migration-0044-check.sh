#!/usr/bin/env bash
# Migration 0044 evidence on a *_test database at version 43:
#   functiondef before / after up, down, up again (diff + md5),
#   row md5 per table at every step, direct-SQL trigger probes at v43 and v44,
#   second apply of the up file (idempotency).
# Usage: TEST_DATABASE_URL=postgres://.../karea_x_test ./migration-0044-check.sh
# Output files go to $TMPDIR unless UPDATE_SCREENSHOTS=1.
set -euo pipefail

: "${TEST_DATABASE_URL:?set TEST_DATABASE_URL}"
db_name="${TEST_DATABASE_URL%%\?*}"
db_name="${db_name##*/}"
[[ "$db_name" == *_test ]] || { echo "refusing: $db_name is not a *_test database" >&2; exit 1; }

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
migs="$root/database/migrations"
out="${TMPDIR:-/tmp}/shipment-removal"
[[ "${UPDATE_SCREENSHOTS:-}" == "1" ]] && out="$here"
mkdir -p "$out"
PSQL="${PSQL:-psql}"

q() { "$PSQL" "$TEST_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 "$@"; }
fdef() { q -At -c "SELECT pg_get_functiondef('fn_enforce_branch_shipment'::regproc)" > "$out/$1"; }
ver() { q -At -c "SELECT version || CASE WHEN dirty THEN ' dirty' ELSE '' END FROM schema_migrations"; }
rows() { echo "== row md5: $1"; q -c '\pset footer off' -f "$here/row-md5.sql"; }

[[ "$(ver)" == "43" ]] || { echo "expected version 43, got $(ver)" >&2; exit 1; }

echo "== version $(ver)"
fdef fdef-v43.sql
rows "v43"
echo "== trigger probes at v43"
q -f "$here/trigger-negative.sql"

migrate -path "$migs" -database "$TEST_DATABASE_URL" up 1 2>&1
echo "== version $(ver)"
fdef fdef-v44.sql
rows "after up"
echo "== diff functiondef v43 -> v44 (only lines starting < or > are changes)"
diff "$out/fdef-v43.sql" "$out/fdef-v44.sql" || true
echo "== changed lines: removed $(diff "$out/fdef-v43.sql" "$out/fdef-v44.sql" | grep -c '^<' || true), added $(diff "$out/fdef-v43.sql" "$out/fdef-v44.sql" | grep -c '^>' || true)"
echo "== trigger probes at v44"
q -f "$here/trigger-negative.sql"

echo "== apply 0044 up file a second time (idempotency)"
q -f "$migs/0044_branch_ship_drop_shipment_gate.up.sql"
fdef fdef-v44-again.sql

migrate -path "$migs" -database "$TEST_DATABASE_URL" down 1 2>&1
echo "== version $(ver)"
fdef fdef-v43-after-down.sql
rows "after down"

migrate -path "$migs" -database "$TEST_DATABASE_URL" up 1 2>&1
echo "== version $(ver)"
fdef fdef-v44-after-reup.sql
rows "after up again"

echo "== functiondef md5"
for f in fdef-v43.sql fdef-v43-after-down.sql fdef-v44.sql fdef-v44-again.sql fdef-v44-after-reup.sql; do
  printf '%-28s %s\n' "$f" "$(md5 -q "$out/$f" 2>/dev/null || md5sum "$out/$f" | cut -d' ' -f1)"
done
echo "== file md5: 0037 up body (lines 13-141) vs 0044 down body (after 4-line header)"
sed -n '13,141p' "$migs/0037_branch_ship_status_audit.up.sql" | md5
tail -n +5 "$migs/0044_branch_ship_drop_shipment_gate.down.sql" | md5
