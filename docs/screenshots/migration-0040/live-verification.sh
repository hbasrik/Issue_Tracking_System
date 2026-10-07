#!/usr/bin/env bash
# Live check after migration 0040 was applied (docs/16 A52). Read-only:
# connects only as karea_ro (password from ~/.pgpass), runs SELECTs and a
# GET /health. Writes nothing and makes no write attempt on a frozen item.
set -u
cd "$(dirname "$0")/../../.."
R="postgres://karea_ro@localhost:5432/karea?sslmode=disable"
P=/opt/homebrew/opt/libpq/bin/psql
q() { "$P" "$R" -X -At -F ' | ' -v ON_ERROR_STOP=1 -c "$1"; }

echo "--- session"
q "select 'session_user=' || session_user || ' transaction_read_only=' || current_setting('transaction_read_only') || ' now=' || now()"

echo "--- schema_migrations"
q "select 'version=' || version || ' dirty=' || dirty from schema_migrations"

echo "--- functions: md5(prosrc) live vs body in the migration file"
python3 - <<'EOF' > /tmp/karea-0040-file-md5.txt
import re, hashlib
s = open('database/migrations/0040_freeze_passed_checklist_items.up.sql').read()
for name, body in re.findall(r'CREATE OR REPLACE FUNCTION (\w+)\(.*?AS \$\$(.*?)\$\$', s, re.S):
    print(name, hashlib.md5(body.encode()).hexdigest())
EOF
while read -r name file_md5; do
  live=$(q "select md5(p.prosrc) || ' volatility=' || p.provolatile::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '$name'")
  live_md5=${live%% *}
  [ "$live_md5" = "$file_md5" ] && v=SAME || v=DIFFERENT
  echo "$name file=$file_md5 live=$live $v"
done < /tmp/karea-0040-file-md5.txt
rm -f /tmp/karea-0040-file-md5.txt

echo "--- triggers: table, function, enabled, definition"
q "select t.tgname, c.relname, p.proname, t.tgenabled, pg_get_triggerdef(t.oid)
   from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid
   where t.tgname in ('trg_enforce_checklist_frozen', 'trg_enforce_checklist_media_frozen') order by 1"

echo "--- row counts and md5"
q "select 'checklist_item_progress rows=' || count(*) || ' md5=' || md5(string_agg(p::text, '|' order by id)) from checklist_item_progress p"
q "select 'media_attachments rows=' || count(*) || ' md5=' || md5(string_agg(m::text, '|' order by id)) from media_attachments m"
echo "progress rows written after the pre-migration measurement (14:50 UTC):"
q "select p.id, p.vin, p.checklist_type, p.check_item_id, p.check_status, p.updated_at, p.checker_id,
          coalesce(fn_checklist_item_frozen_reason(p.vin, p.checklist_type, p.check_item_id), 'not frozen')
   from checklist_item_progress p where greatest(p.updated_at, p.check_date, p.created_at) > '2026-10-07 14:50:00+00' order by p.id"
q "select 'audit ' || a.id || ' ' || a.vin || ' ' || a.event_type || ' ' || a.old_value || '->' || a.new_value || ' by ' || a.performed_by || ' ' || a.metadata
   from audit_logs a where a.vin = 'N7V1K1SA8TK000007' and a.id >= 697 order by a.id"
q "select 'media rows uploaded after 14:50 UTC=' || count(*) from media_attachments where uploaded_at > '2026-10-07 14:50:00+00'"

echo "--- rows that are frozen now"
q "select coalesce(fn_checklist_item_frozen_reason(p.vin, p.checklist_type, p.check_item_id), '(not frozen)'), count(*), count(distinct p.vin)
   from checklist_item_progress p group by 1 order by 1"
q "with f as (select p.*, ti.eol_phase, fn_checklist_item_frozen_reason(p.vin, p.checklist_type, p.check_item_id) r
              from checklist_item_progress p left join checklist_template_items ti on ti.id = p.check_item_id)
   select case when r like '%delivered%' then 'DELIVERED' when r like '%depot%' then 'DEPOT_RELEASED' else 'BRANCH_SHIPPED' end,
          checklist_type::text || coalesce(' ' || eol_phase::text, ''), check_status, count(*), count(distinct vin)
   from f where r is not null group by 1, 2, 3 order by 1, 2, 3"
q "select 'frozen checklist photos=' || count(*) from media_attachments m where fn_checklist_media_frozen_reason(m.entity_type, m.entity_id) is not null"

echo "--- GET /health"
curl -s -w '\nHTTP %{http_code}\n' http://localhost:8080/health
