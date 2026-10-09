#!/usr/bin/env bash
# Karar 29 freeze trials (docs/16 A52, A54). Runs only against
# karea_eolnote_test with migration 0040 applied and the test API on :18081
# (UPLOAD_DIR=/tmp/karea-eolnote-uploads). Every refused write is followed
# by a check that the progress row, the vehicle's audit log, its media rows
# and the upload directory are byte-for-byte unchanged (md5), not only that
# the API said 409.
# Consumes fixtures (releases 0011, delivers 0018, answers 0012's depot
# items): run on a freshly built DB, after `go test`, then capture-web.mjs
# and capture-mobile.mjs.
set -u
T="postgres://karea:karea_secret@localhost:5432/karea_eolnote_test?sslmode=disable"
P=/opt/homebrew/opt/libpq/bin/psql
API=http://localhost:18081/api/v1
UPLOADS=/tmp/karea-eolnote-uploads
q() { "$P" "$T" -X -At -v ON_ERROR_STOP=1 -c "$1"; }
FAILED=0

case "$T" in *_test\?*) ;; *) echo "refusing: not a *_test database"; exit 1;; esac

TOKEN=$(curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"manager@karea.local","password":"changeme123"}' |
  python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')
AUTH="Authorization: Bearer $TOKEN"
sips -s format jpeg "$(dirname "$0")/../eol-photo/mobile-collapse-tr-375-badge.png" --out /tmp/eol-freeze.jpg >/dev/null

# item_id <vin> <EOL|TEST> <BRANCH|DEPOT|-> : first template item id
item_id() {
  local phase_filter=""
  [ "$3" = "-" ] || phase_filter="and ti.eol_phase = '$3'"
  q "select p.check_item_id from checklist_item_progress p join checklist_template_items ti on ti.id = p.check_item_id
     where p.vin = '$1' and p.checklist_type = '$2' $phase_filter order by ti.item_no limit 1"
}
progress_id() { q "select id from checklist_item_progress where vin = '$1' and checklist_type = '$2' and check_item_id = $3"; }

# state <vin> <type> <item id>: row md5 + audit + media + upload dir
state() {
  q "select 'row=' || coalesce((select md5(p::text) from checklist_item_progress p
                                where p.vin = '$1' and p.checklist_type = '$2' and p.check_item_id = $3), 'missing')
       || ' audit_rows=' || (select count(*) from audit_logs a where a.vin = '$1')
       || ' audit_md5=' || coalesce((select md5(string_agg(a::text, '|' order by a.id)) from audit_logs a where a.vin = '$1'), 'none')
       || ' media_rows=' || (select count(*) from media_attachments m where m.vin = '$1')
       || ' media_md5=' || coalesce((select md5(string_agg(m::text, '|' order by m.id)) from media_attachments m where m.vin = '$1'), 'none')"
  echo " upload_files=$(find "$UPLOADS" -type f | wc -l | tr -d ' ')"
}

api_answer() {
  curl -s -w ' HTTP %{http_code}' -X POST "$API/vehicles/$1/checklist/$(echo "$2" | tr A-Z a-z)/$3" \
    -H "$AUTH" -H 'Content-Type: application/json' -d "{\"status\":\"$4\",\"note\":\"freeze trial\"}"
}
api_photo() {
  curl -s -w ' HTTP %{http_code}' -X POST "$API/media" -H "$AUTH" \
    -F entity_type=CHECKLIST_ITEM_PROGRESS -F "entity_id=$1" -F "file=@/tmp/eol-freeze.jpg;type=image/jpeg"
}
sql_try() { "$P" "$T" -X -At -c "$1" 2>&1 | tr '\n' ' '; }

# expect <label> <want: UNCHANGED|CHANGED> <want text> <vin> <type> <item> <command...>
expect() {
  local label=$1 want=$2 text=$3 vin=$4 typ=$5 item=$6; shift 6
  echo "=== $label ($vin $typ item $item)"
  local before after out
  before=$(state "$vin" "$typ" "$item")
  [ -n "$before" ] || { echo "state query failed"; exit 1; }
  out=$("$@")
  after=$(state "$vin" "$typ" "$item")
  echo "response : $out"
  echo "before   : $before"
  echo "after    : $after"
  local got=CHANGED; [ "$before" = "$after" ] && got=UNCHANGED
  local ok=1
  [ "$got" = "$want" ] || ok=0
  case "$out" in *"$text"*) ;; *) ok=0;; esac
  if [ $ok = 1 ]; then echo "PASS ($got)"; else echo "FAIL (got $got, want $want with \"$text\")"; FAILED=1; fi
  echo
}

