#!/usr/bin/env bash
# Migration 0045 (Karar 33) on three databases. Never touches the live
# database; every database it writes ends in _test.
#
#   run-0045.sh fresh <out_dir>   new *_test DB: migrations up, new seed,
#                                 500-VIN load; then down / up
#   run-0045.sh full  <out_dir>   new *_test DB built like the live install
#                                 before Karar 33 (seed 03 from 1feaef0^, 46
#                                 SHIPMENT items, 500 VINs -> 23000 PENDING
#                                 SHIPMENT rows); up / down / up
#   run-0045.sh guard <out_dir>   existing karea_shiprm_test (v44, 415
#                                 non-PENDING SHIPMENT rows): up must raise
#                                 and change nothing
#
# fresh and full create their database and refuse to run when it already
# exists; they never drop a database they did not create in this run.
set -euo pipefail

mode="$1"
out="$2"
mkdir -p "$out"
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../../.." && pwd)"
mig="$repo/database/migrations"
psql=/opt/homebrew/opt/libpq/bin/psql
migrate=/opt/homebrew/bin/migrate
admin="postgres://karea:karea_secret@localhost:5432/postgres?sslmode=disable"
db_url() { echo "postgres://karea:karea_secret@localhost:5432/$1?sslmode=disable"; }

FUNCS="'fn_assign_checklist_templates','fn_reassign_checklist_templates_on_model_change','fn_initialize_vehicle_progress','fn_materialize_vehicle_progress','fn_rematerialize_checklist_after_template_reassign'"

q() { "$psql" "$URL" -Atq -v ON_ERROR_STOP=1 -c "$1"; }
section() { printf '\n==== %s\n' "$*"; }

create_db() {
  local name="$1"
  case "$name" in *_test) ;; *) echo "refusing: $name" >&2; exit 2 ;; esac
  if [ -n "$("$psql" "$admin" -Atc "SELECT 1 FROM pg_database WHERE datname = '$name'")" ]; then
    echo "refusing: database $name already exists" >&2; exit 2
  fi
  "$psql" "$admin" -qc "CREATE DATABASE $name"
  URL="$(db_url "$name")"
  "$psql" "$URL" -q -v ON_ERROR_STOP=1 -f "$repo/database/init/00_extensions.sql"
}

migrate_to() { "$migrate" -path "$mig" -database "$URL" "$@" 2>&1 | sed 's/^/  migrate: /'; }

seed() {
  local dir="$1"; shift
  for f in "$@"; do "$psql" "$URL" -q -v ON_ERROR_STOP=1 -f "$dir/$f" >/dev/null; done
}

load_vins() { "$psql" "$URL" -q -v ON_ERROR_STOP=1 -f "$repo/database/scripts/reset_and_load_vins.sql" >/dev/null; }

state() {
  section "state: $1"
  q "SELECT 'schema_migrations', version || CASE WHEN dirty THEN ' dirty' ELSE '' END FROM schema_migrations"
  q "SELECT 'column vehicles.shipment_template_id', count(*) FROM information_schema.columns WHERE table_name = 'vehicles' AND column_name = 'shipment_template_id'"
  q "SELECT 'CHECK checklist_templates_type_not_shipment', count(*) FROM pg_constraint WHERE conname = 'checklist_templates_type_not_shipment'"
  q "SELECT 'templates ' || t.type, count(DISTINCT t.id) || ' template(s), ' || count(i.id) || ' item(s)' FROM checklist_templates t LEFT JOIN checklist_template_items i ON i.template_id = t.id GROUP BY t.type ORDER BY t.type"
  q "SELECT 'vehicles', count(*) FROM vehicles"
  q "SELECT 'progress ' || checklist_type || ' ' || check_status, count(*) FROM checklist_item_progress GROUP BY 1 ORDER BY 1"
  q "SELECT 'permission ' || p.code, coalesce(string_agg(r.code, ',' ORDER BY r.code), '(no grant)') FROM permissions p LEFT JOIN role_permissions rp ON rp.permission_id = p.id LEFT JOIN roles r ON r.id = rp.role_id WHERE p.code LIKE 'checklist.shipment.%' GROUP BY p.code"
  q "SELECT 'permission rows checklist.shipment.*', count(*) FROM permissions WHERE code LIKE 'checklist.shipment.%'"
  q "SELECT 'fn_materialize_vehicle_progress signature', string_agg(oid::regprocedure::text, ' ; ') FROM pg_proc WHERE proname = 'fn_materialize_vehicle_progress'"
}

# EOL/TEST progress rows, station step progress, EOL workflow and vehicles
# (every column except shipment_template_id), plus the progress id sequence.
data_md5() {
  section "data md5: $1"
  q "SELECT 'EOL/TEST progress', count(*) || ' rows, ids ' || min(id) || '..' || max(id) || ', md5 ' || md5(string_agg(p::text, E'\n' ORDER BY p.id)) FROM checklist_item_progress p WHERE checklist_type IN ('EOL', 'TEST')"
  q "SELECT 'progress id sequence last_value', last_value FROM checklist_item_progress_id_seq"
  q "SELECT 'station step progress', count(*) || ' rows, md5 ' || md5(string_agg(s::text, E'\n' ORDER BY s.id)) FROM vehicle_station_step_progress s"
  q "SELECT 'eol workflow', count(*) || ' rows, md5 ' || md5(string_agg(w::text, E'\n' ORDER BY w.vin)) FROM vehicle_eol_workflow w"
  q "SELECT 'vehicles (minus shipment_template_id)', count(*) || ' rows, md5 ' || md5(string_agg((to_jsonb(v) - 'shipment_template_id')::text, E'\n' ORDER BY v.vin)) FROM vehicles v"
}

