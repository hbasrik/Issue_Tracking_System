"""Verification for migration 0035 (checklist sections by item content).

Builds two throwaway *_test databases:
  karea_sections_test        live clone: migrations 0001-0034, then the live
                             checklist_templates / checklist_template_items
                             rows (read-only pg_dump of the live DB, given as
                             LIVE_DUMP), then seeds 01-06
  karea_sections_fresh_test  fresh install: every migration + seeds 01-06

LIVE_DUMP was produced with
  docker exec -e PGOPTIONS='-c default_transaction_read_only=on' karea_postgres \
    pg_dump -U karea -d karea --data-only --column-inserts \
    -t checklist_templates -t checklist_template_items

Usage:
  LIVE_DUMP=/tmp/live-templates-dump.sql python3 run-verification.py > verification-output.txt
  KEEP=1 keeps karea_sections_test for the screenshots; drop both afterwards.

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
CLONE_DB = "karea_sections_test"
FRESH_DB = "karea_sections_fresh_test"
LIVE_DUMP = os.environ["LIVE_DUMP"]
UP = f"{MIGRATIONS}/0035_checklist_sections_by_content.up.sql"
DOWN = f"{MIGRATIONS}/0035_checklist_sections_by_content.down.sql"

for name in (CLONE_DB, FRESH_DB):
    assert name.endswith("_test"), "database must be *_test"

FAILS = []

# Expected result, written from the approved request (not from the migration).
SHIP = {
    "identity": [17, 18, 19, 20, 23, 24],
    "exterior": [3, 4, 16, 28, 29, 45],
    "interior": [1, 2, 5, 6, 7, 8, 9, 10, 11, 12, 21, 22, 32],
    "closures": [25, 26, 43],
    "electrical": [14, 27, 31],
    "sealing": [15, 30, 34, 35, 36, 37, 38, 46],
    "chassis": [13, 33, 39, 40, 41, 42, 44],
}
TEST = {
    "cold_drag": [1, 2, 3],
    "bcm_ee": list(range(4, 16)),
    "road_test": list(range(16, 25)),
    "brake_test": list(range(25, 30)),
    "alignment": [30, 31, 32],
    "hot_drag": list(range(33, 38)),
    "eng_quality": list(range(38, 44)),
}
SORT = {"identity": 10, "exterior": 20, "interior": 30, "closures": 40, "electrical": 50,
        "sealing": 60, "chassis": 70, "cold_drag": 10, "bcm_ee": 20, "road_test": 30,
        "brake_test": 40, "alignment": 50, "hot_drag": 60, "eng_quality": 70}
TITLE = {"identity": "Kimlik, Logo & Etiket", "exterior": "Dış Görünüm", "interior": "İç Donanım & Trim",
         "closures": "Kapı & Kaput Ayarı", "electrical": "Elektrik & Kablaj", "sealing": "Sızdırmazlık",
         "chassis": "Şasi, Fren & Direksiyon", "cold_drag": "Soğuk Sıkma Testi",
         "bcm_ee": "BCM / EE Fonksiyon Kontrol", "road_test": "Sürüş Testi", "brake_test": "Fren Testi",
         "alignment": "Rot Testi", "hot_drag": "Sıcak Sıkma Testi",
         "eng_quality": "Mühendislik & Kalite Kontrol", None: "(bölümsüz)"}


def expected(typ, no):
    table = SHIP if typ == "SHIPMENT" else TEST
    for key, nos in table.items():
        if no in nos:
            return key, SORT[key]
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


def fixed(snapshot):
    return [{k: r[k] for k in FIXED} for r in snapshot]


def sections(snapshot):
    return {r["id"]: (r["section_key"], r["section_sort"]) for r in snapshot}


def short(text, n=62):
    t = " ".join(text.split())
    return t if len(t) <= n else t[: n - 3] + "..."


# ---------------------------------------------------------------------------
print("== 1. Live clone: migrations 0001-0034 + live template rows + seeds ==")
recreate(CLONE_DB)
for f in migrations(34):
    psql(CLONE_DB, path=f"{MIGRATIONS}/{f}")
print(f"  applied {len(migrations(34))} migrations (0001-0034)")
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
pre_keys = {(r["type"], r["section_key"]) for r in before if r["type"] != "EOL"}
print("  section keys before:", ", ".join(sorted(f"{t}:{k}" for t, k in pre_keys if k)))

# ---------------------------------------------------------------------------
print("\n== 2. Migration 0035 up ==")
out = updates(psql(CLONE_DB, path=UP))
print("  run 1:", " / ".join(out))
after = rows(CLONE_DB, ITEMS)
check("first run updates 90 rows (45 SHIPMENT: all but #16, whose key and sort stay exterior/20; 45 TEST) and clears no other row",
      out == ["UPDATE 90", "UPDATE 0"], " / ".join(out))

print("\n  Result (SHIPMENT and TEST, by item_no):")
print(f"  {'type':<8} {'no':>3}  {'active':<6} {'section_key':<12} {'sort':>4}  {'title':<30} text")
wrong = []
for r in sorted((r for r in after if r["type"] != "EOL"), key=lambda r: (r["type"] != "SHIPMENT", r["item_no"])):
    key, sort = expected(r["type"], r["item_no"])
    ok = (r["section_key"], r["section_sort"]) == (key, sort)
    if not ok:
        wrong.append((r["type"], r["item_no"], r["section_key"], key))
    print(f"  {r['type']:<8} {r['item_no']:>3}  {str(r['is_active']).lower():<6} {str(r['section_key'] or '-'):<12} "
          f"{str(r['section_sort'] or '-'):>4}  {TITLE[r['section_key']]:<30} {short(r['item_text'])}{'' if ok else '  <-- WRONG'}")
check("every SHIPMENT/TEST item sits in the requested section", not wrong, json.dumps(wrong))
check("TEST #44 and #45 (inactive) are unsectioned",
      all(r["section_key"] is None and r["section_sort"] is None and not r["is_active"]
          for r in after if r["type"] == "TEST" and r["item_no"] in (44, 45)))
summary = rows(CLONE_DB, """
SELECT t.type::text AS type, COALESCE(i.section_key, '-') AS key, i.section_sort AS sort,
       count(*) AS items, count(*) FILTER (WHERE i.is_active) AS active,
       string_agg(i.item_no::text, ',' ORDER BY i.item_no) AS item_nos
