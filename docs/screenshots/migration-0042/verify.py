#!/usr/bin/env python3
"""Migration 0042 up / down / up on a test database (never live).

karea_m0042_test: migrations 0001-0041 + seeds 01-06, then
  1. before: md5 of fn_enforce_checklist_frozen and fn_checklist_item_frozen_reason
     (pg_get_functiondef), fingerprint of every checklist_item_progress row
  2. up (psql -1, one transaction like golang-migrate's multi-statement Exec):
     columns, constraint, comments, no backfill, rows unchanged, freeze rule
     unchanged, protected list grown; behaviour on marked 'tmp-m0042' rows
  3. down: function md5 == before (= 0040 body), columns and constraint gone,
     rows unchanged; down twice
  4. up again, then up twice: same function md5 as the first up
Temp rows are deleted; the database is dropped at the end.
"""
import glob
import subprocess
import sys

ROOT = "/Users/Basri/Desktop/kts_kms_project"
PSQL = "/opt/homebrew/opt/libpq/bin/psql"
URL = "postgres://karea:karea_secret@localhost:5432/{db}?sslmode=disable"
DB = "karea_m0042_test"
MIG = f"{ROOT}/database/migrations"
UP = f"{MIG}/0042_checklist_criteria_snapshot.up.sql"
DOWN = f"{MIG}/0042_checklist_criteria_snapshot.down.sql"
NEW_COLS = ["acceptance_criterion_snapshot", "control_method_snapshot", "form_revision_snapshot",
            "criteria_snapshot_at"]

failures = []


def psql(db, sql=None, file=None, single=False, ok_fail=False):
    cmd = [PSQL, URL.format(db=db), "-X", "-q", "-v", "ON_ERROR_STOP=1", "-At", "-F", "|"]
    if single:
        cmd.append("-1")
    cmd += ["-f", file] if file else ["-c", sql]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if ok_fail:
        return r.returncode, r.stdout.strip(), r.stderr.strip()
    if r.returncode != 0:
        raise SystemExit(f"psql failed: {r.stderr.strip()}")
    return r.stdout.strip()


def q(sql):
    return psql(DB, sql)


def check(label, ok, detail=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))
    if not ok:
        failures.append(label)


def fn_md5(name):
    return q(f"select md5(pg_get_functiondef('{name}'::regproc))")


FINGERPRINT = ("select count(*) || ' rows md5 ' || md5(string_agg(concat_ws(',', id, vin, checklist_type, "
               "check_item_id, check_status, checker_id, check_date, check_image_url, rework_desc, rework_date, "
               "conditional_desc, conditional_date, rejected_desc, rejected_date, rejected_by, approved_desc, "
               "approved_date, approved_by, related_issue_id, item_text_snapshot, created_at, updated_at), "
               "'|' order by id)) from checklist_item_progress")


def columns():
    return q("select string_agg(column_name || ' ' || data_type || ' null=' || is_nullable || ' default=' || "
             "coalesce(column_default, '-'), '; ' order by column_name) from information_schema.columns "
             "where table_name = 'checklist_item_progress' and column_name in ("
             + ",".join(f"'{c}'" for c in NEW_COLS) + ")")


def constraint():
    return q("select coalesce(string_agg(pg_get_constraintdef(oid), ''), '') from pg_constraint "
             "where conname = 'chk_criteria_snapshot_stamped'")


def trigger():
    return q("select string_agg(tgname || ' ' || tgenabled::text || ' ' || tgfoid::regproc::text, ', ') from pg_trigger "
             "where tgrelid = 'checklist_item_progress'::regclass and tgname = 'trg_enforce_checklist_frozen'")


# ---------------------------------------------------------------- build
print(f"== build {DB}: migrations 0001-0041 + seeds 01-06")
psql("postgres", f"DROP DATABASE IF EXISTS {DB};")
psql("postgres", f"CREATE DATABASE {DB};")
migs = sorted(f for f in glob.glob(f"{MIG}/*.up.sql") if not f.endswith(UP.rsplit("/", 1)[1]))
for f in migs:
    psql(DB, file=f)
