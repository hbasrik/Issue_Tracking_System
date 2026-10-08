#!/usr/bin/env python3
"""Did the old templates-confirm captures leave anything on live? (docs/16 A59)

Read-only: every statement is a SELECT, run as karea_ro (Karar 28). Prints to
stdout; the committed check-output.txt is this script's stdout.

Markers the old script versions used (agent transcript, 2026-09-07/09):
  SCREENSHOT_TEMP_INACTIVE_ITEM  item POSTed to seed template 3 via the API
                                 (versions that actually ran)
  SCREENSHOT_TEMP_EOL_<ms>       own template INSERTed with SQL
                                 (2026-09-09 version, no run in the transcript)
"""
import subprocess

DB = "postgres://karea_ro@localhost:5432/karea?sslmode=disable"
PSQL = "/opt/homebrew/opt/libpq/bin/psql"

QUERIES = [
    ("schema version", "SELECT max(version) FROM schema_migrations"),
    ("audit_logs by event type",
     "SELECT event_type, count(*), min(event_at), max(event_at) FROM audit_logs GROUP BY 1 ORDER BY 1"),
    ("template change audits (CHECKLIST_TEMPLATE_CHANGE, since 0038)",
     "SELECT id, event_at, performed_by, metadata FROM audit_logs WHERE event_type = 'CHECKLIST_TEMPLATE_CHANGE' ORDER BY id"),
    ("audit rows mentioning a screenshot marker",
     "SELECT count(*) FROM audit_logs WHERE concat_ws(' ', old_value, new_value, metadata::text) ILIKE '%SCREENSHOT%'"),
    ("templates", "SELECT id, type, name, is_active, created_at FROM checklist_templates ORDER BY id"),
    ("template count / item count",
     "SELECT (SELECT count(*) FROM checklist_templates) AS templates, (SELECT count(*) FROM checklist_template_items) AS items"),
    ("items per template",
     "SELECT template_id, count(*) AS total, count(*) FILTER (WHERE is_active) AS active FROM checklist_template_items GROUP BY 1 ORDER BY 1"),
    ("templates named SCREENSHOT_TEMP_EOL_%",
     "SELECT count(*) FROM checklist_templates WHERE name LIKE 'SCREENSHOT_TEMP_EOL_%'"),
    ("items with SCREENSHOT in the text",
     "SELECT count(*) FROM checklist_template_items WHERE item_text ILIKE '%SCREENSHOT%'"),
    ("progress rows on item 214 (the run cleaned up by SQL)",
     "SELECT count(*) FROM checklist_item_progress WHERE check_item_id = 214"),
    ("progress rows whose item is gone",
     "SELECT count(*) FROM checklist_item_progress p WHERE NOT EXISTS "
     "(SELECT 1 FROM checklist_template_items i WHERE i.id = p.check_item_id)"),
    ("sequences vs live rows (ids used and no longer present)",
     "SELECT s.sequencename, s.last_value, c.n_live_tup AS live_rows, c.n_tup_ins AS inserted, c.n_tup_del AS deleted "
     "FROM pg_sequences s JOIN pg_stat_user_tables c ON c.relname = replace(s.sequencename, '_id_seq', '') "
     "WHERE s.sequencename IN ('checklist_templates_id_seq', 'checklist_template_items_id_seq', 'audit_logs_id_seq') ORDER BY 1"),
]

for title, q in QUERIES:
    assert q.lstrip().upper().startswith("SELECT")
    out = subprocess.run([PSQL, DB, "-X", "-v", "ON_ERROR_STOP=1", "-P", "pager=off", "-c", q],
                         capture_output=True, text=True, check=True).stdout
    print(f"== {title}\n{out}")
