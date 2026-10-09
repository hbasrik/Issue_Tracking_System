#!/usr/bin/env bash
# Calls every route that used to serve the Shipment checklist and prints the
# status codes (Karar 33). Read-only apart from the login itself; run it only
# against a *_test database behind a throwaway API.
#
#   api-trial.sh <test-db-url> <api-base> <email> <password>
set -euo pipefail

DB="$1"
API="$2"
EMAIL="$3"
PASSWORD="$4"
PSQL=/opt/homebrew/opt/libpq/bin/psql
IMG="$(dirname "$0")/../shipment-removal/web-en-375-eol-tab.png"

case "$DB" in
  *_test\?*|*_test) ;;
  *) echo "refusing: $DB is not a *_test database" >&2; exit 2 ;;
esac

q() { "$PSQL" "$DB" -Atc "$1"; }

VIN=$(q "SELECT vin FROM vehicles ORDER BY vin LIMIT 1")
SHIP_TPL=$(q "SELECT id FROM checklist_templates WHERE type = 'SHIPMENT' ORDER BY id LIMIT 1")
SHIP_ITEM=$(q "SELECT id FROM checklist_template_items WHERE template_id = ${SHIP_TPL:-0} ORDER BY id LIMIT 1")
SHIP_PROGRESS=$(q "SELECT id FROM checklist_item_progress WHERE checklist_type = 'SHIPMENT' AND vin = '$VIN' ORDER BY id LIMIT 1")
echo "vin=$VIN shipment_template=$SHIP_TPL shipment_item=$SHIP_ITEM shipment_progress=$SHIP_PROGRESS"

TOKEN=$(curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" | sed -E 's/.*"(access_)?token":"([^"]+)".*/\2/')
AUTH="Authorization: Bearer $TOKEN"

show() {
  local label="$1"; shift
  local out code
  out=$(curl -s -w '\n%{http_code}' -H "$AUTH" "$@")
  code=$(printf '%s' "$out" | tail -n1)
  printf '%-44s %s  %s\n' "$label" "$code" "$(printf '%s' "$out" | sed '$d' | cut -c1-140)"
}

show "GET  checklist/shipment" "$API/vehicles/$VIN/checklist/shipment"
show "POST checklist/shipment/{item}" -X POST -H 'Content-Type: application/json' \
  -d '{"status":"OK"}' "$API/vehicles/$VIN/checklist/shipment/$SHIP_ITEM"
show "POST media on SHIPMENT progress row" -X POST \
  -F entity_type=CHECKLIST_ITEM_PROGRESS -F entity_id="$SHIP_PROGRESS" -F "file=@$IMG;type=image/png" \
  "$API/media"
show "GET  checklist-templates/{ship}/items" "$API/checklist-templates/$SHIP_TPL/items"
show "POST checklist-templates/{ship}/items" -X POST -H 'Content-Type: application/json' \
  -d '{"ItemText":"trial"}' "$API/checklist-templates/$SHIP_TPL/items"
show "DELETE checklist-templates/{ship}/items/{i}" -X DELETE "$API/checklist-templates/$SHIP_TPL/items/$SHIP_ITEM"

echo
echo "template list types:"
curl -s -H "$AUTH" "$API/checklist-templates" | grep -o '"Type":"[A-Z]*"' | sort | uniq -c
echo "vehicle payload template fields:"
curl -s -H "$AUTH" "$API/vehicles/$VIN" | grep -o '"[A-Za-z]*TemplateID":[^,}]*' | sort -u
show "GET  checklist/eol (control)" "$API/vehicles/$VIN/checklist/eol"
show "GET  shipment-readiness (control)" "$API/vehicles/$VIN/shipment-readiness"
