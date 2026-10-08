#!/usr/bin/env python3
"""Migration 0043 (comment only) up / down / up on a test database (never live).

karea_m0043_test: migrations 0001-0042 + seeds 01-06. Compares the
item_text_snapshot comment, a schema-only pg_dump and a fingerprint of every
checklist_item_progress row before / after up, down, up, up twice, down twice.
The database is dropped at the end.
"""
import difflib
import glob
import subprocess
import sys

ROOT = "/Users/Basri/Desktop/kts_kms_project"
BIN = "/opt/homebrew/opt/libpq/bin"
URL = "postgres://karea:karea_secret@localhost:5432/{db}?sslmode=disable"
DB = "karea_m0043_test"
MIG = f"{ROOT}/database/migrations"
UP = f"{MIG}/0043_item_text_snapshot_comment.up.sql"
DOWN = f"{MIG}/0043_item_text_snapshot_comment.down.sql"
OLD = ("Item text frozen at first non-PENDING evaluation. NULL for PENDING and legacy rows; "
       "UI falls back to checklist_template_items.item_text.")
NEW = ("Item text copied from the template item on every non-PENDING answer; PENDING keeps the last copy. "
       "NULL for never-answered and legacy rows; UI falls back to checklist_template_items.item_text.")
failures = []


def psql(db, sql=None, file=None, single=False):
    cmd = [f"{BIN}/psql", URL.format(db=db), "-X", "-q", "-v", "ON_ERROR_STOP=1", "-At"]
    if single:
        cmd.append("-1")
    cmd += ["-f", file] if file else ["-c", sql]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"psql: {r.stderr.strip()}")
    return r.stdout.strip()


def check(label, ok, detail=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))
    if not ok:
        failures.append(label)


def comment():
    return psql(DB, "select col_description('checklist_item_progress'::regclass, "
                    "(select attnum from pg_attribute where attrelid = 'checklist_item_progress'::regclass "
                    "and attname = 'item_text_snapshot'))")


def schema():
    r = subprocess.run([f"{BIN}/pg_dump", URL.format(db=DB), "--schema-only", "--no-owner"],
                       capture_output=True, text=True, check=True)
    return [l for l in r.stdout.splitlines() if not l.startswith("-- Dumped") and not l.startswith("\\restrict")
            and not l.startswith("\\unrestrict")]


def rows():
    return psql(DB, "select count(*) || ' rows md5 ' || md5(string_agg(p::text, '|' order by id)) "
                    "from checklist_item_progress p")


def diff(a, b):
    return [l for l in difflib.unified_diff(a, b, lineterm="", n=0) if l[:1] in "+-" and l[:3] not in ("+++", "---")]


print(f"== build {DB}: migrations 0001-0042 + seeds 01-06")
psql("postgres", f"DROP DATABASE IF EXISTS {DB};")
psql("postgres", f"CREATE DATABASE {DB};")
migs = sorted(f for f in glob.glob(f"{MIG}/*.up.sql") if "/0043_" not in f)
for f in migs:
    psql(DB, file=f)
for s in ["01_stations.sql", "02_stations_and_steps.sql", "03_checklist_templates.sql", "04_users.sql",
          "05_defect_catalog.sql", "06_test_vehicles.sql"]:
    psql(DB, file=f"{ROOT}/database/seed/{s}")
print(f"  {len(migs)} migrations, last {migs[-1].rsplit('/', 1)[1]}")

print("\n== before 0043")
s0, r0 = schema(), rows()
print(f"  comment: {comment()}")
print(f"  checklist_item_progress: {r0}")
check("comment is the 0020 text", comment() == OLD)

print("\n== up (psql -1)")
psql(DB, file=UP, single=True)
s1 = schema()
d = diff(s0, s1)
print(f"  comment: {comment()}")
for l in d:
    print(f"    {l}")
check("comment is the new text", comment() == NEW)
check("schema dump differs only in that comment line",
      len(d) == 2 and all("COMMENT ON COLUMN public.checklist_item_progress.item_text_snapshot" in l for l in d))
check("rows unchanged", rows() == r0, rows())

print("\n== down (psql -1)")
psql(DB, file=DOWN, single=True)
check("comment is the 0020 text again", comment() == OLD)
check("schema dump byte-identical to before 0043", schema() == s0)
check("rows unchanged", rows() == r0)
psql(DB, file=DOWN, single=True)
check("down twice: still identical", schema() == s0 and comment() == OLD)

print("\n== up again, up twice")
psql(DB, file=UP, single=True)
check("up again: same schema as the first up", schema() == s1 and comment() == NEW)
psql(DB, file=UP, single=True)
check("up twice: unchanged", schema() == s1 and comment() == NEW)
check("rows unchanged after up/down/up/up", rows() == r0)

psql("postgres", f"DROP DATABASE {DB};")
print(f"\n  dropped {DB}")
print("\nRESULT:", "ALL PASS" if not failures else f"{len(failures)} FAIL: {failures}")
sys.exit(1 if failures else 0)
