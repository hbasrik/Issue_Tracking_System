#!/usr/bin/env python3
"""Migration 0039 (checklist form fields) on a throwaway test database.

  python3 run-verification.py run    build karea_m0039_test with golang-migrate
                                     up to 0038 + seeds 01-06, then 0039
                                     up -> down -> up, plus each file run twice
                                     via psql (idempotency); prints \\d, row
                                     counts and md5 of the pre-existing columns
  python3 run-verification.py drop   drop karea_m0039_test

The live database and the API on 8080 are never used.
"""
import os
import subprocess
import sys

ROOT = "/Users/Basri/Desktop/kts_kms_project"
PSQL = "/opt/homebrew/opt/libpq/bin/psql"
MIGRATE = os.path.expanduser("~/go/bin/migrate")
MIG = ROOT + "/database/migrations"
SEEDS = ROOT + "/database/seed"
DB = "karea_m0039_test"
URL = f"postgres://karea:karea_secret@localhost:5432/{DB}?sslmode=disable"
ADMIN = "postgres://karea:karea_secret@localhost:5432/postgres?sslmode=disable"
NEW_ITEM_COLS = ["acceptance_criterion", "control_method"]
NEW_TPL_COLS = ["form_code", "form_revision", "form_published_at"]
failures = []


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"failed: {' '.join(cmd)}\n{r.stdout}{r.stderr}")
    return (r.stdout + r.stderr).strip()


def psql(sql, url=URL, tuples=True):
    flags = ["-At", "-F", "|"] if tuples else []
    return run([PSQL, url, "-X", "-q", "-v", "ON_ERROR_STOP=1", *flags, "-c", sql])


def psql_file(path):
    return run([PSQL, URL, "-X", "-v", "ON_ERROR_STOP=1", "-f", path])


def migrate(*args):
    return run([MIGRATE, "-path", MIG, "-database", URL, *args])


def check(label, ok, detail=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))
    if not ok:
        failures.append(label)


def columns(table):
    return psql(f"SELECT column_name FROM information_schema.columns WHERE table_name = '{table}' "
                f"ORDER BY ordinal_position").splitlines()


def md5(table, cols):
    col_list = ", ".join(cols)
    return psql(f"SELECT md5(coalesce(string_agg(t::text, E'\\n' ORDER BY t.id), '')) "
                f"FROM (SELECT {col_list} FROM {table}) t")


def counts():
    return psql("SELECT (SELECT count(*) FROM checklist_template_items), "
                "(SELECT count(*) FROM checklist_templates), "
                "(SELECT count(*) FROM checklist_item_progress)")


def describe(title):
    print(f"\n--- \\d after {title} ---")
    for table in ["checklist_template_items", "checklist_templates"]:
        print(psql(f"\\d {table}", tuples=False))
    c = counts().split("|")
    print(f"row counts: checklist_template_items={c[0]} checklist_templates={c[1]} "
          f"checklist_item_progress={c[2]}")
    return c


def version():
    return migrate("version")