echo "trg_enforce_checklist_frozen=$(q "select count(*) from pg_trigger where tgname = 'trg_enforce_checklist_frozen'")" \
  "trg_enforce_checklist_media_frozen=$(q "select count(*) from pg_trigger where tgname = 'trg_enforce_checklist_media_frozen'")"
echo

DEPOT=N7V1K1SA1TK000012     # shipped from the branch, depot open
RELEASED=N7V1K1SAXTK000011  # depot items OK; released below after a photo
DELIVERED=N7V1K1SA2TK000018 # released; delivered below
BRANCH=N7V1K1SA9TK000002    # still at the branch

echo "--- fixtures (test DB, through the API)"
R_ITEM=$(item_id $RELEASED EOL DEPOT); R_PID=$(progress_id $RELEASED EOL "$R_ITEM")
echo "photo on $RELEASED depot item $R_ITEM (progress $R_PID) before release: $(api_photo "$R_PID")"
echo "depot release $RELEASED: $(curl -s -o /dev/null -w 'HTTP %{http_code}' -X POST "$API/vehicles/$RELEASED/eol/depot-release" -H "$AUTH")"
echo "deliver $DELIVERED: $(curl -s -o /dev/null -w 'HTTP %{http_code}' -X POST "$API/vehicles/$DELIVERED/eol/deliver" -H "$AUTH")"
echo

echo "--- API writes to frozen items (expect 409, nothing changes)"
B_EOL=$(item_id $DEPOT EOL BRANCH); B_TEST=$(item_id $DEPOT TEST -)
MSG_BRANCH="after the vehicle has shipped from the branch"
expect "1 depot vehicle, branch EOL item" UNCHANGED "$MSG_BRANCH" $DEPOT EOL "$B_EOL" api_answer $DEPOT EOL "$B_EOL" NOT_OK
expect "2 depot vehicle, Test item" UNCHANGED "$MSG_BRANCH" $DEPOT TEST "$B_TEST" api_answer $DEPOT TEST "$B_TEST" NOT_OK
# 3 (Shipment item) is gone: migration 0045 removed the Shipment checklist (Karar 33).
expect "4 depot vehicle, photo on branch EOL item" UNCHANGED "$MSG_BRANCH" $DEPOT EOL "$B_EOL" api_photo "$(progress_id $DEPOT EOL "$B_EOL")"

D_BR=$(item_id $DELIVERED EOL BRANCH); D_DE=$(item_id $DELIVERED EOL DEPOT)
MSG_DELIV="checklist items of a delivered vehicle"
expect "5 delivered vehicle, branch EOL item" UNCHANGED "$MSG_DELIV" $DELIVERED EOL "$D_BR" api_answer $DELIVERED EOL "$D_BR" NOT_OK
expect "6 delivered vehicle, depot EOL item" UNCHANGED "$MSG_DELIV" $DELIVERED EOL "$D_DE" api_answer $DELIVERED EOL "$D_DE" NOT_OK
expect "7 delivered vehicle, photo on depot item" UNCHANGED "$MSG_DELIV" $DELIVERED EOL "$D_DE" api_photo "$(progress_id $DELIVERED EOL "$D_DE")"

MSG_DEPOT="after the vehicle has been released from the depot"
expect "8 depot-released vehicle, depot EOL item" UNCHANGED "$MSG_DEPOT" $RELEASED EOL "$R_ITEM" api_answer $RELEASED EOL "$R_ITEM" NOT_OK
expect "9 depot-released vehicle, photo on depot item" UNCHANGED "$MSG_DEPOT" $RELEASED EOL "$R_ITEM" api_photo "$R_PID"