fn_md5() {
  section "function md5: $1"
  q "SELECT oid::regprocedure, md5(pg_get_functiondef(oid)) FROM pg_proc WHERE proname IN ($FUNCS) ORDER BY proname"
}

fn_dump() {
  local dir="$out/functiondef-$1"
  mkdir -p "$dir"
  for f in fn_assign_checklist_templates fn_reassign_checklist_templates_on_model_change fn_initialize_vehicle_progress fn_materialize_vehicle_progress fn_rematerialize_checklist_after_template_reassign; do
    q "SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = '$f'" > "$dir/$f.sql"
  done
}

fn_diff() {
  section "pg_get_functiondef diff $1 -> $2"
  diff -ru "$out/functiondef-$1" "$out/functiondef-$2" | sed '/^diff -ru/d' || true
}

dry_run() {
  section "dry run of 0045 up inside BEGIN ... ROLLBACK (notices)"
  { echo 'BEGIN;'; cat "$mig/0045_drop_shipment_checklist.up.sql"; echo 'ROLLBACK;'; } \
    | "$psql" "$URL" -q -v ON_ERROR_STOP=1 2>&1 | sed 's/^/  /' || true
}

check_probe() {
  section "CHECK probe: insert a SHIPMENT template (rolled back)"
  { echo 'BEGIN;'
    echo "INSERT INTO checklist_templates (type, name, is_active) VALUES ('SHIPMENT', 'TMP_0045_CHECK_PROBE', FALSE);"
    echo 'ROLLBACK;'; } | "$psql" "$URL" -q 2>&1 | sed 's/^/  /' || true
  q "SELECT 'probe rows left', count(*) FROM checklist_templates WHERE name = 'TMP_0045_CHECK_PROBE'"
}

gate_tests() {
  section "branch-ship gate negative tests (go test, rolled back)"
  (cd "$repo/backend" && TEST_DATABASE_URL="$URL" go test -count=1 -v \
     -run 'TestBranchShipTrigger_Gates' ./internal/repository/postgres/ 2>&1 \
     | grep -E '^(=== RUN|--- |\s+branch_ship_trigger_test.go|ok|FAIL|PASS)' | sed 's/^/  /')
}

case "$mode" in
fresh)
  create_db karea_s45_fresh_test
  section "migrate up 44 (baseline), then up 45 on the empty database"
  migrate_to up 44
  fn_dump 0044; fn_md5 "after 0044"
  state "empty database at 44"
  dry_run
  migrate_to up 1
  fn_dump 0045; fn_md5 "after 0045"
  state "empty database at 45 (before seed)"
  section "seed 01 02 03 04 05 (new seed), then reset_and_load_vins.sql"
  seed "$repo/database/seed" 01_stations.sql 02_stations_and_steps.sql 03_checklist_templates.sql 04_users.sql 05_defect_catalog.sql
  load_vins
  state "fresh install at 45"
  data_md5 "fresh install at 45"
  check_probe
  gate_tests
  section "down 1"
  migrate_to down 1
  fn_dump 0044-after-down; fn_md5 "after down"
  state "after down"
  data_md5 "after down"
  section "up again"
  migrate_to up 1
  fn_dump 0045-again; fn_md5 "after up again"
  state "after up again"
  data_md5 "after up again"
  check_probe
  fn_diff 0044 0045
  section "functiondef 0044 vs after down (empty = identical)"; diff -r "$out/functiondef-0044" "$out/functiondef-0044-after-down" && echo "  identical"
  section "functiondef 0045 vs up again (empty = identical)"; diff -r "$out/functiondef-0045" "$out/functiondef-0045-again" && echo "  identical"
  ;;
full)
  create_db karea_s45_full_test
  old_seed="$out/seed-1feaef0-parent"
  mkdir -p "$old_seed"
  for f in 01_stations.sql 02_stations_and_steps.sql 03_checklist_templates.sql 04_users.sql 05_defect_catalog.sql; do
    git -C "$repo" show "1feaef0^:database/seed/$f" > "$old_seed/$f"
  done
  section "migrate up 44, seed from 1feaef0^ (46 SHIPMENT items), reset_and_load_vins.sql"
  migrate_to up 44
  seed "$old_seed" 01_stations.sql 02_stations_and_steps.sql 03_checklist_templates.sql 04_users.sql 05_defect_catalog.sql
  load_vins
  fn_dump 0044; fn_md5 "after 0044"
  state "live-shaped copy at 44"
  data_md5 "before 0045"
  dry_run
  section "up 1"
  migrate_to up 1
  fn_dump 0045; fn_md5 "after 0045"
  state "after 0045"
  data_md5 "after 0045"
  check_probe
  gate_tests
  section "down 1"
  migrate_to down 1
  fn_dump 0044-after-down; fn_md5 "after down"
  state "after down"
  data_md5 "after down"
  section "up again"
  migrate_to up 1
  fn_dump 0045-again; fn_md5 "after up again"
  state "after up again"
  data_md5 "after up again"
  fn_diff 0044 0045
  section "functiondef 0044 vs after down (empty = identical)"; diff -r "$out/functiondef-0044" "$out/functiondef-0044-after-down" && echo "  identical"
  section "functiondef 0045 vs up again (empty = identical)"; diff -r "$out/functiondef-0045" "$out/functiondef-0045-again" && echo "  identical"
  ;;
