#!/usr/bin/env bash
# Read-only pre-check on live (karea_ro) before migration 0041:
# template-level form columns hold no value, and no duplicate
# (template_id, seed_key) would block the new unique index.
set -euo pipefail
R="postgres://karea_ro@localhost:5432/karea?sslmode=disable"
P=/opt/homebrew/opt/libpq/bin/psql
"$P" "$R" -X -v ON_ERROR_STOP=1 \
  -c "select current_user, (select version from schema_migrations) schema_version, (select dirty from schema_migrations) dirty" \
  -c "select count(*) templates, count(form_code) form_code_not_null, count(form_revision) form_revision_not_null, count(form_published_at) form_published_at_not_null from checklist_templates" \
  -c "select id, type, name, is_active, vehicle_model_id from checklist_templates order by id" \
  -c "select template_id, seed_key, count(*) from checklist_template_items where seed_key is not null group by 1, 2 having count(*) > 1" \
  -c "select count(*) items, count(seed_key) with_seed_key from checklist_template_items" \
  -c "select column_name from information_schema.columns where table_name = 'checklist_template_items' and column_name like 'form%'"
