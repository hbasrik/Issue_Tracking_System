"""Verification for migration 0036 (shipment sections follow the work order).

Builds two throwaway *_test databases:
  karea_shipsec_test        live clone: migrations 0001-0035, then the live
                            checklist_templates / checklist_template_items
                            rows (read-only pg_dump of the live DB, given as
                            LIVE_DUMP), then seeds 01-06
  karea_shipsec_fresh_test  fresh install: every migration + seeds 01-06

LIVE_DUMP was produced with
  docker exec -e PGOPTIONS='-c default_transaction_read_only=on' karea_postgres \
    pg_dump -U karea -d karea --data-only --column-inserts \
    -t checklist_templates -t checklist_template_items

Usage:
  LIVE_DUMP=/tmp/live-templates-dump.sql python3 run-verification.py > verification-output.txt
  KEEP=1 keeps karea_shipsec_test for the screenshots; drop it afterwards.

Refuses to touch a database whose name does not end in _test.
"""
import json
import os
import subprocess
import sys

PSQL = "/opt/homebrew/opt/libpq/bin/psql"
ROOT = "/Users/Basri/Desktop/kts_kms_project"
MIGRATIONS = ROOT + "/database/migrations"
SEEDS = ROOT + "/database/seed"
URL = "postgres://karea:karea_secret@localhost:5432/{}?sslmode=disable"
CLONE_DB = "karea_shipsec_test"
FRESH_DB = "karea_shipsec_fresh_test"
LIVE_DUMP = os.environ["LIVE_DUMP"]
UP = f"{MIGRATIONS}/0036_shipment_sections_by_process.up.sql"
DOWN = f"{MIGRATIONS}/0036_shipment_sections_by_process.down.sql"

for name in (CLONE_DB, FRESH_DB):
    assert name.endswith("_test"), "database must be *_test"

FAILS = []

# Expected result, written from the approved request (not from the migration).
SHIP = [
    ("interior_fit", 10, "İç Montaj & Kesim İşleri", range(1, 13)),
    ("chassis_exterior", 20, "Şasi & Dış Donanım", range(13, 17)),
    ("badges_trim", 30, "Logo, Etiket & İç Parça", range(17, 25)),
    ("rubber_film", 40, "Kauçuk, Kaplama & Küçük Montaj", range(25, 33)),
    ("brake_sealing", 50, "Fren Ayarı & Sızdırmazlık", range(33, 41)),
    ("final_adjust", 60, "Son Ayar & Kontroller", range(41, 47)),
]
TITLE = {k: t for k, _, t, _ in SHIP}


def expected(no):
    for key, sort, _, nos in SHIP:
        if no in nos:
            return key, sort
    return None, None


def psql(db, sql=None, path=None):
    args = [PSQL, URL.format(db), "-X", "-v", "ON_ERROR_STOP=1"]
    if path:
        args += ["-f", path]
    out = subprocess.run(args, input=sql, capture_output=True, text=True)
    if out.returncode != 0:
        print(out.stdout)
        print(out.stderr)
        sys.exit(f"psql failed on {db}")
    return out.stdout


def scalar(db, q):
    out = subprocess.run([PSQL, URL.format(db), "-X", "-At", "-c", q], capture_output=True, text=True, check=True)
    return out.stdout.strip()


def rows(db, q):
    return json.loads(scalar(db, f"SELECT COALESCE(json_agg(t), '[]') FROM ({q}) t"))