guard)
  URL="$(db_url karea_shiprm_test)"
  table_md5() {
    section "row md5: $1"
    for t in checklist_item_progress checklist_templates checklist_template_items vehicles permissions role_permissions issue_list media_attachments audit_logs vehicle_eol_workflow vehicle_station_step_progress schema_migrations; do
      q "SELECT '$t', count(*) || ' rows, md5 ' || coalesce(md5(string_agg(x::text, E'\n' ORDER BY x::text)), '-') FROM $t x"
    done
    q "SELECT 'functions', md5(string_agg(pg_get_functiondef(oid), E'\n' ORDER BY proname)) FROM pg_proc WHERE proname IN ($FUNCS)"
    q "SELECT 'column vehicles.shipment_template_id', count(*) FROM information_schema.columns WHERE table_name = 'vehicles' AND column_name = 'shipment_template_id'"
  }
  state "karea_shiprm_test before"
  section "history the guard must find"
  q "SELECT 'SHIPMENT progress ' || check_status, count(*) FROM checklist_item_progress WHERE checklist_type = 'SHIPMENT' GROUP BY 1 ORDER BY 1"
  q "SELECT 'issues source_type SHIPMENT_ITEM', count(*) FROM issue_list WHERE source_type = 'SHIPMENT_ITEM'"
  q "SELECT 'audit CHECKLIST_ITEM_UPDATE SHIPMENT', count(*) FROM audit_logs WHERE event_type = 'CHECKLIST_ITEM_UPDATE' AND metadata ->> 'checklist_type' = 'SHIPMENT'"
  table_md5 "before" | tee "$out/guard-md5-before.txt"
  dry_run
  section "migrate up 1 (must fail)"
  "$migrate" -path "$mig" -database "$URL" up 1 2>&1 \
    | sed -n -e 's/ in line 0:.*//p' -e '/(details:/p' | sed 's/^/  migrate: /' || true
  table_md5 "after failed up" | tee "$out/guard-md5-after-up.txt"
  section "migrate force 44 (clears the dirty flag golang-migrate left on 45)"
  migrate_to force 44
  table_md5 "after force 44" | tee "$out/guard-md5-after-force.txt"
  section "diff before vs after failed up"
  diff <(grep -v '^====' "$out/guard-md5-before.txt") <(grep -v '^====' "$out/guard-md5-after-up.txt") | sed 's/^/  /' || true
  section "diff before vs after force 44 (empty = identical)"
  diff <(grep -v '^====' "$out/guard-md5-before.txt") <(grep -v '^====' "$out/guard-md5-after-force.txt") && echo "  identical"
  ;;
idem)
  # karea_s45_fresh_test (left at 45 by "fresh"): each file twice via psql.
  URL="$(db_url karea_s45_fresh_test)"
  apply() { "$psql" "$URL" -q -v ON_ERROR_STOP=1 -f "$mig/0045_drop_shipment_checklist.$1.sql" 2>&1 | sed 's/^/  /'; }
  snapshot() { state "$1"; fn_md5 "$1"; data_md5 "$1"; }
  snapshot "start (45)"
  section "up.sql again (second run on 45)"; apply up
  snapshot "after second up"
  section "down.sql, then down.sql again"; apply down; apply down
  snapshot "after two downs"
  section "up.sql, then up.sql again"; apply up; apply up
  snapshot "after two ups"
  ;;
reapply)
  # verify_migrations.sh step 3: re-run every *.up.sql through psql on a
  # database already at the latest version.
  # REAPPLY_TO=44 measures the same step on the 0044 baseline.
  if [ "${REAPPLY_TO:-}" = 44 ]; then
    create_db karea_s45_reapply44_test
    migrate_to up 44
    files=$(ls "$mig"/*.up.sql | grep -v '/0045_')
  else
    create_db karea_s45_reapply_test
    migrate_to up
    files=$(ls "$mig"/*.up.sql)
  fi
  for f in $files; do
    if ! err=$("$psql" "$URL" -q -v ON_ERROR_STOP=1 -f "$f" 2>&1 >/dev/null); then
      echo "  FAIL $(basename "$f"): $(echo "$err" | grep -m1 ERROR)"
    fi
  done
  state "after re-applying every up file"
  ;;
*)
  echo "usage: $0 fresh|full|guard|idem|reapply <out_dir>" >&2; exit 2 ;;
esac