def phase_run():
    psql(f"DROP DATABASE IF EXISTS {DB}", url=ADMIN)
    psql(f"CREATE DATABASE {DB}", url=ADMIN)
    migrate("goto", "38")
    for name in ["01_stations.sql", "02_stations_and_steps.sql", "03_checklist_templates.sql",
                 "04_users.sql", "05_defect_catalog.sql", "06_test_vehicles.sql"]:
        psql_file(f"{SEEDS}/{name}")
    print(f"built {DB}: golang-migrate version {version()} + seeds 01-06")

    item_cols = columns("checklist_template_items")
    tpl_cols = columns("checklist_templates")
    print(f"pre-0039 checklist_template_items columns ({len(item_cols)}): {', '.join(item_cols)}")
    print(f"pre-0039 checklist_templates columns ({len(tpl_cols)}): {', '.join(tpl_cols)}")
    base_counts = describe("0038 (before 0039)")
    base_items = md5("checklist_template_items", item_cols)
    base_tpl = md5("checklist_templates", tpl_cols)
    print(f"md5 checklist_template_items (pre-existing columns) = {base_items}")
    print(f"md5 checklist_templates      (pre-existing columns) = {base_tpl}")

    def verify(step, expect_new):
        c = describe(step)
        now_items = columns("checklist_template_items")
        now_tpl = columns("checklist_templates")
        has_new = all(x in now_items for x in NEW_ITEM_COLS) and all(x in now_tpl for x in NEW_TPL_COLS)
        print(f"golang-migrate version: {version()}")
        check(f"{step}: five new columns {'present' if expect_new else 'absent'}",
              has_new == expect_new if expect_new else not any(
                  x in now_items + now_tpl for x in NEW_ITEM_COLS + NEW_TPL_COLS))
        check(f"{step}: pre-existing columns unchanged",
              [x for x in now_items if x not in NEW_ITEM_COLS] == item_cols
              and [x for x in now_tpl if x not in NEW_TPL_COLS] == tpl_cols)
        check(f"{step}: row counts unchanged", c == base_counts, "|".join(c))
        m_items = md5("checklist_template_items", item_cols)
        m_tpl = md5("checklist_templates", tpl_cols)
        check(f"{step}: md5 checklist_template_items unchanged", m_items == base_items, m_items)
        check(f"{step}: md5 checklist_templates unchanged", m_tpl == base_tpl, m_tpl)
        if expect_new:
            nulls = psql("SELECT (SELECT count(*) FROM checklist_template_items "
                         " WHERE acceptance_criterion IS NOT NULL OR control_method IS NOT NULL), "
                         "(SELECT count(*) FROM checklist_templates WHERE form_code IS NOT NULL "
                         " OR form_revision IS NOT NULL OR form_published_at IS NOT NULL)")
            check(f"{step}: every existing row has NULL in all five columns", nulls == "0|0",
                  f"non-null rows items|templates = {nulls}")
            defaults = psql("SELECT count(*) FROM information_schema.columns "
                            "WHERE column_name IN ('acceptance_criterion','control_method','form_code',"
                            "'form_revision','form_published_at') AND (column_default IS NOT NULL "
                            "OR is_nullable <> 'YES')")
            check(f"{step}: no default, all nullable", defaults == "0", f"{defaults} offending columns")

    print("\n== 1. migrate up 1 (0039 up) ==")
    print(migrate("up", "1"))
    verify("1. up", True)

    print("\n== 2. migrate down 1 (0039 down) ==")
    print(migrate("down", "1"))
    verify("2. down", False)

    print("\n== 3. migrate up 1 (0039 up again) ==")
    print(migrate("up", "1"))
    verify("3. up again", True)

    print("\n== 4. idempotency: each file run twice via psql ==")
    up = f"{MIG}/0039_checklist_form_fields.up.sql"
    down = f"{MIG}/0039_checklist_form_fields.down.sql"
    print(psql_file(up))
    check("up file re-run on an applied schema succeeds (IF NOT EXISTS)", True)
    print(psql_file(down))
    print(psql_file(down))
    check("down file run twice succeeds (IF EXISTS)",
          not any(x in columns("checklist_template_items") + columns("checklist_templates")
                  for x in NEW_ITEM_COLS + NEW_TPL_COLS))
    print(psql_file(up))
    print(psql_file(up))
    check("up file run twice succeeds", all(x in columns("checklist_template_items") for x in NEW_ITEM_COLS)
          and all(x in columns("checklist_templates") for x in NEW_TPL_COLS))
    check("after the psql re-runs: md5 checklist_template_items unchanged",
          md5("checklist_template_items", item_cols) == base_items)

    print("\nALL CHECKS PASSED" if not failures else f"\nFAILED: {failures}")
    sys.exit(1 if failures else 0)


def phase_drop():
    psql(f"DROP DATABASE IF EXISTS {DB}", url=ADMIN)
    print(f"dropped {DB}")


if __name__ == "__main__":
    {"run": phase_run, "drop": phase_drop}[sys.argv[1]]()
