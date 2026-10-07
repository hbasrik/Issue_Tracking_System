#!/usr/bin/env bash
# Migration 0040 apply check on karea_eolnote_test only: no row changes through
# up -> down -> up -> up, objects present after up, absent after down.
set -euo pipefail
cd "$(dirname "$0")/../../.."
T="postgres://karea:karea_secret@localhost:5432/karea_eolnote_test?sslmode=disable"
P=/opt/homebrew/opt/libpq/bin/psql
UP=database/migrations/0040_freeze_passed_checklist_items.up.sql
DOWN=database/migrations/0040_freeze_passed_checklist_items.down.sql
q() { "$P" "$T" -X -At -v ON_ERROR_STOP=1 -c "$1"; }

fingerprint() {
  q "select 'progress ' || (select count(*) from checklist_item_progress) || ' rows md5 '
         || coalesce((select md5(string_agg(p::text, '|' order by p.id)) from checklist_item_progress p), 'none')
         || ' | media ' || (select count(*) from media_attachments) || ' rows md5 '
         || coalesce((select md5(string_agg(m::text, '|' order by m.id)) from media_attachments m), 'none')
         || ' | workflow ' || (select count(*) from vehicle_eol_workflow) || ' rows md5 '
         || coalesce((select md5(string_agg(w::text, '|' order by w.vin)) from vehicle_eol_workflow w), 'none')"
}
objects() {
  q "select 'triggers=' || (select count(*) from pg_trigger where tgname in ('trg_enforce_checklist_frozen','trg_enforce_checklist_media_frozen'))
         || ' functions=' || (select count(*) from pg_proc where proname in ('fn_checklist_item_frozen_reason','fn_enforce_checklist_frozen','fn_checklist_media_frozen_reason','fn_enforce_checklist_media_frozen'))"
}

python3 docs/screenshots/eol-note/run-verification.py db
echo "built with 0040: $(fingerprint); $(objects)"
"$P" "$T" -X -q -v ON_ERROR_STOP=1 -f "$DOWN"
echo "after down:      $(fingerprint); $(objects)"
"$P" "$T" -X -q -v ON_ERROR_STOP=1 -f "$UP" 2>&1 | sed 's/^/  /'
echo "after up:        $(fingerprint); $(objects)"
"$P" "$T" -X -q -v ON_ERROR_STOP=1 -f "$UP" 2>&1 | sed 's/^/  /'
echo "up twice:        $(fingerprint); $(objects)"
"$P" "$T" -X -q -v ON_ERROR_STOP=1 -f "$DOWN"
"$P" "$T" -X -q -v ON_ERROR_STOP=1 -f "$DOWN"
echo "down twice:      $(fingerprint); $(objects)"
"$P" "$T" -X -q -v ON_ERROR_STOP=1 -f "$UP" 2>&1 | sed 's/^/  /'
echo "final up:        $(fingerprint); $(objects)"
q "select pg_get_triggerdef(oid) from pg_trigger where tgname in ('trg_enforce_checklist_frozen','trg_enforce_checklist_media_frozen') order by tgname"