FROM checklist_template_items i JOIN checklist_templates t ON t.id = i.template_id
WHERE t.type IN ('SHIPMENT', 'TEST')
GROUP BY 1, 2, 3 ORDER BY 1, 3 NULLS LAST""")
print("\n  Sections per template:")
for s in summary:
    print(f"  {s['type']:<8} {s['key']:<12} sort={str(s['sort']):<4} items={s['items']:<3} active={s['active']:<3} item_no={s['item_nos']}")
check("EOL items untouched (no sections)", all(r["section_key"] is None for r in after if r["type"] == "EOL"))
check("text, item_no, is_active, phase, station and seed_key unchanged for all 108 items",
      fixed(after) == fixed(before), f"{len(after)} rows compared")
check("vehicle checklist progress rows unchanged", rows(CLONE_DB, PROGRESS) == progress_before,
      f"{len(progress_before)} rows compared")
fp = "SELECT md5(string_agg(id || '|' || template_id || '|' || item_no || '|' || item_text || '|' || is_active, E'\\n' ORDER BY id)) FROM checklist_template_items"
print("  text/order/active fingerprint after 0035:", scalar(CLONE_DB, fp))

# ---------------------------------------------------------------------------
print("\n== 3. Idempotency: second run ==")
out2 = updates(psql(CLONE_DB, path=UP))
print("  run 2:", " / ".join(out2))
check("second run updates nothing and changes no row", out2 == ["UPDATE 0", "UPDATE 0"] and rows(CLONE_DB, ITEMS) == after)

# ---------------------------------------------------------------------------
print("\n== 4. Rollback ==")
d1 = updates(psql(CLONE_DB, path=DOWN))
print("  down run 1:", " / ".join(d1))
check("down restores every row exactly as before 0035 (all columns)", d1 == ["UPDATE 90"] and rows(CLONE_DB, ITEMS) == before)
item10 = scalar(CLONE_DB, "SELECT section_key FROM checklist_template_items i JOIN checklist_templates t ON t.id = i.template_id WHERE t.type = 'TEST' AND i.item_no = 10")
print("  TEST #10 after down:", item10, "(live value before 0035)")
d2 = updates(psql(CLONE_DB, path=DOWN))
check("second down updates nothing", d2 == ["UPDATE 0"], " / ".join(d2))
u3 = updates(psql(CLONE_DB, path=UP))
check("up after down gives the same result again", u3 == ["UPDATE 90", "UPDATE 0"] and rows(CLONE_DB, ITEMS) == after, " / ".join(u3))

# ---------------------------------------------------------------------------
print("\n== 5. Identity, not position: reorder + text edit, then down/up (rolled back) ==")
probe = f"""
BEGIN;
-- Reverse TEST order the way ReorderTemplateItems renumbers, and edit a text.
WITH ordered AS (
    SELECT i.id, ROW_NUMBER() OVER (ORDER BY i.item_no DESC) AS n
    FROM checklist_template_items i JOIN checklist_templates t ON t.id = i.template_id WHERE t.type = 'TEST'
)
UPDATE checklist_template_items i SET item_no = -o.n FROM ordered o WHERE o.id = i.id;
UPDATE checklist_template_items SET item_no = -item_no WHERE item_no < 0;
UPDATE checklist_template_items SET item_text = 'Mühendis Nihai Onayı (düzenlendi)' WHERE item_text = 'Mühendis Nihai Onayı';
\\i {DOWN}
\\i {UP}
SELECT 'probe|' || i.item_no || '|' || i.item_text || '|' || COALESCE(i.section_key, '-')
FROM checklist_template_items i JOIN checklist_templates t ON t.id = i.template_id
WHERE t.type = 'TEST' AND (i.item_text LIKE 'N''de aracı ittir — Anormal%' OR i.item_text LIKE 'Mühendis Nihai Onayı%'
                           OR i.item_text LIKE 'Sağ arka disk%')
