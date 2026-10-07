#!/usr/bin/env bash
# Proves scripts/create-readonly-role.sql on a throwaway Postgres container
# (never the live server: roles are cluster-wide, so they cannot be tested in
# a *_test database next to the live one). Migrations + seeds are applied,
# the live public-schema ACL (=UC, PUBLIC may CREATE) is reproduced, the
# script runs, then karea_ro tries every kind of read and write.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
NAME="karea_ro_verify_$$"
PORT=55439
PSQL=/opt/homebrew/opt/libpq/bin/psql
OWNER="postgres://karea:karea_secret@127.0.0.1:${PORT}/karea?sslmode=disable"
RO_PASS="ro-verify-$(openssl rand -hex 8)"
RO="postgres://karea_ro:${RO_PASS}@127.0.0.1:${PORT}/karea?sslmode=disable"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --rm --name "$NAME" -e POSTGRES_USER=karea -e POSTGRES_PASSWORD=karea_secret \
  -e POSTGRES_DB=karea -p "${PORT}:5432" postgres:16-alpine >/dev/null
for _ in $(seq 1 40); do
  docker exec "$NAME" pg_isready -U karea -d karea >/dev/null 2>&1 && break
  sleep 1
done
sleep 1
echo "== throwaway server: $($PSQL "$OWNER" -X -At -c 'SHOW server_version') (container $NAME, port $PORT)"