for s in ["01_stations.sql", "02_stations_and_steps.sql", "03_checklist_templates.sql", "04_users.sql",
          "05_defect_catalog.sql", "06_test_vehicles.sql"]:
    psql(DB, file=f"{ROOT}/database/seed/{s}")
print(f"  {len(migs)} migrations, last {migs[-1].rsplit('/', 1)[1]}")

print("\n== 1. before 0042")
fn_before = fn_md5("fn_enforce_checklist_frozen")
reason_before = fn_md5("fn_checklist_item_frozen_reason")
media_before = fn_md5("fn_enforce_checklist_media_frozen")
rows_before = q(FINGERPRINT)
trg_before = trigger()
print(f"  fn_enforce_checklist_frozen      md5 {fn_before}")
print(f"  fn_checklist_item_frozen_reason  md5 {reason_before}")
print(f"  fn_enforce_checklist_media_frozen md5 {media_before}")
print(f"  trigger: {trg_before}")
print(f"  checklist_item_progress: {rows_before}")
check("new columns absent", columns() == "")


def file_body(path):
    src = open(path, encoding="utf-8").read()
    return src.split("CREATE OR REPLACE FUNCTION fn_enforce_checklist_frozen()", 1)[1] \
              .split("AS $$", 1)[1].split("$$ LANGUAGE plpgsql;", 1)[0]


def installed_body():
    return q("select prosrc from pg_proc where proname = 'fn_enforce_checklist_frozen'")


body_0040 = file_body(f"{MIG}/0040_freeze_passed_checklist_items.up.sql")
body_down = file_body(DOWN)
body_up = file_body(UP)
check("installed body before 0042 == 0040 file body (text)", installed_body() == body_0040.strip("\n"))
check("down file body == 0040 file body (text)", body_down == body_0040)
ADDED = {
    "NEW": ",\n        NEW.acceptance_criterion_snapshot, NEW.control_method_snapshot,\n"
           "        NEW.form_revision_snapshot, NEW.criteria_snapshot_at",
    "OLD": ",\n        OLD.acceptance_criterion_snapshot, OLD.control_method_snapshot,\n"
           "        OLD.form_revision_snapshot, OLD.criteria_snapshot_at",
}
check("up file body == 0040 body + only the 4 columns in NEW and OLD",
      all(body_up.count(v) == 1 for v in ADDED.values())
      and body_up.replace(ADDED["NEW"], "").replace(ADDED["OLD"], "") == body_0040)
audit_max = q("select coalesce(max(id), 0) from audit_logs")

# ---------------------------------------------------------------- up
print("\n== 2. up (psql -1)")
psql(DB, file=UP, single=True)
cols = columns()
print(f"  columns: {cols}")
check("4 columns, nullable, no default",
      cols == ("acceptance_criterion_snapshot text null=YES default=-; control_method_snapshot text null=YES default=-; "
               "criteria_snapshot_at timestamp with time zone null=YES default=-; "
               "form_revision_snapshot text null=YES default=-"))
con = constraint()
print(f"  constraint: {con}")
check("chk_criteria_snapshot_stamped present", "criteria_snapshot_at IS NOT NULL" in con
      and all(c in con for c in NEW_COLS[:3]))
comments = q("select count(*) from information_schema.columns c where c.table_name = 'checklist_item_progress' "
             "and c.column_name in (" + ",".join(f"'{c}'" for c in NEW_COLS) + ") "
             "and col_description('checklist_item_progress'::regclass, c.ordinal_position) is not null")
