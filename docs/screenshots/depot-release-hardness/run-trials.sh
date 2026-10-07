#!/usr/bin/env bash
# Depot release hardness trials (mirror of the branch-ship trials).
# Runs only against karea_eolnote_test with migration 0040 rolled back and
# the test API on :18081. Fixture rows are changed only inside the test DB.
set -u
T="postgres://karea:karea_secret@localhost:5432/karea_eolnote_test?sslmode=disable"
P=/opt/homebrew/opt/libpq/bin/psql
API=http://localhost:18081/api/v1
q() { "$P" "$T" -X -At -v ON_ERROR_STOP=1 -c "$1"; }

case "$T" in *_test\?*) ;; *) echo "refusing: not a *_test database"; exit 1;; esac

TOKEN=$(curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"manager@karea.local","password":"changeme123"}' |
  python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("access_token") or d.get("token") or d["data"]["access_token"])')

state() {
  q "select 'workflow=' || md5(w::text) || ' stage=' || w.current_stage || ' depot_released_at=' || coalesce(w.depot_released_at::text,'null')
       || ' vehicle_status=' || v.current_global_status
       || ' audit_rows=' || (select count(*) from audit_logs a where a.vin = w.vin)
       || ' audit_md5=' || coalesce((select md5(string_agg(a::text, '|' order by a.id)) from audit_logs a where a.vin = w.vin), 'none')
     from vehicle_eol_workflow w join vehicles v using (vin) where w.vin = '$1'"
}

depot_rows() {
  q "select string_agg(ti.item_no || ':' || p.check_status, ' ' order by ti.item_no)
     from checklist_item_progress p join checklist_template_items ti on ti.id = p.check_item_id
     where p.vin = '$1' and p.checklist_type = 'EOL' and ti.eol_phase = 'DEPOT'"
}

open_issues() {
  q "select count(*) from issue_list where vin = '$1' and status in ('OPEN','IN_PROGRESS','DONE')"
}

api_release() {
  curl -s -w '\nHTTP %{http_code}\n' -X POST "$API/vehicles/$1/eol/depot-release" -H "Authorization: Bearer $TOKEN"
}

sql_release() {
  "$P" "$T" -X -At -c "UPDATE vehicle_eol_workflow SET depot_released_at = now(), depot_released_by = 1 WHERE vin = '$1'" 2>&1
}

trial() {
  local name=$1 vin=$2 mode=$3
  echo "=== $name ($vin, $mode)"
  echo "depot rows : $(depot_rows "$vin")"
  echo "open issues: $(open_issues "$vin")"
  local before; before=$(state "$vin")
  [ -n "$before" ] || { echo "state query failed"; exit 1; }
  echo "before     : $before"
  if [ "$mode" = api ]; then api_release "$vin"; else echo "sql: $(sql_release "$vin")"; fi
  local after; after=$(state "$vin")
  echo "after      : $after"
  if [ "$before" = "$after" ]; then echo "UNCHANGED"; else echo "CHANGED"; fi
  echo
}

echo "fn_enforce_depot_release md5: $(q "select md5(pg_get_functiondef('fn_enforce_depot_release'::regproc))")"
echo "trg_enforce_checklist_frozen present: $(q "select count(*) from pg_trigger where tgname = 'trg_enforce_checklist_frozen'")"
echo

V=N7V1K1SAXTK000011
DEPOT_IDS="select p.id from checklist_item_progress p join checklist_template_items ti on ti.id = p.check_item_id where p.vin = '$V' and p.checklist_type = 'EOL' and ti.eol_phase = 'DEPOT'"
FIRST_DEPOT="select p.id from checklist_item_progress p join checklist_template_items ti on ti.id = p.check_item_id where p.vin = '$V' and p.checklist_type = 'EOL' and ti.eol_phase = 'DEPOT' order by ti.item_no limit 1"

q "UPDATE checklist_item_progress SET check_status = 'PENDING', checker_id = NULL, check_date = NULL WHERE id = ($FIRST_DEPOT)" >/dev/null
trial "1a depot item PENDING" "$V" api
trial "1b depot item PENDING" "$V" sql

q "UPDATE checklist_item_progress SET check_status = 'NOT_OK', rejected_desc = 'hardness trial', checker_id = 1, check_date = now() WHERE id = ($FIRST_DEPOT)" >/dev/null
trial "2a depot item NOT_OK" "$V" api
trial "2b depot item NOT_OK" "$V" sql

q "DELETE FROM checklist_item_progress WHERE id = ($FIRST_DEPOT)" >/dev/null
trial "3a depot row missing" "$V" api
trial "3b depot row missing" "$V" sql

V2=N7V1K1SA1TK000012
q "UPDATE checklist_item_progress p SET check_status = 'OK', rejected_desc = NULL, checker_id = 1, check_date = now()
   FROM checklist_template_items ti WHERE ti.id = p.check_item_id AND p.vin = '$V2' AND p.checklist_type = 'EOL' AND ti.eol_phase = 'DEPOT'" >/dev/null
trial "4a all depot OK, open issues" "$V2" api
trial "4b all depot OK, open issues" "$V2" sql

V0=N7V1K1SA9TK000002
trial "5a branch not shipped" "$V0" api
trial "5b branch not shipped" "$V0" sql

V3=N7V1K1SA8TK000010
trial "6 depot CONDITIONAL_OK, no open issues (informative, expect release)" "$V3" api

V4=N7V1K1SAXTK000011
q "INSERT INTO checklist_item_progress (vin, checklist_type, check_item_id, check_status, checker_id, check_date)
   SELECT '$V4', 'EOL', ti.id, 'OK', 1, now()
   FROM checklist_template_items ti
   WHERE ti.eol_phase = 'DEPOT'
     AND ti.template_id = (select ti2.template_id from checklist_item_progress p2 join checklist_template_items ti2 on ti2.id = p2.check_item_id where p2.vin = '$V4' and ti2.eol_phase = 'DEPOT' limit 1)
     AND NOT EXISTS (select 1 from checklist_item_progress p where p.vin = '$V4' and p.check_item_id = ti.id)" >/dev/null
echo "=== 7 control: all depot OK, no open issues ($V4, api)"
echo "depot rows : $(depot_rows "$V4")"
echo "open issues: $(open_issues "$V4")"
echo "before     : $(state "$V4")"
api_release "$V4"
echo "after      : $(state "$V4")"
