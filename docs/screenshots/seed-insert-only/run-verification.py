"""Verification for insert-only seeds 01, 02 and 03 (migration 0034 seed_key).

Builds two throwaway *_test databases:
  karea_seed_test        upgrade path: migrations 0001-0033 + the previous
                         (DO UPDATE) seeds, then 0034 and the new seeds
  karea_seed_fresh_test  fresh install: every migration + the new seeds

Usage:
  python3 run-verification.py > verification-output.txt

Refuses to touch a database whose name does not end in _test. Never connects
to the API. Drop both databases afterwards.
"""
import json
import os
import subprocess
import sys

PSQL = "/opt/homebrew/opt/libpq/bin/psql"
ROOT = "/Users/Basri/Desktop/kts_kms_project"
MIGRATIONS = ROOT + "/database/migrations"
SEEDS = ROOT + "/database/seed"
OLD_REV = "11fc7ca"  # last commit with the DO UPDATE seeds 01-03
URL = "postgres://karea:karea_secret@localhost:5432/{}?sslmode=disable"
UPGRADE_DB = "karea_seed_test"
FRESH_DB = "karea_seed_fresh_test"

for name in (UPGRADE_DB, FRESH_DB):
    assert name.endswith("_test"), "database must be *_test"

FAILS = []


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
    raw = scalar(db, f"SELECT COALESCE(json_agg(t), '[]') FROM ({q}) t")
    return json.loads(raw)


