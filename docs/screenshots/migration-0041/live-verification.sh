#!/usr/bin/env bash
# Live check after migration 0041 was applied (docs/16 A55). Read-only:
# connects only as karea_ro (password from ~/.pgpass), runs SELECTs and a
# GET /health. Writes nothing.
set -u
cd "$(dirname "$0")/../../.."
R="postgres://karea_ro@localhost:5432/karea?sslmode=disable"
P=/opt/homebrew/opt/libpq/bin/psql
q() { "$P" "$R" -X -At -F ' | ' -v ON_ERROR_STOP=1 -c "$1"; }

echo "--- session"
q "select 'session_user=' || session_user || ' transaction_read_only=' || current_setting('transaction_read_only') || ' now=' || now()"

echo "--- schema_migrations"
q "select 'version=' || version || ' dirty=' || dirty from schema_migrations"

echo "--- checklist_template_items form columns (name | type | nullable | default | non-NULL rows)"
for c in form_code form_item_ref form_revision form_published_at; do
  meta=$(q "select column_name || ' | ' || data_type || ' | nullable=' || is_nullable || ' | default=' || coalesce(column_default, 'none')
            from information_schema.columns where table_name = 'checklist_template_items' and column_name = '$c'")
  filled=$(q "select count($c) from checklist_template_items")
  echo "${meta:-$c MISSING} | non_null=$filled"
done

echo "--- checklist_templates form columns (expect none)"
q "select coalesce(string_agg(column_name, ','), 'none') from information_schema.columns where table_name = 'checklist_templates' and column_name like 'form%'"

echo "--- index"
q "select indexname || ' | ' || indexdef from pg_indexes where indexname = 'uq_checklist_template_items_template_seed_key'"

echo "--- templates"
q "select id || ' | ' || type || ' | ' || name || ' | active=' || is_active from checklist_templates order by id"

echo "--- counts"
q "select 'items=' || (select count(*) from checklist_template_items) || ' templates=' || (select count(*) from checklist_templates)"

echo "--- GET /health"
curl -s -w '\nHTTP %{http_code}\n' http://localhost:8080/health