echo "--- the same attempts as direct SQL (expect trigger error, nothing changes)"
upd() { echo "UPDATE checklist_item_progress SET check_status = 'NOT_OK', rejected_desc = 'sql trial', checker_id = 1, check_date = now() WHERE vin = '$1' AND checklist_type = '$2' AND check_item_id = $3"; }
expect "10 sql: depot vehicle, branch EOL item" UNCHANGED "$MSG_BRANCH" $DEPOT EOL "$B_EOL" sql_try "$(upd $DEPOT EOL "$B_EOL")"
expect "11 sql: depot vehicle, Test item" UNCHANGED "$MSG_BRANCH" $DEPOT TEST "$B_TEST" sql_try "$(upd $DEPOT TEST "$B_TEST")"
expect "12 sql: delivered vehicle, branch EOL item" UNCHANGED "$MSG_DELIV" $DELIVERED EOL "$D_BR" sql_try "$(upd $DELIVERED EOL "$D_BR")"
expect "13 sql: delivered vehicle, depot EOL item" UNCHANGED "$MSG_DELIV" $DELIVERED EOL "$D_DE" sql_try "$(upd $DELIVERED EOL "$D_DE")"
expect "14 sql: depot-released vehicle, depot EOL item" UNCHANGED "$MSG_DEPOT" $RELEASED EOL "$R_ITEM" sql_try "$(upd $RELEASED EOL "$R_ITEM")"
expect "15 sql: photo row on depot-released item" UNCHANGED "$MSG_DEPOT" $RELEASED EOL "$R_ITEM" sql_try \
  "INSERT INTO media_attachments (entity_type, entity_id, vin, file_name, storage_path, mime_type, file_size, uploaded_by) VALUES ('CHECKLIST_ITEM_PROGRESS', '$R_PID', '$RELEASED', 'x.jpg', 'x/x.jpg', 'image/jpeg', 1, 1)"

echo "--- positive controls (expect 200 and a change)"
BR_ITEM=$(item_id $BRANCH EOL BRANCH)
expect "16 branch vehicle, branch EOL item" CHANGED "HTTP 200" $BRANCH EOL "$BR_ITEM" api_answer $BRANCH EOL "$BR_ITEM" OK
expect "17 branch vehicle, photo on branch EOL item" CHANGED "HTTP 201" $BRANCH EOL "$BR_ITEM" api_photo "$(progress_id $BRANCH EOL "$BR_ITEM")"
DE_ITEM=$(item_id $DEPOT EOL DEPOT)
expect "18 depot vehicle, depot EOL item (still open)" CHANGED "HTTP 200" $DEPOT EOL "$DE_ITEM" api_answer $DEPOT EOL "$DE_ITEM" OK

echo "--- depot release 409 names the real reason"
release() { curl -s -w ' HTTP %{http_code}' -X POST "$API/vehicles/$1/eol/depot-release" -H "$AUTH"; }
echo "19 $DEPOT (depot items + open issues): $(release $DEPOT)"
for id in $(q "select p.check_item_id from checklist_item_progress p join checklist_template_items ti on ti.id = p.check_item_id
              where p.vin = '$DEPOT' and p.checklist_type = 'EOL' and ti.eol_phase = 'DEPOT' and p.check_status not in ('OK','CONDITIONAL_OK')"); do
  echo "   answer depot item $id OK: $(api_answer $DEPOT EOL "$id" OK | tail -c 9)"
done
echo "20 $DEPOT (open issues only): $(release $DEPOT)"
ITEMS_ONLY=N7V1K1SA8TK000010
q "UPDATE checklist_item_progress SET check_status = 'PENDING', checker_id = NULL, check_date = NULL
   WHERE id = (select p.id from checklist_item_progress p join checklist_template_items ti on ti.id = p.check_item_id
               where p.vin = '$ITEMS_ONLY' and p.checklist_type = 'EOL' and ti.eol_phase = 'DEPOT' order by ti.item_no limit 1)" >/dev/null
echo "21 $ITEMS_ONLY (one depot item PENDING, no open issues): $(release $ITEMS_ONLY)"
echo

[ $FAILED = 0 ] && echo "ALL FREEZE TRIALS PASS" || { echo "SOME TRIALS FAILED"; exit 1; }