def check(name, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'} {name}" + (f" — {detail}" if detail != "" else ""))
    if not ok:
        FAILS.append(name)


def inserts(output):
    return [l for l in output.splitlines() if l.startswith(("INSERT", "UPDATE"))]


def old_seed(name):
    return subprocess.run(["git", "-C", ROOT, "show", f"{OLD_REV}:database/seed/{name}"],
                          capture_output=True, text=True, check=True).stdout


def new_seed(name):
    with open(f"{SEEDS}/{name}") as f:
        return f.read()


def run_seed(db, name, label, text=None):
    out = psql(db, sql=text if text is not None else new_seed(name))
    lines = inserts(out)
    print(f"  {label}: {' / '.join(lines)}")
    return lines


def migrations(upto):
    files = sorted(f for f in os.listdir(MIGRATIONS) if f.endswith(".up.sql"))
    return [f for f in files if int(f[:4]) <= upto]


def recreate(db):
    psql("postgres", sql=f"DROP DATABASE IF EXISTS {db};\nCREATE DATABASE {db};")


ITEMS = """
SELECT i.id, t.name AS template, i.item_no, i.item_text, i.is_active,
       i.eol_phase, i.section_key, i.section_sort, i.seed_key
FROM checklist_template_items i
JOIN checklist_templates t ON t.id = i.template_id
WHERE t.vehicle_model_id IS NULL
ORDER BY i.id
"""
ITEMS_NO_KEY = ITEMS.replace(", i.seed_key", "")
STATIONS = "SELECT id, sequence_no, name, is_active FROM stations ORDER BY id"
STEPS = "SELECT id, station_id, sequence_no, name, is_active FROM station_steps ORDER BY id"

EOL = "Default EoL Template (16 items, Branch + Depot)"
SHIP = "Default Customer Vehicle Checklist (43 items)"


def tmpl(name):
    return f"(SELECT id FROM checklist_templates WHERE name = '{name}' AND vehicle_model_id IS NULL)"


def reorder_sql(template, order_by):
    """Same two-step renumbering as ChecklistProgressRepo.ReorderTemplateItems."""
    return f"""
WITH ordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY {order_by}) AS n
    FROM checklist_template_items WHERE template_id = {tmpl(template)}
)
UPDATE checklist_template_items i SET item_no = -o.n FROM ordered o WHERE o.id = i.id;
UPDATE checklist_template_items SET item_no = -item_no
WHERE template_id = {tmpl(template)} AND item_no < 0;
"""


def delete_item_sql(template, text):
    """Fixture shortcut: seed 06 evaluates every item, so the admin UI would
    refuse the delete. Drop the item's progress rows first (test DB only)."""
    return f"""
DELETE FROM checklist_item_progress
WHERE check_item_id = (SELECT id FROM checklist_template_items WHERE template_id = {tmpl(template)} AND item_text = '{text}');
DELETE FROM checklist_template_items WHERE template_id = {tmpl(template)} AND item_text = '{text}';
"""


def by_id(snapshot):
    return {r["id"]: r for r in snapshot}


# ---------------------------------------------------------------------------
print("== 1. Upgrade-path database: migrations 0001-0033 + previous seeds ==")
recreate(UPGRADE_DB)
for f in migrations(33):
    psql(UPGRADE_DB, path=f"{MIGRATIONS}/{f}")
print(f"  applied {len(migrations(33))} migrations (0001-0033)")
for name in ("01_stations.sql", "02_stations_and_steps.sql", "03_checklist_templates.sql"):
    run_seed(UPGRADE_DB, name, f"old {name} @ {OLD_REV}", old_seed(name))
for name in ("04_users.sql", "05_defect_catalog.sql", "06_test_vehicles.sql"):
    run_seed(UPGRADE_DB, name, name)
print("  default checklist items:", scalar(UPGRADE_DB, f"SELECT count(*) FROM ({ITEMS_NO_KEY}) x"),
      "| stations:", scalar(UPGRADE_DB, "SELECT count(*) FROM stations"),
      "| steps:", scalar(UPGRADE_DB, "SELECT count(*) FROM station_steps"),
      "| item progress rows:", scalar(UPGRADE_DB, "SELECT count(*) FROM checklist_item_progress"))

# ---------------------------------------------------------------------------
print("\n== 2. Bug reproduction with the previous seeds (inside a rolled-back transaction) ==")
before = by_id(rows(UPGRADE_DB, ITEMS_NO_KEY))
repro = f"""
BEGIN;
UPDATE checklist_template_items SET item_text = 'Araç Motoru (düzenlendi)'
WHERE template_id = {tmpl(EOL)} AND item_text = 'Araç Motoru';
UPDATE checklist_template_items SET is_active = FALSE
WHERE template_id = {tmpl(EOL)} AND item_text = 'Batarya';
{reorder_sql(EOL, "item_no DESC")}
UPDATE stations SET name = 'Şasi Montaj İstasyonu', is_active = TRUE WHERE sequence_no = 3;
UPDATE stations SET is_active = FALSE WHERE sequence_no = 5;
UPDATE station_steps SET name = 'Ön şasi rayı hizalama' WHERE station_id = (SELECT id FROM stations WHERE sequence_no = 1) AND sequence_no = 2;
UPDATE station_steps SET is_active = FALSE WHERE station_id = (SELECT id FROM stations WHERE sequence_no = 2) AND sequence_no = 4;
CREATE TEMP TABLE pre AS SELECT id, item_no, item_text, is_active FROM checklist_template_items WHERE template_id = {tmpl(EOL)};
{old_seed("01_stations.sql")}
{old_seed("02_stations_and_steps.sql")}
{old_seed("03_checklist_templates.sql")}
SELECT 'items whose text changed: ' || count(*) FROM checklist_template_items i JOIN pre p USING (id) WHERE i.item_text <> p.item_text;
SELECT 'example: id ' || i.id || ' was "' || p.item_text || '" now "' || i.item_text || '"'
FROM checklist_template_items i JOIN pre p USING (id) WHERE p.item_text = 'Sürüş';
SELECT 'edited text "Araç Motoru (düzenlendi)" still present: ' || EXISTS (SELECT 1 FROM checklist_template_items WHERE item_text = 'Araç Motoru (düzenlendi)');
SELECT 'deactivated "Batarya" now is_active = ' || i.is_active FROM checklist_template_items i JOIN pre p USING (id) WHERE p.item_text = 'Batarya';
SELECT 'station 3 name now: ' || name || ', station 5 is_active now: ' || (SELECT is_active FROM stations WHERE sequence_no = 5) FROM stations WHERE sequence_no = 3;
SELECT 'renamed step now: ' || name FROM station_steps WHERE station_id = (SELECT id FROM stations WHERE sequence_no = 1) AND sequence_no = 2;
SELECT 'deactivated step is_active now: ' || is_active FROM station_steps WHERE station_id = (SELECT id FROM stations WHERE sequence_no = 2) AND sequence_no = 4;
ROLLBACK;
"""
out = psql(UPGRADE_DB, sql=repro)
for line in out.splitlines():
    s = line.strip()
    if s.startswith(("items whose", "example:", "edited text", "deactivated", "station 3", "renamed step")):
        print("  old seed ->", s)
check("previous seed writes text onto other items after a reorder", "items whose text changed: 0" not in out)
check("previous seed re-enables a deactivated item", "now is_active = true" in out)
check("previous seed reverts station and step names", "station 3 name now: Chassis Assembly Station" in out and "renamed step now: Front frame rail alignment" in out)
check("rollback left the database unchanged", by_id(rows(UPGRADE_DB, ITEMS_NO_KEY)) == before)

# ---------------------------------------------------------------------------
print("\n== 3. Migration 0034: add seed_key, backfill, idempotency, rollback ==")
up = f"{MIGRATIONS}/0034_checklist_item_seed_key.up.sql"
down = f"{MIGRATIONS}/0034_checklist_item_seed_key.down.sql"
psql(UPGRADE_DB, path=up)
keys1 = rows(UPGRADE_DB, ITEMS)
total = len(keys1)
hashed = sum(1 for r in keys1 if r["seed_key"] is not None)
correct = scalar(UPGRADE_DB, "SELECT count(*) FROM checklist_template_items WHERE seed_key = md5(item_text)")
print(f"  default items: {total}, with seed_key: {hashed}, seed_key = md5(item_text): {correct}")
check("0034 backfills every default-template item", hashed == total and int(correct) == total)
psql(UPGRADE_DB, sql="INSERT INTO checklist_template_items (template_id, item_no, item_text) "
                     f"VALUES ({tmpl(SHIP)}, 900, 'TEMP admin item after 0034');")
psql(UPGRADE_DB, path=up)
admin_key = scalar(UPGRADE_DB, "SELECT COALESCE(seed_key, 'NULL') FROM checklist_template_items WHERE item_text = 'TEMP admin item after 0034'")
check("re-running 0034 changes nothing and leaves later admin items NULL", admin_key == "NULL"
      and [r for r in rows(UPGRADE_DB, ITEMS) if r["item_text"] != "TEMP admin item after 0034"] == keys1, f"admin item seed_key={admin_key}")
psql(UPGRADE_DB, sql="DELETE FROM checklist_template_items WHERE item_text = 'TEMP admin item after 0034';")
psql(UPGRADE_DB, path=down)
col = scalar(UPGRADE_DB, "SELECT count(*) FROM information_schema.columns WHERE table_name = 'checklist_template_items' AND column_name = 'seed_key'")
check("0034 down drops the column", col == "0")
psql(UPGRADE_DB, path=down)
check("0034 down is idempotent", True, "second down ran without error")
psql(UPGRADE_DB, path=up)
check("0034 up after down restores the same keys", rows(UPGRADE_DB, ITEMS) == keys1)

# ---------------------------------------------------------------------------
print("\n== 4. New seeds on the untouched upgraded database ==")
a = run_seed(UPGRADE_DB, "01_stations.sql", "01")
b = run_seed(UPGRADE_DB, "02_stations_and_steps.sql", "02")
c = run_seed(UPGRADE_DB, "03_checklist_templates.sql", "03")
check("new seeds add nothing to a complete install", a == ["INSERT 0 0"] and b == ["INSERT 0 0"] and c == ["INSERT 0 0"])

# ---------------------------------------------------------------------------
print("\n== 5. Checklist items: edit, deactivate, reorder, delete, then seed ==")
dropped = scalar(UPGRADE_DB, f"""
SELECT count(*) FROM checklist_item_progress p JOIN checklist_template_items i ON i.id = p.check_item_id
WHERE i.item_text IN ('Jant Logo Değişimi', 'Rot Balans')""")
print(f"  fixture: deleting 'Rot Balans' and 'Jant Logo Değişimi' with their {dropped} progress rows (seed 06 evaluated every item)")
fixtures = f"""
UPDATE checklist_template_items SET item_text = 'Araç Motoru (düzenlendi)'
WHERE template_id = {tmpl(EOL)} AND item_text = 'Araç Motoru';
UPDATE checklist_template_items SET is_active = FALSE
WHERE template_id = {tmpl(EOL)} AND item_text = 'Batarya';
{reorder_sql(EOL, "item_no DESC")}
{delete_item_sql(EOL, "Rot Balans")}
{reorder_sql(EOL, "item_no")}
{delete_item_sql(SHIP, "Jant Logo Değişimi")}
"""
psql(UPGRADE_DB, sql=fixtures)
s1 = rows(UPGRADE_DB, ITEMS)
eol_order = [r["item_text"] for r in sorted((r for r in s1 if r["template"] == EOL), key=lambda r: r["item_no"])]
print("  EOL order after reverse + delete + compact:", " | ".join(eol_order))
print("  shipment item_no 20 free:", scalar(UPGRADE_DB, f"SELECT NOT EXISTS (SELECT 1 FROM checklist_template_items WHERE template_id = {tmpl(SHIP)} AND item_no = 20)"))
print("  EOL slot 8 (seed slot of Rot Balans) now holds:", scalar(UPGRADE_DB, f"SELECT item_text FROM checklist_template_items WHERE template_id = {tmpl(EOL)} AND item_no = 8"))
progress_before = rows(UPGRADE_DB, "SELECT p.id, p.check_item_id, i.item_text FROM checklist_item_progress p JOIN checklist_template_items i ON i.id = p.check_item_id ORDER BY p.id")

first = run_seed(UPGRADE_DB, "03_checklist_templates.sql", "03 run 1")
s2 = rows(UPGRADE_DB, ITEMS)
s1_ids = by_id(s1)
s2_ids = by_id(s2)
unchanged = all(s2_ids.get(i) == r for i, r in s1_ids.items())
check("seed inserts exactly the 2 deleted items", first == ["INSERT 0 2"])
check("every pre-existing item is byte-identical (text, item_no, is_active, phase, section, seed_key)", unchanged)
edited = [r for r in s2 if r["template"] == EOL and r["item_text"].startswith("Araç Motoru")]
check("edited text kept, original text not re-added", [r["item_text"] for r in edited] == ["Araç Motoru (düzenlendi)"],
      json.dumps([r["item_text"] for r in edited], ensure_ascii=False))
bat = [r for r in s2 if r["template"] == EOL and r["item_text"] == "Batarya"]
check("deactivated item still inactive", len(bat) == 1 and bat[0]["is_active"] is False, f"is_active={bat[0]['is_active'] if bat else None}")
new = [r for r in s2 if r["id"] not in s1_ids]
for r in new:
    print(f"  re-added: {r['template']} #{r['item_no']} {r['item_text']!r} is_active={r['is_active']} seed_key=md5(text): {r['seed_key']}")
ship_new = [r for r in new if r["template"] == SHIP]
eol_new = [r for r in new if r["template"] == EOL]
check("deleted shipment item re-added at its free original slot 20",
      len(ship_new) == 1 and ship_new[0]["item_text"] == "Jant Logo Değişimi" and ship_new[0]["item_no"] == 20)
check("deleted EOL item re-added after the last item because slot 8 is taken (15 seed slots -> 16)",
      len(eol_new) == 1 and eol_new[0]["item_text"] == "Rot Balans" and eol_new[0]["item_no"] == 16)
dupes = scalar(UPGRADE_DB, "SELECT count(*) FROM (SELECT template_id, item_text FROM checklist_template_items GROUP BY 1, 2 HAVING count(*) > 1) d")
check("no template has the same text twice", dupes == "0", f"duplicate groups: {dupes}")
progress_after = rows(UPGRADE_DB, "SELECT p.id, p.check_item_id, i.item_text FROM checklist_item_progress p JOIN checklist_template_items i ON i.id = p.check_item_id ORDER BY p.id")
check("every vehicle progress row still points at the same item text", progress_after == progress_before, f"{len(progress_after)} progress rows compared")

second = run_seed(UPGRADE_DB, "03_checklist_templates.sql", "03 run 2")
check("second run inserts nothing (INSERT 0 0) and changes no row", second == ["INSERT 0 0"] and rows(UPGRADE_DB, ITEMS) == s2)

# ---------------------------------------------------------------------------
print("\n== 6. Stations and steps: rename, deactivate, delete, then seed ==")
step_fixtures = """
UPDATE stations SET name = 'Şasi Montaj İstasyonu' WHERE sequence_no = 3;
UPDATE stations SET is_active = FALSE WHERE sequence_no = 5;
UPDATE station_steps SET name = 'Ön şasi rayı hizalama'
WHERE station_id = (SELECT id FROM stations WHERE sequence_no = 1) AND sequence_no = 2;
UPDATE station_steps SET is_active = FALSE
WHERE station_id = (SELECT id FROM stations WHERE sequence_no = 2) AND sequence_no = 4;
DELETE FROM vehicle_station_step_progress
WHERE station_step_id = (SELECT id FROM station_steps WHERE station_id = (SELECT id FROM stations WHERE sequence_no = 3) AND sequence_no = 7);
DELETE FROM station_steps
WHERE station_id = (SELECT id FROM stations WHERE sequence_no = 3) AND sequence_no = 7;
"""
step_rows = scalar(UPGRADE_DB, """
SELECT count(*) FROM vehicle_station_step_progress
WHERE station_step_id = (SELECT id FROM station_steps WHERE station_id = (SELECT id FROM stations WHERE sequence_no = 3) AND sequence_no = 7)""")
print(f"  fixture: deleting step 3/7 'Underbody shield installation' with its {step_rows} progress rows")
psql(UPGRADE_DB, sql=step_fixtures)
st1, sp1 = rows(UPGRADE_DB, STATIONS), rows(UPGRADE_DB, STEPS)
a = run_seed(UPGRADE_DB, "01_stations.sql", "01 run 1")
b = run_seed(UPGRADE_DB, "02_stations_and_steps.sql", "02 run 1")
st2, sp2 = rows(UPGRADE_DB, STATIONS), rows(UPGRADE_DB, STEPS)
check("01 changes no station (renamed name and is_active kept)", a == ["INSERT 0 0"] and st2 == st1)
print("  station 3:", scalar(UPGRADE_DB, "SELECT name FROM stations WHERE sequence_no = 3"),
      "| station 5 is_active:", scalar(UPGRADE_DB, "SELECT is_active FROM stations WHERE sequence_no = 5"))
sp1_ids = by_id(sp1)
check("02 leaves every existing step identical", all(by_id(sp2).get(i) == r for i, r in sp1_ids.items()))
new_steps = [r for r in sp2 if r["id"] not in sp1_ids]
print("  re-added steps:", json.dumps(new_steps, ensure_ascii=False))
check("02 re-adds the deleted step under the renamed station (matched by sequence_no)",
      b == ["INSERT 0 1"] and len(new_steps) == 1 and new_steps[0]["sequence_no"] == 7
      and new_steps[0]["name"] == "Underbody shield installation")
a2 = run_seed(UPGRADE_DB, "01_stations.sql", "01 run 2")
b2 = run_seed(UPGRADE_DB, "02_stations_and_steps.sql", "02 run 2")
check("second run of 01 and 02 inserts nothing and changes no row",
      a2 == ["INSERT 0 0"] and b2 == ["INSERT 0 0"] and rows(UPGRADE_DB, STATIONS) == st2 and rows(UPGRADE_DB, STEPS) == sp2)

# ---------------------------------------------------------------------------
print("\n== 7. Fresh install: every migration + new seeds ==")
recreate(FRESH_DB)
for f in migrations(9999):
    psql(FRESH_DB, path=f"{MIGRATIONS}/{f}")
print(f"  applied {len(migrations(9999))} migrations")
print("  placeholders from 0002:", scalar(FRESH_DB, "SELECT string_agg(name, ', ' ORDER BY sequence_no) FROM stations"))
psql(FRESH_DB, sql="UPDATE stations SET name = 'HV Hattı' WHERE sequence_no = 4;")
print("  admin renamed placeholder 'Station 4' to 'HV Hattı' before seeding")
f1 = run_seed(FRESH_DB, "01_stations.sql", "01")
f2 = run_seed(FRESH_DB, "02_stations_and_steps.sql", "02")
f3 = run_seed(FRESH_DB, "03_checklist_templates.sql", "03")
names = scalar(FRESH_DB, "SELECT string_agg(name, ', ' ORDER BY sequence_no) FROM stations")
print("  stations:", names)
check("01 renames untouched placeholders only", f1 == ["INSERT 0 7"] and "HV Hattı" in names
      and "Station " not in names and "Body and Frame Station" in names)
check("02 inserts all 64 steps", f2 == ["INSERT 0 64"])
keyed = scalar(FRESH_DB, "SELECT count(*) FROM checklist_template_items WHERE seed_key = md5(item_text)")
check("03 inserts all 104 items with seed_key = md5(text) at seed item_no", f3 == ["INSERT 0 104"] and keyed == "104")
r1 = run_seed(FRESH_DB, "01_stations.sql", "01 run 2")
r2 = run_seed(FRESH_DB, "02_stations_and_steps.sql", "02 run 2")
r3 = run_seed(FRESH_DB, "03_checklist_templates.sql", "03 run 2")
check("fresh install second run: INSERT 0 0 for 01, 02, 03", r1 == r2 == r3 == ["INSERT 0 0"])

print()
if FAILS:
    print("FAILED:", ", ".join(FAILS))
    sys.exit(1)
print("ALL CHECKS PASSED")