check("4 column comments", comments == "4", comments)
filled = q("select count(*) from checklist_item_progress where " + " or ".join(f"{c} is not null" for c in NEW_COLS))
check("no backfill (every new column NULL)", filled == "0", f"{filled} rows with a value")
rows_up = q(FINGERPRINT)
check("existing rows unchanged", rows_up == rows_before, rows_up)
fn_up = fn_md5("fn_enforce_checklist_frozen")
print(f"  fn_enforce_checklist_frozen md5 {fn_up}")
check("fn_enforce_checklist_frozen replaced", fn_up != fn_before)
check("fn_checklist_item_frozen_reason unchanged (freeze rule)", fn_md5("fn_checklist_item_frozen_reason") == reason_before)
check("fn_enforce_checklist_media_frozen unchanged", fn_md5("fn_enforce_checklist_media_frozen") == media_before)
check("trigger unchanged", trigger() == trg_before, trigger())
fn_def = q("select pg_get_functiondef('fn_enforce_checklist_frozen'::regproc)")
check("protected list holds the 4 columns (NEW and OLD)",
      all(f"NEW.{c}" in fn_def and f"OLD.{c}" in fn_def for c in NEW_COLS))
check("installed body after up == up file body (text)", installed_body() == body_up.strip("\n"))

print("\n-- behaviour on marked temp rows (tmp-m0042)")
open_vin = q("select w.vin from vehicle_eol_workflow w where w.current_stage = 'BRANCH' and w.branch_shipped_at is null "
             "order by w.vin limit 1")
# Seeds have no delivered vehicle; a branch-shipped one freezes its BRANCH items.
frozen_vin = q("select w.vin from vehicle_eol_workflow w where w.branch_shipped_at is not null "
               "and w.depot_released_at is null order by w.vin limit 1")
tid = q(f"select eol_template_id from vehicles where vin = '{open_vin}'")
tid_f = q(f"select eol_template_id from vehicles where vin = '{frozen_vin}'")
print(f"  open vehicle {open_vin} (template {tid}), branch-shipped vehicle {frozen_vin} (template {tid_f})")
item_ids = q(f"""insert into checklist_template_items (template_id, item_no, item_text, eol_phase, is_active,
                 acceptance_criterion, control_method, form_revision)
                 values ({tid}, 9101, 'tmp-m0042 open', 'BRANCH', false, 'tmp kriter', 'tmp yontem', 'tmp rev'),
                        ({tid_f}, 9102, 'tmp-m0042 frozen', 'BRANCH', false, 'tmp kriter', 'tmp yontem', 'tmp rev')
                 returning id""").split()
FROZEN_MSG = "shipped from the branch"
p_open = q(f"insert into checklist_item_progress (vin, checklist_type, check_item_id, check_status) "
           f"values ('{open_vin}', 'EOL', {item_ids[0]}, 'PENDING') returning id")
p_frozen = q(f"insert into checklist_item_progress (vin, checklist_type, check_item_id, check_status) "
             f"values ('{frozen_vin}', 'EOL', {item_ids[1]}, 'PENDING') returning id")
check("PENDING insert on a frozen (branch-shipped) item still passes", bool(p_frozen))

code, out, err = psql(DB, f"""update checklist_item_progress p set check_status = 'OK', check_date = now(),
    acceptance_criterion_snapshot = i.acceptance_criterion, control_method_snapshot = i.control_method,
    form_revision_snapshot = i.form_revision, criteria_snapshot_at = now()
    from checklist_template_items i where i.id = p.check_item_id and p.id = {p_open}
    returning p.check_status, p.acceptance_criterion_snapshot, p.control_method_snapshot, p.form_revision_snapshot,
              p.criteria_snapshot_at is not null""", ok_fail=True)
check("open vehicle: answer + copy + stamp accepted", code == 0 and out.startswith("OK|tmp kriter|tmp yontem|tmp rev|t"),
      out or err)
code, out, err = psql(DB, f"update checklist_item_progress set criteria_snapshot_at = null where id = {p_open}", ok_fail=True)
check("copy without stamp refused (chk_criteria_snapshot_stamped)", code != 0 and "chk_criteria_snapshot_stamped" in err,
      err.splitlines()[0] if err else out)