def check(name, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'} {name}" + (f" — {detail}" if detail != "" else ""))
    if not ok:
        FAILS.append(name)


def updates(output):
    return [l for l in output.splitlines() if l.startswith(("INSERT", "UPDATE"))]


def migrations(upto):
    files = sorted(f for f in os.listdir(MIGRATIONS) if f.endswith(".up.sql"))
    return [f for f in files if int(f[:4]) <= upto]


def recreate(db):
    psql("postgres", sql=f"DROP DATABASE IF EXISTS {db};\nCREATE DATABASE {db};")


def seed(db, name):
    with open(f"{SEEDS}/{name}") as f:
        return updates(psql(db, sql=f.read()))


ITEMS = """
SELECT i.id, t.type::text AS type, i.template_id, i.item_no, i.item_text, i.is_active,
       i.eol_phase, i.station_id, i.seed_key, i.section_key, i.section_sort
FROM checklist_template_items i
JOIN checklist_templates t ON t.id = i.template_id
ORDER BY i.id
"""
FIXED = ("id", "type", "template_id", "item_no", "item_text", "is_active", "eol_phase", "station_id", "seed_key")
PROGRESS = "SELECT id, vin, check_item_id, check_status FROM checklist_item_progress ORDER BY id"
FP = ("SELECT md5(string_agg(id || '|' || template_id || '|' || item_no || '|' || item_text || '|' || is_active,"
      " E'\\n' ORDER BY id)) FROM checklist_template_items")
PROGRESS_FP = "SELECT count(*) || ' rows, md5 ' || md5(COALESCE(string_agg(id || '|' || vin || '|' || check_item_id || '|' || check_status, E'\\n' ORDER BY id), '')) FROM checklist_item_progress"
# Screen order: sections by section_sort, items by item_no (shared/checklistSections.ts).
SCREEN = """
SELECT i.item_no FROM checklist_template_items i JOIN checklist_templates t ON t.id = i.template_id
WHERE t.type = 'SHIPMENT' AND i.is_active
ORDER BY COALESCE(i.section_sort, 9999), i.section_key, i.item_no
"""


def fixed(snapshot):
    return [{k: r[k] for k in FIXED} for r in snapshot]


def of_type(snapshot, typ):
    return [r for r in snapshot if r["type"] == typ]


def short(text, n=62):
    t = " ".join(text.split())
    return t if len(t) <= n else t[: n - 3] + "..."


# ---------------------------------------------------------------------------
print("== 1. Live clone: migrations 0001-0035 + live template rows + seeds ==")
recreate(CLONE_DB)
for f in migrations(35):
    psql(CLONE_DB, path=f"{MIGRATIONS}/{f}")
print(f"  applied {len(migrations(35))} migrations (0001-0035)")
psql(CLONE_DB, sql="TRUNCATE checklist_template_items, checklist_templates RESTART IDENTITY CASCADE;")
psql(CLONE_DB, path=LIVE_DUMP)
print("  loaded live dump:", scalar(CLONE_DB, "SELECT count(*) FROM checklist_templates"), "templates,",
      scalar(CLONE_DB, "SELECT count(*) FROM checklist_template_items"), "items")
for name in ("01_stations.sql", "02_stations_and_steps.sql", "03_checklist_templates.sql",
             "04_users.sql", "05_defect_catalog.sql", "06_test_vehicles.sql"):
    print(f"  {name}: {' / '.join(seed(CLONE_DB, name)) or '(no insert/update)'}")
before = rows(CLONE_DB, ITEMS)
progress_before = rows(CLONE_DB, PROGRESS)
print(f"  items: {len(before)} | vehicle checklist progress rows: {len(progress_before)}")
print("  SHIPMENT screen order before 0036:", ",".join(str(r["item_no"]) for r in rows(CLONE_DB, SCREEN)))
print("  text/order/active fingerprint before:", scalar(CLONE_DB, FP))
print("  progress fingerprint before:", scalar(CLONE_DB, PROGRESS_FP))

# ---------------------------------------------------------------------------
print("\n== 2. Migration 0036 up ==")
out = updates(psql(CLONE_DB, path=UP))
print("  run 1:", " / ".join(out))
after = rows(CLONE_DB, ITEMS)
check("first run updates the 46 SHIPMENT rows and clears no other row", out == ["UPDATE 46", "UPDATE 0"], " / ".join(out))

print("\n  Result (SHIPMENT, by item_no):")
print(f"  {'no':>3}  {'active':<6} {'section_key':<16} {'sort':>4}  {'title':<32} text")
wrong = []
for r in sorted(of_type(after, "SHIPMENT"), key=lambda r: r["item_no"]):
    key, sort = expected(r["item_no"])
    ok = (r["section_key"], r["section_sort"]) == (key, sort)
    if not ok:
        wrong.append((r["item_no"], r["section_key"], key))
    print(f"  {r['item_no']:>3}  {str(r['is_active']).lower():<6} {str(r['section_key'] or '-'):<16} "
          f"{str(r['section_sort'] or '-'):>4}  {TITLE.get(r['section_key'], '(bölümsüz)'):<32} "
          f"{short(r['item_text'])}{'' if ok else '  <-- WRONG'}")
check("every SHIPMENT item sits in the requested section", not wrong and len(of_type(after, "SHIPMENT")) == 46,
      json.dumps(wrong))
summary = rows(CLONE_DB, """
SELECT COALESCE(i.section_key, '-') AS key, i.section_sort AS sort, count(*) AS items,
       min(i.item_no) AS first, max(i.item_no) AS last,
       string_agg(i.item_no::text, ',' ORDER BY i.item_no) AS item_nos
FROM checklist_template_items i JOIN checklist_templates t ON t.id = i.template_id
WHERE t.type = 'SHIPMENT' GROUP BY 1, 2 ORDER BY 2 NULLS LAST""")
print("\n  SHIPMENT sections:")
for s in summary:
    print(f"  sort={str(s['sort']):<3} {s['key']:<16} items={s['items']:<3} item_no={s['item_nos']}")
check("each section is one consecutive run of item numbers",
      all(s["last"] - s["first"] + 1 == s["items"] for s in summary))
screen = [r["item_no"] for r in rows(CLONE_DB, SCREEN)]
print("  SHIPMENT screen order after 0036:", ",".join(map(str, screen)))
check("screen order starts at #1 and keeps the item order 1..46", screen == list(range(1, 47)))
check("TEST rows unchanged (all columns, incl. section_key / section_sort)",
      of_type(after, "TEST") == of_type(before, "TEST"), f"{len(of_type(after, 'TEST'))} rows compared")
check("EOL rows unchanged", of_type(after, "EOL") == of_type(before, "EOL"))
check("text, item_no, is_active, phase, station and seed_key unchanged for all items",
      fixed(after) == fixed(before), f"{len(after)} rows compared")
check("vehicle checklist progress rows unchanged", rows(CLONE_DB, PROGRESS) == progress_before,
      f"{len(progress_before)} rows compared")
print("  text/order/active fingerprint after:", scalar(CLONE_DB, FP))
print("  progress fingerprint after:", scalar(CLONE_DB, PROGRESS_FP))

# ---------------------------------------------------------------------------
print("\n== 3. Idempotency: second run ==")
out2 = updates(psql(CLONE_DB, path=UP))
print("  run 2:", " / ".join(out2))
check("second run updates nothing and changes no row", out2 == ["UPDATE 0", "UPDATE 0"] and rows(CLONE_DB, ITEMS) == after)

# ---------------------------------------------------------------------------
print("\n== 4. Rollback ==")
d1 = updates(psql(CLONE_DB, path=DOWN))
print("  down run 1:", " / ".join(d1))
check("down restores every row exactly as before 0036 (all columns)",
      d1 == ["UPDATE 46", "UPDATE 0"] and rows(CLONE_DB, ITEMS) == before, " / ".join(d1))
d2 = updates(psql(CLONE_DB, path=DOWN))
check("second down updates nothing", d2 == ["UPDATE 0", "UPDATE 0"], " / ".join(d2))
u3 = updates(psql(CLONE_DB, path=UP))
check("up after down gives the same result again", u3 == ["UPDATE 46", "UPDATE 0"] and rows(CLONE_DB, ITEMS) == after,
      " / ".join(u3))

# ---------------------------------------------------------------------------
print("\n== 5. Identity, not position: reverse order + text edit, then down/up (rolled back) ==")
probe = f"""
BEGIN;
-- Reverse SHIPMENT order the way ReorderTemplateItems renumbers, and edit a text.
WITH ordered AS (
    SELECT i.id, ROW_NUMBER() OVER (ORDER BY i.item_no DESC) AS n
    FROM checklist_template_items i JOIN checklist_templates t ON t.id = i.template_id WHERE t.type = 'SHIPMENT'
)
UPDATE checklist_template_items i SET item_no = -o.n FROM ordered o WHERE o.id = i.id;
UPDATE checklist_template_items SET item_no = -item_no WHERE item_no < 0;
UPDATE checklist_template_items SET item_text = 'Logo montajı (düzenlendi)' WHERE item_text = 'Logo montajı';
\\i {DOWN}
\\i {UP}
SELECT 'probe|' || i.item_no || '|' || btrim(i.item_text, E'\\n') || '|' || COALESCE(i.section_key, '-')
FROM checklist_template_items i JOIN checklist_templates t ON t.id = i.template_id
WHERE t.type = 'SHIPMENT' AND (i.item_text LIKE 'Rear Bota%' OR i.item_text LIKE 'Logo montajı%'
                               OR i.item_text LIKE 'Bagaj kapagi%')
ORDER BY i.item_no;
ROLLBACK;
"""
probe_out = psql(CLONE_DB, sql=probe)
probe_rows = [l.strip().split("|")[1:] for l in probe_out.splitlines() if l.strip().startswith("probe|")]
for p in probe_rows:
    print(f"  item_no {p[0]:>2} -> {p[2]:<16} {short(p[1], 50)}")
got = {p[1].split()[0]: (int(p[0]), p[2]) for p in probe_rows}
check("after reversing order each item keeps its own section (old #1 now #46 still interior_fit, "
      "old #17 now #30 still badges_trim, old #46 now #1 still final_adjust)",
      got.get("Rear") == (46, "interior_fit") and got.get("Logo") == (30, "badges_trim")
      and got.get("Bagaj") == (1, "final_adjust"), json.dumps(got, ensure_ascii=False))
check("probe rolled back", rows(CLONE_DB, ITEMS) == after)

# ---------------------------------------------------------------------------
print("\n== 6. Retired keys on other SHIPMENT items are cleared (rolled back) ==")
retired = psql(CLONE_DB, sql=f"""
BEGIN;
INSERT INTO checklist_template_items (template_id, item_no, item_text, section_key, section_sort)
SELECT id, 900, 'TEMP admin item with retired key', 'sealing', 60 FROM checklist_templates WHERE type = 'SHIPMENT';
\\i {UP}
SELECT 'retired|' || COALESCE(section_key, 'NULL') || '|' || COALESCE(section_sort::text, 'NULL')
FROM checklist_template_items WHERE item_text = 'TEMP admin item with retired key';
ROLLBACK;
""")
print("  ", " / ".join(updates(retired)))
check("an admin SHIPMENT item still on 'sealing' becomes unsectioned", "retired|NULL|NULL" in retired)
check("fixture rolled back", rows(CLONE_DB, ITEMS) == after)

# ---------------------------------------------------------------------------
print("\n== 7. Seed 03 on the migrated live clone ==")
s = seed(CLONE_DB, "03_checklist_templates.sql")
check("seed 03 adds nothing and changes nothing", s == ["INSERT 0 0"] and rows(CLONE_DB, ITEMS) == after, " / ".join(s))

# ---------------------------------------------------------------------------
print("\n== 8. Fresh install: every migration + seeds ==")
recreate(FRESH_DB)
for f in migrations(9999):
    out = psql(FRESH_DB, path=f"{MIGRATIONS}/{f}")
    if f.startswith("0036"):
        print("  0036 on an empty template:", " / ".join(updates(out)))
print(f"  applied {len(migrations(9999))} migrations")
for name in ("01_stations.sql", "02_stations_and_steps.sql", "03_checklist_templates.sql",
             "04_users.sql", "05_defect_catalog.sql", "06_test_vehicles.sql"):
    print(f"  {name}: {' / '.join(seed(FRESH_DB, name)) or '(no insert/update)'}")
fresh = rows(FRESH_DB, ITEMS)
clone_by_key = {(r["type"], r["seed_key"]): (r["section_key"], r["section_sort"]) for r in after}
fresh_cmp = [((r["type"], r["seed_key"]), (r["section_key"], r["section_sort"])) for r in fresh if r["type"] != "EOL"]
diff = [k for k, v in fresh_cmp if clone_by_key.get(k) != v]
print(f"  seeded SHIPMENT/TEST items: {len(fresh_cmp)}; compared with the migrated live clone by seed_key")
check("seed 03 gives every SHIPMENT and TEST item the same section as the migrated live clone",
      len(fresh_cmp) == 89 and not diff, json.dumps(diff))
fresh_wrong = [r["item_no"] for r in of_type(fresh, "SHIPMENT")
               if (r["section_key"], r["section_sort"]) != expected(r["item_no"])]
check("fresh install SHIPMENT matches the requested table by item_no too", not fresh_wrong, json.dumps(fresh_wrong))
check("fresh install screen order starts at #1 and is 1..46", [r["item_no"] for r in rows(FRESH_DB, SCREEN)] == list(range(1, 47)))
again = updates(psql(FRESH_DB, path=UP))
check("0036 re-run on the fresh install changes nothing", again == ["UPDATE 0", "UPDATE 0"], " / ".join(again))

if os.environ.get("KEEP") != "1":
    psql("postgres", sql=f"DROP DATABASE {CLONE_DB};")
psql("postgres", sql=f"DROP DATABASE {FRESH_DB};")
print(f"\n  dropped {FRESH_DB}" + ("" if os.environ.get("KEEP") == "1" else f" and {CLONE_DB}")
      + (f"; kept {CLONE_DB} for screenshots" if os.environ.get("KEEP") == "1" else ""))

print()
if FAILS:
    print("FAILED:", ", ".join(FAILS))
    sys.exit(1)
print("ALL CHECKS PASSED")
