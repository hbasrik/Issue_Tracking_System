#!/usr/bin/env bash
# Migration 0041 apply check on karea_eolnote_test only.
# - up -> down -> up -> up -> down -> down -> up: progress/media/item rows never
#   change; columns, index and template names flip exactly.
# - guard: a filled template-level form column blocks the column drop.
# - unique index: a duplicate (template_id, seed_key) is refused.
# The guard/index trials use one temp template named 'tmp-0041-verify' that this
# script inserts and deletes itself; no seeded row is updated or deleted.
set -euo pipefail
cd "$(dirname "$0")/../../.."
T="postgres://karea:karea_secret@localhost:5432/karea_eolnote_test?sslmode=disable"
P=/opt/homebrew/opt/libpq/bin/psql
UP=database/migrations/0041_checklist_item_form_identity.up.sql
DOWN=database/migrations/0041_checklist_item_form_identity.down.sql
q() { "$P" "$T" -X -q -At -v ON_ERROR_STOP=1 -c "$1"; }
run() { "$P" "$T" -X -q -v ON_ERROR_STOP=1 -f "$1" 2>&1 | sed 's/^/  /'; }

fingerprint() {
  q "select 'progress ' || (select count(*) from checklist_item_progress) || ' md5 '
         || coalesce((select md5(string_agg(p::text, '|' order by p.id)) from checklist_item_progress p), 'none')
         || ' | media ' || (select count(*) from media_attachments) || ' md5 '
         || coalesce((select md5(string_agg(m::text, '|' order by m.id)) from media_attachments m), 'none')
         || ' | items ' || (select count(*) from checklist_template_items) || ' md5 '
         || (select md5(string_agg(concat_ws(',', i.id, i.template_id, i.item_no, i.item_text, i.station_id,
                                             i.eol_phase, i.is_active, i.section_key, i.section_sort, i.seed_key,
                                             i.acceptance_criterion, i.control_method), '|' order by i.id))
               from checklist_template_items i)
         || ' | templates md5 '
         || (select md5(string_agg(concat_ws(',', t.id, t.vehicle_model_id, t.type, t.is_active, t.created_at), '|' order by t.id))
               from checklist_templates t)"
}
objects() {
  q "select 'item cols=' || coalesce((select string_agg(column_name, ',' order by column_name) from information_schema.columns
                                  where table_name = 'checklist_template_items' and column_name like 'form%'), '-')
         || ' | template cols=' || coalesce((select string_agg(column_name, ',' order by column_name) from information_schema.columns
                                  where table_name = 'checklist_templates' and column_name like 'form%'), '-')
         || ' | index=' || (select count(*) from pg_indexes where indexname = 'uq_checklist_template_items_template_seed_key')
         || ' | names=' || (select string_agg(name, ' ; ' order by id) from checklist_templates)"
}

python3 docs/screenshots/eol-note/run-verification.py db
echo "built (all migrations incl. 0041, seeds 01-06):"
echo "  $(fingerprint)"; echo "  $(objects)"
echo "seeded EOL/SHIPMENT/TEST item counts: $(q "select string_agg(t.type || '=' || (select count(*) from checklist_template_items i where i.template_id = t.id), ' ' order by t.id) from checklist_templates t")"

for step in DOWN UP UP DOWN DOWN UP; do
  f=$UP; [ "$step" = DOWN ] && f=$DOWN
  run "$f"
  echo "after $step:"; echo "  $(fingerprint)"; echo "  $(objects)"
done

echo "--- unique (template_id, seed_key) trial ---"
TMP=$(q "insert into checklist_templates (type, name, is_active) values ('TEST', 'tmp-0041-verify', false) returning id")
q "insert into checklist_template_items (template_id, item_no, item_text, seed_key) values ($TMP, 1, 'tmp a', 'KY.FR-19:46')"
"$P" "$T" -X -At -c "insert into checklist_template_items (template_id, item_no, item_text, seed_key) values ($TMP, 2, 'tmp b', 'KY.FR-19:46')" 2>&1 | sed 's/^/  /' || true
q "insert into checklist_template_items (template_id, item_no, item_text, seed_key) values ($TMP, 3, 'tmp c', NULL), ($TMP, 4, 'tmp d', NULL)"
echo "  temp items now: $(q "select string_agg(item_no || ':' || coalesce(seed_key, 'NULL'), ' ' order by item_no) from checklist_template_items where template_id = $TMP")"

echo "--- guard trial: filled template form column must block the drop ---"
q "delete from checklist_templates where id = $TMP"
run "$DOWN"
TMP=$(q "insert into checklist_templates (type, name, is_active, form_code) values ('TEST', 'tmp-0041-verify', false, 'KY.FR-99') returning id")
"$P" "$T" -X -q -v ON_ERROR_STOP=1 -1 -f "$UP" 2>&1 | sed 's/^/  /' || true
echo "  after refused up: $(objects)"
q "delete from checklist_templates where id = $TMP"
echo "  temp template rows left: $(q "select count(*) from checklist_templates where name = 'tmp-0041-verify'")"
run "$UP"
echo "final up:"; echo "  $(fingerprint)"; echo "  $(objects)"