for f in "$ROOT"/database/migrations/*.up.sql; do
  $PSQL "$OWNER" -X -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null || { echo "migration failed: $f"; exit 1; }
done
for s in 01_stations 02_stations_and_steps 03_checklist_templates 04_users 05_defect_catalog 06_test_vehicles; do
  $PSQL "$OWNER" -X -q -v ON_ERROR_STOP=1 -f "$ROOT/database/seed/$s.sql" >/dev/null || { echo "seed failed: $s"; exit 1; }
done
$PSQL "$OWNER" -X -q -c "CREATE TABLE IF NOT EXISTS schema_migrations (version bigint PRIMARY KEY, dirty boolean NOT NULL); INSERT INTO schema_migrations VALUES (39, false) ON CONFLICT DO NOTHING;"
$PSQL "$OWNER" -X -q -c "GRANT CREATE ON SCHEMA public TO PUBLIC;"
echo "== migrations + seeds applied; public schema ACL like live: $($PSQL "$OWNER" -X -At -c "SELECT nspacl FROM pg_namespace WHERE nspname='public'")"

echo
echo "== 1. script without a password (must stop before doing anything)"
$PSQL "$OWNER" -X -v ON_ERROR_STOP=1 -f "$ROOT/scripts/create-readonly-role.sql" 2>&1
echo "   karea_ro exists after that: $($PSQL "$OWNER" -X -At -c "SELECT count(*) FROM pg_roles WHERE rolname='karea_ro'")"

echo
echo "== 2. script with a password, run twice (idempotent)"
for run in 1 2; do
  echo "-- run $run"
  $PSQL "$OWNER" -X -v ON_ERROR_STOP=1 -v ro_password="$RO_PASS" -f "$ROOT/scripts/create-readonly-role.sql" 2>&1
  echo "   exit=$?"
done
echo "   public schema ACL now: $($PSQL "$OWNER" -X -At -c "SELECT nspacl FROM pg_namespace WHERE nspname='public'")"
echo "   database ACL now:      $($PSQL "$OWNER" -X -At -c "SELECT datacl FROM pg_database WHERE datname='karea'")"
echo "   role attributes:       $($PSQL "$OWNER" -X -At -c "SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolconnlimit, rolconfig FROM pg_roles WHERE rolname='karea_ro'")"
echo "   table privileges of karea_ro (distinct): $($PSQL "$OWNER" -X -At -c "SELECT string_agg(DISTINCT privilege_type, ',') FROM information_schema.role_table_grants WHERE grantee='karea_ro'")"
echo "   tables without SELECT for karea_ro: $($PSQL "$OWNER" -X -At -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','v','m','p') AND NOT has_table_privilege('karea_ro', c.oid, 'SELECT')")"
echo "   tables where karea_ro has any write privilege: $($PSQL "$OWNER" -X -At -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','v','m','p') AND (has_table_privilege('karea_ro', c.oid, 'INSERT') OR has_table_privilege('karea_ro', c.oid, 'UPDATE') OR has_table_privilege('karea_ro', c.oid, 'DELETE') OR has_table_privilege('karea_ro', c.oid, 'TRUNCATE'))")"

try() {
  local label="$1" sql="$2"
  echo
  echo "-- $label"
  echo "   SQL: $sql"
  $PSQL "$RO" -X -v ON_ERROR_STOP=1 -c "$sql" 2>&1 | sed 's/^/   /'
  echo "   exit=${PIPESTATUS[0]}"
}

# Same, but the session read-only default is switched off first in its own
# transaction, so a failure here can only come from missing privileges.
try_rw() {
  local label="$1" sql="$2"
  echo
  echo "-- $label"
  echo "   SQL: SET default_transaction_read_only = off;  then, as a separate transaction:  $sql"
  $PSQL "$RO" -X -v ON_ERROR_STOP=1 -c "SET default_transaction_read_only = off" \
    -c "SELECT current_setting('default_transaction_read_only') AS read_only_now" -c "$sql" 2>&1 | sed 's/^/   /'
  echo "   exit=${PIPESTATUS[0]}"
}

echo
echo "== 3. connected as karea_ro"
try "who am I"                         "SELECT current_user, session_user, current_setting('default_transaction_read_only') AS read_only_default"
try "SELECT (must work)"                "SELECT count(*) AS vehicles, (SELECT count(*) FROM checklist_template_items) AS items, (SELECT version FROM schema_migrations) AS migration FROM vehicles"
try "INSERT into vehicles (must fail)" "INSERT INTO vehicles (vin) VALUES ('ROTEST00000000001')"
try_rw "INSERT into vehicles with the read-only default off (must fail on privilege)" "INSERT INTO vehicles (vin) VALUES ('ROTEST00000000001')"
try_rw "UPDATE schema_migrations (must fail)" "UPDATE schema_migrations SET dirty = true"
try_rw "INSERT schema_migrations (must fail)" "INSERT INTO schema_migrations VALUES (40, false)"
try_rw "DELETE from audit_logs (must fail)"   "DELETE FROM audit_logs"
try_rw "TRUNCATE issue_list (must fail)"      "TRUNCATE issue_list"
try_rw "CREATE TABLE in public (must fail)"   "CREATE TABLE public.ro_probe (id int)"
try_rw "CREATE TEMP TABLE (must fail)"        "CREATE TEMP TABLE ro_probe (id int)"
try_rw "nextval on a sequence (must fail)"    "SELECT nextval('vehicle_models_id_seq')"

echo
echo "== 4. a table created later by karea (default privileges)"
$PSQL "$OWNER" -X -q -c "CREATE TABLE ro_future_probe (id int); INSERT INTO ro_future_probe VALUES (1);"
try "SELECT from the new table (must work)" "SELECT * FROM ro_future_probe"
try_rw "INSERT into the new table (must fail)" "INSERT INTO ro_future_probe VALUES (2)"

echo
echo "== 5. data unchanged by every attempt"
echo "   vehicles ROTEST rows: $($PSQL "$OWNER" -X -At -c "SELECT count(*) FROM vehicles WHERE vin LIKE 'ROTEST%'")"
echo "   schema_migrations:    $($PSQL "$OWNER" -X -At -c "SELECT version, dirty FROM schema_migrations")"
echo "   ro_future_probe rows: $($PSQL "$OWNER" -X -At -c "SELECT count(*) FROM ro_future_probe")"
echo "   tables named ro_probe: $($PSQL "$OWNER" -X -At -c "SELECT count(*) FROM pg_class WHERE relname='ro_probe'")"
echo
echo "== container $NAME removed on exit"
