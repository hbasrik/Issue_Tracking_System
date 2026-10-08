#!/usr/bin/env python3
"""Read-only check of migration 0042 on live (karea_ro only, SELECT only)."""
import hashlib
import subprocess
import sys
import urllib.request

ROOT = "/Users/Basri/Desktop/kts_kms_project"
MIG = f"{ROOT}/database/migrations"
PSQL = "/opt/homebrew/opt/libpq/bin/psql"
RO = "postgres://karea_ro@localhost:5432/karea?sslmode=disable"
failures = []


def q(sql):
    r = subprocess.run([PSQL, RO, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-At", "-F", "|", "-c", sql],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(r.stderr.strip())
    return r.stdout.strip()


def check(label, ok, detail=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))
    if not ok:
        failures.append(label)


def file_body(path, header):
    src = open(path, encoding="utf-8").read()
    return src.split(header, 1)[1].split("AS $$", 1)[1].split("$$ LANGUAGE plpgsql", 1)[0]


md5 = lambda s: hashlib.md5(s.encode()).hexdigest()

print("== live (karea_ro, read-only)")
print("  session:", q("select current_user || ' read_only=' || current_setting('transaction_read_only') "
                      "|| ' default_ro=' || current_setting('default_transaction_read_only')"))

v = q("select version, dirty from schema_migrations")
check("schema_migrations 42, dirty=false", v == "42|f", v)

cols = q("select string_agg(column_name || ' ' || data_type || ' null=' || is_nullable || ' default=' || "
         "coalesce(column_default, '-'), '; ' order by column_name) from information_schema.columns "
         "where table_name = 'checklist_item_progress' and column_name in ('acceptance_criterion_snapshot', "
         "'control_method_snapshot', 'form_revision_snapshot', 'criteria_snapshot_at')")
print("  columns:", cols)
check("4 columns, nullable, no default",
      cols == ("acceptance_criterion_snapshot text null=YES default=-; control_method_snapshot text null=YES default=-; "
               "criteria_snapshot_at timestamp with time zone null=YES default=-; "
               "form_revision_snapshot text null=YES default=-"))

con = q("select coalesce(string_agg(pg_get_constraintdef(oid), ''), '') from pg_constraint "
        "where conname = 'chk_criteria_snapshot_stamped' and conrelid = 'checklist_item_progress'::regclass")
check("chk_criteria_snapshot_stamped present", con.startswith("CHECK (((criteria_snapshot_at IS NOT NULL)"), con)

up_body = file_body(f"{MIG}/0042_checklist_criteria_snapshot.up.sql",
                    "CREATE OR REPLACE FUNCTION fn_enforce_checklist_frozen()")
live = q("select md5(prosrc) from pg_proc where proname = 'fn_enforce_checklist_frozen'")
print(f"  fn_enforce_checklist_frozen  live {live}  0042 up file {md5(up_body)}")
check("fn_enforce_checklist_frozen body == 0042 up file body (md5)", live == md5(up_body))

reason_body = file_body(f"{MIG}/0040_freeze_passed_checklist_items.up.sql",
                        "CREATE OR REPLACE FUNCTION fn_checklist_item_frozen_reason(")
live = q("select md5(prosrc) from pg_proc where proname = 'fn_checklist_item_frozen_reason'")
print(f"  fn_checklist_item_frozen_reason  live {live}  0040 up file {md5(reason_body)}")
check("fn_checklist_item_frozen_reason body == 0040 up file body (md5)", live == md5(reason_body))

trg = q("select string_agg(tgname || ' ' || tgenabled::text || ' ' || tgfoid::regproc::text, ', ') from pg_trigger "
        "where tgrelid = 'checklist_item_progress'::regclass and tgname = 'trg_enforce_checklist_frozen'")
check("trigger present and enabled", trg == "trg_enforce_checklist_frozen O fn_enforce_checklist_frozen", trg)

filled = q("select count(*) from checklist_item_progress where acceptance_criterion_snapshot is not null "
           "or control_method_snapshot is not null or form_revision_snapshot is not null "
           "or criteria_snapshot_at is not null")
check("no backfill: every new column NULL", filled == "0", f"{filled} rows with a value")

# Same column list as verify.py's FINGERPRINT (the pre-0042 columns only).
fp = q("select count(*) || ' rows md5 ' || md5(string_agg(concat_ws(',', id, vin, checklist_type, "
       "check_item_id, check_status, checker_id, check_date, check_image_url, rework_desc, rework_date, "
       "conditional_desc, conditional_date, rejected_desc, rejected_date, rejected_by, approved_desc, "
       "approved_date, approved_by, related_issue_id, item_text_snapshot, created_at, updated_at), "
       "'|' order by id)) from checklist_item_progress")
print("  checklist_item_progress fingerprint (pre-0042 columns):", fp)
print("  max(updated_at):", q("select max(updated_at) from checklist_item_progress"))

# Last pre-0042 live measurement: migration-0040/live-verification-output.txt
# (2026-10-07 15:03 UTC), md5(string_agg(p::text, '|' order by id)). 0042
# appended four NULL columns, so each row text only gained a ",,,," suffix.
BASELINE = "53000|e94d6bcd1db26a143392d94359852782"
tail_ok = q("select count(*) from checklist_item_progress p where p::text !~ ',,,,\\)$'")
check("every row text ends with the four NULL columns", tail_ok == "0", f"{tail_ok} rows without")
now_fp = q("select count(*), md5(string_agg(regexp_replace(p::text, ',,,,\\)$', ')'), '|' order by id)) "
           "from checklist_item_progress p")
check("checklist_item_progress rows and md5 == pre-0042 measurement (0040 live check)", now_fp == BASELINE,
      f"now {now_fp}, before {BASELINE}")

try:
    with urllib.request.urlopen("http://localhost:8080/health", timeout=5) as r:
        body = r.read().decode()
        check("/health 200", r.status == 200, f"{r.status} {body.strip()}")
except Exception as e:
    check("/health 200", False, str(e))

print("\nRESULT:", "ALL PASS" if not failures else f"{len(failures)} FAIL: {failures}")
sys.exit(1 if failures else 0)