ORDER BY i.item_no;
ROLLBACK;
"""
probe_out = psql(CLONE_DB, sql=probe)
probe_rows = [l.strip().split("|")[1:] for l in probe_out.splitlines() if l.strip().startswith("probe|")]
for p in probe_rows:
    print(f"  item_no {p[0]:>2} -> {p[2]:<11} {short(p[1], 50)}")
got = {p[1].split(" —")[0]: (int(p[0]), p[2]) for p in probe_rows}
check("after reversing order each item keeps its own section (old #1 now #45 still cold_drag, old #43 now #3 still eng_quality)",
      got.get("N'de aracı ittir") == (45, "cold_drag")
      and got.get("Mühendis Nihai Onayı (düzenlendi)") == (3, "eng_quality")
      and got.get("Sağ arka disk") == (10, "hot_drag"), json.dumps(got, ensure_ascii=False))
check("probe rolled back", rows(CLONE_DB, ITEMS) == after)

# ---------------------------------------------------------------------------
print("\n== 6. Retired keys on other items are cleared (rolled back) ==")
retired = psql(CLONE_DB, sql=f"""
BEGIN;
INSERT INTO checklist_template_items (template_id, item_no, item_text, section_key, section_sort)
SELECT id, 900, 'TEMP admin item with retired key', 'brakes', 10 FROM checklist_templates WHERE type = 'TEST';
\\i {UP}
SELECT 'retired|' || COALESCE(section_key, 'NULL') || '|' || COALESCE(section_sort::text, 'NULL')
FROM checklist_template_items WHERE item_text = 'TEMP admin item with retired key';
ROLLBACK;
""")
print("  ", " / ".join(updates(retired)))
check("an admin item still on 'brakes' becomes unsectioned", "retired|NULL|NULL" in retired)
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
    if f.startswith("0035"):
        print("  0035 on an empty template:", " / ".join(updates(out)))
print(f"  applied {len(migrations(9999))} migrations")
for name in ("01_stations.sql", "02_stations_and_steps.sql", "03_checklist_templates.sql",
             "04_users.sql", "05_defect_catalog.sql", "06_test_vehicles.sql"):
    print(f"  {name}: {' / '.join(seed(FRESH_DB, name)) or '(no insert/update)'}")
fresh = rows(FRESH_DB, ITEMS)
clone_by_key = {(r["type"], r["seed_key"]): (r["section_key"], r["section_sort"]) for r in after}
fresh_cmp = [((r["type"], r["seed_key"]), (r["section_key"], r["section_sort"])) for r in fresh if r["type"] != "EOL"]
diff = [k for k, v in fresh_cmp if clone_by_key.get(k) != v]
print(f"  seeded SHIPMENT/TEST items: {len(fresh_cmp)}; compared with the migrated live clone by seed_key")
check("seed 03 gives every item the same section as migration 0035", len(fresh_cmp) == 89 and not diff, json.dumps(diff))
fresh_wrong = [(r["type"], r["item_no"]) for r in fresh if r["type"] != "EOL"
               and (r["section_key"], r["section_sort"]) != expected(r["type"], r["item_no"])]
check("fresh install matches the requested table by item_no too", not fresh_wrong, json.dumps(fresh_wrong))
again = updates(psql(FRESH_DB, path=UP))
check("0035 re-run on the fresh install changes nothing", again == ["UPDATE 0", "UPDATE 0"], " / ".join(again))

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