code, out, err = psql(DB, f"update checklist_item_progress set criteria_snapshot_at = now(), "
                          f"acceptance_criterion_snapshot = null, control_method_snapshot = null, "
                          f"form_revision_snapshot = null where id = {p_open}", ok_fail=True)
check("stamp with NULL copy accepted (form gave none)", code == 0, err)

for col, val in [("acceptance_criterion_snapshot", "'x'"), ("control_method_snapshot", "'x'"),
                 ("form_revision_snapshot", "'x'"), ("criteria_snapshot_at", "now()")]:
    extra = ", criteria_snapshot_at = now()" if col != "criteria_snapshot_at" else ""
    code, out, err = psql(DB, f"update checklist_item_progress set {col} = {val}{extra} where id = {p_frozen}", ok_fail=True)
    check(f"frozen item: changing only {col} refused", code != 0 and FROZEN_MSG in err,
          err.splitlines()[0] if err else out)
code, out, err = psql(DB, f"update checklist_item_progress set updated_at = now(), item_text_snapshot = 'tmp' "
                          f"where id = {p_frozen}", ok_fail=True)
check("frozen item: non-answer update (updated_at, item_text_snapshot) still passes", code == 0, err)
code, out, err = psql(DB, f"update checklist_item_progress set check_status = 'OK', check_date = now() "
                          f"where id = {p_frozen}", ok_fail=True)
check("frozen item: answering still refused", code != 0 and FROZEN_MSG in err,
      err.splitlines()[0] if err else out)

q(f"delete from checklist_item_progress where id in ({p_open}, {p_frozen})")
q(f"delete from checklist_template_items where id in ({item_ids[0]}, {item_ids[1]})")
new_audit = q(f"select count(*) from audit_logs where id > {audit_max}")
print(f"  audit rows written by the temp fixtures: {new_audit}")
q(f"delete from audit_logs where id > {audit_max}")
left = q("select (select count(*) from checklist_template_items where item_text like 'tmp-m0042%') || ' items, ' || "
         "(select count(*) from checklist_item_progress where id in (" + p_open + "," + p_frozen + ")) || ' progress, ' || "
         f"(select count(*) from audit_logs where id > {audit_max}) || ' audit'")
check("temp rows deleted", left == "0 items, 0 progress, 0 audit", left)
check("seed rows still unchanged", q(FINGERPRINT) == rows_before)

# ---------------------------------------------------------------- down
print("\n== 3. down (psql -1)")
psql(DB, file=DOWN, single=True)
fn_down = fn_md5("fn_enforce_checklist_frozen")
print(f"  fn_enforce_checklist_frozen md5 {fn_down} (before 0042: {fn_before})")
check("down restores the 0040 body byte for byte (md5 of pg_get_functiondef)", fn_down == fn_before)
check("columns gone", columns() == "")
check("constraint gone", constraint() == "")
check("freeze rule unchanged", fn_md5("fn_checklist_item_frozen_reason") == reason_before)
check("trigger unchanged", trigger() == trg_before)
check("rows unchanged after down", q(FINGERPRINT) == rows_before)
psql(DB, file=DOWN, single=True)
check("down a second time succeeds and changes nothing", fn_md5("fn_enforce_checklist_frozen") == fn_before
      and columns() == "")

# ---------------------------------------------------------------- up again
print("\n== 4. up again, then up twice")
psql(DB, file=UP, single=True)
check("up again: same function md5 as the first up", fn_md5("fn_enforce_checklist_frozen") == fn_up)
check("up again: columns and constraint back", columns() == cols and constraint() == con)
psql(DB, file=UP, single=True)
check("up a second time succeeds and changes nothing", fn_md5("fn_enforce_checklist_frozen") == fn_up
      and columns() == cols and constraint() == con)
check("rows unchanged after up/down/up/up", q(FINGERPRINT) == rows_before)

psql("postgres", f"DROP DATABASE {DB};")
print(f"\n  dropped {DB}")
print("\nRESULT:", "ALL PASS" if not failures else f"{len(failures)} FAIL: {failures}")
sys.exit(1 if failures else 0)
